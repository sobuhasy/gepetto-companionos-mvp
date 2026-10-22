'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { installSdk, parseArgs } = require('../scripts/setup-live2d.cjs');

async function fixture(t) {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'companion-live2d-test-'));
  t.after(() => fs.rm(temporary, { recursive: true, force: true }));
  const sdk = path.join(temporary, 'sdk');
  const output = path.join(temporary, 'public', 'live2d');
  const write = async (file, text) => {
    const target = path.join(sdk, file);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, text);
  };
  // Synthetic fixtures verify packaging, not Cubism rendering or SDK licensing.
  for (const [file, name] of [
    ['live2dcubismframework', 'CubismFramework'], ['model/cubismusermodel', 'CubismUserModel'],
    ['cubismmodelsettingjson', 'CubismModelSettingJson'], ['math/cubismmatrix44', 'CubismMatrix44'],
    ['type/csmmap', 'csmMap'], ['physics/cubismphysics', 'CubismPhysics'], ['effect/cubismpose', 'CubismPose']
  ]) await write(`Framework/src/${file}.ts`, `/** Synthetic test fixture, not Live2D SDK code. */\nexport class ${name} { marker = '${name}'; }`);
  await write('Framework/src/rendering/cubismshader_webgl.ts', `
    export class CubismShaderManager_WebGL {
      static getInstance() { return { getShader(gl) { return gl.shader; } }; }
    }
  `);
  await write('Core/live2dcubismcore.min.js', '/* Synthetic Core fixture. */');
  await write('Core/live2dcubismcore.wasm', 'synthetic wasm');
  await write('LICENSE.md', 'Synthetic SDK license notice');
  await write('NOTICE.md', 'Synthetic SDK redistribution notice');
  await write('Core/LICENSE.md', 'Synthetic Core license notice');
  await write('Framework/LICENSE.md', 'Synthetic Framework license notice');
  await write('Framework/Shaders/WebGL/test.vert', 'synthetic shader');
  await write('Samples/Resources/DoNotCopy/model.model3.json', '{}');
  return { sdk, output, write };
}

test('SDK setup requires explicit acceptance and a complete local SDK', async t => {
  const { sdk, output } = await fixture(t);
  await assert.rejects(installSdk({ sdk, output }), /--accept-sdk-license/);
  await assert.rejects(installSdk({ output, acceptSdkLicense: true }), /Missing --sdk/);
  await fs.rm(path.join(sdk, 'Core/live2dcubismcore.min.js'));
  await assert.rejects(installSdk({ sdk, output, acceptSdkLicense: true }), /Official SDK file missing/);
  await assert.rejects(fs.access(output), { code: 'ENOENT' });
});

test('SDK setup refuses missing licenses before writing runtime assets', async t => {
  const { sdk, output } = await fixture(t);
  await fs.rm(path.join(sdk, 'Core/LICENSE.md'));
  await assert.rejects(installSdk({ sdk, output, acceptSdkLicense: true }), /Core license file missing/);
  await assert.rejects(fs.access(output), { code: 'ENOENT' });
});

test('SDK setup bundles named browser exports, adjacent wasm, shaders and notices without copying models', async t => {
  const { sdk, output } = await fixture(t);
  const result = await installSdk({ sdk, output, acceptSdkLicense: true });
  assert.equal(result.runtimeFiles, 2);
  const sandbox = {};
  vm.runInNewContext(await fs.readFile(path.join(output, 'cubism-framework.js'), 'utf8'), sandbox);
  assert.deepEqual(Object.keys(sandbox.CompanionCubism).sort(), ['CubismFramework', 'CubismMatrix44', 'CubismModelSettingJson', 'CubismPhysics', 'CubismPose', 'CubismUserModel', 'csmMap', 'prepareRenderer']);
  for (const file of ['live2dcubismcore.min.js', 'live2dcubismcore.wasm', 'shaders/test.vert',
    'licenses/SDK/LICENSE.md', 'licenses/SDK/NOTICE.md', 'licenses/Core/LICENSE.md', 'licenses/Framework/LICENSE.md']) {
    await fs.access(path.join(output, file));
  }
  await assert.rejects(fs.access(path.join(output, 'Samples')), { code: 'ENOENT' });
  const manifest = JSON.parse(await fs.readFile(path.join(output, 'installation.json'), 'utf8'));
  assert.match(manifest.coreSha256, /^[a-f0-9]{64}$/);
  assert.equal(manifest.externalShaders, true);
  assert.equal(JSON.stringify(manifest).includes(sdk), false, 'Do not publish a local absolute SDK path');
});

test('failed SDK bundle preserves a previous installation and removes staging files', async t => {
  const { sdk, output, write } = await fixture(t);
  await fs.mkdir(output, { recursive: true });
  await fs.writeFile(path.join(output, 'existing.txt'), 'keep');
  await write('Framework/src/live2dcubismframework.ts', 'this is not valid TypeScript!!!');
  await assert.rejects(installSdk({ sdk, output, acceptSdkLicense: true }));
  assert.equal(await fs.readFile(path.join(output, 'existing.txt'), 'utf8'), 'keep');
  assert.deepEqual(await fs.readdir(path.dirname(output)), ['live2d']);
});

