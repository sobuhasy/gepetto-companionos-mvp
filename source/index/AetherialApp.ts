import { LlmOpenAI } from "../module/LlmOpenAI";
import { TtsTypeCast } from "../tts/TtsTypeCast";
import { MicWhisper } from "../stt/MicWhisper";
import { RobotBody } from "../body/RobotBody";
import { BodyBackend, createRobotBody } from "../body/BodyFactory";
import { ObsVision } from '../module/ObsVision';
import { TtsCoqui } from '../tts/TtsCoqui';
import { getCompanionProfile, normalizeCompanionMode } from '../companion/CompanionProfile';
import { CompanionPromptService } from '../companion/CompanionPromptService';
import type { GeneratedCompanionProfile } from '../companion/GeneratedCompanionProfile';

export type InteractionMode = 'text' | 'speech';

export type AetherialReply = {
    success: boolean;
    responseText: string;
    spokenText?: string;
    emotion?: string;
};

type EveEmotion = 'neutral' | 'love' | 'angry' | 'sad' | 'amazed' | 'sleepy' | 'nervous';

type EveResponse = {
    text: string;
    emotion: "neutral" | "love" | "angry" | "sad" | "amazed" | "sleepy" | "nervous";
    speak: boolean,
    expressionDurationMs?: number;
}

const SAFE_RESPONSE_FALLBACK = "I'm sorry, I could not format that response cleanly. Please try again.";
const JSON_PARSE_DEPTH = 4;

function stripOuterMarkdownFence(value: string): string {
    return value
        .replace(/^\uFEFF/, '')
        .trim()
        .replace(/^```(?:json)?[ \t]*(?:\r?\n)?/i, '')
        .replace(/(?:\r?\n)?```\s*$/, '')
        .trim();
}

function cleanDisplayText(value: string): string {
    return value
        .replace(/\r\n?/g, '\n')
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
        .trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toEmotion(value: unknown): EveEmotion {
    const normalized = typeof value === 'string' ? value.toLowerCase() : 'neutral';
    const allowed: EveEmotion[] = ['neutral', 'love', 'angry', 'sad', 'amazed', 'sleepy', 'nervous'];
    return allowed.includes(normalized as EveEmotion) ? (normalized as EveEmotion) : 'neutral';
}

function responseFromRecord(value: unknown): EveResponse | undefined {
    if (!isRecord(value)) {
        return undefined;
    }

    const text = typeof value['text'] === 'string' ? cleanDisplayText(value['text']) : '';
    if (!text) {
        return undefined;
    }

    const emotion = toEmotion(value['emotion']);
    const speak = typeof value['speak'] === 'boolean' ? value['speak'] : true;
    const duration = value['expressionDurationMs'];
    const expressionDurationMs = typeof duration === 'number' && Number.isFinite(duration) && duration >= 0
        ? duration
        : undefined;

    return expressionDurationMs === undefined
        ? { text, emotion, speak }
        : { text, emotion, speak, expressionDurationMs };
}

function parseJsonLayers(value: string): { parsed: boolean; value: unknown } {
    let current: unknown = stripOuterMarkdownFence(value);
    let parsed = false;

    for (let depth = 0; depth < JSON_PARSE_DEPTH && typeof current === 'string'; depth += 1) {
        const candidate = stripOuterMarkdownFence(current);
        try {
            current = JSON.parse(candidate) as unknown;
            parsed = true;
        } catch {
            break;
        }
    }

    return { parsed, value: current };
}

function readLooseQuotedValue(value: string, startIndex: number): string {
    const quote = value[startIndex];
    let decoded = '';

    for (let index = startIndex + 1; index < value.length; index += 1) {
        const character = value[index];
        if (character === quote) {
            break;
        }

        if (character !== '\\') {
            decoded += character;
            continue;
        }

        index += 1;
        if (index >= value.length) {
            break;
        }

        const escaped = value[index];
        switch (escaped) {
            case 'n': decoded += '\n'; break;
            case 'r': decoded += '\r'; break;
            case 't': decoded += '\t'; break;
            case 'b': decoded += '\b'; break;
            case 'f': decoded += '\f'; break;
            case 'u': {
                const hex = value.slice(index + 1, index + 5);
                if (/^[0-9a-f]{4}$/i.test(hex)) {
                    decoded += String.fromCharCode(Number.parseInt(hex, 16));
                    index += 4;
                } else {
                    decoded += 'u';
                }
                break;
            }
            default: decoded += escaped;
        }
    }

    return decoded;
}

function findFieldValueStart(value: string, fieldName: string): number | undefined {
    const fieldPattern = new RegExp(`(?:^|[,{}]\\s*)["']?${fieldName}["']?\\s*:\\s*`, 'i');
    const match = fieldPattern.exec(value);
    return match ? match.index + match[0].length : undefined;
}

function extractLooseField(value: string, fieldName: string): string | undefined {
    const startIndex = findFieldValueStart(value, fieldName);
    if (startIndex === undefined || startIndex >= value.length) {
        return undefined;
    }

    const firstCharacter = value[startIndex];
    if (firstCharacter === '"' || firstCharacter === "'") {
        return readLooseQuotedValue(value, startIndex);
    }
    if (firstCharacter === '{' || firstCharacter === '[') {
        return undefined;
    }

    const remaining = value.slice(startIndex);
    const endIndex = remaining.search(/[,}\r\n]/);
    return (endIndex === -1 ? remaining : remaining.slice(0, endIndex)).trim();
}

