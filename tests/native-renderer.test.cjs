const { test } = require('node:test');
const assert = require('node:assert/strict');
const { NativeLive2DRenderer, Live2DParameterDriver, poseForState, localAssetUrl, DEFAULT_PARAMETERS } = require('../source/web/public/live2d-renderer');

test('activity and emotion poses differ while only speaking can open the mouth', () => {
  const poses = ['idle', 'listening', 'thinking', 'speaking'].map(activity => poseForState({ activity, emotion: 'neutral' }, 2, 0.7));
  assert.equal(new Set(poses.map(pose => JSON.stringify(pose))).size, 4);
  assert.ok(poses[1].angleY > poses[0].angleY);
  assert.ok(poses[2].eyeBallX > poses[1].eyeBallX);
  assert.deepEqual(poses.map(pose => pose.mouthOpen), [0, 0, 0, 0.7]);
  const emotions = ['neutral', 'love', 'angry', 'sad', 'amazed', 'sleepy', 'nervous'];
  const expressions = emotions.map(emotion => poseForState({ activity: 'idle', emotion }, 2, 1));
  assert.equal(new Set(expressions.map(pose => JSON.stringify(pose))).size, emotions.length);
  assert.ok(expressions.every(pose => pose.mouthOpen === 0));
});

function rig(ids = Object.values(DEFAULT_PARAMETERS)) {
  const values = new Map();
  return {
    values,
    getParameterCount: () => ids.length,
    getParameterId: index => ids[index],
    getParameterMinimumValue: () => -1,
    getParameterMaximumValue: () => 1,
    setParameterValueByIndex: (index, value) => values.set(ids[index], value),
    getCanvasWidth: () => 2, getCanvasHeight: () => 4,
    loadParameters() {}, update() {},
  };
}
const framework = { getIdManager: () => ({ getId: id => id }) };
const settings = (lipIds = [], eyeIds = []) => ({
  getLipSyncParameterCount: () => lipIds.length, getLipSyncParameterId: index => lipIds[index],
  getEyeBlinkParameterCount: () => eyeIds.length, getEyeBlinkParameterId: index => eyeIds[index],
  release() {},
});

test('driver honors rig lip-sync groups, custom aliases and bounds without inventing missing parameters', () => {
  const model = rig(['CustomMouth', 'OtherMouth', 'Head', 'CustomEye']);
  const driver = new Live2DParameterDriver(model, framework, settings(['CustomMouth', 'OtherMouth'], ['CustomEye']), { angleX: 'Head' });
  driver.apply(poseForState({ activity: 'speaking', emotion: 'neutral' }, 3, 0.6));
  assert.equal(model.values.get('CustomMouth'), 0.6);
  assert.equal(model.values.get('OtherMouth'), 0.6);
  assert.ok(Math.abs(model.values.get('Head')) <= 1);
  assert.equal(model.values.size, 4);
  assert.ok(driver.missing.includes('breath'));
  assert.ok(!driver.missing.includes('eyeROpen'), 'the rig eye-blink group covers both eyes without a false warning');
  driver.closeMouth();
  assert.equal(model.values.get('CustomMouth'), 0);
  const custom = new Live2DParameterDriver(model, framework, settings(['OtherMouth']), { mouthOpen: 'CustomMouth' });
  model.values.clear(); custom.apply(poseForState({ activity: 'speaking', emotion: 'neutral' }, 3, 0.8));
  assert.equal(model.values.get('CustomMouth'), 0.8);
  assert.equal(model.values.has('OtherMouth'), false);
});

test('all model references are constrained to local model assets, including encoded paths', () => {
  const base = 'http://localhost:3000/models/authorized/avatar.model3.json';
  assert.equal(localAssetUrl('textures/texture 00.png', base, '.png'), 'http://localhost:3000/models/authorized/textures/texture%2000.png');
  for (const path of ['https://other.example/model.png', '//other.example/model.png', '../model.png', '%2e%2e/model.png', '%252e%252e/model.png', 'C:\\model.png', 'file:///model.png', '/private.png', 'evil.js', 'tex.png?track=1', 'tex.png#track', '%5cmodel.png']) {
    assert.throws(() => localAssetUrl(path, base, '.png'), undefined, path);
  }
});