test('SDK setup supports releases that replace csmMap with native Map', async t => {
  const { sdk, output } = await fixture(t);
  await fs.rm(path.join(sdk, 'Framework/src/type/csmmap.ts'));
  await installSdk({ sdk, output, acceptSdkLicense: true });
  const { CompanionCubism: bundled } = await bundledSdk(output);
  const layout = new bundled.csmMap();
  layout.set('Height', 2);
  assert.equal(layout.get('Height'), 2);
  assert.equal(layout.size, 1);
});

test('SDK arguments reject unknown switches and overlapping output', async t => {
  assert.equal(parseArgs(['--sdk', 'C:/SDK', '--accept-sdk-license']).acceptSdkLicense, true);
  assert.throws(() => parseArgs(['--download']), /Unknown argument/);
  assert.throws(() => parseArgs(['--sdk', '--accept-sdk-license']), /requires exactly one/);
  const { sdk } = await fixture(t);
  await assert.rejects(installSdk({ sdk, output: path.join(sdk, 'generated'), acceptSdkLicense: true }), /separate folders/);
});

async function bundledSdk(output) {
  const sandbox = { setTimeout };
  vm.runInNewContext(await fs.readFile(path.join(output, 'cubism-framework.js'), 'utf8'), sandbox);
  return sandbox;
}

test('shader bridge waits for SDK async completion instead of claiming early readiness', async t => {
  const { sdk, output } = await fixture(t);
  await installSdk({ sdk, output, acceptSdkLicense: true });
  const { CompanionCubism: bundled } = await bundledSdk(output);
  const shader = { _isShaderLoading: false, _isShaderLoaded: false, _shaderSets: [] };
  let requestedPath;
  const renderer = { loadShaders(value) { requestedPath = value; shader._isShaderLoading = true; } };
  let settled = false;
  const loading = bundled.prepareRenderer(renderer, { shader }, '/live2d/shaders/').then(() => { settled = true; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(requestedPath, '/live2d/shaders/');
  assert.equal(settled, false);
  shader._shaderSets = [{ shaderProgram: {} }, { shaderProgram: {} }];
  shader._isShaderLoaded = true;
  shader._isShaderLoading = false;
  await loading;
  assert.equal(settled, true);
});

test('shader bridge rejects unloaded, missing and failed shader programs', async t => {
  const { sdk, output } = await fixture(t);
  await installSdk({ sdk, output, acceptSdkLicense: true });
  const { CompanionCubism: bundled } = await bundledSdk(output);
  const renderer = { loadShaders() {} };
  for (const shader of [
    { _isShaderLoading: false, _isShaderLoaded: false, _shaderSets: [{ shaderProgram: {} }] },
    { _isShaderLoading: false, _isShaderLoaded: true, _shaderSets: [] },
    { _isShaderLoading: false, _isShaderLoaded: true, _shaderSets: [{ shaderProgram: null }] },
    { _isShaderLoading: false, _isShaderLoaded: true, _shaderSets: new Array(2) }
  ]) await assert.rejects(bundled.prepareRenderer(renderer, { shader }, '/live2d/shaders/'), /could not load or compile/);
  await bundled.prepareRenderer({}, {}, '/live2d/shaders/'); // Old SDK with embedded, synchronous shaders.
});

test('shader bridge supports the older shader singleton interface', async t => {
  const { sdk, output, write } = await fixture(t);
  await write('Framework/src/rendering/cubismshader_webgl.ts', `
    export class CubismShader_WebGL { static getInstance() { return globalThis.fixtureShader; } }
  `);
  await installSdk({ sdk, output, acceptSdkLicense: true });
  const sandbox = await bundledSdk(output);
  sandbox.fixtureShader = { _isShaderLoading: false, _isShaderLoaded: true, _shaderSets: [{ shaderProgram: {} }] };
  await sandbox.CompanionCubism.prepareRenderer({ loadShaders() {} }, {}, '/live2d/shaders/');
});

test('shader bridge accepts unused SDK blend slots and checks every reachable program', async t => {
  const { sdk, output } = await fixture(t);
  await installSdk({ sdk, output, acceptSdkLicense: true });
  const { CompanionCubism: bundled } = await bundledSdk(output);
  const shader = {
    _isShaderLoading: false, _isShaderLoaded: true,
    _shaderSets: Array.from({ length: 17 }, (_, index) => ({ shaderProgram: index < 14 ? {} : null })),
    _blendShaderSetMap: new Map([['BlendExample', 11]])
  };
  const renderer = { loadShaders() {} };
  await bundled.prepareRenderer(renderer, { shader }, '/live2d/shaders/');
  for (const index of [0, 10, 11, 12, 13]) {
    shader._shaderSets[index].shaderProgram = null;
    await assert.rejects(bundled.prepareRenderer(renderer, { shader }, '/live2d/shaders/'), /could not load or compile/);
    shader._shaderSets[index].shaderProgram = {};
  }
  shader._blendShaderSetMap.set('OutsideShaderArray', 17);
  await assert.rejects(bundled.prepareRenderer(renderer, { shader }, '/live2d/shaders/'), /could not load or compile/);
});