function recoverMalformedResponse(value: string): EveResponse | undefined {
    const recoveredText = extractLooseField(value, 'text')?.replace(/\\r\\n|\\n|\\r/g, '\n') ?? '';
    const text = cleanDisplayText(recoveredText);
    if (!text) {
        return undefined;
    }

    const emotion = toEmotion(extractLooseField(value, 'emotion'));
    const speakValue = extractLooseField(value, 'speak')?.toLowerCase();
    const speak = speakValue === 'false' ? false : true;
    const durationValue = Number(extractLooseField(value, 'expressionDurationMs'));
    const expressionDurationMs = Number.isFinite(durationValue) && durationValue >= 0
        ? durationValue
        : undefined;

    return expressionDurationMs === undefined
        ? { text, emotion, speak }
        : { text, emotion, speak, expressionDurationMs };
}

function decodeLooseOuterString(value: string): string | undefined {
    const trimmed = value.trim();
    return trimmed.startsWith('"') ? readLooseQuotedValue(trimmed, 0) : undefined;
}

function hasResponseEnvelopeEvidence(value: string): boolean {
    const trimmed = value.trim();
    const contractFields = trimmed.match(/["']?(?:text|emotion|speak|expressionDurationMs)["']?\s*:/gi) ?? [];
    const escapedContractFields = trimmed.match(/\\["'](?:text|emotion|speak|expressionDurationMs)\\["']\s*:/gi) ?? [];
    const contractFieldCount = contractFields.length + escapedContractFields.length;
    const startsLikeObject = /^(?:```(?:json)?\s*)?\{/i.test(trimmed);
    const containsQuotedObjectField = /\{\s*["'](?:text|emotion|speak|expressionDurationMs)["']\s*:/i.test(trimmed);
    const startsLikeField = /^["'](?:text|emotion|speak|expressionDurationMs)["']\s*:/i.test(trimmed);
    const startsLikeEncodedObject = /^["']/.test(trimmed)
        && /\\["'](?:text|emotion|speak)\\["']\s*:/i.test(trimmed);

    return contractFieldCount > 0
        && (startsLikeObject
            || containsQuotedObjectField
            || startsLikeField
            || startsLikeEncodedObject
            || contractFieldCount > 1);
}

function unwrapNestedResponse(response: EveResponse): EveResponse {
    let current = response;

    for (let depth = 0; depth < JSON_PARSE_DEPTH; depth += 1) {
        if (!hasResponseEnvelopeEvidence(current.text)) {
            break;
        }

        const nested = responseFromRecord(parseJsonLayers(current.text).value)
            ?? recoverMalformedResponse(current.text);
        if (!nested || nested.text === current.text) {
            break;
        }

        current = nested;
    }

    return hasResponseEnvelopeEvidence(current.text)
        ? { text: SAFE_RESPONSE_FALLBACK, emotion: 'neutral', speak: true }
        : current;
}

export function parseCompanionResponse(raw: string): EveResponse {
    const normalized = stripOuterMarkdownFence(raw);
    const layered = parseJsonLayers(normalized);
    const parsedResponse = responseFromRecord(layered.value);
    if (parsedResponse) {
        return unwrapNestedResponse(parsedResponse);
    }

    const candidates: string[] = [];
    if (typeof layered.value === 'string') {
        candidates.push(stripOuterMarkdownFence(layered.value));
    }
    candidates.push(normalized);

    const looselyDecoded = decodeLooseOuterString(normalized);
    if (looselyDecoded !== undefined) {
        candidates.push(stripOuterMarkdownFence(looselyDecoded));
    }

    for (const candidate of [...new Set(candidates)]) {
        const candidateResponse = responseFromRecord(parseJsonLayers(candidate).value)
            ?? (hasResponseEnvelopeEvidence(candidate) ? recoverMalformedResponse(candidate) : undefined);
        if (candidateResponse) {
            return unwrapNestedResponse(candidateResponse);
        }
    }

    const plainTextCandidate = layered.parsed && typeof layered.value === 'string'
        ? stripOuterMarkdownFence(layered.value)
        : looselyDecoded ?? normalized;
    const cleanPlainText = cleanDisplayText(plainTextCandidate);
    const parsedStructuredJson = layered.parsed
        && typeof layered.value === 'object'
        && layered.value !== null;

    if (!cleanPlainText
        || parsedStructuredJson
        || hasResponseEnvelopeEvidence(normalized)
        || hasResponseEnvelopeEvidence(cleanPlainText)) {
        return { text: SAFE_RESPONSE_FALLBACK, emotion: 'neutral', speak: true };
    }

    return { text: cleanPlainText, emotion: 'neutral', speak: true };
}

function isEnabled(value: string | undefined): boolean {
    return value?.trim().toLowerCase() === 'true';
}

function toBodyBackend(value: unknown): BodyBackend {
    if (value === "pico" || value === "hybrid" || value === "vtube") {
        return value;
    }

    return "vtube";
}

export class AetherialApp {
    private eveBrain?: LlmOpenAI;
    private eveVoice?: TtsTypeCast;
    private eveVoiceBackup?: TtsCoqui;
    private eveEars?: MicWhisper;
    private eveBody?: RobotBody;
    private eveEyes?: ObsVision;
    private readonly companionPrompts = new CompanionPromptService();
    private initialized = false;

    async init(): Promise<void> {
        if (this.initialized) {
            return;
        }

        this.eveBrain = new LlmOpenAI();
        this.eveVoice = new TtsTypeCast();
        this.eveVoiceBackup = new TtsCoqui();
        this.eveEars = new MicWhisper();
        const bodyBackend = toBodyBackend(process.env["ROBOT_BODY_BACKEND"] ?? "vtube");
        this.eveBody = createRobotBody(bodyBackend);
        this.eveEyes = new ObsVision();

        await this.eveBrain.init();
        await this.eveVoice.init();
        await this.eveVoiceBackup.init();
        await this.eveBody.init();
        await this.eveEyes.init();

        this.initialized = true;
    }

    async getPromptFromSpeech(): Promise<string> {
        return this.requireEars().listenAndTranscribe();
    }

    async interact(userPrompt: string, mode: InteractionMode = 'text', uploadedImage?: string, companionModeInput?: unknown, generatedProfile?: GeneratedCompanionProfile, requestScreenContext = false): Promise<AetherialReply> {
        if (!this.initialized) {
            throw new Error('AetherialApp not initialized');
        }

        if (userPrompt.toLowerCase().includes('exit')) {
            return {
                success: true,
                responseText: 'Session closed. I will be here when you return.',
            };
        }

        let finalImage = uploadedImage;

        const shouldCaptureScreen = requestScreenContext || isEnabled(process.env["AUTO_CAPTURE_OBS"]);

        if (!finalImage && shouldCaptureScreen) {
            finalImage = await this.requireEyes().captureScreen();
            if (finalImage) {
                console.log("📸 [System]: Aetherial Retina successfully captured the analog screen!");
            }
        } else if (finalImage) {
            console.log("📸 [System]: Aetherial Retina received an uploaded image from the Web GUI!");
        }


        const companionMode = normalizeCompanionMode(typeof companionModeInput === 'string' ? companionModeInput : undefined);
        const promptInput = {
            mode: companionMode,
            userMessage: userPrompt,
            hasImage: Boolean(finalImage),
        };
        const routedPrompt = await this.companionPrompts.buildPrompt(
            generatedProfile ? { ...promptInput, profile: generatedProfile } : promptInput,
        );

        const response = await this.requireBrain().generate(routedPrompt, finalImage);
        if (!(response.success && response.value)) {
            return {
                success: false,
                responseText: 'Connection failed. Please check the runtime connection and try again.',
            };
        }

        const eveResponse = parseCompanionResponse(response.value);
        const visibleText = eveResponse.text;
        const emotion = eveResponse.emotion;

        await this.triggerExpression(emotion, eveResponse.expressionDurationMs);

        const routeProfile = getCompanionProfile(companionMode);

        const spokenText = eveResponse.speak
            ? await this.generateVoiceForVisibleReply(visibleText, routeProfile.voiceId)
            : undefined;
        

        const speakerLabel = mode === 'speech' ? 'speech' : 'text';
        console.log(`[${generatedProfile?.name ?? routeProfile.name}:${speakerLabel} (${emotion})]: "${visibleText}"`);

        const reply: AetherialReply = {
            success: true,
            responseText: visibleText,
            emotion,
        };

        return spokenText ? { ...reply, spokenText } : reply;
    }

    async captureVision(): Promise<string | undefined> {
        if (!this.initialized) {
            throw new Error('AetherialApp not initialized');
        }

        return this.requireEyes().captureScreen();
    }

    async shutdown(): Promise<void> {
        if (!this.initialized) {
            return;
        }

        await this.requireBrain().free();
        await this.requireVoice().free();
        await this.requireBackupVoice().free();
        this.initialized = false;
    }

    private async triggerExpression(emotion: EveEmotion, durationMs?: number): Promise<void> {
        await this.requireBody().setExpression(emotion, durationMs);
    }

    private async generateVoiceForVisibleReply(text: string, voiceId?: string): Promise<string | undefined> {
        if (process.env["COMPANION_VOICE_ENABLED"] === "false") {
            return undefined;
        }

        const speechText = this.toSpeechPreview(text);
        if (!speechText) {
            console.log("[Voice]: No safe speech preview generated.");
            return undefined;
        }

        const selectedVoiceId = process.env["COMPANION_VOICE_ID"] ?? voiceId;

        try {
            await this.requireVoice().generate(speechText, selectedVoiceId);
            return speechText;
        } catch (error) {
            console.warn("[Voice]: TypeCast failed. Continuing text-only unless local fallback is enabled.", error);
        }

        if (process.env["ENABLE_LOCAL_TTS_FALLBACK"] !== "true") {
            return undefined;
        }

        try {
            await this.requireBackupVoice().generate(speechText);
            return speechText;
        } catch (error) {
            console.warn("[Voice]: Local fallback failed. Text response remains available.", error);
            return undefined;
        }
    }

    private toSpeechPreview(text: string): string {
        const cleaned = text
            .replace(/```[\s\S]*?```/g, "I prepared a code block for you in the chat.")
            .replace(/\\r\\n|\\n|\\r/g, " ")
            .replace(/https?:\/\/\S+/g, "link omitted")
            .replace(/[#*_`>|{}\[\]\\]/g, "")
            .replace(/\s+/g, " ")
            .trim();

        if (!cleaned) {
            return "";
        }

        const maxSpeechCharacters = Number(process.env["COMPANION_MAX_SPEECH_CHARS"] ?? 2500);

        if (!Number.isFinite(maxSpeechCharacters) || maxSpeechCharacters <= 0) {
            return cleaned;
        }

        return cleaned.length > maxSpeechCharacters
            ? `${cleaned.slice(0, maxSpeechCharacters - 3)}...`
            : cleaned;
    }

    private requireBrain(): LlmOpenAI {
        if (!this.eveBrain) throw new Error('LlmOpenAI not initialized');
        return this.eveBrain;
    }

    private requireVoice(): TtsTypeCast {
        if (!this.eveVoice) throw new Error('TtsTypeCast not initialized');
        return this.eveVoice;
    }

    private requireBackupVoice(): TtsCoqui {
        if (!this.eveVoiceBackup) throw new Error('TtsCoqui not initialized');
        return this.eveVoiceBackup;
    }

    private requireEars(): MicWhisper {
        if (!this.eveEars) throw new Error('MicWhisper not initialized');
        return this.eveEars;
    }

    private requireBody(): RobotBody {
        if (!this.eveBody) throw new Error('RobotBody not initialized');
        return this.eveBody;
    }

    private requireEyes(): ObsVision {
        if (!this.eveEyes) throw new Error('ObsVision not initialized');
        return this.eveEyes;
    }
}
