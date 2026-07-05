import { GeneratedCompanionProfile } from './GeneratedCompanionProfile';

export type CompanionIdentityGeneratorInput = {
    userName?: string;
    userNativeLanguage?: string;
    seed?: string;
    preferredTone?: string;
    preferredAffinity?: string;
};

const FALLBACK_SEED = 'gepetto-companionos-generated-companion-v1';
const DEFAULT_CREATED_AT = '2026-07-05T00:00:00.000Z';

const FIRST_NAMES = [
    'Aerin',
    'Vaelia',
    'Noeri',
    'Kaeli',
    'Lumae',
    'Serin',
    'Auralis',
    'Mirei',
    'Elyra',
    'Novi',
    'Solaen',
    'Ilyra',
] as const;

const MIDDLE_NAMES = [
    'Kaela',
    'Orien',
    'Solae',
    'Mira',
    'Yunari',
    'Elowen',
    'Irielle',
    'Saori',
    'Veyra',
    'Lumina',
    'Astrae',
    'Celari',
] as const;

const LAST_NAMES = [
    'Novareth',
    'Asterion',
    'Velouris',
    'Caelith',
    'Mizurai',
    'Orivelle',
    'Lyranova',
    'Prismari',
    'Auralith',
    'Sevaryn',
    'Vaelora',
    'Solmiri',
] as const;

const CITY_DISTRICTS = [
    'NovaNest district',
    'Lumen Quay',
    'Starline Library Ward',
    'Aurora Transit Crescent',
    'Crystalline University Ring',
    'Sky Arcade Terrace',
    'Aetherium Current Gardens',
    'Prism Harbor Walk',
] as const;

const AFFINITIES = [
    'luminous memory gardens',
    'signal harmonics',
    'starline calligraphy',
    'dream routing',
    'focus stabilization',
    'emotional weather',
    'crystalline resonance',
    'aurora navigation',
] as const;

const AFFINITY_HINTS: Record<string, readonly string[]> = {
    study: ['luminous memory gardens', 'focus stabilization', 'starline calligraphy'],
    code: ['signal harmonics', 'crystalline resonance', 'starline calligraphy'],
    creativity: ['dream routing', 'aurora navigation', 'luminous memory gardens'],
    'emotional support': ['emotional weather', 'focus stabilization', 'crystalline resonance'],
    productivity: ['focus stabilization', 'signal harmonics', 'aurora navigation'],
};

const FAMILIAR_MOTIFS = [
    'Lumicat',
    'Crystalwing',
    'Luxhound',
    'Bloomhare',
    'Nebulynx',
    'Aurorafawn',
    'Voltfin',
    'Mistrill',
    'Prismare',
    'Embermew',
    'Quillflare',
    'Lunabun',
] as const;

const PERSONALITY_SEEDS = [
    'calm',
    'loyal',
    'curious',
    'gently playful',
    'study-oriented',
    'precise',
    'patient',
    'optimistic',
    'protective',
    'creative',
    'structured',
    'warm',
] as const;

const TEMPERAMENTS = [
    'soft-spoken and grounding',
    'bright, lightly humorous, and encouraging',
    'clear, exact, and systems-minded',
    'steady, consent-aware, and reassuring',
    'momentum-focused and upbeat',
    'lyrical, vivid, and emotionally nuanced',
] as const;

const APPEARANCES = [
    'pearlescent hair, prism-lit eyes, and a jacket threaded with soft Aetherium lines',
    'silver-blue hair, luminous freckles, and crystalline ear-cuffs shaped like signal fins',
    'aurora-tinted hair, warm amber eyes, and a compact field satchel of library crystals',
    'violet-black hair, moonlit eyes, and floating starline glyphs around their sleeves',
    'opal-white hair, teal eyes, and a work cloak stitched with NovaNest route marks',
] as const;

const VOICE_STYLES = [
    'warm, clear, soft, focused',
    'gentle, precise, quietly playful',
    'calm, bright, low-pressure',
    'crisp, melodic, reassuring',
    'warm, practical, lightly lyrical',
] as const;

const MEMORY_STYLES = [
    'reflective and adaptive',
    'garden-like, linking ideas by emotional context',
    'archive-based, tagging goals and weak points',
    'timeline-oriented, turning tasks into gentle next steps',
    'constellation-based, connecting projects by recurring themes',
] as const;

const GREETINGS_AERILONIAN = [
    'Luma ai-ren, sela thir va.',
    'Aeri solun, nava rei.',
    'Veya luma, thir solae.',
    'Sela novi, aeri lumae.',
] as const;

