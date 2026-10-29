import { randomUUID } from 'node:crypto';
import type { ConsentState } from '../privacy/ConsentState';
import type { ToolRiskLevel } from '../openclaw/OpenClawTypes';

export type SkillAction =
    | { type: 'study.save'; recordId: string }
    | { type: 'study.delete'; recordId: string }
    | { type: 'task.create'; recordId: string }
    | { type: 'external.tool'; tool: string };

export type ActionContext = { consent: ConsentState; approved: boolean };
export type ActionOutcome = {
    id: string;
    action: SkillAction['type'] | 'invalid';
    status: 'succeeded' | 'denied' | 'approval_required' | 'failed';
    risk: ToolRiskLevel;
    reason: string;
    result?: unknown;
};
export type ActionAudit = Omit<ActionOutcome, 'result'> & { createdAt: string };
export type SkillActionHandlers = {
    saveStudy: (recordId: string, context: ActionContext) => Promise<unknown>;
    deleteStudy: (recordId: string, context: ActionContext) => Promise<unknown>;
    createTask: (recordId: string, context: ActionContext) => Promise<unknown>;
};

function parseAction(value: unknown): SkillAction | undefined {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
    const prototype: unknown = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return undefined;
    const input = value as Record<string, unknown>;
    if (!Object.hasOwn(input, 'type')) return undefined;
    const type = input['type'];
    if (type === 'external.tool') {
        if (Object.keys(input).some(key => !['type', 'tool'].includes(key))
            || !Object.hasOwn(input, 'tool') || typeof input['tool'] !== 'string'
            || !/^[a-z][a-z0-9_.-]{0,79}$/i.test(input['tool'])) return undefined;
        return { type, tool: input['tool'] };
    }
    if (type !== 'study.save' && type !== 'study.delete' && type !== 'task.create') return undefined;
    if (Object.keys(input).some(key => !['type', 'recordId'].includes(key))
        || !Object.hasOwn(input, 'recordId') || typeof input['recordId'] !== 'string'
        || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input['recordId'])) return undefined;
    return { type, recordId: input['recordId'] };
}

/** Local skills only. No external client, shell, capture or memory retrieval is registered. */
export class SkillActionRouter {
    private readonly records: ActionAudit[] = [];
    constructor(private readonly handlers: SkillActionHandlers) {}

    audit(): ActionAudit[] { return this.records.map(record => ({ ...record })); }

    private finish(outcome: ActionOutcome): ActionOutcome {
        const { result: _result, ...metadata } = outcome;
        this.records.unshift({ ...metadata, createdAt: new Date().toISOString() });
        this.records.splice(100);
        return outcome;
    }

    async execute(input: unknown, context: ActionContext): Promise<ActionOutcome> {
        const action = parseAction(input);
        const id = randomUUID();
        if (!action) return this.finish({ id, action: 'invalid', status: 'denied', risk: 'dangerous', reason: 'Unknown or malformed action.' });
        const risk: ToolRiskLevel = action.type === 'study.delete' || action.type === 'external.tool' ? 'dangerous' : 'caution';
        const metadata = { id, action: action.type, risk };
        if (action.type === 'external.tool') {
            return this.finish({ ...metadata, status: 'denied', reason: 'External tools are disabled.' });
        }
        if ((action.type === 'study.save' || action.type === 'study.delete') && context.consent.study !== true) {
            return this.finish({ ...metadata, status: 'denied', reason: 'Study record consent is required.' });
        }
        if (context.approved !== true) {
            return this.finish({ ...metadata, status: 'approval_required', reason: 'Explicit approval is required for this local change.' });
        }
        try {
            const result = action.type === 'study.save' ? await this.handlers.saveStudy(action.recordId, context)
                : action.type === 'study.delete' ? await this.handlers.deleteStudy(action.recordId, context)
                    : await this.handlers.createTask(action.recordId, context);
            if (result === undefined || result === null || result === false) throw new Error('Action did not produce a confirmed result.');
            return this.finish({ ...metadata, status: 'succeeded', reason: 'Local action completed and verified.', result });
        } catch {
            return this.finish({ ...metadata, status: 'failed', reason: 'Local action failed; completion could not be verified.' });
        }
    }
}
