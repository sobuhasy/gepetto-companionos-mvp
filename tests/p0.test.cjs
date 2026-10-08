const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtemp, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { DEFAULT_CONSENT, parseConsent, ConsentError } = require('../dist/privacy/ConsentState');
const { buildMemoryContext } = require('../dist/companion/MemoryContext');
const { CompanionPromptService } = require('../dist/companion/CompanionPromptService');
const { JsonLongTermMemory } = require('../dist/ltm/JsonLongTermMemory');
const { AetherialApp } = require('../dist/index/AetherialApp');
const cloud = { ...DEFAULT_CONSENT, localFirst: false };

test('missing/malformed consent fails closed', () => {
  for (const input of [undefined, null, {}, { memory: 'true', localFirst: 0 }]) {
    assert.deepEqual(parseConsent(input), DEFAULT_CONSENT);
  }
});

test('memory reads require consent; prompt context is bounded, ranked and metadata-free', async () => {
  let reads = 0;
  const memory = { query: async options => {
    reads++; assert.equal(options.limit, 50);
    return Array.from({ length: 50 }, (_, index) => ({ id: 'SECRET-ID', content: index === 49 ? 'Japanese practice' : 'x'.repeat(1000), createdAt: 'SECRET-DATE' }));
  }};
  assert.equal(await buildMemoryContext(memory, cloud, 'Japanese'), ''); assert.equal(reads, 0);
  const context = await buildMemoryContext(memory, { ...cloud, memory: true }, 'Japanese');
  const values = JSON.parse(context.slice(context.indexOf('\n') + 1));
  assert.equal(values.length, 5); assert.equal(values[0], 'Japanese practice');
  assert.ok(values.every(value => value.length <= 400));
  assert.ok(!context.includes('SECRET'));
  const prompt = await new CompanionPromptService().buildPrompt({ userMessage: 'Japanese', context });
  assert.ok(prompt.includes(context));
});

test('runtime enforces cloud, microphone, uploaded-image and screen boundaries, including AUTO_CAPTURE_OBS', async () => {
  const app = new AetherialApp();
  app.initialized = true;
  let captures = 0, calls = 0, queries = 0, prompt = '';
  app.eveEyes = { captureScreen: async () => { captures++; return 'image'; } };
  app.eveBrain = { generate: async value => { calls++; prompt = value; return { success: true, value: '{"text":"ok","emotion":"neutral","speak":false}' }; } };
  app.eveBody = { setExpression: async () => {} };
  app.memory = { query: async () => { queries++; return [{ content: 'Remember Japanese practice' }]; } };
  await assert.rejects(app.interact('hello'), ConsentError);
  await assert.rejects(app.getPromptFromSpeech(cloud), ConsentError);
  await assert.rejects(app.captureVision(cloud), ConsentError);
  await assert.rejects(app.generateVoiceTest(), ConsentError);
  await assert.rejects(app.interact('hello', 'text', 'image', undefined, undefined, false, cloud), ConsentError);
  await assert.rejects(app.interact('hello', 'text', undefined, undefined, undefined, true, cloud), ConsentError);
  assert.equal(calls, 0);
  const previous = process.env.AUTO_CAPTURE_OBS;
  process.env.AUTO_CAPTURE_OBS = 'true';
  try {
    await app.interact('hello', 'text', undefined, undefined, undefined, false, cloud);
    assert.equal(captures, 0); assert.equal(queries, 0);
    await app.interact('Japanese', 'text', undefined, undefined, undefined, false, { ...cloud, memory: true });
    assert.ok(prompt.includes('Remember Japanese practice')); assert.equal(queries, 1);
    await app.interact('hello', 'text', undefined, undefined, undefined, true, { ...cloud, screen: true });
    assert.equal(captures, 1);
  } finally {
    if (previous === undefined) delete process.env.AUTO_CAPTURE_OBS; else process.env.AUTO_CAPTURE_OBS = previous;
  }
});

