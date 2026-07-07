import type { CompanionMode } from './GeneratedCompanionProfile';

export type { CompanionMode } from './GeneratedCompanionProfile';

export type LegacyCompanionMode = 'eve' | 'lyriel' | 'rea';

export type CompanionProfile = {
    mode: LegacyCompanionMode;
    normalizedMode: CompanionMode;
    name: string;
    role: string;
    systemPromptPath: string;
    voiceId?: string;
    specialties: string[];
};

const DEFAULT_COMPANION_VOICE_IDS: Record<LegacyCompanionMode, string> = {
    eve: 'tc_68d49c1e02c83f1fd4cdeaae',
    lyriel: 'tc_68d49c1e02c83f1fd4cdeaae',
    rea: 'tc_68d49c1e02c83f1fd4cdeaae',
};

function voiceIdFromEnv(name: string, fallbackVoiceId: string): Pick<CompanionProfile, 'voiceId'> {
    return { voiceId: process.env[name] ?? fallbackVoiceId };
}

export const companionProfiles: Record<LegacyCompanionMode, CompanionProfile> = {
    eve: {
        mode: 'eve',
        normalizedMode: 'productivity',
        name: 'Generated CompanionOS companion',
        role: 'Legacy productivity voice route',
        systemPromptPath: 'data/prompts/eve.system.txt',
        ...voiceIdFromEnv('EVE_VOICE_ID', DEFAULT_COMPANION_VOICE_IDS.eve),
        specialties: ['productivity', 'planning', 'daily-execution', 'creative-support'],
    },
    lyriel: {
        mode: 'lyriel',
        normalizedMode: 'study',
        name: 'Generated CompanionOS companion',
        role: 'Legacy study voice route',
        systemPromptPath: 'data/prompts/lyriel.system.txt',
        ...voiceIdFromEnv('LYRIEL_VOICE_ID', DEFAULT_COMPANION_VOICE_IDS.lyriel),
        specialties: ['study', 'code', 'japanese', 'active-recall', 'language-learning'],
    },
    rea: {
        mode: 'rea',
        normalizedMode: 'support',
        name: 'Generated CompanionOS companion',
        role: 'Legacy support voice route',
        systemPromptPath: 'data/prompts/rea.system.txt',
        ...voiceIdFromEnv('REA_VOICE_ID', DEFAULT_COMPANION_VOICE_IDS.rea),
        specialties: ['support', 'reflection', 'stability', 'routine', 'grounding'],
    },
};

export function normalizeCompanionMode(input: string | undefined): CompanionMode {
    const normalized = input?.trim().toLowerCase();

    switch (normalized) {
        case 'study':
        case 'code':
        case 'productivity':
        case 'japanese':
        case 'creative':
        case 'support':
            return normalized;
        case 'eve':
            return 'productivity';
        case 'lyriel':
            return 'study';
        case 'rea':
            return 'support';
        default:
            return 'productivity';
    }
}

export function toCompanionMode(value: unknown): CompanionMode {
    return normalizeCompanionMode(typeof value === 'string' ? value : undefined);
}

export function getCompanionProfile(mode: CompanionMode | LegacyCompanionMode): CompanionProfile {
    return companionProfiles[toLegacyCompanionRoute(mode)];
}

function toLegacyCompanionRoute(mode: CompanionMode | LegacyCompanionMode): LegacyCompanionMode {
    switch (mode) {
        case 'study':
        case 'code':
        case 'japanese':
        case 'lyriel':
            return 'lyriel';
        case 'support':
        case 'rea':
            return 'rea';
        case 'productivity':
        case 'creative':
        case 'eve':
        default:
            return 'eve';
    }
}
