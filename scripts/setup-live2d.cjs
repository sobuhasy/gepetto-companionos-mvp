#!/usr/bin/env node
'use strict';

// Installs only an SDK the user has already obtained from Live2D. This script
// deliberately has no download, model-copying, or license-acceptance fallback.
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');

const DOWNLOAD_URL = 'https://www.live2d.com/en/sdk/download/web/';
const DEFAULT_OUTPUT = path.resolve(__dirname, '../source/web/public/live2d');
const ENTRY = [
  'export { CubismFramework } from "./Framework/src/live2dcubismframework";',
  'export { CubismUserModel } from "./Framework/src/model/cubismusermodel";',
  'export { CubismModelSettingJson } from "./Framework/src/cubismmodelsettingjson";',
  'export { CubismMatrix44 } from "./Framework/src/math/cubismmatrix44";',
  'export { CubismPhysics } from "./Framework/src/physics/cubismphysics";',
  'export { CubismPose } from "./Framework/src/effect/cubismpose";',
  'import * as shaderModule from "./Framework/src/rendering/cubismshader_webgl";',
  // SDK loadShaders() returns void while its fetch/compile chain is still active.
  // Keep this narrow SDK-version bridge out of the host-independent renderer.
  `export async function prepareRenderer(renderer: any, gl: any, shaderPath: string): Promise<void> {
    if (typeof renderer.loadShaders !== 'function') return;
    const failure = 'Live2D shaders could not load or compile. Re-run SDK setup, check /live2d/shaders/ and browser WebGL support, and inspect the browser console.';
    const shaderExports: any = shaderModule;
    const manager = shaderExports.CubismShaderManager_WebGL?.getInstance?.();
    const shader = manager?.getShader?.(gl) ?? shaderExports.CubismShader_WebGL?.getInstance?.();
    if (!shader) throw new Error('The installed Cubism SDK has an unsupported shader interface. Re-run setup with a compatible complete official SDK.');
    const pending = renderer.loadShaders(shaderPath);
    let loadError;
    try { await pending; } catch (error) { loadError = error; }
    // Do not time out and release Framework while its shader fetches can still
    // complete against that Framework. The caller retains its loading reference.
    while (shader._isShaderLoading === true) await new Promise(resolve => setTimeout(resolve, 10));
    const shaders = Array.isArray(shader._shaderSets) ? Array.from(shader._shaderSets) : [];
    let required = shaders;
    if (typeof shader._blendShaderSetMap?.values === 'function') {
      // 5-r.5 allocates three unused trailing slots for the Normal/Over blend,
      // which uses the base shader instead. Validate every reachable program.
      const indices = new Set<number>(Array.from({ length: 11 }, (_, index) => index));
      for (const base of shader._blendShaderSetMap.values()) {
        if (!Number.isInteger(base) || base < 11 || base + 2 >= shaders.length) throw new Error(failure);
        for (let offset = 0; offset < 3; offset++) indices.add(base + offset);
      }
      required = Array.from(indices, index => shaders[index]);
    }
    if (loadError || shader._isShaderLoaded !== true || !required.length || !required.every((entry: any) => entry?.shaderProgram)) {
      throw new Error(failure);
    }
  }`
].join('\n');
const REQUIRED_SOURCES = [
  'Framework/src/live2dcubismframework.ts',
  'Framework/src/model/cubismusermodel.ts',
  'Framework/src/cubismmodelsettingjson.ts',
  'Framework/src/math/cubismmatrix44.ts',
  'Framework/src/physics/cubismphysics.ts',
  'Framework/src/effect/cubismpose.ts',
  'Framework/src/rendering/cubismshader_webgl.ts'
];
const NOTICE_FILE = /(?:licen[cs]e|notice|redistribut|copying)/i;

function usage() {
  return [
    'Usage: npm run setup:live2d -- --sdk <official SDK folder> --accept-sdk-license',
    '',
    `Download and extract the official Cubism SDK for Web yourself: ${DOWNLOAD_URL}`,
    'Read the proprietary/open software agreements and the SDK license/notice files first.',
    '--accept-sdk-license confirms you have reviewed and accepted the applicable SDK terms.',
    'This acknowledgement is not a publication license or permission to use any model.',
    'No SDK or model is downloaded. Generated assets remain local and git-ignored.'
  ].join('\n');
}