function fixture(options = {}) {
  const calls = { start: 0, initialize: 0, dispose: 0, clean: 0, released: 0, drawn: 0, deletedTextures: 0, fetched: [] };
  const frames = new Map(), listeners = new Map();
  let nextFrame = 0, nextTexture = 0;
  const gl = new Proxy({
    createTexture: () => ({ texture: ++nextTexture }),
    deleteTexture: () => calls.deletedTextures++,
    isContextLost: () => false,
  }, { get(target, property) { return target[property] || (() => {}); } });
  const canvas = { width: 600, height: 600, clientWidth: 300, clientHeight: 400,
    addEventListener: (event, callback) => listeners.set(event, callback),
    removeEventListener: event => listeners.delete(event),
    getBoundingClientRect: () => ({ left: 20, top: 30, width: canvas.clientWidth, height: canvas.clientHeight }),
    getContext: () => gl,
  };
  const models = [];
  class UserModel {
    constructor() { this.model = rig(); this.released = false; models.push(this); }
    loadModel() { if (options.invalidMoc) this.model = null; }
    getModel() { return this.model; }
    getModelMatrix() { return { setHeight() {}, centerX() {}, centerY() {}, setupFromLayout(layout) { calls.layout = layout; } }; }
    createRenderer() {}
    getRenderer() { return { startUp() {}, setIsPremultipliedAlpha() {}, bindTexture() {}, setMvpMatrix() {}, setRenderState() {}, drawModel: () => calls.drawn++, ...(options.prepareRenderer ? { loadShaders() {} } : {}) }; }
    release() { assert.equal(this.released, false); this.released = true; calls.released++; }
  }
  const sdk = {
    CubismFramework: { ...framework,
      startUp: () => { calls.start++; return true; }, initialize: () => calls.initialize++,
      dispose: () => calls.dispose++, cleanUp: () => calls.clean++,
    },
    CubismUserModel: UserModel,
    CubismModelSettingJson: class { constructor() { Object.assign(this, settings()); } },
    CubismMatrix44: class { loadIdentity() {} scale() {} multiplyByMatrix() {} },
    csmMap: Map,
    ...(options.prepareRenderer ? { prepareRenderer: options.prepareRenderer } : {}),
  };
  const encoder = new TextEncoder();
  const modelJson = { Version: 3, FileReferences: { Moc: 'avatar.moc3', Textures: ['texture.png'] } };
  const defaultFetch = async (url, init) => {
    assert.equal(init.redirect, 'error');
    const body = url.endsWith('.model3.json') ? encoder.encode(JSON.stringify(options.modelJson || modelJson)).buffer : new ArrayBuffer(16);
    return { ok: !options.failTexture || !url.endsWith('.png'), status: 404, arrayBuffer: async () => body, blob: async () => ({}) };
  };
  const renderer = new NativeLive2DRenderer(canvas, {
    origin: 'http://localhost:3000', getSdk: async () => sdk,
    fetch: async (url, init) => { calls.fetched.push(url); return (options.fetch || defaultFetch)(url, init, defaultFetch); },
    decodeImage: async () => ({}),
    requestAnimationFrame: callback => { frames.set(++nextFrame, callback); return nextFrame; },
    cancelAnimationFrame: frame => frames.delete(frame),
  });
  const tick = (time = 1000) => { const [id, callback] = frames.entries().next().value; frames.delete(id); callback(time); };
  return { renderer, calls, frames, listeners, models, canvas, tick };
}