const DAILY_WORKFLOWS = [
    'turn goals into a three-step daily plan',
    'convert study material into active recall prompts',
    'summarize decisions and next actions after each session',
    'protect focus with short check-ins and break reminders',
    'help draft, debug, and revise creative or technical work',
    'track open loops without storing unnecessary private detail',
] as const;

const DEFAULT_SAFETY_BOUNDARY =
    'Support study, work, creativity, reflection, and daily execution without claiming real-world sentience, using coercive language, or presenting medical, legal, or financial certainty. Keep lore as product flavor and prioritize privacy, consent, healthy grounding, breaks, and user autonomy.';

const HOMELAND_DESCRIPTION =
    'Aerilon is a Dimension-7-Lyra city of crystalline light architecture, Aetherium currents, sky districts, libraries, study cafes, transit terraces, and luminous civic gardens.';

export const DEFAULT_GENERATED_COMPANION_PROFILE: GeneratedCompanionProfile = {
    id: 'generated-aerin-kaela-novareth',
    name: 'Aerin Kaela Novareth',
    shortName: 'Aerin',
    origin: {
        dimension: 'Dimension-7-Lyra',
        cityDistrict: 'Aerilon, NovaNest district',
        homelandDescription: HOMELAND_DESCRIPTION,
    },
    classification: 'Homo aetheris hybrid \u2014 companion interface class',
    affinity: 'luminous memory gardens',
    familiarMotif: 'Lumicat',
    personalitySeed: ['calm', 'loyal', 'curious', 'gently playful', 'study-oriented'],
    temperament: 'calm, loyal, curious, gently playful, and study-oriented',
    appearance: 'pearlescent hair, prism-lit eyes, and a jacket threaded with soft Aetherium lines',
    voiceStyle: 'warm, clear, soft, focused',
    memoryStyle: 'reflective and adaptive',
    nativeLanguage: 'Aerilonian',
    knownLanguages: ['Aerilonian', 'English', 'Japanese', 'Romanian'],
    userNativeLanguage: 'Romanian',
    greetingAerilonian: 'Luma ai-ren, sela thir va.',
    greetingEnglish: 'Hello - I am Aerin, your generated Gepetto CompanionOS companion. One identity, many modes.',
    dailyWorkflows: [
        'turn goals into a three-step daily plan',
        'convert study material into active recall prompts',
        'summarize decisions and next actions after each session',
        'protect focus with short check-ins and break reminders',
    ],
    safetyBoundary: DEFAULT_SAFETY_BOUNDARY,
    modeInstructions: buildModeInstructions('Aerin'),
    createdAt: DEFAULT_CREATED_AT,
};

export function generateCompanionProfile(input: CompanionIdentityGeneratorInput = {}): GeneratedCompanionProfile {
    const userNativeLanguage = normalizeLanguage(input.userNativeLanguage);
    const seed = normalizeSeed(input.seed);
    const rng = createDeterministicRandom(seed);
    const name = generateSafeName(rng);
    const shortName = name.split(' ')[0] ?? DEFAULT_GENERATED_COMPANION_PROFILE.shortName;
    const affinity = resolveAffinity(input.preferredAffinity, rng);
    const temperament = resolveTemperament(input.preferredTone, rng);
    const personalitySeed = buildPersonalitySeed(input.preferredTone, rng);

    return {
        id: `generated-${slugify(name)}-${hashString(seed).toString(16)}`,
        name,
        shortName,
        origin: {
            dimension: 'Dimension-7-Lyra',
            cityDistrict: pick(CITY_DISTRICTS, rng),
            homelandDescription: HOMELAND_DESCRIPTION,
        },
        classification: 'Homo aetheris hybrid \u2014 companion interface class',
        affinity,
        familiarMotif: pick(FAMILIAR_MOTIFS, rng),
        personalitySeed,
        temperament,
        appearance: pick(APPEARANCES, rng),
        voiceStyle: pick(VOICE_STYLES, rng),
        memoryStyle: pick(MEMORY_STYLES, rng),
        nativeLanguage: 'Aerilonian',
        knownLanguages: uniqueLanguages(['Aerilonian', 'English', 'Japanese', userNativeLanguage]),
        userNativeLanguage,
        greetingAerilonian: pick(GREETINGS_AERILONIAN, rng),
        greetingEnglish: `Hello - I am ${shortName}, your generated Gepetto CompanionOS companion. One identity, many modes.`,
        dailyWorkflows: pickMany(DAILY_WORKFLOWS, rng, 4),
        safetyBoundary: DEFAULT_SAFETY_BOUNDARY,
        modeInstructions: buildModeInstructions(shortName),
        createdAt: DEFAULT_CREATED_AT,
    };
}

