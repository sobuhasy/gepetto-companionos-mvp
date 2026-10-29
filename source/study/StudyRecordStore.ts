import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { requireConsent } from '../privacy/ConsentState';
import type { ConsentState } from '../privacy/ConsentState';
import type { StudyRecord } from './StudyService';

function object(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function text(value: unknown): value is string { return typeof value === 'string' && value.length > 0; }
function date(value: unknown): boolean { return typeof value === 'string' && Number.isFinite(Date.parse(value)); }
function validRecord(value: unknown): value is StudyRecord {
    if (!object(value)) return false;
    const question = value['question'];
    const review = value['nextReview'];
    return typeof value['id'] === 'string' && UUID.test(value['id'])
        && typeof value['sessionId'] === 'string' && UUID.test(value['sessionId'])
        && (value['topic'] === 'rotation-matrices' || value['topic'] === 'fk-ik')
        && object(question) && text(question['id']) && text(question['prompt']) && text(question['answerHint'])
        && text(value['studentAnswer']) && text(value['feedback'])
        && typeof value['score'] === 'number' && Number.isInteger(value['score']) && value['score'] >= 0
        && typeof value['maxScore'] === 'number' && Number.isInteger(value['maxScore']) && value['maxScore'] > 0
        && value['score'] <= value['maxScore']
        && Array.isArray(value['steps']) && value['steps'].length > 0 && value['steps'].every(text)
        && object(review) && text(review['title']) && text(review['details']) && date(review['suggestedAt'])
        && date(value['createdAt']);
}

/** Explicit local saves only. Consent is checked before disk access and at async boundaries. */
export class StudyRecordStore {
    private writes: Promise<unknown> = Promise.resolve();
    constructor(private readonly path = join(process.cwd(), 'data', 'study', 'records.json')) {}

    private allowed(consent: ConsentState): void { requireConsent(consent.study === true, 'Study progress consent is required.'); }

    private async read(consent: ConsentState): Promise<StudyRecord[]> {
        this.allowed(consent);
        let raw: string;
        try { raw = await readFile(this.path, 'utf8'); }
        catch (error) {
            this.allowed(consent);
            if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') return [];
            throw error;
        }
        this.allowed(consent);
        let parsed: unknown;
        try { parsed = JSON.parse(raw) as unknown; }
        catch { throw new Error('Saved study records are malformed. No records were overwritten.'); }
        if (!Array.isArray(parsed) || !parsed.every(validRecord) || new Set(parsed.map(record => record.id)).size !== parsed.length) {
            throw new Error('Saved study records are invalid. No records were overwritten.');
        }
        return parsed as StudyRecord[];
    }

    private mutate<T>(operation: () => Promise<T>): Promise<T> {
        const next = this.writes.then(operation);
        this.writes = next.catch(() => undefined);
        return next;
    }

    private async replace(records: StudyRecord[], consent: ConsentState): Promise<void> {
        this.allowed(consent);
        await mkdir(dirname(this.path), { recursive: true });
        this.allowed(consent);
        const temporary = `${this.path}.${randomUUID()}.tmp`;
        try {
            await writeFile(temporary, `${JSON.stringify(records, null, 2)}\n`, 'utf8');
            this.allowed(consent);
            await rename(temporary, this.path);
        } finally { await unlink(temporary).catch(() => undefined); }
    }

    async list(consent: ConsentState): Promise<StudyRecord[]> {
        this.allowed(consent);
        await this.writes;
        return this.read(consent);
    }

    async save(record: StudyRecord, consent: ConsentState): Promise<StudyRecord> {
        this.allowed(consent);
        if (!validRecord(record)) throw new Error('Cannot save an invalid study record.');
        const snapshot = structuredClone(record);
        return this.mutate(async () => {
            const records = await this.read(consent);
            this.allowed(consent);
            const existing = records.find(item => item.id === snapshot.id);
            if (existing) return existing;
            await this.replace([snapshot, ...records], consent);
            this.allowed(consent);
            const verified = (await this.read(consent)).find(item => item.id === snapshot.id);
            if (!verified) throw new Error('Study record save could not be verified.');
            return verified;
        });
    }

    async delete(id: string, consent: ConsentState): Promise<boolean> {
        this.allowed(consent);
        if (!UUID.test(id)) throw new Error('A valid study record UUID is required.');
        return this.mutate(async () => {
            const records = await this.read(consent);
            this.allowed(consent);
            const remaining = records.filter(record => record.id !== id);
            if (remaining.length === records.length) return false;
            await this.replace(remaining, consent);
            return true;
        });
    }
}
