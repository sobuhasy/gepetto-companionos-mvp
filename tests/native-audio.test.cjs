const { test } = require('node:test');
const assert = require('node:assert/strict');
const { AvatarMediaSession } = require('../source/web/public/avatar-lifecycle');

class AudioMock extends EventTarget {
  paused = true;
  ended = false;
  listeners = new Map();
  addEventListener(event, listener) {
    super.addEventListener(event, listener);
    this.listeners.set(event, listener);
  }
  removeEventListener(event, listener) {
    super.removeEventListener(event, listener);
    if (this.listeners.get(event) === listener) this.listeners.delete(event);
  }
  play() { this.paused = false; return Promise.resolve(); }
  pause() { this.paused = true; this.fire('pause'); }
  fire(event) { this.dispatchEvent(new Event(event)); }
}
class NodeMock {
  connections = new Set();
  connect(node) { this.connections.add(node); }
  disconnect() { this.connections.clear(); }
}
function fixture(options = {}) {
  const mouth = [], states = [], sent = [], elements = [], frames = new Map(), cancelled = [];
  let frameId = 0, interaction = 0, amplitude = 0.1, createdContexts = 0;
  const analyser = Object.assign(new NodeMock(), {
    getFloatTimeDomainData(samples) { samples.fill(amplitude); },
  });
  const sources = [];
  const context = {
    state: 'suspended', destination: {}, resumes: 0, closes: 0,
    resume() { this.resumes++; this.state = 'running'; return Promise.resolve(); },
    close() { this.closes++; this.state = 'closed'; return Promise.resolve(); },
    createAnalyser() { if (options.analyserFailure) throw new Error('Analysis unavailable'); return analyser; },
    createMediaElementSource(audio) { const source = new NodeMock(); source.audio = audio; sources.push(source); return source; },
  };
  let activity = 'idle';
  const session = new AvatarMediaSession(async request => {
    sent.push(request);
    if (options.send) {
      const result = await options.send(request);
      if (result !== undefined) return result;
    }
    if (request.event === 'begin') {
      activity = request.activity;
      return { interactionId: String(++interaction), avatar: { activity, emotion: 'neutral' } };
    }
    if (request.event === 'playing') activity = 'speaking';
    if (['ended', 'error', 'cancel'].includes(request.event)) activity = 'idle';
    return { accepted: true, avatar: { activity, emotion: 'neutral' } };
  }, url => {
    const audio = new AudioMock(); audio.url = url; elements.push(audio); return audio;
  }, {
    onMouth: level => mouth.push(level),
    onState: state => states.push(state),
    makeAudioContext: () => { createdContexts++; return context; },
    requestFrame: callback => { frames.set(++frameId, callback); return frameId; },
    cancelFrame: id => { cancelled.push(frames.get(id)); frames.delete(id); },
  });
  const flush = async () => { await session.queue; await Promise.resolve(); };
  const sample = () => {
    const pending = [...frames.entries()];
    frames.clear();
    for (const [, callback] of pending) callback();
  };
  const start = async () => {
    await session.begin('thinking');
    await session.play('/eve_voice.wav');
    const audio = session.audio;
    audio.fire('playing'); await flush(); sample();
    return audio;
  };
  return { session, mouth, states, sent, elements, frames, cancelled, context, analyser, sources,
    flush, sample, start, amplitude: value => { amplitude = value; }, contexts: () => createdContexts };
}

test('mouth follows the actual playback samples, with silence gate and clamping', async t => {
  const f = fixture(); t.after(() => f.session.dispose());
  await f.session.begin('thinking');
  assert.equal(f.context.resumes, 1, 'context is activated at interaction start');
  await f.session.play('/eve_voice.wav');
  assert.equal(f.frames.size, 0, 'play promise is not a playing event');
  assert.equal(f.sources.length, 0, 'audio is not redirected before accepted playback');
  f.session.audio.fire('playing'); await f.flush(); f.sample();
  assert.equal(f.sources[0].audio, f.session.audio, 'analysis uses the same browser player');
  assert.ok(Math.abs(f.mouth.at(-1) - 0.44) < 0.001);
  assert.equal(f.states.at(-1).activity, 'speaking');
  f.amplitude(0); f.sample(); assert.equal(f.mouth.at(-1), 0);
  f.amplitude(1); f.sample(); assert.equal(f.mouth.at(-1), 1);
});

