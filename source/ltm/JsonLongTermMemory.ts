import { appendFile, mkdir, readFile } from "node:fs/promises";
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

        await appendFile(this.memoryPath, `${JSON.stringify(memory)}\n`, "utf-8");

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