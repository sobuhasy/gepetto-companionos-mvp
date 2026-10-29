const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtemp, rm, readFile, access, mkdir, writeFile } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { spawn } = require('node:child_process');
const { request: httpRequest } = require('node:http');
const { DEFAULT_CONSENT, parseConsent } = require('../dist/privacy/ConsentState');
const { studyExpression } = require('../dist/body/StudyExpression');

// Native fetch may replace Host with the URL's authority; use HTTP for rebinding probes.
function rawStatus(address, path, headers) {
  return new Promise((resolve, reject) => {
    const req = httpRequest(address + path, { headers }, res => {
      res.resume(); res.once('end', () => resolve(res.statusCode));
    });
    req.once('error', reject); req.end();
  });
}

async function server(t, directory) {
  const child = spawn(process.execPath, [join(__dirname, '../dist/web/server.js')], {
    cwd: directory,
    env: { ...process.env, PORT: '0', OPENAI_API_KEY: '', AUTO_CAPTURE_OBS: 'true', ROBOT_BODY_BACKEND: 'native' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', chunk => { stderr += chunk; });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = new Promise(resolve => child.once('exit', resolve));
      child.kill(); await exited;
    }
    await rm(directory, { recursive: true, force: true });
  });
  const address = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Server startup timeout: ${stderr}`)), 15000);
    child.once('error', error => { clearTimeout(timeout); reject(error); });
    child.once('exit', code => { clearTimeout(timeout); reject(new Error(`Server exited ${code}: ${stderr}`)); });
    child.stdout.on('data', chunk => {
      const match = String(chunk).match(/http:\/\/localhost:(\d+)/);
      if (match) { clearTimeout(timeout); resolve(`http://localhost:${match[1]}`); }
    });
  });
  return {
    address,
    request: (path, method = 'GET', body, consent, extraHeaders = {}) => fetch(address + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(consent ? { 'X-Companion-Consent': JSON.stringify(consent) } : {}), ...extraHeaders },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
  };
}

test('study consent is independent and fails closed; expressions use existing semantic states', () => {
  for (const study of [undefined, 'true', 1, null]) assert.equal(parseConsent({ study }).study, false);
  assert.equal(DEFAULT_CONSENT.study, false);
  assert.equal(parseConsent({ study: true }).study, true);
  assert.deepEqual(studyExpression('question'), { activity: 'idle', emotion: 'neutral' });
  assert.deepEqual(studyExpression('answering'), { activity: 'listening', emotion: 'neutral' });
  assert.deepEqual(studyExpression('checking'), { activity: 'thinking', emotion: 'neutral' });
  assert.deepEqual(studyExpression('feedback', true), { activity: 'idle', emotion: 'amazed' });
  assert.deepEqual(studyExpression('feedback', false), { activity: 'idle', emotion: 'neutral' });
});