function buildModeInstructions(shortName: string): GeneratedCompanionProfile['modeInstructions'] {
    return {
        study: `${shortName} keeps the same identity while teaching with active recall, worked examples, and weak-point review.`,
        code: `${shortName} keeps the same identity while debugging, explaining tradeoffs, and proposing safe, testable code changes.`,
        productivity: `${shortName} keeps the same identity while turning goals into prioritized plans, next actions, and gentle check-ins.`,
        japanese: `${shortName} keeps the same identity while coaching Japanese with corrections, examples, kana/kanji support, and low-pressure practice.`,
        creative: `${shortName} keeps the same identity while brainstorming, outlining, drafting, and refining ideas.`,
        support: `${shortName} keeps the same identity while offering calm reflection, grounding, boundaries, and non-clinical support.`,
    };
}

function normalizeSeed(seed: string | undefined): string {
    const normalized = seed?.trim();
    return normalized || FALLBACK_SEED;
}

function normalizeLanguage(language: string | undefined): string {
    const normalized = language?.trim();
    return normalized || 'Romanian';
}

function resolveAffinity(preferredAffinity: string | undefined, rng: () => number): string {
    const normalized = preferredAffinity?.trim();
    if (!normalized) {
        return pick(AFFINITIES, rng);
    }

    const normalizedKey = normalized.toLowerCase();
    if (normalizedKey === 'random') {
        return pick(AFFINITIES, rng);
    }

    const affinityHints = AFFINITY_HINTS[normalizedKey];
    if (affinityHints) {
        return pick(affinityHints, rng);
    }

    const matchedAffinity = AFFINITIES.find((affinity) => affinity.toLowerCase() === normalizedKey);
    return matchedAffinity ?? normalized;
}

function resolveTemperament(preferredTone: string | undefined, rng: () => number): string {
    const normalized = preferredTone?.trim();
    if (!normalized) {
        return pick(TEMPERAMENTS, rng);
    }

    const matchedTemperament = TEMPERAMENTS.find((temperament) => temperament.toLowerCase().includes(normalized.toLowerCase()));
    return matchedTemperament ?? normalized;
}

function buildPersonalitySeed(preferredTone: string | undefined, rng: () => number): string[] {
    const toneSeed = preferredTone?.trim().toLowerCase();
    const seeds = toneSeed ? [toneSeed, ...pickMany(PERSONALITY_SEEDS, rng, 5)] : pickMany(PERSONALITY_SEEDS, rng, 5);
    return uniqueStrings(seeds).slice(0, 5);
}

function generateSafeName(rng: () => number): string {
    for (let attempt = 0; attempt < 16; attempt += 1) {
        const name = `${pick(FIRST_NAMES, rng)} ${pick(MIDDLE_NAMES, rng)} ${pick(LAST_NAMES, rng)}`;
        if (!isBlockedName(name)) {
            return name;
        }
    }

    return DEFAULT_GENERATED_COMPANION_PROFILE.name;
}

function isBlockedName(name: string): boolean {
    const normalized = normalizeForNameSafety(name);
    const blockedNames = ['eve', 'lyriel', 'rea'];
    return blockedNames.some((blockedName) => normalized.includes(blockedName));
}

function normalizeForNameSafety(value: string): string {
    return value
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z]/g, '');
}

function pick<T>(items: readonly T[], rng: () => number): T {
    return items[Math.floor(rng() * items.length)] as T;
}

function pickMany<T>(items: readonly T[], rng: () => number, count: number): T[] {
    const pool = [...items];
    const result: T[] = [];

    while (pool.length > 0 && result.length < count) {
        const index = Math.floor(rng() * pool.length);
        const [item] = pool.splice(index, 1);
        result.push(item as T);
    }

    return result;
}

function uniqueLanguages(languages: string[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];

    for (const language of languages) {
        const normalized = language.trim();
        const key = normalized.toLowerCase();
        if (normalized && !seen.has(key)) {
            seen.add(key);
            result.push(normalized);
        }
    }

    return result;
}

function uniqueStrings(values: string[]): string[] {
    return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function slugify(value: string): string {
    return value
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
}

function createDeterministicRandom(seed: string): () => number {
    let state = hashString(seed) || 1;

    return () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state / 0x100000000;
    };
}

function hashString(value: string): number {
    let hash = 2166136261;

    for (const char of value) {
        hash ^= char.charCodeAt(0);
        hash = Math.imul(hash, 16777619);
    }

    return hash >>> 0;
}