for (const event of ['ended', 'error', 'pause', 'cancel']) {
  test(event + ' immediately closes mouth and releases playback resources', async t => {
    const f = fixture(); t.after(() => f.session.dispose());
    const audio = await f.start(); assert.ok(f.mouth.at(-1) > 0);
    const pending = event === 'cancel' ? f.session.cancel() : audio.fire(event);
    assert.equal(f.mouth.at(-1), 0, 'no backend roundtrip is required to close mouth');
    assert.equal(f.frames.size, 0);
    assert.equal(audio.listeners.size, 0);
    assert.equal(f.sources[0].connections.size, 0);
    assert.equal(audio.paused, true);
    await pending; await f.flush();
    assert.equal(f.session.id, null);
    assert.equal(f.states.at(-1).activity, 'idle');
  });
}

for (const event of ['waiting', 'stalled']) {
  test(event + ' closes mouth during buffering and real playing resumes analysis', async t => {
    const f = fixture(); t.after(() => f.session.dispose());
    const audio = await f.start();
    audio.fire(event);
    assert.equal(f.mouth.at(-1), 0);
    assert.equal(f.frames.size, 0);
    assert.ok(f.sources[0].connections.has(f.context.destination), 'buffering preserves audio output');
    const id = f.session.id;
    audio.fire('playing'); await f.flush(); f.sample();
    assert.ok(f.mouth.at(-1) > 0);
    assert.equal(f.session.id, id);
    assert.equal(f.sources.length, 1, 'a media element gets at most one source node');
    assert.equal(f.sources[0].connections.size, 1, 'resuming does not double the output');
  });
}

test('late playing acknowledgement cannot reopen mouth after buffering starts', async t => {
  let acknowledge;
  const f = fixture({ send: request => request.event === 'playing'
    ? new Promise(resolve => { acknowledge = resolve; }) : undefined });
  t.after(() => f.session.dispose());
  await f.session.begin('thinking'); await f.session.play('/eve_voice.wav');
  const audio = f.session.audio;
  audio.fire('playing');
  await Promise.resolve(); await Promise.resolve();
  audio.fire('waiting');
  acknowledge({ accepted: true, avatar: { activity: 'speaking', emotion: 'neutral' } });
  await f.flush();
  assert.equal(f.frames.size, 0);
  assert.equal(f.mouth.at(-1), 0);
});

test('old audio events and already queued animation frames cannot reset a new owner', async t => {
  const f = fixture(); t.after(() => f.session.dispose());
  const oldAudio = await f.start();
  const oldError = oldAudio.listeners.get('error');
  const oldPlaying = oldAudio.listeners.get('playing');
  const oldFrame = [...f.frames.values()][0];
  const nextAudio = await f.start();
  const id = f.session.id, level = f.mouth.at(-1), messages = f.sent.length;
  oldAudio.fire('ended'); oldError(); oldPlaying(); oldFrame();
  await f.flush();
  assert.equal(f.session.id, id);
  assert.equal(f.session.audio, nextAudio);
  assert.equal(f.mouth.at(-1), level);
  assert.equal(f.frames.size, 1);
  assert.equal(f.sent.length, messages);
  assert.equal(f.contexts(), 1, 'audio context is reused across interactions');
});

for (const failure of ['rejected', 'idle', 'network']) {
  test('heartbeat ' + failure + ' stops disconnected ownership and mouth movement', async t => {
    const f = fixture({ send: request => {
      if (request.event !== 'heartbeat') return;
      if (failure === 'network') throw new Error('Disconnected');
      return { accepted: failure !== 'rejected', avatar: { activity: failure === 'idle' ? 'idle' : 'listening', emotion: 'neutral' } };
    } });
    t.after(() => f.session.dispose());
    const audio = await f.start();
    await f.session.event('heartbeat').catch(() => {});
    assert.equal(f.mouth.at(-1), 0);
    assert.equal(f.session.id, null);
    assert.equal(audio.paused, true);
    assert.equal(f.frames.size, 0);
  });
}

