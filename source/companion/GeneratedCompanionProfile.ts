export type GeneratedCompanionMode =
    | 'study'
    | 'code'
    | 'productivity'
    | 'japanese'
    | 'creative'
    | 'support';

export type GeneratedCompanionProfile = {
    id: string;
    name: string;
    shortName: string;
    origin: {
        dimension: 'Dimension-7-Lyra';
        cityDistrict: string;
        homelandDescription: string;
    };
    classification: string;
    affinity: string;
    familiarMotif: string;
    personalitySeed: string[];
    temperament: string;
    appearance: string;
    voiceStyle: string;
    memoryStyle: string;
    nativeLanguage: 'Aerilonian';
    knownLanguages: string[];
    userNativeLanguage: string;
    greetingAerilonian: string;
    greetingEnglish: string;
    dailyWorkflows: string[];
    safetyBoundary: string;
    modeInstructions: Record<GeneratedCompanionMode, string>;
    createdAt: string;
};

export const GENERATED_COMPANION_MODES: readonly GeneratedCompanionMode[] = [
    'study',
    'code',
    'productivity',
    'japanese',
    'creative',
    'support',
] as const;
