import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export type DashboardTask = {
    id: string;
    title: string;
    kind: 'startup' | 'study' | 'workflow' | 'project';
    details: string;
    done: boolean;
    createdAt: string;
    studyRecordId?: string;
};

type TaskInput = Pick<DashboardTask, 'title' | 'kind' | 'details'>;

function isTask(value: unknown): value is DashboardTask {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
    const task = value as Record<string, unknown>;
    return typeof task['id'] === 'string' && task['id'].length > 0
        && typeof task['title'] === 'string' && task['title'].trim().length > 0
        && ['startup', 'study', 'workflow', 'project'].includes(String(task['kind']))
        && typeof task['details'] === 'string'
        && typeof task['done'] === 'boolean'
        && typeof task['createdAt'] === 'string' && Number.isFinite(Date.parse(task['createdAt']))
        && (task['studyRecordId'] === undefined || typeof task['studyRecordId'] === 'string');
}

/** The dashboard's existing JSON array; one serialized writer per server process. */
export class TaskStore {
    private writes: Promise<unknown> = Promise.resolve();
    private readonly defaults: DashboardTask[];

    constructor(private readonly path: string, defaults: DashboardTask[] = []) {
        if (!defaults.every(isTask)) throw new Error('Invalid default tasks.');
        this.defaults = defaults.map(task => ({ ...task }));
    }

    private mutate<T>(operation: () => Promise<T>): Promise<T> {
        const next = this.writes.then(operation);
        this.writes = next.catch(() => undefined);
        return next;
    }

    private async read(): Promise<DashboardTask[]> {
        let raw: string;
        try { raw = await readFile(this.path, 'utf8'); }
        catch (error) {
            if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') {
                return this.defaults.map(task => ({ ...task }));
            }
            throw error;
        }
        const tasks: unknown = JSON.parse(raw);
        if (!Array.isArray(tasks) || !tasks.every(isTask)
            || new Set(tasks.map(task => task.id)).size !== tasks.length) {
            throw new Error('Invalid saved task list.');
        }
        return tasks;
    }

    async list(): Promise<DashboardTask[]> {
        await this.writes;
        return this.read();
    }

    private async write(tasks: DashboardTask[]): Promise<void> {
        await mkdir(dirname(this.path), { recursive: true });
        const temporary = `${this.path}.${randomUUID()}.tmp`;
        try {
            await writeFile(temporary, `${JSON.stringify(tasks, null, 2)}\n`, 'utf8');
            await rename(temporary, this.path);
        } finally {
            await unlink(temporary).catch(() => undefined);
        }
    }

    private async verify(task: DashboardTask): Promise<DashboardTask> {
        const saved = (await this.read()).find(candidate => candidate.id === task.id);
        if (!saved || saved.title !== task.title || saved.kind !== task.kind || saved.details !== task.details
            || saved.done !== task.done || saved.createdAt !== task.createdAt || saved.studyRecordId !== task.studyRecordId) {
            throw new Error('Task persistence could not be verified.');
        }
        return saved;
    }

    async create(input: TaskInput): Promise<DashboardTask> {
        return this.createTask(input);
    }

    async createStudyReview(recordId: string, title: string, details: string): Promise<DashboardTask> {
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(recordId)) {
            throw new Error('A study record UUID is required.');
        }
        return this.createTask({ title, details, kind: 'study' }, recordId);
    }

    private async createTask(input: TaskInput, studyRecordId?: string): Promise<DashboardTask> {
        if (typeof input.title !== 'string' || !input.title.trim() || input.title.length > 300
            || typeof input.details !== 'string' || input.details.length > 10000
            || !['startup', 'study', 'workflow', 'project'].includes(input.kind)) {
            throw new Error('A valid task title, kind and details are required.');
        }
        const title = input.title.trim();
        const details = input.details.trim();
        return this.mutate(async () => {
            const tasks = await this.read();
            const existing = studyRecordId ? tasks.find(task => task.studyRecordId === studyRecordId) : undefined;
            if (existing) return this.verify(existing);
            const task: DashboardTask = {
                id: randomUUID(), title, kind: input.kind, details, done: false, createdAt: new Date().toISOString(),
                ...(studyRecordId ? { studyRecordId } : {}),
            };
            await this.write([task, ...tasks]);
            return this.verify(task);
        });
    }

    async setDone(id: string, done: boolean): Promise<DashboardTask | undefined> {
        if (typeof done !== 'boolean') throw new Error('Task completion must be a boolean.');
        return this.mutate(async () => {
            const tasks = await this.read();
            const task = tasks.find(candidate => candidate.id === id);
            if (!task) return undefined;
            task.done = done;
            await this.write(tasks);
            return this.verify(task);
        });
    }
}