test('offline HTTP learning → approval → verified task, with explicit inspect/delete and revocation', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'gepetto-study-http-'));
  const { address, request } = await server(t, directory);
  const grant = { ...DEFAULT_CONSENT, study: true };
  const topics = await (await request('/api/study/topics')).json();
  assert.deepEqual(topics.topics.map(topic => topic.id), ['rotation-matrices', 'fk-ik']);
  assert.equal((await request('/api/study/records')).status, 403);
  assert.equal((await request('/api/study/session', 'POST', { topic: 'unimplemented' })).status, 400);
  assert.equal((await request('/api/study/session', 'POST', { topic: 'rotation-matrices' }, undefined,
    { Origin: 'https://foreign.invalid' })).status, 403);
  assert.equal(await rawStatus(address, '/api/study/topics', { Host: 'attacker.invalid' }), 403);
  assert.equal((await request('/api/study/session', 'POST', { topic: 'rotation-matrices' }, undefined,
    { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
  const started = await request('/api/study/session', 'POST', { topic: 'rotation-matrices' });
  assert.equal(started.status, 201);
  const { session } = await started.json();
  assert.equal((await request('/api/study/answer', 'POST', { sessionId: session.id, answer: 'eval(1),1,0' })).status, 400);
  const answer = await request('/api/study/answer', 'POST', { sessionId: session.id, answer: '0,1,0' });
  assert.equal(answer.status, 200);
  const { record, avatar } = await answer.json();
  assert.equal(record.score, 3); assert.equal(record.maxScore, 3);
  assert.ok(record.steps.some(step => step.includes('Rz')));
  assert.deepEqual(avatar, { activity: 'idle', emotion: 'amazed' });
  await assert.rejects(access(join(directory, 'data/study/records.json')));
  await assert.rejects(access(join(directory, 'data/dashboard/tasks.json')));

  const save = { type: 'study.save', recordId: record.id };
  assert.equal((await request('/api/study/actions', 'POST', { ...save, approved: true })).status, 403);
  assert.equal((await request('/api/study/actions', 'POST', save, grant)).status, 409);
  assert.equal((await request('/api/study/actions', 'POST', { ...save, approved: 'true' }, grant)).status, 409);
  assert.equal((await request('/api/study/actions', 'POST', { ...save, approved: true }, grant)).status, 200);
  assert.equal((await request('/api/study/records', 'GET', undefined, { memory: true })).status, 403);
  const saved = await (await request('/api/study/records', 'GET', undefined, grant)).json();
  assert.equal(saved.records[0].studentAnswer, '0,1,0');
  const disk = JSON.parse(await readFile(join(directory, 'data/study/records.json'), 'utf8'));
  assert.equal(disk[0].id, record.id);
  assert.equal((await request('/api/study/records')).status, 403, 'revocation blocks later reads');
  assert.equal((await request('/api/study/actions', 'POST', { ...save, approved: true })).status, 403, 'revocation blocks saves');

  const create = { type: 'task.create', recordId: record.id };
  assert.equal((await request('/api/study/actions', 'POST', create)).status, 409);
  const created = await request('/api/study/actions', 'POST', { ...create, approved: true });
  assert.equal(created.status, 200);
  const outcome = await created.json();
  assert.equal(outcome.status, 'succeeded'); assert.ok(outcome.result.id);
  const persistedTasks = JSON.parse(await readFile(join(directory, 'data/dashboard/tasks.json'), 'utf8'));
  assert.ok(persistedTasks.some(task => task.id === outcome.result.id && task.title === record.nextReview.title));
  assert.ok(!JSON.stringify(persistedTasks).includes(record.studentAnswer), 'task contains review suggestion, not student answer');
  const retry = await (await request('/api/study/actions', 'POST', { ...create, approved: true })).json();
  assert.equal(retry.result.id, outcome.result.id);
  const taskList = await (await request('/api/tasks')).json();
  assert.equal(taskList.tasks.filter(task => task.studyRecordId === record.id).length, 1);
  assert.equal((await request('/api/tasks', 'PATCH', { id: outcome.result.id, done: true })).status, 200);

  const external = await request('/api/study/actions', 'POST', { type: 'external.tool', tool: 'run_command', approved: true }, grant);
  assert.equal(external.status, 403);
  assert.equal((await request('/api/study/actions', 'POST', { type: 'task.create', recordId: record.id, score: 999, approved: true })).status, 403);
  const remove = { type: 'study.delete', recordId: record.id, approved: true };
  assert.equal((await request('/api/study/actions', 'POST', remove)).status, 403);
  assert.equal((await request('/api/study/actions', 'POST', remove, grant)).status, 200);
  assert.deepEqual((await (await request('/api/study/records', 'GET', undefined, grant)).json()).records, []);
  const audit = await (await request('/api/study/audit')).json();
  assert.ok(audit.outcomes.some(item => item.action === 'study.delete' && item.status === 'succeeded'));
  assert.ok(audit.outcomes.some(item => item.status === 'denied'));
  assert.ok(!JSON.stringify(audit).includes(record.studentAnswer));
  const status = await (await request('/api/status')).json();
  assert.equal(status.ready, false, 'offline study never initializes providers or hardware');
  assert.deepEqual(status.avatar, { activity: 'idle', emotion: 'neutral' });
  for (const path of ['/api/message', '/api/transcribe', '/api/vision/capture', '/api/voice/test']) {
    assert.equal((await request(path, 'POST')).status, 403, path);
  }
  assert.equal(await rawStatus(address, '/api/tasks', { Host: 'rebinding.invalid' }), 403);
});

test('HTTP action failures never claim success or overwrite corrupt task storage', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'gepetto-study-failure-'));
  await mkdir(join(directory, 'data/dashboard'), { recursive: true });
  await writeFile(join(directory, 'data/dashboard/tasks.json'), 'broken-json');
  const { request } = await server(t, directory);
  const { session } = await (await request('/api/study/session', 'POST', { topic: 'fk-ik' })).json();
  const { record } = await (await request('/api/study/answer', 'POST', { sessionId: session.id, answer: '1,1,0,90' })).json();
  const response = await request('/api/study/actions', 'POST', { type: 'task.create', recordId: record.id, approved: true });
  assert.equal(response.status, 500);
  const outcome = await response.json();
  assert.equal(outcome.status, 'failed'); assert.equal(outcome.result, undefined);
  assert.equal(await readFile(join(directory, 'data/dashboard/tasks.json'), 'utf8'), 'broken-json');
  const audit = await (await request('/api/study/audit')).json();
  assert.equal(audit.outcomes[0].status, 'failed');
});
