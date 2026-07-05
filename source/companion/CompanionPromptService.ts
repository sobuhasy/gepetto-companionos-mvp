import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DEFAULT_GENERATED_COMPANION_PROFILE } from './CompanionIdentityGenerator';
import { normalizeCompanionMode } from './CompanionProfile';
import type { CompanionMode, GeneratedCompanionProfile } from './GeneratedCompanionProfile';

export type CompanionPromptInput = {
    mode?: string;
    userMessage: string;
    context?: string;
    hasImage?: boolean;
    profile?: GeneratedCompanionProfile;
};

const BASE_PROMPT_PATH = 'data/prompts/generated-companion.base.system.txt';

export class CompanionPromptService {
    private basePromptCache?: string;

    constructor(private readonly generatedProfile: GeneratedCompanionProfile = DEFAULT_GENERATED_COMPANION_PROFILE) {}

    async getSystemPrompt(mode?: string): Promise<string> {
        return this.buildModePrefix(mode);
    }

    async buildModePrefix(mode?: string): Promise<string> {
        const normalizedMode = normalizeCompanionMode(mode);
        const basePrompt = await this.getBasePrompt();

        return this.buildInstructionPacket(basePrompt, this.generatedProfile, normalizedMode);
    }

    async buildPrompt(input: CompanionPromptInput): Promise<string> {
        const normalizedMode = normalizeCompanionMode(input.mode);
        const profile = input.profile ?? this.generatedProfile;
        const basePrompt = await this.getBasePrompt();
        const context = this.buildUserContext(input.userMessage, input.context, input.hasImage);

        return [
            this.buildInstructionPacket(basePrompt, profile, normalizedMode),
            '',
            'User message and context:',
            context,
        ].join('\n');
    }

    private async getBasePrompt(): Promise<string> {
        if (this.basePromptCache) {
            return this.basePromptCache;
        }

        const promptPath = join(process.cwd(), BASE_PROMPT_PATH);
        const prompt = await readFile(promptPath, 'utf-8');
        this.basePromptCache = prompt.trim();
        return this.basePromptCache;
    }

    private buildInstructionPacket(basePrompt: string, profile: GeneratedCompanionProfile, mode: CompanionMode): string {
        const activeModeInstruction = profile.modeInstructions[mode];

        return [
            basePrompt.trim(),
            '',
            'Generated companion profile:',
            `- Name: ${profile.name} (${profile.shortName})`,
            `- Origin: ${profile.origin.dimension}; ${profile.origin.cityDistrict}; ${profile.origin.homelandDescription}`,
            `- Classification: ${profile.classification}`,
            `- Affinity: ${profile.affinity}`,
            `- Familiar motif: ${profile.familiarMotif}`,
            `- Temperament: ${profile.temperament}`,
            `- Voice style: ${profile.voiceStyle}`,
            `- Memory style: ${profile.memoryStyle}`,
            `- Native language: ${profile.nativeLanguage}`,
            `- Known languages: ${profile.knownLanguages.join(', ')}`,
            `- Daily workflows: ${profile.dailyWorkflows.join('; ')}`,
            `- Safety boundary: ${profile.safetyBoundary}`,
            '',
            `Active companion mode: ${mode}`,
            `Active mode instruction: ${activeModeInstruction}`,
            '',
            'Runtime behavior:',
            '- You are the same generated CompanionOS companion across all modes.',
            '- Mode changes behavior only; it must not change your name, origin, or identity.',
            '- Japanese Coach mode may teach Japanese directly with examples, corrections, kana, kanji, and practice.',
            `- Other languages are companion capabilities only; support English, Japanese, Aerilonian, and especially ${profile.userNativeLanguage} when useful.`,
            '- Do not expose private legacy lore, fixed-persona backstory, or unrelated internal names.',
            '- Do not claim literal real-world sentience.',
            '- Keep responses understandable, privacy-first, supportive, and non-coercive.',
            '',
            'Response contract:',
            '- Return only valid JSON with keys: text, emotion, speak, and optional expressionDurationMs.',
            '- emotion must be one of: neutral, love, angry, sad, amazed, sleepy, nervous.',
            '- text must contain the full user-visible answer.',
            '- speak must be a boolean.',
            '- Do not wrap the JSON in Markdown fences.',
        ].join('\n');
    }

    private buildUserContext(userMessage: string, context: string | undefined, hasImage: boolean | undefined): string {
        return [
            'User message:',
            userMessage.trim() || '(No text message supplied.)',
            '',
            'Additional context:',
            context?.trim() || 'No additional text context supplied.',
            '',
            'Vision context:',
            hasImage ? 'A user-provided or consent-captured image is attached to this request.' : 'No image is attached to this request.',
        ].join('\n');
    }
}
