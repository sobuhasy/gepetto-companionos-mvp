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
    const classes = new Set();
    this.classList = {
      add: (...names) => names.forEach(name => classes.add(name)),
      remove: (...names) => names.forEach(name => classes.delete(name)),
      contains: name => classes.has(name),
      toggle: (name, force = !classes.has(name)) => {
        if (force) classes.add(name); else classes.delete(name);
        return force;
      },
    };
    this.scrollTop = 0;
    this.scrollHeight = 320;
    this.clientHeight = 320;
    this.open = false;
    this.focusCount = 0;
    this.ownText = '';
  }
  set textContent(value) { this.ownText = String(value); this.children = []; }
  get textContent() { return this.ownText + this.children.map(child => child.textContent).join(''); }
  addEventListener(event, listener) {
    const listeners = this.listeners.get(event) || [];
    listeners.push(listener); this.listeners.set(event, listeners);
  }
  async fire(event, properties = {}) {
    const dispatched = {
      preventDefault() { this.defaultPrevented = true; }, target: this, ...properties,
    };
    await Promise.all((this.listeners.get(event) || []).map(listener =>
      listener(dispatched)));
    return dispatched;
  }
  appendChild(child) { this.children.push(child); return child; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; this.ownText = ''; }
  setAttribute() {}
  focus() { ++this.focusCount; }
  scrollIntoView() {}
  click() { return this.fire('click'); }
  requestSubmit() { ++this.submissionCount; return this.fire('submit'); }
}