test('model loading, drawing, switching and disposal free GPU, model and SDK resources', async () => {
  const { renderer, calls, frames, listeners, models, tick } = fixture();
  try {
    assert.equal(await renderer.loadModel('/models/first/avatar.model3.json'), true);
    renderer.setState({ activity: 'speaking', emotion: 'love' }); renderer.setMouth(0.8);
    tick();
    assert.equal(models[0].model.values.get('ParamMouthOpenY'), 0.8);
    assert.equal(calls.drawn, 1);
    renderer.setState({ activity: 'thinking', emotion: 'neutral' });
    assert.equal(models[0].model.values.get('ParamMouthOpenY'), 0);
    assert.equal(await renderer.loadModel('/models/second/avatar.model3.json'), true);
    assert.equal(calls.released, 1); assert.equal(calls.deletedTextures, 1);
    assert.equal(calls.start, 1); assert.equal(frames.size, 1);
    tick(2000); assert.equal(calls.drawn, 2);
  } finally { renderer.dispose(); }
  assert.equal(calls.released, 2); assert.equal(calls.deletedTextures, 2);
  assert.equal(calls.dispose, 1); assert.equal(calls.clean, 1);
  assert.equal(frames.size, 0); assert.equal(listeners.size, 0);
  renderer.dispose(); assert.equal(calls.dispose, 1);
  await assert.rejects(renderer.loadModel('/models/third/avatar.model3.json'), /disposed/);
});

test('Cubism 5-r.5 native Map layout entries reach the official model matrix', async () => {
  const layout = { width: 2, center_x: 0, center_y: -0.1 };
  const { renderer, calls } = fixture({ modelJson: { Version: 3, FileReferences: { Moc: 'avatar.moc3', Textures: ['texture.png'] }, Layout: layout } });
  try {
    await renderer.loadModel('/models/authorized/avatar.model3.json');
    assert.ok(calls.layout instanceof Map);
    assert.deepEqual(Object.fromEntries(calls.layout), layout);
  } finally { renderer.dispose(); }
});

test('queued callbacks from a previous model cannot create a second animation loop', async () => {
  const { renderer, frames, calls, tick } = fixture();
  try {
    await renderer.loadModel('/models/first/avatar.model3.json');
    const queuedOldFrame = frames.values().next().value;
    await renderer.loadModel('/models/second/avatar.model3.json');
    const currentFrame = renderer.frame;
    queuedOldFrame(1000);
    assert.equal(calls.drawn, 0); assert.equal(renderer.frame, currentFrame); assert.equal(frames.size, 1);
    tick(); assert.equal(calls.drawn, 1); assert.equal(frames.size, 1);
  } finally { renderer.dispose(); }
});

test('missing texture and invalid moc release partial models with no running animation', async () => {
  for (const options of [{ failTexture: true }, { invalidMoc: true }]) {
    const { renderer, calls, frames } = fixture(options);
    try {
      await assert.rejects(renderer.loadModel('/models/invalid/avatar.model3.json'));
      assert.equal(calls.released, 1); assert.equal(frames.size, 0); assert.equal(renderer.mouth, 0);
    } finally { renderer.dispose(); }
  }
});

test('remote texture references fail without contacting the remote origin', async () => {
  const { renderer, calls } = fixture({ modelJson: { Version: 3, FileReferences: { Moc: 'avatar.moc3', Textures: ['https://tracking.example/texture.png'] } } });
  try {
    await assert.rejects(renderer.loadModel('/models/authorized/avatar.model3.json'), /local/);
    assert.ok(calls.fetched.every(url => url.startsWith('http://localhost:3000/models/')));
    assert.equal(calls.released, 1);
  } finally { renderer.dispose(); }
});

const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { resolve, promise }; };

