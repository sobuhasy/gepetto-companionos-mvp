import { createServer, IncomingMessage, Server, ServerResponse } from 'node:http';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, extname, join, normalize } from 'node:path';
import { randomUUID } from 'node:crypto';
import { OpenAI } from 'openai';
import { AetherialApp } from '../index/AetherialApp';
import { SystemHealthService } from '../module/SystemHealthService';
import { MemoryCategory, MemoryRecord, MemorySource } from '../ltm/ltm_interface';
import { toCompanionMode } from '../companion/CompanionProfile';
import { DEFAULT_GENERATED_COMPANION_PROFILE, generateCompanionProfile } from '../companion/CompanionIdentityGenerator';
import { COMPANION_MODES } from '../companion/GeneratedCompanionProfile';
import type { CompanionIdentityGeneratorInput } from '../companion/CompanionIdentityGenerator';
import type { GeneratedCompanionProfile } from '../companion/GeneratedCompanionProfile';

const DEFAULT_PORT = 3000;
const PORT = Number(process.env['PORT'] ?? DEFAULT_PORT);
const MAX_PORT_FALLBACKS = 10;
const PUBLIC_DIR = join(process.cwd(), 'source', 'web', 'public');
const TMP_DIR = join(process.cwd(), 'tmp');
const MEMORY_PATH = join(process.cwd(), 'data', 'ltm', 'memories.jsonl');
const TASKS_PATH = join(process.cwd(), 'data', 'dashboard', 'tasks.json');
const COMPANION_PROFILE_PATH = join(process.cwd(), 'data', 'companion', 'generated-profile.json');
const healthService = new SystemHealthService();
const app = new AetherialApp();
let isReady = false;
let currentGeneratedProfile: GeneratedCompanionProfile | undefined;
let latestVision: { image?: string; capturedAt?: string; source: string; status: string } = {
    source: 'OBS Display Capture',
    status: 'No screen context has been captured in this web session yet.',
};
const eventLog: DashboardLogEntry[] = [];

type DashboardLogEntry = {
    id: string;
    level: 'info' | 'warn' | 'error';
    message: string;
    createdAt: string;
};

type DashboardTask = {
    id: string;
    title: string;
    kind: 'startup' | 'study' | 'workflow' | 'project';
    details: string;
    done: boolean;
    createdAt: string;
};

const memoryCategories: MemoryCategory[] = [
    'user_profile',
    'projects',
    'language_learning',
    'coding_history',
    'emotional_preferences',
    'blocked_distractions',
    'startup_tasks',
    'robotics_design',
];

const memorySources: MemorySource[] = ['chat', 'manual', 'system', 'imported'];

const defaultTasks: DashboardTask[] = [
    {
        id: 'study-active-recall',
        title: 'Active recall study sprint',
        kind: 'study',
        details: 'Use Study Mode to turn one topic into questions, answers, and weak-point review.',
        done: false,
        createdAt: new Date(0).toISOString(),
    },
    {
        id: 'japanese-coach-sprint',
        title: 'Japanese coach sprint',
        kind: 'study',
        details: 'Practice vocabulary, grammar, sentence correction, and kana or kanji recall.',
        done: false,
        createdAt: new Date(0).toISOString(),
    },
    {
        id: 'build-one-mvp-improvement',
        title: 'Build one MVP improvement',
        kind: 'project',
        details: 'Choose one visible improvement, ship it, and verify the demo still builds.',
        done: false,
        createdAt: new Date(0).toISOString(),
    },
    {
        id: 'review-privacy-controls',
        title: 'Review privacy controls',
        kind: 'workflow',
        details: 'Confirm microphone, camera, screen context, memory, and local-first toggles match user consent.',
        done: false,
        createdAt: new Date(0).toISOString(),
    },
    {
        id: 'prepare-follow-up-message',
        title: 'Prepare follow-up message',
        kind: 'workflow',
        details: 'Draft the next update, investor note, or user-facing follow-up after the demo session.',
        done: false,
        createdAt: new Date(0).toISOString(),
    },
];

