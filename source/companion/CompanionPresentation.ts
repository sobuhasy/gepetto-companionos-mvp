import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { getCompanionProfile, normalizeCompanionMode } from './CompanionProfile';

export const LIVE2D_PARAMETER_ALIASES = [
    'angleX', 'angleY', 'angleZ', 'bodyAngleX', 'eyeLOpen', 'eyeROpen', 'eyeBallX', 'eyeBallY',
    'browLY', 'browRY', 'mouthOpen', 'mouthForm', 'breath',
] as const;
export type Live2DParameterMap = Partial<Record<typeof LIVE2D_PARAMETER_ALIASES[number], string>>;
type PresentationOverride = { modelUrl?: string; voiceId?: string; parameterMap?: Live2DParameterMap };
export type CompanionPresentation = {
    profileId: string;
    modelUrl: string | null;
    voiceId: string | null;
    parameterMap: Live2DParameterMap;
};

export class PresentationValidationError extends Error {}

function record(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function validateLocalModelUrl(value: unknown): string {
    if (typeof value !== 'string' || value.length > 1024 || !value.startsWith('/models/')
        || !value.endsWith('.model3.json') || /[?#\\\u0000-\u001f]/.test(value)) {
        throw new PresentationValidationError('Model URL must be a local /models/... .model3.json path.');
    }
    let decoded: string;
    try { decoded = decodeURIComponent(value); }
    catch { throw new PresentationValidationError('Model URL has invalid encoding.'); }
    if (/[\\:%?#\u0000-\u001f]/.test(decoded)
        || decoded.slice('/models/'.length).split('/').some(part => !part || part === '.' || part === '..')) {
        throw new PresentationValidationError('Model URL must not contain traversal or encoded paths.');
    }
    return value;
}

function validateVoiceId(value: unknown): string {
    if (typeof value !== 'string' || !/^[A-Za-z0-9_.:-]{1,200}$/.test(value.trim())) {
        throw new PresentationValidationError('Voice ID must contain 1–200 letters, digits, underscores, dots, colons or hyphens.');
    }
    return value.trim();
}

function validateParameterMap(value: unknown): Live2DParameterMap {
    if (!record(value)) throw new PresentationValidationError('parameterMap must be an object.');
    const result: Live2DParameterMap = {};
    for (const [alias, parameter] of Object.entries(value)) {
        if (!LIVE2D_PARAMETER_ALIASES.includes(alias as typeof LIVE2D_PARAMETER_ALIASES[number])
            || typeof parameter !== 'string' || !/^[A-Za-z0-9_.:-]{1,128}$/.test(parameter)) {
            throw new PresentationValidationError('parameterMap must map supported aliases to rig parameter IDs.');
        }
        result[alias as typeof LIVE2D_PARAMETER_ALIASES[number]] = parameter;
    }
    return result;
}

export function isPresentationFallbackId(id: string): boolean {
    return /^(?:mode:(?:study|code|productivity|japanese|creative|support)|legacy:(?:eve|lyriel|rea))$/.test(id);
}

/** Presentation selections remain separate from personality profiles and provider credentials. */
export class CompanionPresentationStore {
    private queue: Promise<void> = Promise.resolve();
    constructor(private readonly path = join(process.cwd(), 'data', 'companion', 'presentation.json')) {}

    private async read(): Promise<Record<string, PresentationOverride>> {
        try {
            const parsed: unknown = JSON.parse(await readFile(this.path, 'utf8'));
            if (!record(parsed)) throw new Error('Invalid companion presentation store.');
            const result: Record<string, PresentationOverride> = Object.create(null) as Record<string, PresentationOverride>;
            for (const [id, value] of Object.entries(parsed)) {
                if (!record(value)) throw new Error('Invalid companion presentation entry.');
                result[id] = {
                    ...(value['modelUrl'] === undefined ? {} : { modelUrl: validateLocalModelUrl(value['modelUrl']) }),
                    ...(value['voiceId'] === undefined ? {} : { voiceId: validateVoiceId(value['voiceId']) }),
                    ...(value['parameterMap'] === undefined ? {} : { parameterMap: validateParameterMap(value['parameterMap']) }),
                };
            }
            return result;
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') return Object.create(null) as Record<string, PresentationOverride>;
            throw error;
        }
    }

    async get(profileId: string, modeInput?: string): Promise<CompanionPresentation> {
        await this.queue;
        const saved = await this.read();
        const mode = normalizeCompanionMode(modeInput ?? (isPresentationFallbackId(profileId) ? profileId.split(':')[1] : undefined));
        const legacy = getCompanionProfile(mode);
        const layers = [saved[`legacy:${legacy.mode}`], saved[`mode:${mode}`], saved[profileId]];
        const selected = Object.assign({}, ...layers) as PresentationOverride;
        const configuredModel = process.env['LIVE2D_MODEL_URL']?.trim();
        return {
            profileId,
            modelUrl: selected.modelUrl ?? (configuredModel ? validateLocalModelUrl(configuredModel) : null),
            voiceId: selected.voiceId ?? (process.env['COMPANION_VOICE_ID']?.trim() || legacy.voiceId || null),
            parameterMap: Object.assign({}, ...layers.map(layer => layer?.parameterMap)) as Live2DParameterMap,
        };
    }

    async update(profileId: string, patch: Record<string, unknown>): Promise<void> {
        if (!profileId || profileId.length > 200 || /[\u0000-\u001f]/.test(profileId)) {
            throw new PresentationValidationError('A valid profileId is required.');
        }
        const update: Partial<Record<keyof PresentationOverride, string | Live2DParameterMap | null>> = {};
        if ('modelUrl' in patch) update.modelUrl = patch['modelUrl'] === null ? null : validateLocalModelUrl(patch['modelUrl']);
        if ('voiceId' in patch) update.voiceId = patch['voiceId'] === null ? null : validateVoiceId(patch['voiceId']);
        if ('parameterMap' in patch) update.parameterMap = patch['parameterMap'] === null ? null : validateParameterMap(patch['parameterMap']);
        const operation = this.queue.then(async () => {
            const saved = await this.read();
            const next = { ...saved[profileId] };
            for (const key of Object.keys(update) as (keyof PresentationOverride)[]) {
                const value = update[key];
                if (value === null) delete next[key];
                else if (key === 'parameterMap') next.parameterMap = value as Live2DParameterMap;
                else next[key] = value as string;
            }
            // A null-prototype map also permits imported profile IDs such as "__proto__" safely.
            const entries = Object.assign(Object.create(null) as Record<string, PresentationOverride>, saved);
            entries[profileId] = next;
            await mkdir(dirname(this.path), { recursive: true });
            const temporary = `${this.path}.${randomUUID()}.tmp`;
            try {
                await writeFile(temporary, `${JSON.stringify(entries, null, 2)}\n`, 'utf8');
                await rename(temporary, this.path);
            } finally { await unlink(temporary).catch(() => undefined); }
        });
        this.queue = operation.catch(() => undefined);
        await operation;
    }
}
