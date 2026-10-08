import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";

import {
    LTM,
    MemoryCategory,
    MemoryRecord,
} from "./ltm_interface";

export type MemoryQueryOptions = {
    category?: MemoryCategory;
    text?: string;
    limit?: number;
};

export class JsonLongTermMemory implements LTM {
    private readonly memoryPath: string;

    public constructor(memoryPath = join(process.cwd(), "data", "ltm", "memories.jsonl")){
        this.memoryPath = memoryPath;
    }

    public async init(): Promise<void> {
        await mkdir(dirname(this.memoryPath), { recursive: true });
    }

    public async free(): Promise<void> {
        // No persistent connection to close for JSONL storage.
    }

    private writes: Promise<unknown> = Promise.resolve();

    private mutate<T>(operation: () => Promise<T>): Promise<T> {
        const next = this.writes.then(operation);
        this.writes = next.catch(() => undefined);
        return next;
    }

    private async saveAll(records: MemoryRecord[]): Promise<void> {
        await this.init();
        const temporary = `${this.memoryPath}.tmp`;
        await writeFile(temporary, records.map(record => JSON.stringify(record) + '\n').join(''), 'utf-8');
        await rename(temporary, this.memoryPath);
    }

    public async update(id: string, patch: Pick<MemoryRecord, 'content' | 'category' | 'source' | 'confidence'>): Promise<MemoryRecord | undefined> {
        return this.mutate(async () => {
            const records = await this.loadAll();
            const target = records.find(record => record.id === id);
            if (!target) return undefined;
            if (!patch.content.trim()) throw new Error('Memory content is required.');
            Object.assign(target, patch, { content: patch.content.trim(), confidence: this.normalizeConfidence(patch.confidence) });
            await this.saveAll(records);
            return target;
        });
    }

    public async delete(id: string): Promise<boolean> {
        return this.mutate(async () => {
            const records = await this.loadAll();
            const remaining = records.filter(record => record.id !== id);
            if (remaining.length === records.length) return false;
            await this.saveAll(remaining);
            return true;
        });
    }

    public async store(record: Omit<MemoryRecord, "id" | "createdAt">): Promise<MemoryRecord> {
        await this.init();

        const now = new Date().toISOString();

        const memory: MemoryRecord = {
            id: randomUUID(),
            category: record.category,
            content: record.content.trim(),
            createdAt: now,
            ...(record.lastUsedAt === undefined ? {} : { lastUsedAt: record.lastUsedAt }),
            confidence: this.normalizeConfidence(record.confidence),
            source: record.source,
        };

        if (!memory.content) {
            throw new Error("Cannot store an empty memory record.");
        }

        await this.mutate(async () => { await this.saveAll([...(await this.loadAll()), memory]); });

        return memory;
    }

    public async query(options: MemoryQueryOptions = {}): Promise<MemoryRecord[]> {
        const allMemories = await this.loadAll();

        const textNeedle = options.text?.trim().toLowerCase();

        const filtered = allMemories.filter((memory) => {
            if (options.category && memory.category !== options.category) {
                return false;
            }

            if (textNeedle && !memory.content.toLowerCase().includes(textNeedle)) {
                return false;
            }

            return true;
        });

        const sorted = filtered.sort((a, b) => {
            const aTime = Date.parse(a.lastUsedAt ?? a.createdAt);
            const bTime = Date.parse(b.lastUsedAt ?? b.createdAt);
            return bTime - aTime;
        });

        return sorted.slice(0, options.limit ?? 20);
    }

    private async loadAll(): Promise<MemoryRecord[]> {
        try{
            const raw = await readFile(this.memoryPath, "utf-8");

            return raw
                .split("\n")
                .map((line) => line.trim())
                .filter(Boolean)
                .map((line) => line.trim())
                .filter(Boolean)
                .map((line) => JSON.parse(line) as MemoryRecord)
                .filter((memory) => this.isValidMemoryRecord(memory));
        } catch (error) {
            if (this.isFileNotFoundError(error)) {
                return [];
            }
            throw error;
        }
    }

    private normalizeConfidence(confidence: number): number {
        if (!Number.isFinite(confidence)) {
            return 0.5;
        }

        if (confidence < 0) {
            return 0;
        }

        if (confidence > 1) {
            return 1;
        }

        return confidence;
    }

    private isValidMemoryRecord(value: MemoryRecord): boolean {
        return typeof value.id === "string"
            && typeof value.category === "string"
            && typeof value.content === "string"
            && typeof value.createdAt === "string"
            && typeof value.confidence === "number"
            && typeof value.source === "string";
    }

    private isFileNotFoundError(error: unknown): boolean {
        return typeof error === "object"
            && error !== null
            && "code" in error
            && error.code === "ENOENT";
    }
}