const contentTypes: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.wav': 'audio/wav',
    '.mp3': 'audio/mpeg',
    '.ogg': 'audio/ogg',
    '.webm': 'audio/webm',
};

function addLog(level: DashboardLogEntry['level'], message: string): void {
    eventLog.unshift({ id: randomUUID(), level, message, createdAt: new Date().toISOString() });
    eventLog.splice(80);
}

async function ensureInitialized(): Promise<void> {
    if (isReady) {
        return;
    }
    await app.init();
    isReady = true;
    addLog('info', 'Aetherial runtime initialized for Aetherlink.');
}

async function parseBody(req: IncomingMessage): Promise<Record<string, unknown>> {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    if (chunks.length === 0) {
        return {};
    }

    const raw = Buffer.concat(chunks).toString('utf8');
    return JSON.parse(raw) as Record<string, unknown>;
}

function respondJson(res: ServerResponse, statusCode: number, payload: unknown): void {
    res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(payload));
}

function optionalString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasStringField(record: Record<string, unknown>, key: string): boolean {
    return typeof record[key] === 'string' && record[key].trim().length > 0;
}

function isStringArray(value: unknown): value is string[] {
    return Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === 'string' && item.trim().length > 0);
}

function isModeInstructionRecord(value: unknown): boolean {
    return isRecord(value) && COMPANION_MODES.every((mode) => hasStringField(value, mode));
}

function isGeneratedCompanionProfile(value: unknown): value is GeneratedCompanionProfile {
    if (!isRecord(value)) {
        return false;
    }

    const origin = value['origin'];
    if (!isRecord(origin)) {
        return false;
    }

    return [
        'id',
        'name',
        'shortName',
        'classification',
        'affinity',
        'familiarMotif',
        'temperament',
        'appearance',
        'voiceStyle',
        'memoryStyle',
        'userNativeLanguage',
        'greetingAerilonian',
        'greetingEnglish',
        'safetyBoundary',
        'createdAt',
    ].every((field) => hasStringField(value, field))
        && origin['dimension'] === 'Dimension-7-Lyra'
        && hasStringField(origin, 'cityDistrict')
        && hasStringField(origin, 'homelandDescription')
        && value['nativeLanguage'] === 'Aerilonian'
        && isStringArray(value['knownLanguages'])
        && isStringArray(value['personalitySeed'])
        && isStringArray(value['dailyWorkflows'])
        && isModeInstructionRecord(value['modeInstructions']);
}

function companionGeneratorInputFromBody(body: Record<string, unknown>): CompanionIdentityGeneratorInput {
    const input: CompanionIdentityGeneratorInput = {};
    const userName = optionalString(body['userName']);
    const userNativeLanguage = optionalString(body['userNativeLanguage']);
    const seed = optionalString(body['seed']);
    const preferredTone = optionalString(body['preferredTone']);
    const preferredAffinity = optionalString(body['preferredAffinity']);

    if (userName !== undefined) {
        input.userName = userName;
    }
    if (userNativeLanguage !== undefined) {
        input.userNativeLanguage = userNativeLanguage;
    }
    if (seed !== undefined) {
        input.seed = seed;
    }
    if (preferredTone !== undefined) {
        input.preferredTone = preferredTone;
    }
    if (preferredAffinity !== undefined) {
        input.preferredAffinity = preferredAffinity;
    }

    return input;
}

async function loadSavedGeneratedProfile(): Promise<GeneratedCompanionProfile | undefined> {
    try {
        const profile = JSON.parse(await readFile(COMPANION_PROFILE_PATH, 'utf-8')) as unknown;
        if (isGeneratedCompanionProfile(profile)) {
            return profile;
        }

        addLog('warn', 'Saved generated companion profile is invalid; using default profile.');
        return undefined;
    } catch (error) {
        if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') {
            return undefined;
        }
        throw error;
    }
}

