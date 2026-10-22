const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { spawn } = require('node:child_process');
const { CompanionPresentationStore, validateLocalModelUrl } = require('../dist/companion/CompanionPresentation');
const { readLocalAvatarAsset } = require('../dist/web/LocalAvatarAssets');
const { createRobotBody, toBodyBackend } = require('../dist/body/BodyFactory');
const { NativeBody } = require('../dist/body/NativeBody');
const { AetherialApp } = require('../dist/index/AetherialApp');
const { TtsTypeCast } = require('../dist/tts/TtsTypeCast');
const { SystemHealthService } = require('../dist/module/SystemHealthService');
const { DEFAULT_CONSENT } = require('../dist/privacy/ConsentState');
const { DEFAULT_GENERATED_COMPANION_PROFILE } = require('../dist/companion/CompanionIdentityGenerator');
const cloud = { ...DEFAULT_CONSENT, localFirst: false };

function setEnv(t, changes) {
  for (const [name, value] of Object.entries(changes)) {
    const before = process.env[name];
    if (value === undefined) delete process.env[name]; else process.env[name] = value;
    t.after(() => { if (before === undefined) delete process.env[name]; else process.env[name] = before; });
  }
}

test('default native runtime initializes, changes state and shuts down without constructing a VTube adapter', async t => {
  setEnv(t, { ROBOT_BODY_BACKEND: undefined, OPENAI_API_KEY: 'unit-test-no-network', TYPECAST_API_KEY: undefined, OBS_PASSWORD: undefined });
  const vtubeModule = require('../dist/body/VTubeBody');
  t.mock.method(vtubeModule, 'VTubeBody', function () { throw new Error('Native mode constructed VTube Studio'); });
  assert.ok(createRobotBody() instanceof NativeBody);
  assert.equal(toBodyBackend(undefined), 'native');
  for (const backend of ['native-pico', 'vtube', 'pico', 'hybrid']) assert.equal(toBodyBackend(backend), backend);
  let freed = false;
  const app = new AetherialApp(() => ({ init: async () => {}, free: async () => { freed = true; } }));
  await app.init();
  assert.ok(app.eveBody instanceof NativeBody);
  const id = await app.avatar.begin('listening');
  assert.equal(app.avatar.current.activity, 'listening');
  await app.avatar.event(id, 'processing');
  app.avatar.preparePlayback(id);
  await app.avatar.event(id, 'playing');
  assert.equal(app.avatar.current.activity, 'speaking');
  await app.shutdown();
  assert.equal(freed, true);
  assert.deepEqual(app.avatar.current, { activity: 'idle', emotion: 'neutral' });
});

test('native health checks do not contact VTube Studio and optional VTube backend retains its probe', async t => {
  setEnv(t, { ROBOT_BODY_BACKEND: 'native' });
  const health = new SystemHealthService(), ports = [];
  health.checkCommand = async () => 'offline';
  health.checkOpenClaw = async () => 'unknown';
  health.checkTcpPort = async (_host, port) => { ports.push(port); return 'offline'; };
  assert.equal((await health.check(true)).vtubeStudio, 'unknown');
  assert.deepEqual(ports, [4455]);
  process.env.ROBOT_BODY_BACKEND = 'vtube';
  ports.length = 0;
  await health.check(true);
  assert.deepEqual(ports, [4455, 8001]);
});

