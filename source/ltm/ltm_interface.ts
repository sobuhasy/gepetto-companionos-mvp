import { Module } from "../module/module_interface";

export type MemoryCategory =
    | "user_profile"
    | "projects"
    | "language_learning"
    | "coding_history"
    | "emotional_preferences"
    | "blocked_distractions"
    | "startup_tasks"
    | "robotics_design";

export type MemorySource = "chat" | "manual" | "system" | "imported";

export type MemoryRecord = {
    id: string;
    category: MemoryCategory;
    content: string;
    createdAt: string;
    lastUsedAt?: string;
    confidence: number;
    source: MemorySource;
};

export type MemoryQuery = {
    category?: MemoryCategory;
    text?: string;
    limit?: number;
};

export interface LTM extends Module {
    store(record: Omit<MemoryRecord, "id" | "createdAt">): Promise<MemoryRecord>;
    query(options?: MemoryQuery): Promise<MemoryRecord[]>;
}