async function getCurrentGeneratedProfile(): Promise<GeneratedCompanionProfile> {
    if (currentGeneratedProfile) {
        return currentGeneratedProfile;
    }

    const savedProfile = await loadSavedGeneratedProfile();
    if (savedProfile) {
        currentGeneratedProfile = savedProfile;
        return savedProfile;
    }

    return DEFAULT_GENERATED_COMPANION_PROFILE;
}

async function saveGeneratedProfile(profile: GeneratedCompanionProfile): Promise<void> {
    currentGeneratedProfile = profile;
    await mkdir(dirname(COMPANION_PROFILE_PATH), { recursive: true });
    await writeFile(COMPANION_PROFILE_PATH, `${JSON.stringify(profile, null, 2)}\n`, 'utf-8');
}

function extensionFromMimeType(mimeType: string): string {
    if (mimeType.includes('webm')) {
        return 'webm';
    }
    if (mimeType.includes('ogg')) {
        return 'ogg';
    }
    if (mimeType.includes('wav')) {
        return 'wav';
    }
    if (mimeType.includes('mpeg')) {
        return 'mp3';
    }
    return 'webm';
}

async function transcribeAudio(audioBase64: string, mimeType: string): Promise<string> {
    const audioPayload = audioBase64.includes(',') ? audioBase64.split(',')[1] ?? '' : audioBase64;

    if (!audioPayload) {
        throw new Error('Audio payload is empty.');
    }

    const extension = extensionFromMimeType(mimeType);
    await mkdir(TMP_DIR, { recursive: true });
    const tempFile = join(TMP_DIR, `webgui-audio-${randomUUID()}.${extension}`);

    await writeFile(tempFile, Buffer.from(audioPayload, 'base64'));

    try {
        const transcribeClient = new OpenAI({ apiKey: process.env['OPENAI_API_KEY'] });
        const transcription = await transcribeClient.audio.transcriptions.create({
            model: 'gpt-4o-mini-transcribe',
            file: createReadStream(tempFile),
            response_format: 'text',
        });

        return String(transcription).trim();
    } finally {
        await unlink(tempFile).catch(() => {
            // no-op cleanup
        });
    }
}

async function loadMemories(): Promise<MemoryRecord[]> {
    try {
        const raw = await readFile(MEMORY_PATH, 'utf-8');
        return raw
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean)
            .map((line) => JSON.parse(line) as MemoryRecord)
            .filter((memory) => typeof memory.id === 'string' && typeof memory.content === 'string')
            .sort((a, b) => Date.parse(b.lastUsedAt ?? b.createdAt) - Date.parse(a.lastUsedAt ?? a.createdAt));
    } catch (error) {
        if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') {
            return [];
        }
        throw error;
    }
}

async function saveMemories(memories: MemoryRecord[]): Promise<void> {
    await mkdir(dirname(MEMORY_PATH), { recursive: true });
    const serialized = memories.map((memory) => JSON.stringify(memory)).join('\n');
    await writeFile(MEMORY_PATH, serialized ? `${serialized}\n` : '', 'utf-8');
}

function toMemoryCategory(value: unknown): MemoryCategory {
    return memoryCategories.includes(value as MemoryCategory) ? value as MemoryCategory : 'projects';
}

function toMemorySource(value: unknown): MemorySource {
    return memorySources.includes(value as MemorySource) ? value as MemorySource : 'manual';
}

