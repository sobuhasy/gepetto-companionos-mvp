const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const { StudyService, StudyError } = require('../dist/study/StudyService');
const { StudyRecordStore } = require('../dist/study/StudyRecordStore');
const { DEFAULT_CONSENT, ConsentError, parseConsent } = require('../dist/privacy/ConsentState');

const allowed = () => ({ ...DEFAULT_CONSENT, study: true });
function scored(service = new StudyService(), answer = '0, 1, 0') {
  const session = service.start('rotation-matrices');
  return service.answer(session.id, answer);
}

test('rotation scoring is deterministic, gives component feedback and a worked matrix product', () => {
  const now = Date.parse('2026-10-29T12:00:00Z');
  const service = new StudyService(() => now);
  const session = service.start('rotation-matrices');
  assert.equal(session.question.id, 'rotation-z-90-v1');
  assert.equal('steps' in session, false, 'the question is initially shown without the worked solution');
  const answer = service.answer(session.id, '(0, 1/1, -0)');
  assert.equal(answer.score, 3);
  assert.equal(answer.maxScore, 3);
  assert.match(answer.feedback, /Correct/);
  assert.ok(answer.steps.some(step => step.includes('Rz(θ)')));
  assert.ok(answer.steps.some(step => step.includes('x′ = 0·1')));
  assert.equal(answer.nextReview.suggestedAt, '2026-11-01T12:00:00.000Z');
  assert.deepEqual(service.answer(session.id, '(0, 1/1, -0)'), answer, 'a network retry does not duplicate the result');
  assert.equal(service.record(answer.id).studentAnswer, answer.studentAnswer);
  assert.throws(() => service.answer(session.id, '1,0,0'), error => error instanceof StudyError && error.status === 409);
  answer.steps[0] = 'mutated';
  assert.notEqual(service.record(answer.id).steps[0], 'mutated', 'callers cannot mutate server-owned scoring');

  const partial = scored(service, '0, -1, 0');
  assert.equal(partial.score, 2);
  assert.match(partial.feedback, /rotated y/);
  assert.equal(partial.nextReview.suggestedAt, '2026-10-30T12:00:00.000Z');
  assert.match(partial.nextReview.details, /rotated y/);
  assert.equal(scored(service, '1,0,1').score, 0);
});

test('FK/IK scores the selected branch and explains both mappings with intermediate steps', () => {
  const service = new StudyService();
  const session = service.start('fk-ik');
  const result = service.answer(session.id, '1,1,0,90');
  assert.equal(result.score, 4);
  assert.equal(result.maxScore, 4);
  assert.ok(result.steps.some(step => step.includes('cos(θ₁ + θ₂)')));
  assert.ok(result.steps.some(step => step.includes('law of cosines')));
  assert.ok(result.steps.some(step => step.includes('45° − 45° = 0°')));
  const other = service.start('fk-ik');
  const otherBranch = service.answer(other.id, '1,1,90,-90');
  assert.equal(otherBranch.score, 2, 'the specified positive-theta2 branch is part of the question');
  assert.match(otherBranch.feedback, /IK θ₁/);
});

test('invalid numeric answers fail explicitly and do not consume a session', () => {
  const service = new StudyService();
  const session = service.start('rotation-matrices');
  for (const answer of ['', ' ', null, 42, '0,1', '0,1,0,0', '0,1,', '0,1,0junk', '0,Infinity,0', '0,1/0,0', '0,1e999,0', '0,Math.sin(1),0', '<script>1</script>', '[0,1,0)', 'x'.repeat(501)]) {
    assert.throws(() => service.answer(session.id, answer), StudyError, String(answer));
  }
  assert.equal(service.answer(session.id, '0 1 0').score, 3);
  assert.throws(() => service.start('constructor'), StudyError);
  assert.throws(() => service.answer(null, '0 1 0'), StudyError);
  assert.throws(() => service.record({}), StudyError);
  assert.throws(() => service.record('missing'), error => error.status === 404);
});