test('presentation mappings persist independently by generated profile and retain mode/legacy fallbacks', async t => {
  const directory = await fs.mkdtemp(join(tmpdir(), 'gepetto-presentation-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  setEnv(t, { COMPANION_VOICE_ID: 'environment-voice', LIVE2D_MODEL_URL: undefined });
  const path = join(directory, 'presentation.json');
  const store = new CompanionPresentationStore(path);
  await store.update('legacy:lyriel', { voiceId: 'legacy-voice', parameterMap: { mouthOpen: 'Mouth' } });
  await store.update('mode:study', { modelUrl: '/models/Study/Study.model3.json', parameterMap: { angleY: 'HeadY' } });
  await Promise.all([
    store.update('generated-one', { voiceId: 'voice-one' }),
    store.update('generated-two', { modelUrl: '/models/Other/Other.model3.json', voiceId: 'voice-two' }),
  ]);
  const reopened = new CompanionPresentationStore(path);
  const first = await reopened.get('generated-one', 'study');
  assert.equal(first.voiceId, 'voice-one');
  assert.equal(first.modelUrl, '/models/Study/Study.model3.json');
  assert.deepEqual(first.parameterMap, { mouthOpen: 'Mouth', angleY: 'HeadY' });
  assert.equal((await reopened.get('generated-two', 'study')).modelUrl, '/models/Other/Other.model3.json');
  assert.equal((await reopened.get('missing', 'study')).voiceId, 'legacy-voice');
  await reopened.update('generated-one', { voiceId: null });
  assert.equal((await reopened.get('generated-one', 'study')).voiceId, 'legacy-voice');
  assert.equal((await reopened.get('missing', 'productivity')).voiceId, 'environment-voice');
  assert.deepEqual((await fs.readdir(directory)), ['presentation.json']);
});

test('presentation rejects remote models, traversal, unsupported aliases and malformed voice IDs', async t => {
  const directory = await fs.mkdtemp(join(tmpdir(), 'gepetto-presentation-invalid-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const store = new CompanionPresentationStore(join(directory, 'presentation.json'));
  for (const model of ['https://example.com/a.model3.json', '/models/../secret.model3.json', '/models/%2e%2e/secret.model3.json', '/models/x%2f..%2fsecret.model3.json', '/models/C:/a.model3.json', '/models/a.model3.json?x', '/models/a.moc3']) {
    assert.throws(() => validateLocalModelUrl(model), /Model URL/);
    await assert.rejects(store.update('current', { modelUrl: model }));
  }
  await assert.rejects(store.update('current', { parameterMap: { unknown: 'ParamX' } }), /supported aliases/);
  await assert.rejects(store.update('current', { parameterMap: { mouthOpen: '<script>' } }), /supported aliases/);
  await assert.rejects(store.update('current', { voiceId: 'voice\nheader' }), /Voice ID/);
  assert.equal(validateLocalModelUrl('/models/My%20Model/My.model3.json'), '/models/My%20Model/My.model3.json');
});

test('selected profile voice reaches actual TypeCast requests for replies and voice tests despite environment fallback', async t => {
  setEnv(t, { COMPANION_VOICE_ID: 'environment-voice', COMPANION_VOICE_ENABLED: 'true', TYPECAST_EMOTION_TYPE: 'off', LIVE2D_MODEL_URL: undefined });
  const directory = await fs.mkdtemp(join(tmpdir(), 'gepetto-selected-voice-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const store = new CompanionPresentationStore(join(directory, 'presentation.json'));
  await store.update('profile-one', { voiceId: 'selected-one', modelUrl: '/models/One/One.model3.json' });
  const calls = [];
  const voice = new TtsTypeCast();
  voice.client = { textToSpeech: async request => { calls.push(request); return { format: 'wav', audioData: new Uint8Array([1, 2]) }; } };
  // Do not touch an existing user's generated audio while checking the real generation request path.
  t.mock.method(fs, 'writeFile', async () => {});
  const app = new AetherialApp(undefined, store);
  app.initialized = true;
  app.eveBody = new NativeBody();
  app.eveVoice = voice;
  app.eveVoiceBackup = { free: async () => {} };
  app.eveBrain = { generate: async () => ({ success: true, value: '{"text":"A selected voice reply","emotion":"love","speak":true}' }), free: async () => {} };
  const interact = async () => {
    const id = await app.avatar.begin('thinking');
    const result = await app.interact('hello', 'text', undefined, 'study', { ...DEFAULT_GENERATED_COMPANION_PROFILE, id: 'profile-one', name: 'Test Companion' }, false, cloud, id);
    await app.avatar.event(id, 'ended');
    return result;
  };
  assert.equal((await interact()).audioUrl, '/eve_voice.wav');
  await app.generateVoiceTest(cloud, 'profile-one', 'study');
  // Restore the mocked writer for persistence, then mock it again only during audio generation.
  fs.writeFile.mock.restore();
  await store.update('profile-one', { voiceId: 'selected-two' });
  t.mock.method(fs, 'writeFile', async () => {});
  await interact();
  assert.deepEqual(calls.map(request => request.voice_id), ['selected-one', 'selected-one', 'selected-two']);
  await app.shutdown();
});

test('avatar asset reads allow rig resources and reject traversal, executable models and outside symlinks', async t => {
  const directory = await fs.mkdtemp(join(tmpdir(), 'gepetto-assets-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const root = join(directory, 'models');
  await fs.mkdir(join(root, 'Model'), { recursive: true });
  await fs.writeFile(join(root, 'Model', 'Model.model3.json'), '{}');
  await fs.writeFile(join(root, 'Model', 'Model.moc3'), 'binary');
  await fs.writeFile(join(root, 'Model', 'texture.png'), 'texture');
  await fs.writeFile(join(root, 'Model', 'unsafe.js'), 'secret');
  await fs.writeFile(join(directory, 'outside.json'), 'private');
  assert.equal((await readLocalAvatarAsset(root, 'Model/Model.moc3', 'model')).data.toString(), 'binary');
  for (const request of ['../outside.json', '%2e%2e/outside.json', 'Model%5c..%5c..%5coutside.json', 'Model/unsafe.js', '/absolute.json']) {
    await assert.rejects(readLocalAvatarAsset(root, request, 'model'));
  }
  const outside = join(directory, 'outside');
  await fs.mkdir(outside);
  await fs.writeFile(join(outside, 'secret.json'), 'private');
  await fs.symlink(outside, join(root, 'escape'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(readLocalAvatarAsset(root, 'escape/secret.json', 'model'), /Invalid avatar asset/);
});

test('HTTP presentation configuration and native startup work without VTube Studio; asset MIME and same-origin controls hold', async t => {
  const directory = await fs.mkdtemp(join(tmpdir(), 'gepetto-native-http-'));
  const modelRoot = join(directory, 'data/live2d/models');
  const publicRoot = join(directory, 'source/web/public');
  await fs.mkdir(join(modelRoot, 'Rig'), { recursive: true });
  await fs.mkdir(join(publicRoot, 'live2d/shaders'), { recursive: true });
  await fs.mkdir(join(publicRoot, 'live2d/licenses/Core'), { recursive: true });
  await fs.writeFile(join(modelRoot, 'Rig', 'Rig.model3.json'), '{}');
  await fs.writeFile(join(modelRoot, 'Rig', 'Rig.moc3'), 'moc');
  await fs.writeFile(join(modelRoot, 'Rig', 'texture.png'), 'png');
  await fs.writeFile(join(modelRoot, 'Rig', 'secret.txt'), 'do not serve');
  await fs.writeFile(join(publicRoot, 'live2d', 'core.wasm'), 'wasm');
  await fs.writeFile(join(publicRoot, 'live2d', 'core.data'), 'data');
  await fs.writeFile(join(publicRoot, 'live2d', 'core.mem'), 'mem');
  await fs.writeFile(join(publicRoot, 'live2d/licenses/Core', 'LICENSE.md'), 'license');
  await fs.writeFile(join(publicRoot, 'live2d/licenses/Core', 'NOTICE.txt'), 'notice');
  await fs.writeFile(join(publicRoot, 'live2d/licenses/Core', 'LICENSE.html'), '<script>must be served as text</script>');
  await fs.writeFile(join(publicRoot, 'live2d', 'unsafe.html'), '<script>not allowed</script>');
  await fs.writeFile(join(publicRoot, 'live2d/shaders', 'shader.vert'), 'shader');
  const child = spawn(process.execPath, [join(__dirname, '../dist/web/server.js')], {
    cwd: directory,
    env: { ...process.env, PORT: '0', ROBOT_BODY_BACKEND: 'native', LIVE2D_MODELS_DIR: modelRoot, LIVE2D_MODEL_URL: '', OBS_PASSWORD: '', TYPECAST_API_KEY: '', OPENAI_API_KEY: 'integration-test-no-network' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(async () => {
    if (child.exitCode === null) { const exited = new Promise(resolve => child.once('exit', resolve)); child.kill(); await exited; }
    await fs.rm(directory, { recursive: true, force: true });
  });
  const address = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Native server startup timeout')), 15000);
    child.once('exit', code => { clearTimeout(timeout); reject(new Error(`Native server exited: ${code}`)); });
    child.stdout.on('data', chunk => { const match = String(chunk).match(/http:\/\/localhost:(\d+)/); if (match) { clearTimeout(timeout); resolve(`http://localhost:${match[1]}`); } });
  });
  const request = (path, method = 'GET', body, extraHeaders = {}) => fetch(address + path, {
    method, headers: { 'Content-Type': 'application/json', ...extraHeaders }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const before = await (await request('/api/companion/profile')).json();
  let response = await request('/api/companion/presentation');
  assert.equal(response.status, 200);
  const initial = await response.json();
  assert.equal(initial.profileId, before.id);
  assert.equal(initial.backend, 'native');
  assert.equal(initial.modelUrl, null);
  assert.deepEqual(await (await request('/api/avatar')).json(), { avatar: { activity: 'idle', emotion: 'neutral' }, avatarBackend: 'native' });
  const selection = { profileId: before.id, modelUrl: '/models/Rig/Rig.model3.json', voiceId: 'chosen-voice', parameterMap: { mouthOpen: 'Mouth' } };
  response = await request('/api/companion/presentation', 'POST', selection);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).voiceId, 'chosen-voice');
  assert.equal((await (await request('/api/companion/presentation')).json()).modelUrl, selection.modelUrl);
  assert.deepEqual(await (await request('/api/companion/profile')).json(), before, 'presentation does not rewrite personality profiles');
  assert.equal((await request('/api/companion/presentation', 'POST', { ...selection, profileId: 'other-person' })).status, 400);
  assert.equal((await request('/api/companion/presentation', 'POST', { modelUrl: 'https://external.invalid/model.model3.json' })).status, 400);
  assert.equal((await request('/api/companion/presentation', 'POST', selection, { Origin: 'http://external.invalid' })).status, 403);
  response = await request('/api/companion/presentation', 'POST', { profileId: 'legacy:lyriel', modelUrl: '/models/Study/Study.model3.json', voiceId: 'study-fallback' });
  assert.equal(response.status, 200);
  response = await request('/api/companion/presentation', 'POST', { profileId: before.id, modelUrl: null, voiceId: null, companionMode: 'study' });
  assert.equal(response.status, 200);
  const cleared = await response.json();
  assert.equal(cleared.modelUrl, '/models/Study/Study.model3.json', 'POST body mode resolves cleared model against selected mode');
  assert.equal(cleared.voiceId, 'study-fallback', 'POST body mode resolves cleared voice against selected mode');
  assert.equal((await (await request('/api/companion/presentation?companionMode=study')).json()).voiceId, 'study-fallback');
  for (const companionMode of [42, 'unknown-mode', {}]) {
    assert.equal((await request('/api/companion/presentation', 'POST', { voiceId: 'must-not-save', companionMode })).status, 400);
  }
  assert.equal((await (await request('/api/companion/presentation?companionMode=study')).json()).voiceId, 'study-fallback', 'invalid modes do not persist changes');
  assert.equal((await request('/api/companion/presentation?companionMode=unknown')).status, 400);
  for (const [path, mime] of [['/models/Rig/Rig.model3.json', 'application/json'], ['/models/Rig/Rig.moc3', 'application/octet-stream'], ['/models/Rig/texture.png', 'image/png'], ['/live2d/core.wasm', 'application/wasm'], ['/live2d/core.data', 'application/octet-stream'], ['/live2d/core.mem', 'application/octet-stream'], ['/live2d/shaders/shader.vert', 'text/plain'], ['/live2d/licenses/Core/LICENSE.md', 'text/plain'], ['/live2d/licenses/Core/NOTICE.txt', 'text/plain'], ['/live2d/licenses/Core/LICENSE.html', 'text/plain']]) {
    response = await request(path); assert.equal(response.status, 200, path); assert.ok(response.headers.get('content-type').startsWith(mime), path);
  }
  assert.equal((await request('/live2d/unsafe.html')).status, 404);
  assert.equal((await request('/models/Rig/secret.txt')).status, 404);
  response = await request('/api/avatar', 'POST', { event: 'begin', activity: 'thinking' }, { 'X-Companion-Consent': JSON.stringify(cloud) });
  assert.equal(response.status, 200);
  const interaction = await response.json();
  assert.equal(interaction.avatar.activity, 'thinking');
  response = await request('/api/avatar', 'POST', { event: 'cancel', interactionId: interaction.interactionId });
  assert.deepEqual((await response.json()).avatar, { activity: 'idle', emotion: 'neutral' });
});