async function dashboard(t) {
  const elements = new Map(), requests = [], handlers = new Map(), intervals = new Map(), audio = [];
  const get = id => {
    if (!elements.has(id)) elements.set(id, new Element());
    return elements.get(id);
  };
  get('companion-mode').value = 'productivity';
  get('auto-play-toggle').checked = true;
  get('stt-ready-toggle').checked = true;
  get('chat-form').submissionCount = 0;
  get('jump-to-latest').classList.add('hidden');
  get('image-preview-container').classList.add('hidden');
  get('auto-play-toggle').parentElement = new Element();
  const privacy = ['microphone', 'camera', 'screen', 'memory', 'localFirst'].map(key => {
    const element = new Element(); element.dataset.privacy = key;
    element.checked = key === 'localFirst';
    return element;
  });
  const modes = ['study', 'code', 'productivity', 'japanese', 'creative', 'support'].map(mode => {
    const element = new Element(); element.dataset.mode = mode; return element;
  });
  const document = {
    getElementById: get,
    createElement: () => new Element(),
    querySelectorAll: selector => selector === '[data-privacy]' ? privacy : selector === '.mode-btn' ? modes : [],
  };
  const window = new Element();
  const storage = new Map();
  const backend = {
    profile: profile('Companion A'), nextProfile: profile('Companion B'), avatar: idle(), interaction: 0,
    tasks: [], memories: [],
  };
  const presentations = new Map();
  const presentation = id => presentations.get(id) || {
    profileId: id, modelUrl: `/models/${encodeURIComponent(id)}/avatar.model3.json`,
    voiceId: `voice-${id}`, parameterMap: {}, backend: 'native',
  };
  let renderer;
  const renderers = [];
  class RendererMock {
    models = [];
    states = [];
    mouths = [];
    constructor() { renderer = this; renderers.push(this); }
    async loadModel(url, parameters) { this.models.push({ url, parameters }); return true; }
    setState(state) { this.states.push({ ...state }); }
    setMouth(level) { this.mouths.push(level); }
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
    if (pathname === '/api/tasks') {
      if (request.method === 'POST') backend.tasks.push({ id: `task-${backend.tasks.length + 1}`, done: false, ...request.body });
      if (request.method === 'PATCH') Object.assign(backend.tasks.find(task => task.id === request.body.id), request.body);
      return { tasks: backend.tasks };
    }
    if (pathname === '/api/memory') {
      if (request.method === 'POST') backend.memories.push({ ...request.body, id: `memory-${backend.memories.length + 1}` });
      if (request.method === 'PATCH') Object.assign(backend.memories.find(memory => memory.id === request.body.id), request.body);
      if (request.method === 'DELETE') backend.memories = backend.memories.filter(memory => memory.id !== request.body.id);
      return { memories: backend.memories, categories: ['user_profile', 'projects'] };
    }
    if (pathname === '/api/message') return { responseText: 'Your companion reply.', avatar: { ...backend.avatar } };
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
        body: options.body ? JSON.parse(options.body) : undefined, headers: options.headers };
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
    get, requests, handlers, backend, presentations, presentation, renderer, renderers, audio, modes, privacy, storage, window,
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

test('a reply preserves upward scroll and offers a working jump to latest', async t => {
  const h = await dashboard(t);
  const reply = deferred(), received = deferred();
  h.handlers.set('POST /api/message', () => { received.resolve(); return reply.promise; });
  const chat = h.get('chat-log');
  chat.scrollHeight = 1800;
  chat.clientHeight = 400;
  h.get('prompt').value = 'I will read an earlier message while you answer.';
  const submitted = h.get('chat-form').fire('submit');
  await received.promise;
  chat.scrollTop = 200;
  await chat.fire('scroll');
  chat.scrollHeight = 2100;
  reply.resolve({ responseText: 'A new reply is available below.', avatar: idle() });
  await submitted;
  assert.equal(chat.scrollTop, 200, 'new companion messages must not move a user reading history');
  assert.equal(h.get('jump-to-latest').classList.contains('hidden'), false);
  await h.window.fire('resize');
  assert.equal(chat.scrollTop, 200, 'resizing must also preserve intentional upward scroll');
  await h.get('jump-to-latest').click();
  assert.equal(chat.scrollTop, chat.scrollHeight);
  assert.equal(h.get('jump-to-latest').classList.contains('hidden'), true);
});

test('sending a message resumes following the latest conversation from an upward scroll', async t => {
  const h = await dashboard(t);
  const chat = h.get('chat-log');
  chat.scrollHeight = 1900;
  chat.clientHeight = 400;
  chat.scrollTop = 150;
  await chat.fire('scroll');
  h.get('prompt').value = 'Continue here';
  await h.get('chat-form').fire('submit');
  assert.equal(chat.scrollTop, chat.scrollHeight);
  assert.equal(h.get('jump-to-latest').classList.contains('hidden'), true);
  assert.equal(h.requests.filter(request => request.url.pathname === '/api/message').length, 1);
  assert.match(chat.textContent, /Continue here/);
  assert.match(chat.textContent, /Your companion reply/);
});

test('Enter submits once while Shift+Enter, composing Enter and disabled send preserve the draft', async t => {
  const h = await dashboard(t);
  const prompt = h.get('prompt');
  prompt.value = 'A multiline\ndraft';
  for (const properties of [{ shiftKey: true }, { isComposing: true }, { keyCode: 229 }]) {
    const event = await prompt.fire('keydown', { key: 'Enter', ...properties });
    assert.equal(event.defaultPrevented, undefined);
    assert.equal(prompt.value, 'A multiline\ndraft');
  }
  assert.equal(h.get('chat-form').submissionCount, 0);
  h.get('send-button').disabled = true;
  const blocked = await prompt.fire('keydown', { key: 'Enter' });
  assert.equal(blocked.defaultPrevented, true);
  assert.equal(h.get('chat-form').submissionCount, 0);
  h.get('send-button').disabled = false;
  const sent = await prompt.fire('keydown', { key: 'Enter' });
  await settle();
  assert.equal(sent.defaultPrevented, true);
  assert.equal(h.get('chat-form').submissionCount, 1);
  const messages = h.requests.filter(request => request.url.pathname === '/api/message');
  assert.equal(messages.length, 1);
  assert.equal(messages[0].body.message, 'A multiline\ndraft');
});

test('mode selection retains messages and the current model and returns drawer actions to the composer', async t => {
  const h = await dashboard(t);
  h.get('prompt').value = 'Keep this conversation';
  await h.get('chat-form').fire('submit');
  const messages = [...h.get('chat-log').children];
  const modelLoads = h.renderer.models.length;
  h.get('companion-mode').value = 'study';
  await h.get('companion-mode').fire('change');
  await settle();
  assert.deepEqual(h.get('chat-log').children, messages);
  assert.equal(h.renderer.models.length, modelLoads, 'an unchanged presentation must not reload its model');
  assert.equal(h.renderers.length, 1);
  assert.equal(h.get('presence-mode').textContent, 'Study Mode');
  const drawer = h.get('settings-drawer');
  drawer.open = true;
  h.window.companionWorkspace = { closeSettings() { drawer.open = false; } };
  const focusBefore = h.get('prompt').focusCount;
  await h.modes.find(button => button.dataset.mode === 'code').click();
  await settle();
  assert.equal(drawer.open, false);
  assert.equal(h.get('prompt').focusCount, focusBefore + 1);
  assert.match(h.get('prompt').value, /^Code Mode:/);
  assert.deepEqual(h.get('chat-log').children, messages);
  assert.equal(h.renderer.models.length, modelLoads);
});

test('opening settings during speech preserves the playback owner through polling and closing', async t => {
  const h = await dashboard(t);
  await h.get('voice-test').click();
  const audio = h.audio[0];
  audio.dispatchEvent(new Event('playing'));
  await settle();
  const modelLoads = h.renderer.models.length;
  const cancellations = () => h.requests.filter(request => request.body?.event === 'cancel').length;
  const cancellationsBefore = cancellations();
  h.get('settings-drawer').open = true;
  await h.poll();
  assert.equal(audio.paused, false);
  assert.equal(h.get('avatar-state').textContent, 'speaking · neutral');
  h.get('settings-drawer').open = false;
  await h.poll();
  assert.equal(h.audio.length, 1);
  assert.equal(audio.paused, false);
  assert.equal(cancellations(), cancellationsBefore);
  assert.equal(h.renderer.models.length, modelLoads);
  assert.equal(h.renderers.length, 1);
});

test('a chat reply arriving while settings are open does not steal composer focus', async t => {
  const h = await dashboard(t);
  const reply = deferred(), received = deferred();
  h.handlers.set('POST /api/message', () => { received.resolve(); return reply.promise; });
  h.get('prompt').value = 'Please reply while settings are open';
  const submitted = h.get('chat-form').fire('submit');
  await received.promise;
  h.get('settings-drawer').open = true;
  const focusBefore = h.get('prompt').focusCount;
  reply.resolve({ responseText: 'The conversation is still here.', avatar: idle() });
  await submitted;
  assert.equal(h.get('prompt').focusCount, focusBefore);
  assert.match(h.get('chat-log').textContent, /The conversation is still here/);
});

test('the interrupt control pauses real playback ownership and resets avatar mouth and state', async t => {
  const h = await dashboard(t);
  await h.get('voice-test').click();
  const audio = h.audio[0];
  audio.dispatchEvent(new Event('playing'));
  await settle();
  assert.equal(h.get('avatar-state').textContent, 'speaking · neutral');
  await h.get('interrupt-voice').click();
  await settle();
  assert.equal(audio.paused, true);
  assert.equal(h.renderer.mouths.at(-1), 0);
  assert.deepEqual(h.renderer.states.at(-1), idle());
  assert.equal(h.get('avatar-state').textContent, 'idle · neutral');
  assert.ok(h.requests.some(request => request.body?.event === 'cancel' && request.body.interactionId));
  const eventsAfterInterrupt = h.requests.filter(request => request.body?.event).length;
  audio.dispatchEvent(new Event('ended'));
  await settle();
  assert.equal(h.requests.filter(request => request.body?.event).length, eventsAfterInterrupt,
    'events from interrupted audio must no longer affect the media owner');
});

test('microphone and image controls explain rejected consent without starting media or uploads', async t => {
  const h = await dashboard(t);
  const requestsBefore = h.requests.length;
  await h.get('mic-button').click();
  assert.equal(h.get('conversation-status').dataset.activity, 'error');
  assert.match(h.get('conversation-status').textContent, /Enable microphone consent and disable local-first/);
  h.get('image-upload').value = 'photo.png';
  await h.get('image-upload').fire('change', { target: { files: [{ name: 'photo.png' }] } });
  assert.equal(h.get('image-upload').value, '');
  assert.equal(h.get('image-preview-container').classList.contains('hidden'), true);
  assert.match(h.get('conversation-status').textContent, /Enable camera \/ uploaded image consent/);
  assert.equal(h.get('conversation-status').dataset.activity, 'error');
  assert.equal(h.requests.length, requestsBefore, 'denied capture never reaches a backend');
  assert.equal(h.audio.length, 0);
});

test('an error during speech survives state polling and clears on the next explicit message', async t => {
  const h = await dashboard(t);
  await h.get('voice-test').click();
  const audio = h.audio[0];
  audio.dispatchEvent(new Event('playing'));
  await settle();
  assert.equal(h.get('conversation-status').dataset.activity, 'speaking');
  await h.get('image-upload').fire('change', { target: { files: [{ name: 'photo.png' }] } });
  const status = h.get('conversation-status');
  const consentError = status.textContent;
  assert.match(consentError, /Enable camera \/ uploaded image consent/);
  await h.poll();
  assert.equal(status.textContent, consentError, 'speaking polls must not hide an actionable error');
  audio.dispatchEvent(new Event('ended'));
  await settle();
  await h.poll();
  assert.equal(h.get('avatar-state').textContent, 'idle · neutral');
  assert.equal(status.dataset.activity, 'error');
  assert.equal(status.textContent, consentError, 'idle must not leave stale speaking feedback after an error');

  const received = deferred(), reply = deferred();
  h.handlers.set('POST /api/message', () => { received.resolve(); return reply.promise; });
  h.get('prompt').value = 'Continue our conversation';
  const submitted = h.get('chat-form').fire('submit');
  await received.promise;
  assert.equal(status.dataset.activity, 'thinking', 'an explicit new message clears the old error');
  assert.equal(status.textContent, 'Thinking…');
  h.backend.avatar = idle();
  reply.resolve({ responseText: 'We can continue.', avatar: idle() });
  await submitted;
  assert.equal(status.dataset.activity, 'idle');
  assert.equal(status.textContent, 'Ready when you are');
});

test('task creation and completion retain their existing API contracts', async t => {
  const h = await dashboard(t);
  h.get('task-kind').value = 'study';
  h.get('task-title').value = 'Review a chapter';
  h.get('task-details').value = 'Use active recall';
  await h.get('task-form').fire('submit');
  const created = h.requests.find(request => request.method === 'POST' && request.url.pathname === '/api/tasks');
  assert.deepEqual(created.body, { kind: 'study', title: 'Review a chapter', details: 'Use active recall' });
  assert.equal(h.get('task-title').value, '');
  assert.equal(h.get('task-details').value, '');
  const checkbox = h.get('task-list').children[0].children[0];
  checkbox.checked = true;
  await checkbox.fire('change');
  const completed = h.requests.find(request => request.method === 'PATCH' && request.url.pathname === '/api/tasks');
  assert.deepEqual(completed.body, { id: h.backend.tasks[0].id, done: true });
  assert.equal(h.get('task-list').children[0].children[0].checked, true);
});

test('memory stays consent gated and retains create, edit and delete controls', async t => {
  const h = await dashboard(t);
  const memoryRequests = () => h.requests.filter(request => request.url.pathname === '/api/memory');
  assert.equal(memoryRequests().length, 0);
  assert.match(h.get('memory-list').textContent, /Enable memory consent/);
  const consent = h.privacy.find(input => input.dataset.privacy === 'memory');
  consent.checked = true;
  await consent.fire('change');
  await settle();
  h.get('memory-category').value = 'projects';
  h.get('memory-content').value = 'Build a companion workspace';
  await h.get('memory-form').fire('submit');
  const created = memoryRequests().find(request => request.method === 'POST');
  assert.equal(created.body.category, 'projects');
  assert.equal(created.body.content, 'Build a companion workspace');
  assert.equal(JSON.parse(created.headers['X-Companion-Consent']).memory, true);
  let row = h.get('memory-list').children[0];
  await row.children[1].click();
  assert.equal(h.get('memory-content').value, 'Build a companion workspace');
  h.get('memory-content').value = 'Keep the companion central';
  await h.get('memory-form').fire('submit');
  const edited = memoryRequests().find(request => request.method === 'PATCH');
  assert.equal(edited.body.id, h.backend.memories[0].id);
  assert.equal(edited.body.content, 'Keep the companion central');
  row = h.get('memory-list').children[0];
  await row.children[2].click();
  assert.equal(h.backend.memories.length, 0);
  assert.ok(memoryRequests().some(request => request.method === 'DELETE'));
  const requestsBeforeRevoke = memoryRequests().length;
  consent.checked = false;
  await consent.fire('change');
  await settle();
  assert.equal(memoryRequests().length, requestsBeforeRevoke);
  assert.match(h.get('memory-list').textContent, /Enable memory consent/);
});

test('revoke access resets every consent and active audio while preserving the conversation', async t => {
  const h = await dashboard(t);
  for (const input of h.privacy) input.checked = input.dataset.privacy !== 'localFirst';
  await h.get('voice-test').click();
  const messages = [...h.get('chat-log').children];
  await h.get('revoke-access').click();
  await settle();
  for (const input of h.privacy) {
    const expected = input.dataset.privacy === 'localFirst';
    assert.equal(input.checked, expected, input.dataset.privacy);
    assert.equal(h.storage.get(`gepetto-privacy-${input.dataset.privacy}`), String(expected));
  }
  assert.equal(h.audio[0].paused, true);
  assert.equal(h.renderer.mouths.at(-1), 0);
  assert.equal(h.get('vision-status').textContent, 'Screen consent disabled.');
  assert.equal(h.get('presence-privacy').textContent, 'Access revoked');
  assert.deepEqual(h.get('chat-log').children, messages);
});
