const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtemp, readFile, writeFile, mkdir, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { randomUUID } = require('node:crypto');
const { TaskStore } = require('../dist/tasks/TaskStore');
const { SkillActionRouter } = require('../dist/actions/SkillActionRouter');
const { DEFAULT_CONSENT } = require('../dist/privacy/ConsentState');

const approved = { consent: { ...DEFAULT_CONSENT, study: true }, approved: true };
const recordId = randomUUID();

function router(override = {}) {
  const calls = [];
  const handler = name => async id => { calls.push([name, id]); return { confirmed: true }; };
  return {
    calls,
    actions: new SkillActionRouter({ saveStudy: handler('save'), deleteStudy: handler('delete'), createTask: handler('task'), ...override }),
  };
}

test('local skill actions enforce approval, consent and fixed risk before executing', async () => {
  const { actions, calls } = router();
  assert.equal((await actions.execute({ type: 'study.save', recordId }, { ...approved, approved: false })).status, 'approval_required');
  assert.equal((await actions.execute({ type: 'study.save', recordId }, { consent: DEFAULT_CONSENT, approved: true })).status, 'denied');
  assert.equal((await actions.execute({ type: 'study.delete', recordId }, { consent: DEFAULT_CONSENT, approved: true })).status, 'denied');
  assert.equal(calls.length, 0);
  const saved = await actions.execute({ type: 'study.save', recordId }, approved);
  assert.equal(saved.status, 'succeeded'); assert.equal(saved.risk, 'caution');
  const deleted = await actions.execute({ type: 'study.delete', recordId }, approved);
  assert.equal(deleted.status, 'succeeded'); assert.equal(deleted.risk, 'dangerous');
  const task = await actions.execute({ type: 'task.create', recordId }, { consent: DEFAULT_CONSENT, approved: true });
  assert.equal(task.status, 'succeeded', 'explicit task approval authorizes its own local persistence');
  assert.deepEqual(calls.map(([name]) => name), ['save', 'delete', 'task']);
});

test('external, malformed, inherited and unknown skill actions fail closed and cannot lower risk', async () => {
  const { actions, calls } = router();
  for (const input of [
    undefined, null, [], 'study.save', {}, { type: 'constructor' }, { type: '__proto__', recordId },
    { type: 'task.create', recordId: 'missing' }, { type: 'task.create', recordId, risk: 'safe' },
    { type: 'study.save', recordId, approved: true }, Object.create({ type: 'task.create', recordId }),
    JSON.parse(`{"type":"task.create","recordId":"${recordId}","__proto__":{}}`),
    { type: 'external.tool', tool: 'run_command' },
  ]) {
    assert.equal((await actions.execute(input, approved)).status, 'denied');
  }
  assert.equal(calls.length, 0);
  const denied = await actions.execute({ type: 'external.tool', tool: 'read_file' }, approved);
  assert.equal(denied.risk, 'dangerous');
  assert.match(denied.reason, /disabled/);
});

test('failures and unconfirmed actions are audited without private data and later actions still work', async () => {
  const { actions } = router({
    saveStudy: async () => { throw new Error('PRIVATE ANSWER /secret/path API_KEY'); },
    createTask: async () => undefined,
  });
  assert.equal((await actions.execute({ type: 'study.save', recordId }, approved)).status, 'failed');
  assert.equal((await actions.execute({ type: 'task.create', recordId }, approved)).status, 'failed');
  assert.equal((await actions.execute({ type: 'study.delete', recordId }, approved)).status, 'succeeded');
  const audit = actions.audit();
  assert.deepEqual(audit.map(item => item.status), ['succeeded', 'failed', 'failed']);
  assert.ok(audit.every(item => item.id && item.createdAt && !('result' in item) && !('recordId' in item)));
  assert.ok(!JSON.stringify(audit).includes('PRIVATE'));
  audit[0].reason = 'tampered';
  assert.notEqual(actions.audit()[0].reason, 'tampered');
  for (let index = 0; index < 110; index++) await actions.execute({}, approved);
  assert.equal(actions.audit().length, 100);
});

