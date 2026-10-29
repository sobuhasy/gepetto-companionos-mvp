const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../source/web/public/study-session.js'), 'utf8');
const Study = vm.runInNewContext(`${source}\nRoboticsStudySession`, { Date });
const record = () => ({
  id: 'record-1', sessionId: 'session-1', topic: 'rotation-matrices',
  question: { id: 'rotation', prompt: 'Rotate [1, 0] by 90°.', answerHint: 'x, y' },
  studentAnswer: '0, 1', feedback: 'Both components are correct.', score: 2, maxScore: 2,
  steps: ['R(θ) = [[cos θ, −sin θ], [sin θ, cos θ]]', 'R(90°)[1,0]ᵀ = [0,1]ᵀ'],
  nextReview: { title: 'Review rotation matrices', details: 'Rotate [0,1] by 90°.', suggestedAt: '2026-10-30T12:00:00.000Z' },
  createdAt: '2026-10-29T12:00:00.000Z',
});
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};

function harness() {
  let document;
  class Element {
    constructor(id = '') {
      this.id = id; this.hidden = false; this.disabled = false; this.value = '';
      this.children = []; this.text = ''; this.listeners = new Map(); this.attributes = new Map();
      this.ownerDocument = document;
      this.classList = { toggle() {} };
    }
    set textContent(value) { this.text = String(value); this.children = []; }
    get textContent() { return this.text + this.children.map(child => child.textContent).join(''); }
    set innerHTML(_) { throw new Error('Study UI must not render HTML from API content.'); }
    addEventListener(name, callback) { this.listeners.set(name, callback); }
    fire(name) { return this.listeners.get(name)?.({ preventDefault() {} }); }
    setAttribute(key, value) { this.attributes.set(key, value); }
    appendChild(child) { this.children.push(child); }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = children; this.text = ''; }
  }
  document = { createElement: () => new Element() };
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, new Element(id));
    return elements.get(id);
  };
  element('study-panel').hidden = true;
  element('study-topic').value = 'rotation-matrices';
  const requests = [], approvals = [], activities = [], handlers = new Map();
  const consent = { study: false };
  let allowApproval = true, saved = [], tasks = [], refreshFailure = false;
  const ui = new Study({
    element, getConsent: () => consent,
    approve: text => { approvals.push(text); return allowApproval; },
    onActivity: value => activities.push(value),
    refreshTasks: async () => { if (refreshFailure) throw new Error('offline'); return tasks; },
    request: async (url, options = {}) => {
      const body = options.body && JSON.parse(options.body);
      requests.push({ url, body });
      if (handlers.has(url)) return handlers.get(url)(body);
      if (url === '/api/study/topics') return { topics: [{ id: 'rotation-matrices', title: 'Rotation matrices' }] };
      if (url === '/api/study/session') return { session: { id: 'session-1', topic: body.topic, question: record().question } };
      if (url === '/api/study/answer') return { record: record() };
      if (url === '/api/study/records') return { records: saved };
      if (url === '/api/study/actions') return { status: 'succeeded', result: body.type === 'task.create' ? { id: 'task-1', title: record().nextReview.title } : record() };
      throw new Error('Unexpected URL');
    },
  });
  return { ui, element, requests, consent, approvals, activities, handlers,
    setApproval: value => { allowApproval = value; }, setSaved: value => { saved = value; },
    setTasks: value => { tasks = value; }, failTaskRefresh: () => { refreshFailure = true; },
  };
}

test('robotics flow renders worked mathematics, keeps the chat mounted, and never autosaves', async () => {
  const h = harness();
  assert.equal(h.requests.length, 0, 'opening the dashboard performs no study request');
  await h.element('study-toggle').fire('click');
  assert.equal(h.element('study-panel').hidden, false);
  assert.equal(h.element('chat-log').hidden, true);
  await h.element('study-start').fire('click');
  h.element('study-answer').value = '0, 1';
  await h.element('study-answer-form').fire('submit');
  assert.equal(h.element('study-score').textContent, 'Score: 2 / 2');
  assert.match(h.element('study-steps').textContent, /R\(90°\)/);
  assert.match(h.element('study-review').textContent, /Review rotation matrices/);
  assert.equal(h.requests.some(request => request.url.includes('actions')), false);
  assert.equal(h.element('study-save').disabled, true);
  assert.equal(h.element('study-task').disabled, false);
  assert.equal(h.activities.at(-1), 'correct');
  await h.element('study-toggle').fire('click');
  assert.equal(h.element('chat-log').hidden, false);
});

test('explicit task approval reviews concrete content and verifies the saved task before success', async () => {
  const h = harness(); h.ui.record = record();
  h.setApproval(false);
  await h.ui.action('task.create');
  assert.equal(h.requests.length, 0);
  assert.match(h.approvals[0], /Review rotation matrices/);
  assert.match(h.approvals[0], /no reminder or external tool is scheduled/);
  h.setApproval(true); h.setTasks([{ id: 'task-1', title: record().nextReview.title }]);
  await h.ui.action('task.create');
  assert.equal(h.requests[0].body.approved, true);
  assert.match(h.element('study-status').textContent, /Verified task.*task-1/);
});