async function handleMemory(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    if (req.url?.startsWith('/api/memory') !== true) {
        return false;
    }

    if (req.method === 'GET') {
        const url = new URL(req.url, 'http://localhost');
        const category = url.searchParams.get('category');
        const text = url.searchParams.get('text')?.trim().toLowerCase();
        const memories = (await loadMemories()).filter((memory) => {
            if (category && category !== 'all' && memory.category !== category) {
                return false;
            }
            if (text && !memory.content.toLowerCase().includes(text)) {
                return false;
            }
            return true;
        });
        respondJson(res, 200, { categories: memoryCategories, memories });
        return true;
    }

    if (req.method === 'POST') {
        const body = await parseBody(req);
        const content = typeof body['content'] === 'string' ? body['content'].trim() : '';
        if (!content) {
            respondJson(res, 400, { error: 'Memory content is required.' });
            return true;
        }

        const memory: MemoryRecord = {
            id: randomUUID(),
            category: toMemoryCategory(body['category']),
            content,
            createdAt: new Date().toISOString(),
            confidence: Number.isFinite(body['confidence']) ? Number(body['confidence']) : 0.75,
            source: toMemorySource(body['source']),
        };
        const memories = await loadMemories();
        await saveMemories([memory, ...memories]);
        addLog('info', `Memory added in ${memory.category}.`);
        respondJson(res, 201, { memory });
        return true;
    }

    if (req.method === 'PATCH') {
        const body = await parseBody(req);
        const id = typeof body['id'] === 'string' ? body['id'] : '';
        const content = typeof body['content'] === 'string' ? body['content'].trim() : '';
        const memories = await loadMemories();
        const target = memories.find((memory) => memory.id === id);
        if (!target || !content) {
            respondJson(res, 400, { error: 'Valid id and content are required.' });
            return true;
        }

        target.content = content;
        target.category = toMemoryCategory(body['category']);
        target.source = toMemorySource(body['source']);
        target.confidence = Number.isFinite(body['confidence']) ? Number(body['confidence']) : target.confidence;
        target.lastUsedAt = new Date().toISOString();
        await saveMemories(memories);
        addLog('info', `Memory updated in ${target.category}.`);
        respondJson(res, 200, { memory: target });
        return true;
    }

    respondJson(res, 405, { error: 'Method not allowed.' });
    return true;
}

async function loadTasks(): Promise<DashboardTask[]> {
    try {
        return JSON.parse(await readFile(TASKS_PATH, 'utf-8')) as DashboardTask[];
    } catch (error) {
        if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') {
            return defaultTasks;
        }
        throw error;
    }
}

async function saveTasks(tasks: DashboardTask[]): Promise<void> {
    await mkdir(dirname(TASKS_PATH), { recursive: true });
    await writeFile(TASKS_PATH, `${JSON.stringify(tasks, null, 2)}\n`, 'utf-8');
}

async function handleTasks(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    if (req.url !== '/api/tasks') {
        return false;
    }

    if (req.method === 'GET') {
        respondJson(res, 200, { tasks: await loadTasks() });
        return true;
    }

    if (req.method === 'POST') {
        const body = await parseBody(req);
        const title = typeof body['title'] === 'string' ? body['title'].trim() : '';
        if (!title) {
            respondJson(res, 400, { error: 'Task title is required.' });
            return true;
        }

        const task: DashboardTask = {
            id: randomUUID(),
            title,
            kind: body['kind'] === 'study' ? 'study' : 'startup',
            details: typeof body['details'] === 'string' ? body['details'].trim() : '',
            done: false,
            createdAt: new Date().toISOString(),
        };
        const tasks = await loadTasks();
        await saveTasks([task, ...tasks]);
        addLog('info', `Task created: ${task.title}.`);
        respondJson(res, 201, { task });
        return true;
    }

    if (req.method === 'PATCH') {
        const body = await parseBody(req);
        const id = typeof body['id'] === 'string' ? body['id'] : '';
        const tasks = await loadTasks();
        const task = tasks.find((item) => item.id === id);
        if (!task) {
            respondJson(res, 404, { error: 'Task not found.' });
            return true;
        }
        task.done = Boolean(body['done']);
        await saveTasks(tasks);
        addLog('info', `Task ${task.done ? 'completed' : 'reopened'}: ${task.title}.`);
        respondJson(res, 200, { task });
        return true;
    }

    respondJson(res, 405, { error: 'Method not allowed.' });
    return true;
}