test('rejected playing ownership never attaches analysis or animates the mouth', async t => {
  const f = fixture({ send: request => request.event === 'playing' ? { accepted: false } : undefined });
  t.after(() => f.session.dispose());
  const audio = await f.start();
  assert.equal(f.sources.length, 0);
  assert.equal(f.mouth.at(-1), 0);
  assert.equal(f.session.id, null);
  assert.equal(audio.paused, true);
});

test('analysis failure preserves normal audio and does not claim fake lip sync', async t => {
  const f = fixture({ analyserFailure: true }); t.after(() => f.session.dispose());
  const audio = await f.start();
  assert.equal(audio.paused, false);
  assert.equal(f.sources.length, 0, 'failed analyser setup does not redirect the audio element');
  assert.equal(f.mouth.at(-1), 0);
  assert.equal(f.session.id, '1');
});

test('blocked AudioContext resume leaves the existing browser playback path intact', async t => {
  const f = fixture(); t.after(() => f.session.dispose());
  f.context.resume = () => Promise.reject(new Error('User activation required'));
  const audio = await f.start();
  assert.equal(audio.paused, false);
  assert.equal(f.sources.length, 0, 'suspended Web Audio never takes over browser audio');
  assert.equal(f.mouth.at(-1), 0);
});

test('graph setup failure after source creation falls back to direct audio output', async t => {
  const f = fixture(); t.after(() => f.session.dispose());
  f.analyser.connect = () => { throw new Error('Analysis node unavailable'); };
  const audio = await f.start();
  assert.equal(audio.paused, false);
  assert.ok(f.sources[0].connections.has(f.context.destination));
  assert.equal(f.sources[0].connections.size, 1);
  assert.equal(f.mouth.at(-1), 0);
  assert.equal(f.frames.size, 0);
});

test('sample failure keeps a direct playback path and closes mouth', async t => {
  const f = fixture(); t.after(() => f.session.dispose());
  const audio = await f.start();
  f.analyser.getFloatTimeDomainData = () => { throw new Error('Device disappeared'); };
  f.sample();
  assert.equal(f.mouth.at(-1), 0);
  assert.equal(f.frames.size, 0);
  assert.ok(f.sources[0].connections.has(f.context.destination));
  assert.equal(audio.paused, false);
});

test('rejected play and server idle observation immediately release playback', async t => {
  const f = fixture(); t.after(() => f.session.dispose());
  await f.session.begin('thinking');
  f.session.makeAudio = () => {
    const audio = new AudioMock(); audio.play = async () => { throw new Error('Autoplay blocked'); }; return audio;
  };
  assert.equal(await f.session.play('/eve_voice.wav'), false);
  assert.equal(f.mouth.at(-1), 0);
  assert.equal(f.session.id, null);
  f.session.makeAudio = () => new AudioMock();
  const audio = await f.start();
  f.session.observe({ activity: 'idle', emotion: 'neutral' });
  assert.equal(f.mouth.at(-1), 0);
  assert.equal(f.session.id, null);
  assert.equal(audio.paused, true);
  assert.equal(await f.session.play('/late.wav'), false, 'stale TTS cannot play after server expiry');
});

test('dispose closes reusable context, timers, nodes and listeners even if cancellation fails', async () => {
  const f = fixture({ send: request => {
    if (request.event === 'cancel') throw new Error('Offline during unload');
  } });
  const audio = await f.start();
  await assert.rejects(f.session.dispose(), /Offline/);
  assert.equal(f.context.closes, 1);
  assert.equal(f.frames.size, 0);
  assert.equal(f.session.timer, null);
  assert.equal(audio.listeners.size, 0);
  assert.equal(f.sources[0].connections.size, 0);
  assert.equal(f.analyser.connections.size, 0);
  assert.equal(f.mouth.at(-1), 0);
  await f.session.dispose();
  assert.equal(f.context.closes, 1);
  await assert.rejects(f.session.begin('thinking'), /disposed/);
});