test('failed outcomes, missing saved tasks, and refresh failures never claim verified creation', async () => {
  for (const mode of ['failed', 'missing', 'refresh']) {
    const h = harness(); h.ui.record = record();
    if (mode === 'failed') h.handlers.set('/api/study/actions', () => ({ status: 'failed', reason: 'Local write failed.' }));
    if (mode === 'refresh') h.failTaskRefresh();
    await h.ui.action('task.create');
    assert.doesNotMatch(h.element('study-status').textContent, /Verified task/);
    assert.match(h.element('study-status').textContent, mode === 'failed' ? /Local write failed/ : mode === 'missing' ? /not found/ : /refreshing.*failed/);
    assert.equal(h.ui.busy, false);
  }
});

test('study saving and saved record reads require their own consent', async () => {
  const h = harness(); h.ui.record = record();
  await h.ui.action('study.save'); await h.ui.loadRecords();
  assert.equal(h.requests.length, 0); assert.equal(h.approvals.length, 0);
  h.consent.study = true; h.ui.consentChanged(); h.setSaved([record()]);
  await h.ui.action('study.save');
  assert.match(h.element('study-status').textContent, /saved locally/);
  assert.match(h.approvals[0], /Your answer: 0, 1/);
  assert.match(h.element('study-records').textContent, /Both components are correct/);
  const deleteButton = h.element('study-records').children[0].children.at(-1);
  h.setSaved([]); await deleteButton.fire('click');
  assert.equal(h.requests.at(-2).body.type, 'study.delete');
  assert.match(h.element('study-status').textContent, /deleted/);
});

test('revocation discards delayed saved record and save responses', async () => {
  for (const operation of ['read', 'save']) {
    const h = harness(); h.consent.study = true; h.ui.record = record();
    const pending = deferred();
    h.handlers.set(operation === 'read' ? '/api/study/records' : '/api/study/actions', () => pending.promise);
    const work = operation === 'read' ? h.ui.loadRecords() : h.ui.action('study.save');
    h.consent.study = false; h.ui.consentChanged();
    pending.resolve(operation === 'read' ? { records: [record()] } : { status: 'succeeded', result: record() });
    await work;
    assert.equal(h.element('study-records').textContent, '');
    assert.match(h.element('study-status').textContent, /access disabled/);
    assert.equal(h.element('study-save').disabled, true);
    assert.equal(h.ui.busy, false);
  }
});

test('revocation leaves a pending unsaved local exercise usable', async () => {
  const h = harness(); await h.ui.start();
  const pending = deferred(); h.handlers.set('/api/study/answer', () => pending.promise);
  const checking = h.ui.answer();
  h.ui.consentChanged(); pending.resolve({ record: record() }); await checking;
  assert.equal(h.element('study-result').hidden, false);
  assert.equal(h.element('study-save').disabled, true);
  assert.equal(h.element('study-task').disabled, false);
});

test('API text and saved answers render as text without HTML execution', async () => {
  const h = harness(); h.consent.study = true;
  const hostile = record(); hostile.studentAnswer = '<img src=x onerror=alert(1)>';
  h.setSaved([hostile]); await h.ui.loadRecords();
  assert.match(h.element('study-records').textContent, /<img src=x onerror=alert\(1\)>/);
});

test('answer failure recovers controls and does not show a successful score', async () => {
  const h = harness(); await h.ui.start();
  h.handlers.set('/api/study/answer', () => { throw new Error('Enter two finite numeric components.'); });
  await h.ui.answer();
  assert.equal(h.element('study-result').hidden, true);
  assert.equal(h.element('study-submit').disabled, false);
  assert.match(h.element('study-status').textContent, /finite numeric/);
});

test('closing study during pending requests retains the result without reclaiming the companion', async () => {
  for (const operation of ['start', 'answer']) {
    const h = harness(); await h.ui.toggle();
    if (operation === 'answer') await h.ui.start();
    const pending = deferred();
    h.handlers.set(operation === 'start' ? '/api/study/session' : '/api/study/answer', () => pending.promise);
    const work = operation === 'start' ? h.ui.start() : h.ui.answer();
    await h.ui.toggle();
    assert.equal(h.activities.at(-1), 'closed');
    const activityCount = h.activities.length;
    pending.resolve(operation === 'start'
      ? { session: { id: 'session-1', topic: 'rotation-matrices', question: record().question } }
      : { record: record() });
    await work;
    assert.equal(h.element('study-panel').hidden, true);
    assert.equal(h.activities.length, activityCount, 'late requests cannot change the companion presentation');
    await h.ui.toggle();
    assert.equal(h.element('study-panel').hidden, false);
    assert.equal(h.element(operation === 'start' ? 'study-question' : 'study-score').textContent,
      operation === 'start' ? record().question.prompt : 'Score: 2 / 2');
  }
});
