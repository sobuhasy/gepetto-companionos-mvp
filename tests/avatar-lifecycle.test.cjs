const { test } = require('node:test');
const assert = require('node:assert/strict');
const { AvatarLifecycleController } = require('../dist/body/AvatarLifecycleController');
const { AvatarMediaSession } = require('../source/web/public/avatar-lifecycle');
const { AetherialApp } = require('../dist/index/AetherialApp');
const { VTubeBody } = require('../dist/body/VTubeBody');
const { HybridBody } = require('../dist/body/HybridBody');
const { DEFAULT_CONSENT } = require('../dist/privacy/ConsentState');
const consent = { ...DEFAULT_CONSENT, localFirst: false };
const tick = () => new Promise(resolve => setImmediate(resolve));
function body() {
  const calls = [];
  return { calls, init: async () => {}, free: async () => calls.push('free'),
    setStatusLight: async activity => calls.push(activity),
    setExpression: async emotion => calls.push('emotion:' + emotion) };
}
class AudioMock extends EventTarget {
  play() { return Promise.resolve(); }
  pause() { this.dispatchEvent(new Event('pause')); }
  fire(event) { this.dispatchEvent(new Event(event)); }
}
function browser(controller, audio = new AudioMock()) {
  return { audio, session: new AvatarMediaSession(async value => {
    if (value.event === 'begin') return { interactionId: await controller.begin(value.activity) };
    return { accepted: await controller.event(value.interactionId, value.event) };
  }, () => audio) };
}
function appFixture(response = { text: 'Hello', emotion: 'love', speak: true }) {
  const app = new AetherialApp();
  const robot = body();
  app.initialized = true;
  app.eveBody = robot;
  app.eveBrain = { generate: async () => ({ success: true, value: JSON.stringify(response) }), free: async () => {} };
  app.eveVoice = { generateWithResult: async () => ({ spokenText: 'Hello', audioUrl: '/eve_voice.wav' }), free: async () => {} };
  app.eveVoiceBackup = { free: async () => {} };
  const interact = (id, audio = true) => app.interact('hello', 'text', undefined, undefined, undefined, false, consent, id, audio);
  return { app, robot, interact };
}

test('normal microphone -> transcription -> model -> real playback -> idle', async () => {
  const { app, robot, interact } = appFixture();
  const { session, audio } = browser(app.avatar);
  const id = await session.begin('listening'); // mocked recorder start
  await session.event('processing'); // mocked recorder stop
  const result = await interact(id);
  assert.equal(result.audioUrl, '/eve_voice.wav');
  assert.equal(app.avatar.current.activity, 'thinking', 'TTS completion is not playback completion');
  await session.play(result.audioUrl);
  assert.equal(app.avatar.current.activity, 'thinking', 'play promise alone is not playing');
  audio.fire('playing'); await session.queue;
  assert.deepEqual(app.avatar.current, { activity: 'speaking', emotion: 'love' });
  audio.fire('ended'); await session.queue;
  assert.deepEqual(app.avatar.current, { activity: 'idle', emotion: 'neutral' });
  assert.deepEqual(robot.calls.filter(v => !v.startsWith('emotion:')), ['listening', 'thinking', 'speaking', 'idle']);
  await app.shutdown();
});

test('text-only and audio-disabled interactions never speak or generate TTS', async () => {
  for (const audioEnabled of [true, false]) {
    const { app, robot, interact } = appFixture({ text: 'text', emotion: 'sad', speak: !audioEnabled });
    app.eveVoice.generateWithResult = async () => { throw new Error('Must not call TTS'); };
    const id = await app.avatar.begin('thinking');
    const reply = await interact(id, audioEnabled);
    assert.equal(reply.spokenText, undefined);
    assert.equal(app.avatar.current.activity, 'idle');
    assert.deepEqual(robot.calls.filter(v => !v.startsWith('emotion:')), ['thinking', 'idle']);
    await app.shutdown();
  }
});

test('replaying a completed generation ID cannot overwrite audio or reset playback', async () => {
  const { app, interact } = appFixture();
  const id = await app.avatar.begin('thinking');
  await interact(id);
  await app.avatar.event(id, 'playing');
  await assert.rejects(interact(id), /already processed/);
  assert.equal(app.avatar.current.activity, 'speaking');
  await app.shutdown();
});

test('TTS failure preserves text and resets idle', async () => {
  const { app, interact } = appFixture();
  app.eveVoice.generateWithResult = async () => { throw new Error('mock TTS failure'); };
  const id = await app.avatar.begin('thinking');
  const previous = process.env.ENABLE_LOCAL_TTS_FALLBACK;
  process.env.ENABLE_LOCAL_TTS_FALLBACK = 'false';
  try {
    const reply = await interact(id);
    assert.equal(reply.responseText, 'Hello');
    assert.equal(reply.spokenText, undefined);
    assert.equal(app.avatar.current.activity, 'idle');
  } finally {
    if (previous === undefined) delete process.env.ENABLE_LOCAL_TTS_FALLBACK;
    else process.env.ENABLE_LOCAL_TTS_FALLBACK = previous;
    await app.shutdown();
  }
});