test('task creation is verified on disk, survives restart and preserves existing dashboard tasks', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'gepetto-study-tasks-'));
  try {
    const path = join(directory, 'tasks.json');
    const defaults = [{ id: 'legacy', title: 'Existing task', kind: 'workflow', details: 'Keep this', done: false, createdAt: new Date(0).toISOString() }];
    const store = new TaskStore(path, defaults);
    const initial = await store.list(); initial[0].title = 'changed outside store';
    assert.equal((await store.list())[0].title, 'Existing task');
    await assert.rejects(readFile(path), { code: 'ENOENT' }, 'listing must not create local data');
    const task = await store.createStudyReview(recordId, 'Review rotation matrices', 'Tomorrow: redo Rz(90°) · [1,0,0]ᵀ.');
    const disk = JSON.parse(await readFile(path, 'utf8'));
    assert.deepEqual(disk.find(item => item.id === task.id), task);
    const restarted = new TaskStore(path);
    assert.equal((await restarted.list()).length, 2);
    assert.equal((await restarted.list()).find(item => item.id === 'legacy').details, 'Keep this');
    const retried = await restarted.createStudyReview(recordId, task.title, task.details);
    assert.equal(retried.id, task.id); assert.equal((await restarted.list()).length, 2);
    assert.equal((await restarted.setDone(task.id, true)).done, true);
    assert.equal((await new TaskStore(path).list()).find(item => item.id === task.id).done, true);
    assert.equal(await restarted.setDone('not-present', true), undefined);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('serialized task updates preserve concurrent creates, review retries and completion changes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'gepetto-study-concurrent-'));
  try {
    const path = join(directory, 'tasks.json');
    const store = new TaskStore(path);
    const created = await Promise.all(Array.from({ length: 12 }, (_, index) => store.create({ title: `Task ${index}`, kind: 'workflow', details: '' })));
    assert.equal((await store.list()).length, 12);
    const reviews = await Promise.all(Array.from({ length: 8 }, () => store.createStudyReview(recordId, 'Review', 'Practice')));
    assert.equal(new Set(reviews.map(task => task.id)).size, 1);
    await Promise.all(created.map(task => store.setDone(task.id, true)));
    const persisted = await new TaskStore(path).list();
    assert.equal(persisted.length, 13);
    assert.equal(persisted.filter(task => task.done).length, 12);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('task corruption and write failures never report creation success or erase existing files', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'gepetto-study-task-failure-'));
  try {
    const path = join(directory, 'tasks.json');
    const store = new TaskStore(path);
    const input = { title: 'Review', kind: 'study', details: '' };
    for (const corrupt of ['{broken', '{}', '[{"title":"missing fields"}]']) {
      await writeFile(path, corrupt);
      await assert.rejects(store.create(input));
      assert.equal(await readFile(path, 'utf8'), corrupt);
    }
    await writeFile(path, '[]');
    const task = await store.create(input);
    assert.ok(task.id, 'queue recovers after failed operations');
    const occupiedPath = join(directory, 'directory-instead-of-json');
    await mkdir(occupiedPath);
    await assert.rejects(new TaskStore(occupiedPath).create(input));
    const parentFile = join(directory, 'parent-file');
    await writeFile(parentFile, 'preserve');
    const unwritable = new TaskStore(join(parentFile, 'tasks.json'));
    const actions = new SkillActionRouter({ saveStudy: async () => true, deleteStudy: async () => true, createTask: async () => unwritable.create(input) });
    const outcome = await actions.execute({ type: 'task.create', recordId }, approved);
    assert.equal(outcome.status, 'failed'); assert.equal(outcome.result, undefined);
    assert.equal(await readFile(parentFile, 'utf8'), 'preserve');
    await assert.rejects(store.create({ ...input, title: ' ' }));
    await assert.rejects(store.setDone(task.id, 'true'));
  } finally { await rm(directory, { recursive: true, force: true }); }
});
