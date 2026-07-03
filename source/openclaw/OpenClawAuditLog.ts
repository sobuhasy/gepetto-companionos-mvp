import { appendFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";

import {
    OpenClawActionDecision,
    OpenClawActionRequest,
    OpenClawAuditRecord,
} from "./OpenClawTypes";

export class OpenClawAuditLog {
    private readonly logPath = join(process.cwd(), "logs", "openclaw-audit.jsonl");

    public async record(
        request: OpenClawActionRequest,
        decision: OpenClawActionDecision,
    ): Promise<void> {
        const record: OpenClawAuditRecord = {
            id: randomUUID(),
            tool: request.tool,
            args: request.args,
            reason: request.reason,
            decision,
            createdAt: new Date().toISOString(),
        };

        await mkdir(dirname(this.logPath), { recursive: true });
        await appendFile(this.logPath, `${JSON.stringify(record)}\n`, "utf-8")
    }
}