test('late model load completion cannot replace a newer model', async () => {
  const blocked = deferred(), entered = deferred();
  const { renderer, calls, frames } = fixture({ fetch: async (url, init, normal) => {
    if (url.includes('/old/') && url.endsWith('.moc3')) { entered.resolve(); await blocked.promise; }
    return normal(url, init);
  } });
  try {
    const oldLoad = renderer.loadModel('/models/old/avatar.model3.json');
    await entered.promise;
    assert.equal(await renderer.loadModel('/models/new/avatar.model3.json'), true);
    const current = renderer.resource;
    blocked.resolve(); assert.equal(await oldLoad, false);
    assert.equal(renderer.resource, current); assert.equal(calls.released, 1); assert.equal(frames.size, 1);
  } finally { renderer.dispose(); }
});

test('disposal during a load frees partial models before tearing down Cubism', async () => {
  const blocked = deferred(), entered = deferred();
  const { renderer, calls, frames } = fixture({ fetch: async (url, init, normal) => {
    if (url.endsWith('.moc3')) { entered.resolve(); await blocked.promise; }
    return normal(url, init);
  } });
  const loading = renderer.loadModel('/models/authorized/avatar.model3.json');
  await entered.promise;
  renderer.dispose(); assert.equal(calls.dispose, 0);
  blocked.resolve(); assert.equal(await loading, false);
  assert.equal(calls.released, 1); assert.equal(calls.dispose, 1); assert.equal(frames.size, 0);
});

test('context loss cancels drawing and closes the mouth; restoration reloads cleanly', async () => {
  const { renderer, calls, frames, listeners } = fixture();
  try {
    await renderer.loadModel('/models/authorized/avatar.model3.json');
    renderer.setState({ activity: 'speaking', emotion: 'neutral' }); renderer.setMouth(0.9);
    let prevented = false;
    listeners.get('webglcontextlost')({ preventDefault: () => { prevented = true; } });
    assert.equal(prevented, true); assert.equal(renderer.mouth, 0); assert.equal(frames.size, 0); assert.equal(calls.released, 1);
    assert.equal(calls.dispose, 1, 'context loss invalidates cached shader programs');
    listeners.get('webglcontextrestored')();
    for (let i = 0; i < 30 && !renderer.resource; i++) await Promise.resolve();
    assert.ok(renderer.resource); assert.equal(frames.size, 1);
    assert.equal(calls.initialize, 2, 'restoration starts with a fresh SDK shader cache');
  } finally { renderer.dispose(); }
});

test('hidden HiDPI canvases retain a bounded backing buffer and resume when visible', async () => {
  const { renderer, calls, canvas, tick } = fixture();
  const originalRatio = globalThis.devicePixelRatio;
  globalThis.devicePixelRatio = 2;
  try {
    await renderer.loadModel('/models/authorized/avatar.model3.json');
    canvas.clientWidth = canvas.clientHeight = 0;
    for (let i = 0; i < 8; i++) tick(i * 20);
    assert.equal(canvas.width, 600); assert.equal(canvas.height, 600); assert.equal(calls.drawn, 0);
    canvas.clientWidth = 200; canvas.clientHeight = 300; tick(200);
    assert.equal(canvas.width, 400); assert.equal(canvas.height, 600); assert.equal(calls.drawn, 1);
  } finally {
    renderer.dispose();
    if (originalRatio === undefined) delete globalThis.devicePixelRatio; else globalThis.devicePixelRatio = originalRatio;
  }
});

test('viewport and pixel-density changes resize the existing model without reloading resources', async () => {
  const { renderer, calls, canvas, models, tick } = fixture();
  const originalRatio = globalThis.devicePixelRatio;
  try {
    await renderer.loadModel('/models/authorized/avatar.model3.json');
    const resource = renderer.resource;
    const requests = calls.fetched.length;
    for (const [width, height, ratio] of [[740, 790, 1], [390, 280, 3], [500, 600, 1.25]]) {
      canvas.clientWidth = width; canvas.clientHeight = height;
      globalThis.devicePixelRatio = ratio;
      tick();
      assert.equal(canvas.width, Math.round(width * Math.min(ratio, 2)));
      assert.equal(canvas.height, Math.round(height * Math.min(ratio, 2)));
      assert.equal(renderer.resource, resource);
    }
    assert.equal(models.length, 1);
    assert.equal(calls.fetched.length, requests);
    assert.equal(calls.released, 0);
    assert.equal(calls.initialize, 1);
    assert.equal(calls.drawn, 3);
  } finally {
    renderer.dispose();
    if (originalRatio === undefined) delete globalThis.devicePixelRatio; else globalThis.devicePixelRatio = originalRatio;
  }
});

