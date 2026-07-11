import { TypecastClient } from '@neosapience/typecast-js';
import type { TTSRequest, TTSResponse } from '@neosapience/typecast-js';
import * as fs from 'fs';
import * as path from 'path';
import { TTS } from './tts_interface';

const DEFAULT_MODEL = 'ssfm-v30';
const DEFAULT_MAX_CHARS = 900;
const TYPECAST_API_MAX_CHARS = 5000;
const SELF_TEST_TEXT = 'Hello. Gepetto CompanionOS voice test.';

export type TypeCastDiagnostic = {
    statusCode?: number;
    errorCode?: string;
    message?: string;
    validationErrors?: unknown;
};

export type TypeCastGenerationResult = {
    audioUrl: string;
    format: 'wav' | 'mp3';
    model: string;
    spokenText: string;
    usedPrompt: boolean;
    retriedWithoutPrompt: boolean;
};

export class TypeCastGenerationError extends Error {
    public readonly diagnostic: TypeCastDiagnostic;
    public readonly retriedWithoutPrompt: boolean;

    public constructor(message: string, diagnostic: TypeCastDiagnostic, retriedWithoutPrompt: boolean) {
        super(message);
        this.name = 'TypeCastGenerationError';
        this.diagnostic = diagnostic;
        this.retriedWithoutPrompt = retriedWithoutPrompt;
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sanitizeDiagnosticString(value: string, maxLength = 240): string {
    let sanitized = value
        .replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ')
        .replace(/bearer\s+\S+/gi, 'Bearer [redacted]')
        .replace(/(?:api[_ -]?key|authorization|token|secret)\s*[:=]\s*\S+/gi, '[redacted]')
        .replace(/\s+/g, ' ')
        .trim();

    const apiKey = process.env['TYPECAST_API_KEY'];
    if (apiKey) {
        sanitized = sanitized.replaceAll(apiKey, '[redacted]');
    }

    return sanitized.length > maxLength ? `${sanitized.slice(0, maxLength - 3)}...` : sanitized;
}

function sanitizeDiagnosticValue(value: unknown, depth = 0): unknown {
    if (depth > 3) {
        return '[truncated]';
    }
    if (typeof value === 'string') {
        return sanitizeDiagnosticString(value);
    }
    if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
        return value;
    }
    if (Array.isArray(value)) {
        return value.slice(0, 8).map((item) => sanitizeDiagnosticValue(item, depth + 1));
    }
    if (!isRecord(value)) {
        return undefined;
    }

    const sanitized: Record<string, unknown> = {};
    for (const [key, candidate] of Object.entries(value).slice(0, 12)) {
        if (/(?:authorization|api[_-]?key|token|secret|headers?|request|body|input)/i.test(key)) {
            sanitized[key] = '[redacted]';
            continue;
        }
        sanitized[key] = sanitizeDiagnosticValue(candidate, depth + 1);
    }
    return sanitized;
}

function firstString(record: Record<string, unknown> | undefined, keys: string[]): string | undefined {
    if (!record) {
        return undefined;
    }

    for (const key of keys) {
        const value = record[key];
        if (typeof value === 'string' && value.trim()) {
            return sanitizeDiagnosticString(value);
        }
    }
    return undefined;
}

export function getTypeCastDiagnostic(error: unknown): TypeCastDiagnostic {
    const errorRecord = isRecord(error) ? error : undefined;
    const response = isRecord(errorRecord?.['response']) ? errorRecord['response'] : undefined;
    const diagnostic: TypeCastDiagnostic = {};
    const statusCode = errorRecord?.['statusCode'];
    const errorCode = firstString(response, ['error_code', 'code', 'error']);
    const responseMessage = firstString(response, ['message']);
    const errorMessage = error instanceof Error ? sanitizeDiagnosticString(error.message) : undefined;
    const diagnosticMessage = responseMessage ?? errorMessage;
    const validationCandidate = response?.['validation_errors'] ?? response?.['errors'] ?? response?.['detail'];

    if (typeof statusCode === 'number' && Number.isFinite(statusCode)) {
        diagnostic.statusCode = statusCode;
    }
    if (errorCode) {
        diagnostic.errorCode = errorCode;
    }
    if (diagnosticMessage) {
        diagnostic.message = diagnosticMessage;
    }
    if (validationCandidate !== undefined) {
        const validationErrors = sanitizeDiagnosticValue(validationCandidate);
        if (validationErrors !== undefined) {
            diagnostic.validationErrors = validationErrors;
        }
    }

    return diagnostic;
}

function isValidationFailure(diagnostic: TypeCastDiagnostic): boolean {
    return diagnostic.statusCode === 422 || diagnostic.errorCode?.toUpperCase() === 'VALIDATION_ERROR';
}

function safeValidationJson(value: unknown): string {
    try {
        return sanitizeDiagnosticString(JSON.stringify(value), 700);
    } catch {
        return '[unavailable]';
    }
}

function formatTypeCastDiagnostic(diagnostic: TypeCastDiagnostic): string {
    const validationFailure = isValidationFailure(diagnostic);
    const label = validationFailure ? 'TypeCast validation failed' : 'TypeCast request failed';
    const metadata: string[] = [];

    if (diagnostic.statusCode !== undefined) {
        metadata.push(`statusCode=${diagnostic.statusCode}`);
    }
    if (diagnostic.errorCode) {
        metadata.push(`error_code=${diagnostic.errorCode}`);
    }

    const metadataText = metadata.length ? ` (${metadata.join(', ')})` : '';
    const messageText = diagnostic.message ? `: ${diagnostic.message}` : '';
    const validationText = diagnostic.validationErrors === undefined
        ? ''
        : ` validation_errors=${safeValidationJson(diagnostic.validationErrors)}`;

    return sanitizeDiagnosticString(`${label}${metadataText}${messageText}.${validationText}`, 900);
}

export function getSafeTypeCastErrorMessage(error: unknown): string {
    if (error instanceof TypeCastGenerationError) {
        return error.message;
    }

    const diagnostic = getTypeCastDiagnostic(error);
    if (diagnostic.statusCode !== undefined || diagnostic.errorCode || diagnostic.message) {
        return formatTypeCastDiagnostic(diagnostic);
    }

    return 'TypeCast voice generation is unavailable. Text response remains available.';
}

function logTypeCastDiagnostic(context: string, diagnostic: TypeCastDiagnostic): void {
    console.warn(`[TypeCast]: ${context}. ${formatTypeCastDiagnostic(diagnostic)}`);
}

function flattenSpeechLines(value: string): string {
    return value
        .split(/\r?\n+/)
        .map((line) => {
            const listOrHeading = /^\s*(?:#{1,6}\s+|[-*+•▪◦]\s+|\d+[.)]\s+)/.test(line);
            const cleaned = line.replace(/^\s*(?:#{1,6}\s+|[-*+•▪◦]\s+|\d+[.)]\s+)/, '').trim();
            if (!cleaned) {
                return '';
            }
            return listOrHeading && !/[.!?]$/.test(cleaned) ? `${cleaned}.` : cleaned;
        })
        .filter(Boolean)
        .join(' ');
}

function configuredMaxCharacters(): number {
    const configured = Number(process.env['TYPECAST_MAX_CHARS'] ?? DEFAULT_MAX_CHARS);
    if (!Number.isFinite(configured) || configured <= 0) {
        console.warn(`[TypeCast]: TYPECAST_MAX_CHARS is invalid; using ${DEFAULT_MAX_CHARS}.`);
        return DEFAULT_MAX_CHARS;
    }
    return Math.min(Math.floor(configured), TYPECAST_API_MAX_CHARS);
}

function truncateSpeechText(value: string, maxCharacters: number): string {
    if (value.length <= maxCharacters) {
        return value;
    }
    if (maxCharacters <= 3) {
        return value.slice(0, maxCharacters);
    }

    const candidate = value.slice(0, maxCharacters);
    const minimumSentenceBoundary = Math.floor(maxCharacters * 0.45);
    let sentenceBoundary = -1;
    for (const match of candidate.matchAll(/[.!?](?=\s|$)/g)) {
        if ((match.index ?? -1) >= minimumSentenceBoundary) {
            sentenceBoundary = match.index ?? sentenceBoundary;
        }
    }

    if (sentenceBoundary >= minimumSentenceBoundary) {
        return candidate.slice(0, sentenceBoundary + 1).trim();
    }

    const available = candidate.slice(0, maxCharacters - 3);
    const wordBoundary = available.lastIndexOf(' ');
    const truncated = wordBoundary >= Math.floor(maxCharacters * 0.45)
        ? available.slice(0, wordBoundary)
        : available;
    return `${truncated.trim()}...`;
}

export function sanitizeTypeCastText(text: string): string {
    const withoutCode = text
        .replace(/```[\s\S]*?```/g, ' Code example omitted. ')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/\[([^\]]+)]\([^)]*\)/g, '$1')
        .replace(/https?:\/\/\S+/gi, ' link omitted ');
    const flattened = flattenSpeechLines(withoutCode)
        .replace(/\s+(?:[-*+•▪◦]|\d+[.)])\s+/g, '. ');
    const cleaned = flattened
        .replace(/[{}\[\]]/g, ' ')
        .replace(/["']?(?:emotion|speak|expressionDurationMs)["']?\s*:\s*(?:["'][^"']*["']|true|false|null|-?\d+(?:\.\d+)?)\s*,?/gi, ' ')
        .replace(/["']?text["']?\s*:\s*/gi, ' ')
        .replace(/[|<>#*_~`\\]/g, ' ')
        .replace(/["'“”‘’]/g, '')
        .replace(/\s*[,;:]\s*[,;:]+\s*/g, '. ')
        .replace(/[\p{Extended_Pictographic}\p{So}\p{Cs}]/gu, ' ')
        .replace(/[\u0000-\u001F\u007F-\u009F\u200D\uFE0F]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    return truncateSpeechText(cleaned, configuredMaxCharacters());
}

function configuredPrompt(model: string): TTSRequest['prompt'] | undefined {
    const emotionType = (process.env['TYPECAST_EMOTION_TYPE'] ?? 'smart').trim().toLowerCase();
    if (!emotionType || emotionType === 'none' || emotionType === 'off') {
        return undefined;
    }
    if (model !== 'ssfm-v30') {
        console.warn(`[TypeCast]: Emotion prompt omitted because model "${sanitizeDiagnosticString(model)}" does not support v30 prompt modes.`);
        return undefined;
    }
    if (emotionType === 'smart') {
        return { emotion_type: 'smart' };
    }
    if (emotionType === 'preset') {
        return { emotion_type: 'preset' };
    }

    console.warn(`[TypeCast]: Unsupported TYPECAST_EMOTION_TYPE "${sanitizeDiagnosticString(emotionType)}"; prompt omitted.`);
    return undefined;
}

export class TtsTypeCast implements TTS {
    private client: TypecastClient | undefined;
    private readonly defaultVoiceId = 'tc_68d49c1e02c83f1fd4cdeaae';

    public async init(): Promise<void> {
        const apiKey = process.env['TYPECAST_API_KEY'];
        if (!apiKey) {
            const message = 'TYPECAST_API_KEY is not configured. Cloud voice is unavailable.';
            console.warn(`[TypeCast]: ${message}`);
            throw new Error(message);
        }

        this.client = new TypecastClient({ apiKey });
        console.log('[TypeCast]: Cloud voice initialized.');
    }

    public async free(): Promise<void> {
        this.client = undefined;
        console.log('[TypeCast]: Cloud voice disconnected.');
    }

    public async generate(text: string, voiceId?: string): Promise<void> {
        await this.generateWithResult(text, voiceId);
    }

    public async generateTest(): Promise<TypeCastGenerationResult | undefined> {
        return this.generateWithResult(SELF_TEST_TEXT);
    }

    public async generateWithResult(text: string, voiceId?: string): Promise<TypeCastGenerationResult | undefined> {
        if (!this.client) {
            throw new Error('TypeCast client is not initialized. Text response remains available.');
        }

        const spokenText = sanitizeTypeCastText(text);
        if (!spokenText) {
            console.warn('[TypeCast]: Sanitized speech text is empty; generation skipped.');
            return undefined;
        }

        const model = process.env['TYPECAST_MODEL']?.trim() || DEFAULT_MODEL;
        const selectedVoiceId = process.env['COMPANION_VOICE_ID']?.trim() || voiceId?.trim() || this.defaultVoiceId;
        const prompt = configuredPrompt(model);
        const baseRequest: TTSRequest = {
            text: spokenText,
            model: model as TTSRequest['model'],
            voice_id: selectedVoiceId,
        };
        const initialRequest: TTSRequest = prompt ? { ...baseRequest, prompt } : baseRequest;
        let audio: TTSResponse;
        let retriedWithoutPrompt = false;

        console.log(`[TypeCast]: Generating ${spokenText.length} speech characters with model "${sanitizeDiagnosticString(model)}" (prompt ${prompt ? 'enabled' : 'disabled'}).`);

        try {
            audio = await this.client.textToSpeech(initialRequest);
        } catch (error) {
            const initialDiagnostic = getTypeCastDiagnostic(error);
            if (!(prompt && isValidationFailure(initialDiagnostic))) {
                logTypeCastDiagnostic('Generation failed', initialDiagnostic);
                throw new TypeCastGenerationError(formatTypeCastDiagnostic(initialDiagnostic), initialDiagnostic, false);
            }

            retriedWithoutPrompt = true;
            logTypeCastDiagnostic('Prompt validation failed; retrying once without prompt', initialDiagnostic);
            try {
                audio = await this.client.textToSpeech(baseRequest);
                console.log('[TypeCast]: Retry without prompt succeeded.');
            } catch (retryError) {
                const retryDiagnostic = getTypeCastDiagnostic(retryError);
                logTypeCastDiagnostic('Retry without prompt failed', retryDiagnostic);
                throw new TypeCastGenerationError(formatTypeCastDiagnostic(retryDiagnostic), retryDiagnostic, true);
            }
        }

        const fileName = `eve_voice.${audio.format}`;
        const outputPath = path.join(process.cwd(), 'source', 'web', 'public', fileName);
        await fs.promises.writeFile(outputPath, Buffer.from(audio.audioData));
        console.log(`[TypeCast]: Audio generated (${audio.format}, ${spokenText.length} speech characters).`);

        return {
            audioUrl: `/${fileName}`,
            format: audio.format,
            model,
            spokenText,
            usedPrompt: Boolean(prompt) && !retriedWithoutPrompt,
            retriedWithoutPrompt,
        };
    }
}