test('volatile study sessions expire and remain bounded', () => {
  let now = 1;
  const service = new StudyService(() => now, 100, 2);
  const first = service.start('rotation-matrices');
  const result = service.answer(first.id, '0,1,0');
  service.start('fk-ik');
  const latest = service.start('rotation-matrices');
  assert.throws(() => service.record(result.id), error => error.status === 404);
  assert.throws(() => service.answer(first.id, '0,1,0'), error => error.status === 404);
  now = 102;
  assert.throws(() => service.answer(latest.id, '0,1,0'), error => error.status === 404);
});

test('study persistence is explicitly consented, local, inspectable and deletable across instances', async () => {
  const directory = await fs.mkdtemp(join(tmpdir(), 'gepetto-study-'));
  const file = join(directory, 'study', 'records.json');
  const store = new StudyRecordStore(file);
  try {
    const record = scored();
    await assert.rejects(store.save(record, DEFAULT_CONSENT), ConsentError);
    await assert.rejects(store.list(DEFAULT_CONSENT), ConsentError);
    await assert.rejects(store.delete(record.id, DEFAULT_CONSENT), ConsentError);
    assert.equal(await fs.access(file).then(() => true, () => false), false);
    assert.equal(parseConsent({ study: 'true' }).study, false);
    const consent = allowed();
    const records = Array.from({ length: 5 }, () => scored());
    await Promise.all(records.map(item => store.save(item, consent)));
    await store.save(records[0], consent);
    const reopened = new StudyRecordStore(file);
    assert.equal((await reopened.list(consent)).length, 5, 'concurrent saves preserve every result and retries are idempotent');
    assert.deepEqual((await reopened.list(consent)).find(item => item.id === records[0].id), records[0]);
    consent.study = false;
    await assert.rejects(reopened.list(consent), ConsentError);
    await assert.rejects(reopened.save(record, consent), ConsentError);
    await assert.rejects(reopened.delete(records[0].id, consent), ConsentError);
    assert.equal((await reopened.list(allowed())).length, 5, 'revocation blocks access without silently deleting history');
    await Promise.all(records.slice(0, 2).map(item => store.delete(item.id, allowed())));
    assert.equal(await store.delete(records[0].id, allowed()), false);
    assert.equal((await store.list(allowed())).length, 3);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test('revocation while an async study read is pending prevents a queued save', async () => {
  const directory = await fs.mkdtemp(join(tmpdir(), 'gepetto-study-revoke-'));
  const file = join(directory, 'records.json');
  const consent = allowed();
  await fs.writeFile(file, '[]\n');
  const originalRead = fs.readFile;
  try {
    fs.readFile = async (...args) => {
      const value = await originalRead(...args);
      if (args[0] === file) consent.study = false;
      return value;
    };
    await assert.rejects(new StudyRecordStore(file).save(scored(), consent), ConsentError);
  } finally {
    fs.readFile = originalRead;
    assert.equal(await fs.readFile(file, 'utf8'), '[]\n');
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('corrupt study storage and filesystem failures are reported without replacing records', async () => {
  const directory = await fs.mkdtemp(join(tmpdir(), 'gepetto-study-failure-'));
  const file = join(directory, 'records.json');
  try {
    const store = new StudyRecordStore(file);
    for (const corrupt of ['{broken', '{}', '[{"id":"bad"}]', '[null]']) {
      await fs.writeFile(file, corrupt);
      await assert.rejects(store.list(allowed()), /malformed|invalid/);
      await assert.rejects(store.save(scored(), allowed()), /malformed|invalid/);
      assert.equal(await fs.readFile(file, 'utf8'), corrupt);
    }
    await assert.rejects(store.save({}, allowed()), /invalid/);
    const blocked = new StudyRecordStore(join(file, 'blocked.json'));
    await assert.rejects(blocked.save(scored(), allowed()));
    await fs.writeFile(file, '[]');
    await store.save(scored(), allowed());
    assert.equal((await store.list(allowed())).length, 1, 'a failed mutation does not poison subsequent writes');
    assert.ok((await fs.readdir(directory)).every(name => !name.endsWith('.tmp')));
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});