test('cursor tracking stays bounded, preserves expressions and cannot open a stopped mouth', async () => {
  const { renderer, models, listeners, tick } = fixture();
  try {
    await renderer.loadModel('/models/authorized/avatar.model3.json');
    const move = listeners.get('pointermove');
    move({ pointerType: 'touch', clientX: 320, clientY: 30 });
    assert.deepEqual(renderer.pointer, { x: 0, y: 0 }, 'touch gestures do not take over gaze');
    move({ pointerType: 'mouse', clientX: 5000, clientY: -5000 });
    assert.deepEqual(renderer.pointer, { x: 1, y: 1 });
    renderer.setState({ activity: 'idle', emotion: 'love' });
    renderer.setMouth(1);
    tick(1000);
    const values = models[0].model.values;
    assert.ok(values.get('ParamEyeBallX') > 0 && values.get('ParamEyeBallX') <= 0.65);
    assert.ok(values.get('ParamEyeBallY') > 0 && values.get('ParamEyeBallY') <= 0.45);
    assert.equal(values.get('ParamMouthForm'), 0.8, 'tracking preserves the current emotion');
    assert.equal(values.get('ParamMouthOpenY'), 0, 'a cursor cannot synthesize speech');
    renderer.setState({ activity: 'speaking', emotion: 'love' }); renderer.setMouth(0.7);
    tick(1100);
    assert.equal(values.get('ParamMouthOpenY'), 0.7, 'real playback still controls mouth movement');
    listeners.get('pointerleave')();
    assert.deepEqual(renderer.pointer, { x: 0, y: 0 });
    renderer.setState({ activity: 'idle', emotion: 'neutral' });
    for (let frame = 1; frame <= 12; frame++) tick(1100 + frame * 100);
    assert.ok(Math.abs(values.get('ParamEyeBallX')) < 0.001, 'gaze settles back after the cursor leaves');
    assert.equal(values.get('ParamMouthOpenY'), 0);
    move({ pointerType: 'pen', clientX: 20, clientY: 430 });
    listeners.get('pointercancel')();
    assert.deepEqual(renderer.pointer, { x: 0, y: 0 });
  } finally { renderer.dispose(); }
  assert.equal(listeners.size, 0, 'disposing releases pointer and graphics listeners');
});

test('shader compilation finishes before a model becomes ready or its framework is freed', async () => {
  const blocked = deferred(), entered = deferred();
  const { renderer, calls, frames } = fixture({ prepareRenderer: async (_renderer, _gl, path) => {
    assert.equal(path, '/live2d/shaders/'); entered.resolve(); await blocked.promise;
  } });
  const loading = renderer.loadModel('/models/authorized/avatar.model3.json');
  await entered.promise;
  assert.equal(renderer.resource, null); assert.equal(frames.size, 0);
  renderer.dispose(); assert.equal(calls.dispose, 0);
  blocked.resolve(); assert.equal(await loading, false);
  assert.equal(calls.dispose, 1); assert.equal(calls.released, 1); assert.equal(frames.size, 0);
});

test('shader failure leaves an actionable error and frees every partial GPU resource', async () => {
  const { renderer, calls, frames } = fixture({ prepareRenderer: async () => { throw new Error('Shader compile failed'); } });
  try {
    await assert.rejects(renderer.loadModel('/models/authorized/avatar.model3.json'), /Shader compile failed/);
    assert.equal(renderer.resource, null); assert.equal(frames.size, 0);
    assert.equal(calls.released, 1); assert.equal(calls.deletedTextures, 1);
  } finally { renderer.dispose(); }
});