function parseArgs(args) {
  const options = { sdk: undefined, acceptSdkLicense: false, help: false };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--accept-sdk-license') options.acceptSdkLicense = true;
    else if (arg === '--sdk') {
      if (options.sdk || !args[index + 1] || args[index + 1].startsWith('--')) {
        throw new Error('--sdk requires exactly one local SDK folder.');
      }
      options.sdk = args[++index];
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

async function regularFile(file) {
  try { return (await fs.lstat(file)).isFile(); }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

// Do not follow links or copy dependencies/models from an extracted SDK.
async function filesBelow(folder, { rootNoticesOnly = false } = {}) {
  const files = [];
  for (const entry of await fs.readdir(folder, { withFileTypes: true })) {
    const file = path.join(folder, entry.name);
    if (entry.isFile()) {
      if (!rootNoticesOnly || NOTICE_FILE.test(entry.name)) files.push(file);
    } else if (entry.isDirectory() && !['node_modules', '.git', 'Samples'].includes(entry.name)) {
      if (!rootNoticesOnly || NOTICE_FILE.test(entry.name)) {
        files.push(...await filesBelow(file));
      }
    }
  }
  return files;
}

function contains(parent, child) {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

// Windows temp folders can use an 8.3 alias (for example ILIESC~1). Resolve an
// existing ancestor before comparing paths so aliases cannot hide overlap.
async function canonicalDestination(destination) {
  try { return await fs.realpath(destination); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const parent = path.dirname(destination);
    if (parent === destination) throw error;
    return path.join(await canonicalDestination(parent), path.basename(destination));
  }
}

async function copyFile(source, destination) {
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.copyFile(source, destination);
}

async function installSdk({ sdk, acceptSdkLicense = false, output = DEFAULT_OUTPUT } = {}) {
  if (acceptSdkLicense !== true) {
    throw new Error('SDK terms must be reviewed and accepted explicitly with --accept-sdk-license. Nothing was installed.');
  }
  if (!sdk) throw new Error(`Missing --sdk folder. Obtain the official SDK from ${DOWNLOAD_URL}`);
  const sdkRoot = await fs.realpath(path.resolve(sdk)).catch(error => {
    if (error.code === 'ENOENT') throw new Error(`SDK folder does not exist: ${sdk}`);
    throw error;
  });
  const outputRoot = await canonicalDestination(path.resolve(output));
  if (outputRoot === path.parse(outputRoot).root || contains(sdkRoot, outputRoot) || contains(outputRoot, sdkRoot)) {
    throw new Error('SDK and generated output must be separate folders.');
  }
  const core = path.join(sdkRoot, 'Core');
  const framework = path.join(sdkRoot, 'Framework');
  const coreScript = path.join(core, 'live2dcubismcore.min.js');
  for (const relative of ['Core/live2dcubismcore.min.js', ...REQUIRED_SOURCES]) {
    if (!await regularFile(path.join(sdkRoot, relative))) {
      throw new Error(`Official SDK file missing: ${relative}. Pass the extracted SDK root containing Core and Framework, not a third-party runtime.`);
    }
  }
  // Cubism 5-r.5 replaced csmMap with native Map. Keep the exported layout
  // constructor stable while consuming the SDK's own expected map interface.
  const layoutMapExport = await regularFile(path.join(framework, 'src/type/csmmap.ts'))
    ? 'export { csmMap } from "./Framework/src/type/csmmap";'
    : 'export const csmMap = Map;';
  const noticeGroups = [];
  for (const [label, folder, rootNoticesOnly] of [['SDK', sdkRoot, true], ['Core', core, false], ['Framework', framework, false]]) {
    const notices = (await filesBelow(folder, { rootNoticesOnly })).filter(file => NOTICE_FILE.test(path.basename(file)));
    if (!notices.some(file => /licen[cs]e/i.test(path.basename(file)))) {
      throw new Error(`${label} license file missing. Use the complete, unmodified official SDK archive with its license and notice files.`);
    }
    noticeGroups.push({ label, folder, notices });
  }
  let esbuild;
  try { esbuild = require('esbuild'); }
  catch { throw new Error('esbuild is missing. Run npm install before setting up Live2D.'); }

  await fs.mkdir(path.dirname(outputRoot), { recursive: true });
  const stage = await fs.mkdtemp(path.join(path.dirname(outputRoot), '.live2d-setup-'));
  const backup = `${stage}-previous`;
  let previousMoved = false;
  try {
    const header = (await fs.readFile(path.join(framework, 'src/live2dcubismframework.ts'), 'utf8')).match(/^\s*(\/\*\*[\s\S]*?\*\/)/)?.[1];
    await esbuild.build({
      stdin: { contents: `${ENTRY}\n${layoutMapExport}`, resolveDir: sdkRoot, sourcefile: 'companion-cubism-entry.ts', loader: 'ts' },
      outfile: path.join(stage, 'cubism-framework.js'),
      bundle: true, format: 'iife', globalName: 'CompanionCubism', platform: 'browser',
      target: 'es2020', legalComments: 'eof', logLevel: 'silent',
      banner: { js: [header, '/*! Live2D Cubism SDK. Copyright(c) Live2D Inc. All rights reserved. See ./licenses/ for SDK terms and notices. */'].filter(Boolean).join('\n') }
    });
    const runtimeFiles = (await filesBelow(core)).filter(file =>
      /\.(?:wasm|data|mem)$/i.test(file) || /^live2dcubismcore.*\.js$/i.test(path.basename(file))
    );
    for (const file of runtimeFiles) await copyFile(file, path.join(stage, path.relative(core, file)));
    for (const { label, folder, notices } of noticeGroups) {
      for (const file of notices) await copyFile(file, path.join(stage, 'licenses', label, path.relative(folder, file)));
    }
    // Older releases embed shaders. New releases load the official shader files.
    const shaders = path.join(framework, 'Shaders', 'WebGL');
    let shaderFiles = [];
    try { shaderFiles = await filesBelow(shaders); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    for (const file of shaderFiles) await copyFile(file, path.join(stage, 'shaders', path.relative(shaders, file)));

    const digest = async file => createHash('sha256').update(await fs.readFile(file)).digest('hex');
    await fs.writeFile(path.join(stage, 'installation.json'), JSON.stringify({
      schemaVersion: 1, source: DOWNLOAD_URL,
      coreSha256: await digest(coreScript),
      frameworkSha256: await digest(path.join(stage, 'cubism-framework.js')),
      externalShaders: shaderFiles.length > 0,
      licenseNotices: 'licenses/',
      note: 'Installed from a user-supplied SDK after explicit acceptance. No model is included. Review Live2D publication terms before distribution.'
    }, null, 2) + '\n');
    try { await fs.rename(outputRoot, backup); previousMoved = true; }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    try { await fs.rename(stage, outputRoot); }
    catch (error) {
      if (previousMoved) { await fs.rename(backup, outputRoot); previousMoved = false; }
      throw error;
    }
    if (previousMoved) await fs.rm(backup, { recursive: true, force: true });
    return { output: outputRoot, runtimeFiles: runtimeFiles.length, shaderFiles: shaderFiles.length };
  } finally {
    await fs.rm(stage, { recursive: true, force: true });
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) { process.stdout.write(usage() + '\n'); return; }
  const result = await installSdk(options);
  process.stdout.write(`Live2D Core, Framework and license notices installed into ${result.output}\n`);
  process.stdout.write('No model was copied. Configure an authorized local .model3.json in the dashboard.\n');
}

if (require.main === module) main().catch(error => {
  process.stderr.write(`Live2D setup failed: ${error.message}\n\n${usage()}\n`);
  process.exitCode = 1;
});

module.exports = { installSdk, parseArgs, usage };