async function handleVision(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    if (req.url === '/api/vision' && req.method === 'GET') {
        respondJson(res, 200, latestVision);
        return true;
    }

    if (req.url === '/api/vision/capture' && req.method === 'POST') {
        try {
            await ensureInitialized();
            const image = await app.captureVision();
            latestVision = image
                ? { image, capturedAt: new Date().toISOString(), source: 'OBS Display Capture', status: 'Captured latest OBS/screen context.' }
                : { source: 'OBS Display Capture', status: 'OBS capture unavailable. Check OBS WebSocket and source name.' };
            addLog(image ? 'info' : 'warn', latestVision.status);
            respondJson(res, image ? 200 : 503, latestVision);
            return true;
        } catch (error) {
            addLog('error', 'Vision capture failed.');
            console.error('Failed to capture vision:', error);
            respondJson(res, 500, { error: 'Failed to capture vision.' });
            return true;
        }
    }

    return false;
}

async function handleCompanionProfile(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
    if (!pathname.startsWith('/api/companion/')) {
        return false;
    }

    try {
        if (pathname === '/api/companion/profile' && req.method === 'GET') {
            respondJson(res, 200, await getCurrentGeneratedProfile());
            return true;
        }

        if (pathname === '/api/companion/generate' && req.method === 'POST') {
            const body = await parseBody(req);
            const profile = generateCompanionProfile(companionGeneratorInputFromBody(body));
            await saveGeneratedProfile(profile);
            addLog('info', `Generated companion profile saved: ${profile.name}.`);
            respondJson(res, 200, profile);
            return true;
        }

        if (pathname === '/api/companion/profile' && req.method === 'POST') {
            const body = await parseBody(req);
            if (!isGeneratedCompanionProfile(body)) {
                respondJson(res, 400, { error: 'A valid GeneratedCompanionProfile is required.' });
                return true;
            }

            await saveGeneratedProfile(body);
            addLog('info', `Generated companion profile updated: ${body.name}.`);
            respondJson(res, 200, body);
            return true;
        }
    } catch (error) {
        console.error('Failed to handle companion profile request:', error);
        addLog('error', 'Generated companion profile request failed.');
        respondJson(res, 500, { error: 'Failed to handle generated companion profile request.' });
        return true;
    }

    if (pathname === '/api/companion/profile' || pathname === '/api/companion/generate') {
        respondJson(res, 405, { error: 'Method not allowed.' });
        return true;
    }

    respondJson(res, 404, { error: 'Companion API endpoint not found.' });
    return true;
}