test('JSONL explicit CRUD preserves concurrent writes and removes deleted context', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'gepetto-memory-'));
  try {
    const memory = new JsonLongTermMemory(join(directory, 'memories.jsonl'));
    const records = await Promise.all(['one', 'two'].map(content => memory.store({ content, category: 'projects', source: 'manual', confidence: 1 })));
    assert.equal((await memory.query()).length, 2);
    await memory.update(records[0].id, { content: 'edited', category: 'projects', source: 'manual', confidence: 2 });
    assert.ok((await memory.query()).some(record => record.content === 'edited' && record.confidence === 1));
    assert.equal(await memory.delete(records[0].id), true);
    assert.equal(await memory.delete(records[0].id), false);
    assert.equal(await memory.update('missing', { content: 'x', category: 'projects', source: 'manual', confidence: 1 }), undefined);
    assert.ok(!(await buildMemoryContext(memory, { ...cloud, memory: true }, 'edited')).includes('edited'));
  } finally { await rm(directory, { recursive: true, force: true }); }
});


test('HTTP consent gates and memory CRUD return explicit status codes', async () => {
  const { spawn } = require('node:child_process');
  const directory = await mkdtemp(join(tmpdir(), 'gepetto-http-'));
  const child = spawn(process.execPath, [join(__dirname, '../dist/web/server.js')], {
    cwd: directory, env: { ...process.env, PORT: '0', AUTO_CAPTURE_OBS: 'true' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  try {
    const address = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Server startup timeout')), 15000);
      child.once('exit', code => { clearTimeout(timeout); reject(new Error(`Server exited: ${code}`)); });
      child.stdout.on('data', chunk => {
        const match = String(chunk).match(/http:\/\/localhost:(\d+)/);
        if (match) { clearTimeout(timeout); resolve(`http://localhost:${match[1]}`); }
      });
    });
    const request = (path, method = 'GET', body, consent) => fetch(address + path, {
      method, headers: { 'Content-Type': 'application/json', ...(consent ? { 'X-Companion-Consent': JSON.stringify(consent) } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    for (const [path, method] of [['/api/message', 'POST'], ['/api/transcribe', 'POST'], ['/api/vision/capture', 'POST'], ['/api/vision', 'GET'], ['/api/memory', 'GET'], ['/api/voice/test', 'POST']]) {
      assert.equal((await request(path, method)).status, 403, path);
    }
    assert.equal((await request('/api/message', 'POST', { message: 'hi', image: 'image' }, cloud)).status, 403);
    assert.equal((await request('/api/message', 'POST', { message: 'hi', useScreenContext: true }, cloud)).status, 403);
    const consent = { ...DEFAULT_CONSENT, memory: true };
    const created = await request('/api/memory', 'POST', { content: 'test memory', category: 'projects' }, consent);
    assert.equal(created.status, 201);
    const { memory } = await created.json();
    assert.equal((await request('/api/memory', 'PATCH', { id: memory.id, content: 'updated' }, consent)).status, 200);
    assert.equal((await request('/api/memory', 'DELETE', { id: 'bad' }, consent)).status, 400);
    assert.equal((await request('/api/memory', 'DELETE', { id: memory.id }, consent)).status, 200);
    assert.equal((await request('/api/memory', 'DELETE', { id: memory.id }, consent)).status, 404);
    assert.equal((await request('/api/memory', 'PATCH', { id: memory.id, content: 'x' }, consent)).status, 404);
    const listing = await (await request('/api/memory', 'GET', undefined, consent)).json();
    assert.deepEqual(listing.memories, []);
    const status = await (await request('/api/status')).json();
    assert.ok(status.logs.some(log => log.message.includes('added')));
    assert.ok(status.logs.some(log => log.message.includes('updated')));
    assert.ok(status.logs.some(log => log.message.includes('deleted')));
  } finally {
    const exited = new Promise(resolve => child.once('exit', resolve));
    child.kill(); await exited;
    await rm(directory, { recursive: true, force: true });
  }
});