for (const failure of ['rejected-play', 'error', 'pause', 'interrupt']) {
  test('audio failure or interruption resets idle: ' + failure, async () => {
    const robot = body(), controller = new AvatarLifecycleController(() => robot);
    const { session, audio } = browser(controller);
    const id = await session.begin('thinking'); controller.preparePlayback(id);
    if (failure === 'rejected-play') audio.play = async () => { throw new Error('autoplay blocked'); };
    await session.play('/mock.wav');
    if (failure !== 'rejected-play') {
      audio.fire('playing'); await session.queue;
      if (failure === 'interrupt') await session.cancel(); else audio.fire(failure);
      await session.queue;
    }
    assert.equal(controller.current.activity, 'idle');
    await controller.shutdown();
  });
}

test('old playback and request completion cannot reset a newer interaction', async () => {
  const { app, interact } = appFixture();
  let resolve;
  app.eveBrain.generate = () => new Promise(done => { resolve = done; });
  const old = await app.avatar.begin('thinking');
  const pending = interact(old);
  while (!resolve) await tick();
  const next = await app.avatar.begin('listening');
  await assert.rejects(interact(next), /still processing/);
  resolve({ success: true, value: '{"text":"old","emotion":"love","speak":true}' });
  await assert.rejects(pending, /cancelled/);
  assert.equal(await app.avatar.event(old, 'ended'), false);
  assert.equal(app.avatar.current.activity, 'listening');
  assert.equal(app.avatar.isCurrent(next), true);
  await app.shutdown();
});

test('stale browser audio events preserve the new owner', async () => {
  const controller = new AvatarLifecycleController(() => body());
  const { session, audio } = browser(controller);
  const old = await session.begin('thinking'); controller.preparePlayback(old);
  await session.play('/mock.wav');
  const next = await session.begin('listening');
  audio.fire('ended'); audio.fire('playing'); await session.queue;
  assert.equal(controller.isCurrent(next), true);
  assert.equal(controller.current.activity, 'listening');
  await session.cancel(); await controller.shutdown();
});

test('disconnected body and Hybrid sibling failure degrade gracefully', async () => {
  const disconnected = body();
  disconnected.setStatusLight = disconnected.setExpression = async () => { throw new Error('disconnected'); };
  const pico = body();
  const controller = new AvatarLifecycleController(() => new HybridBody([disconnected, pico]));
  const id = await controller.begin('thinking');
  controller.preparePlayback(id); await controller.event(id, 'playing');
  assert.equal(controller.current.activity, 'speaking');
  await controller.reset(id); await controller.shutdown();
  assert.ok(pico.calls.includes('speaking'));
  assert.ok(pico.calls.includes('idle'));
});

test('shutdown during a request suppresses late reply and frees body', async () => {
  const { app, robot, interact } = appFixture();
  let resolve;
  app.eveBrain.generate = () => new Promise(done => { resolve = done; });
  const id = await app.avatar.begin('thinking');
  const pending = interact(id);
  while (!resolve) await tick();
  await app.shutdown();
  resolve({ success: true, value: '{"text":"late","emotion":"love","speak":true}' });
  await assert.rejects(pending, /cancelled/);
  assert.equal(app.avatar.current.activity, 'idle');
  assert.ok(robot.calls.includes('free'));
  await assert.rejects(app.avatar.begin('thinking'), /shut down/);
});

test('expression changes while speaking do not change activity; timers and shutdown clear expressions', async () => {
  const calls = [];
  const bridge = { triggerExpression: async name => calls.push('on:' + name), clearExpression: async name => calls.push('off:' + name), free: async () => calls.push('free') };
  const vtube = new VTubeBody(bridge);
  const controller = new AvatarLifecycleController(() => vtube);
  const id = await controller.begin('thinking'); controller.preparePlayback(id);
  await controller.event(id, 'playing');
  await controller.emotion(id, 'love', 10);
  await controller.emotion(id, 'angry', 1000);
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.deepEqual(controller.current, { activity: 'speaking', emotion: 'angry' });
  assert.ok(calls.includes('off:Love.exp3.json'));
  assert.ok(!calls.includes('off:Angry.exp3.json'));
  await controller.shutdown();
  assert.ok(calls.includes('off:Angry.exp3.json'));
  assert.equal(calls.at(-1), 'free');
});

test('lost browser lease safely returns idle', async () => {
  const controller = new AvatarLifecycleController(() => body(), 15);
  const id = await controller.begin('listening');
  await new Promise(resolve => setTimeout(resolve, 40));
  assert.equal(controller.current.activity, 'idle');
  assert.equal(controller.isCurrent(id), false);
  await controller.shutdown();
});
