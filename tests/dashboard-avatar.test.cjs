const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const publicPath = path.join(__dirname, '../source/web/public');
const source = fs.readFileSync(path.join(publicPath, 'app.js'), 'utf8');
const mediaSource = fs.readFileSync(path.join(publicPath, 'avatar-lifecycle.js'), 'utf8');
const idle = () => ({ activity: 'idle', emotion: 'neutral' });
const profile = id => ({ id, name: id, shortName: id, knownLanguages: ['English'], userNativeLanguage: 'English' });
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};
const settle = async () => {
  // Flush startup/event-handler promises without running browser intervals.
  await new Promise(setImmediate);
  await new Promise(setImmediate);
};

class Element {
  constructor() {
    this.value = '';
    this.checked = false;
    this.dataset = {};
    this.children = [];
    this.listeners = new Map();
    this.classList = { add() {}, remove() {}, toggle() {} };
    this.ownText = '';
  }
  set textContent(value) { this.ownText = String(value); this.children = []; }
  get textContent() { return this.ownText + this.children.map(child => child.textContent).join(''); }
  addEventListener(event, listener) {
    const listeners = this.listeners.get(event) || [];
    listeners.push(listener); this.listeners.set(event, listeners);
  }
  async fire(event, properties = {}) {
    await Promise.all((this.listeners.get(event) || []).map(listener =>
      listener({ preventDefault() {}, target: this, ...properties })));
  }
  appendChild(child) { this.children.push(child); return child; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; this.ownText = ''; }
  setAttribute() {}
  focus() {}
  scrollIntoView() {}
  click() { return this.fire('click'); }
  requestSubmit() { return this.fire('submit'); }
}

async function dashboard(t) {
  const elements = new Map(), requests = [], handlers = new Map(), intervals = new Map(), audio = [];
  const get = id => {
    if (!elements.has(id)) elements.set(id, new Element());
    return elements.get(id);
  };
  get('companion-mode').value = 'productivity';
  get('auto-play-toggle').checked = true;
  get('auto-play-toggle').parentElement = new Element();
  const privacy = ['microphone', 'camera', 'screen', 'memory', 'localFirst'].map(key => {
    const element = new Element(); element.dataset.privacy = key; return element;
  });
  const document = {
    getElementById: get,
    createElement: () => new Element(),
    querySelectorAll: selector => selector === '[data-privacy]' ? privacy : [],
  };
  const window = new Element();
  const storage = new Map();
  const backend = { profile: profile('Companion A'), nextProfile: profile('Companion B'), avatar: idle(), interaction: 0 };
  const presentations = new Map();
  const presentation = id => presentations.get(id) || {
    profileId: id, modelUrl: `/models/${encodeURIComponent(id)}/avatar.model3.json`,
    voiceId: `voice-${id}`, parameterMap: {}, backend: 'native',
  };
  let renderer;
  class RendererMock {
    models = [];
    states = [];
    constructor() { renderer = this; }
    async loadModel(url, parameters) { this.models.push({ url, parameters }); return true; }
    setState(state) { this.states.push({ ...state }); }
    setMouth() {}
    dispose() {}
  }
  class AudioMock extends EventTarget {
    paused = true;
    constructor(url) { super(); this.url = url; audio.push(this); }
    play() { this.paused = false; return Promise.resolve(); }
    pause() { this.paused = true; this.dispatchEvent(new Event('pause')); }
  }
  const fallback = request => {
    const { pathname } = request.url;
    if (pathname === '/api/companion/profile') return backend.profile;
    if (pathname === '/api/companion/generate') {
      backend.profile = backend.nextProfile;
      return backend.profile;
    }
    if (pathname === '/api/companion/presentation') {
      if (request.method === 'POST') return { ...request.body, backend: 'native' };
      return presentation(backend.profile.id);
    }
    if (pathname === '/api/avatar') {
      if (request.method === 'GET') return { avatar: { ...backend.avatar } };
      if (request.body.event === 'begin') {
        backend.avatar = { activity: request.body.activity, emotion: 'neutral' };
        return { interactionId: String(++backend.interaction), avatar: { ...backend.avatar } };
      }
      if (['ended', 'cancel', 'error'].includes(request.body.event)) backend.avatar = idle();
      if (request.body.event === 'playing') backend.avatar.activity = 'speaking';
      return { accepted: true, avatar: { ...backend.avatar } };
    }
    if (pathname === '/api/status') return { ready: true, avatar: { ...backend.avatar }, health: {}, logs: [] };
    if (pathname === '/api/vision') return { image: null };
    if (pathname === '/api/tasks') return { tasks: [] };
    if (pathname === '/api/voice/test') return { success: true, audioUrl: '/voice-test.wav', avatar: { ...backend.avatar } };
    throw new Error(`Unexpected dashboard request: ${request.method} ${pathname}`);
  };
  let intervalId = 0;
  const context = vm.createContext({
    document, window, console, URL, Audio: AudioMock,
    NativeLive2DRenderer: RendererMock,
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    setInterval: (callback, delay) => { intervals.set(++intervalId, { callback, delay }); return intervalId; },
    clearInterval: id => intervals.delete(id),
    fetch: async (url, options = {}) => {
      const request = { url: new URL(url, 'http://localhost'), method: options.method || 'GET',
        body: options.body ? JSON.parse(options.body) : undefined };
      requests.push(request);
      const handler = handlers.get(`${request.method} ${request.url.pathname}`);
      const custom = handler ? await handler(request) : undefined;
      const payload = custom === undefined ? fallback(request) : custom;
      return { ok: true, json: async () => payload };
    },
  });
  // Execute the production event handlers and media ownership implementation.
  // Only browser surfaces, network responses and canvas drawing are substituted.
  vm.runInContext(mediaSource, context, { filename: 'avatar-lifecycle.js' });
  vm.runInContext(source, context, { filename: 'app.js' });
  t.after(async () => { await window.fire('pagehide'); await settle(); });
  await settle();
  return {
    get, requests, handlers, backend, presentations, presentation, renderer, audio,
    poll: async () => {
      for (const timer of [...intervals.values()]) if (timer.delay === 1000) await timer.callback();
    },
  };
}