async function handleApi(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    if (await handleCompanionProfile(req, res)) {
        return true;
    }

    if (await handleMemory(req, res)) {
        return true;
    }

    if (await handleTasks(req, res)) {
        return true;
    }

    if (await handleVision(req, res)) {
        return true;
    }

    if (req.url === '/api/status' && req.method === 'GET') {
        const health = await healthService.check(isReady);
        respondJson(res, 200, { online: true, ready: isReady, health, logs: eventLog });
        return true;
    }

    if (req.url === '/api/transcribe' && req.method === 'POST') {
        try {
            if (!process.env['OPENAI_API_KEY']) {
                respondJson(res, 500, { error: 'OPENAI_API_KEY is not configured on the server.' });
                return true;
            }

            const body = await parseBody(req);
            const audioBase64 = typeof body['audioBase64'] === 'string' ? body['audioBase64'] : '';
            const mimeType = typeof body['mimeType'] === 'string' ? body['mimeType'] : 'audio/webm';

            if (!audioBase64) {
                respondJson(res, 400, { error: 'audioBase64 is required.' });
                return true;
            }

            const text = await transcribeAudio(audioBase64, mimeType);
            respondJson(res, 200, { text });
            return true;
        } catch (error) {
            console.error('Failed to transcribe audio:', error);
            respondJson(res, 500, { error: 'Failed to transcribe audio.' });
            return true;
        }
    }

    if (req.url === '/api/message' && req.method === 'POST') {
        try {
            await ensureInitialized();
            const body = await parseBody(req);
            const legacyPrompt = typeof body['prompt'] === 'string' ? body['prompt'].trim() : '';
            const message = typeof body['message'] === 'string' ? body['message'].trim() : '';
            const prompt = legacyPrompt || message;
            const image = typeof body['image'] === 'string' ? body['image'] : undefined;
            const mode = toCompanionMode(body['mode']);
            const companionProfile = isGeneratedCompanionProfile(body['companionProfile']) ? body['companionProfile'] : undefined;

            if (!prompt && !image) {
                respondJson(res, 400, { error: 'Prompt or image is required.' });
                return true;
            }

            const result = await app.interact(prompt, 'text', image, mode, companionProfile);
            addLog(result.success ? 'info' : 'warn', `Chat interaction ${result.success ? 'completed' : 'failed'} in ${mode} mode.`);
            respondJson(res, 200, { ...result, mode });
            return true;
        } catch (error) {
            console.error('Failed to process API message:', error);
            addLog('error', 'Chat interaction failed.');
            respondJson(res, 500, { error: 'Failed to process the message.' });
            return true;
        }
    }

    return false;
}

async function serveStatic(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const requestPath = new URL(req.url ?? '/index.html', 'http://localhost').pathname;
    const requested = requestPath === '/' ? '/index.html' : requestPath;
    const safePath = normalize(requested).replace(/^(\.\.(\/|\\|$))+/, '');
    const filePath = join(PUBLIC_DIR, safePath);

    try {
        const data = await readFile(filePath);
        const contentType = contentTypes[extname(filePath).toLowerCase()] ?? 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(data);
    } catch {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not Found');
    }
}

function listenOnPort(server: Server, port: number): Promise<void> {
    return new Promise((resolve, reject) => {
        const onError = (error: NodeJS.ErrnoException) => {
            server.off('listening', onListening);
            reject(error);
        };
        const onListening = () => {
            server.off('error', onError);
            resolve();
        };

        server.once('error', onError);
        server.once('listening', onListening);
        server.listen(port);
    });
}

async function listenWithPortFallback(server: Server, preferredPort: number): Promise<void> {
    for (let offset = 0; offset <= MAX_PORT_FALLBACKS; offset += 1) {
        const port = preferredPort + offset;

        try {
            await listenOnPort(server, port);
            const fallbackNote = port === preferredPort ? '' : ` (preferred port ${preferredPort} was busy)`;
            const message = `Gepetto CompanionOS dashboard available at http://localhost:${port}${fallbackNote}`;
            addLog(port === preferredPort ? 'info' : 'warn', message);
            console.log(`🌐 ${message}`);
            return;
        } catch (error) {
            const nodeError = error as NodeJS.ErrnoException;
            if (nodeError.code !== 'EADDRINUSE' || offset === MAX_PORT_FALLBACKS) {
                throw error;
            }

            addLog('warn', `Port ${port} is already in use; trying ${port + 1}.`);
        }
    }
}

async function main(): Promise<void> {
    const server = createServer(async (req, res) => {
        const wasApiHandled = await handleApi(req, res);
        if (wasApiHandled) {
            return;
        }

        await serveStatic(req, res);
    });

    process.on('SIGINT', async () => {
        await app.shutdown();
        server.close(() => process.exit(0));
    });

    addLog('info', 'Gepetto CompanionOS web dashboard booting.');
    await listenWithPortFallback(server, PORT);
}

main().catch(async (error) => {
    console.error('Fatal web server error:', error);
    await app.shutdown();
    process.exit(1);
});