test('initial profile loads its saved model and voice without changing the dashboard mode', async t => {
  const h = await dashboard(t);
  assert.equal(h.get('companion-mode').value, 'productivity');
  assert.equal(h.renderer.models.at(-1).url, h.presentation(h.backend.profile.id).modelUrl);
  assert.equal(h.get('avatar-voice-id').value, 'voice-Companion A');
  assert.equal(h.get('profile-status').textContent, 'Profile ready');
});

test('generating and saving a companion refresh its independent presentation mapping', async t => {
  const h = await dashboard(t);
  await h.get('generate-companion').click();
  assert.equal(h.get('profile-name').textContent, 'Companion B');
  assert.equal(h.renderer.models.at(-1).url, h.presentation('Companion B').modelUrl);
  h.presentations.set('Companion B', {
    profileId: 'Companion B', modelUrl: '/models/second/second.model3.json',
    voiceId: 'another-authorized-voice', parameterMap: { angleX: 'HeadX' }, backend: 'native',
  });
  await h.get('save-companion').click();
  assert.equal(h.renderer.models.at(-1).url, '/models/second/second.model3.json');
  assert.equal(h.get('avatar-voice-id').value, 'another-authorized-voice');
  assert.equal(h.get('companion-mode').value, 'productivity');
});

test('voice test uses the selected mode and the existing browser playback element', async t => {
  const h = await dashboard(t);
  h.get('companion-mode').value = 'study';
  await h.get('companion-mode').fire('change'); await settle();
  await h.get('voice-test').click();
  const request = h.requests.find(request => request.url.pathname === '/api/voice/test');
  assert.equal(request.body.companionMode, 'study');
  assert.ok(request.body.interactionId);
  assert.equal(h.audio.length, 1);
  assert.match(h.audio[0].url, /^\/voice-test\.wav\?t=/);
  assert.equal(h.audio[0].paused, false);
});

test('idle polling while a text-only reply is in transit preserves the reply', async t => {
  const h = await dashboard(t);
  const reply = deferred(), received = deferred();
  h.handlers.set('POST /api/message', () => {
    // Server completion resets ownership before the HTTP response reaches the tab.
    h.backend.avatar = idle(); received.resolve(); return reply.promise;
  });
  h.get('prompt').value = 'Please answer without speech';
  const submitted = h.get('chat-form').fire('submit');
  await received.promise;
  await h.poll();
  assert.equal(h.get('avatar-state').textContent, 'idle · neutral');
  reply.resolve({ responseText: 'The complete text answer survived.', avatar: idle() });
  await submitted;
  assert.match(h.get('chat-log').textContent, /The complete text answer survived\./);
  assert.equal(h.audio.length, 0, 'text-only replies never start playback');
  assert.equal(h.get('send-button').disabled, false);
});

test('settings save snapshots its fields before cancellation and cannot replace a newer companion', async t => {
  const h = await dashboard(t);
  await h.get('voice-test').click();
  const cancellation = deferred(), cancelling = deferred();
  h.handlers.set('POST /api/avatar', request => {
    if (request.body.event === 'cancel') { cancelling.resolve(); return cancellation.promise; }
  });
  h.get('avatar-model-url').value = '/models/chosen/chosen.model3.json';
  h.get('avatar-voice-id').value = 'chosen-voice';
  h.get('avatar-parameter-map').value = '{"angleX":"HeadX"}';
  const saving = h.get('avatar-settings').fire('submit');
  await cancelling.promise;
  // Change both the visible form and active identity while cancellation is pending.
  h.get('avatar-model-url').value = '/models/edited/edited.model3.json';
  h.get('avatar-voice-id').value = 'edited-voice';
  await h.get('generate-companion').click();
  const currentModel = h.renderer.models.at(-1).url;
  cancellation.resolve({ accepted: true, avatar: idle() });
  await saving;
  const request = h.requests.find(request => request.method === 'POST' && request.url.pathname === '/api/companion/presentation');
  assert.deepEqual(request.body, {
    profileId: 'Companion A', modelUrl: '/models/chosen/chosen.model3.json', voiceId: 'chosen-voice',
    parameterMap: { angleX: 'HeadX' }, companionMode: 'productivity',
  });
  assert.equal(h.renderer.models.at(-1).url, currentModel);
  assert.equal(h.get('profile-name').textContent, 'Companion B');
  assert.equal(h.get('avatar-model-url').value, h.presentation('Companion B').modelUrl);
  assert.equal(h.get('avatar-voice-id').value, 'voice-Companion B');
});
