import { GeneratedCompanionProfile } from './GeneratedCompanionProfile';

export type CompanionIdentityGeneratorInput = {
    userName?: string;
    userNativeLanguage?: string;
    seed?: string;
    preferredTone?: string;
    preferredAffinity?: string;
};

const BLOCKED_PUBLIC_NAMES = new Set(['eve', 'lyriel', 'lyriël', 'rëa', 'rea']);
const DEFAULT_CREATED_AT = '2026-07-05T00:00:00.000Z';

const FIRST_NAMES = ['Aerin', 'Vaelia', 'Noeri', 'Kaelï', 'Lumae', 'Serin', 'Auralis', 'Mirei', 'Elyra', 'Novi'];
const MIDDLE_NAMES = ['Kaela', 'Oriën', 'Solae', 'Mira', 'Yunari', 'Elowen', 'Irielle', 'Saori', 'Veyra', 'Lumina'];
const LAST_NAMES = ['Novareth', 'Asterion', 'Velouris', 'Caelith', 'Mizurai', 'Orivelle', 'Lyranova', 'Prismari', 'Auralith', 'Sevaryn'];
const DISTRICTS = [
    'NovaNest district',
    'Lumen Quay',
    'Starline Library Ward',
    'Aurora Transit Crescent',
    'Crystalline University Ring',
    'Sky Arcade Terrace',
    'Aetherium Current Gardens',
];
const AFFINITIES = [
    'crystalline resonance',
    'emotional weather',
    'memory gardens',
    'starline calligraphy',
    'luminous archives',
    'dream routing',
    'signal harmonics',
    'aurora navigation',
    'empathy interfaces',
    'focus stabilization',
    'creative spark',
    'protective grounding',
];
const AFFINITY_HINTS: Record<string, string[]> = {
    study: ['memory gardens', 'luminous archives', 'focus stabilization'],
    code: ['signal harmonics', 'starline calligraphy', 'crystalline resonance'],
    creativity: ['creative spark', 'dream routing', 'aurora navigation'],
    'emotional support': ['protective grounding', 'empathy interfaces', 'emotional weather'],
    productivity: ['focus stabilization', 'signal harmonics', 'luminous archives'],
};
const FAMILIAR_MOTIFS = ['Lumicat', 'Crystalwing', 'Luxhound', 'Bloomhare', 'Nebulynx', 'Aurorafawn', 'Voltfin', 'Mistrill', 'Prismare', 'Embermew', 'Quillflare', 'Lunabun'];
const PERSONALITY_SEEDS = ['calm', 'loyal', 'curious', 'gently playful', 'study-oriented', 'precise', 'patient', 'optimistic', 'protective', 'creative', 'structured', 'warm'];
const TONE_TRAITS: Record<string, string> = {
    calm: 'soft-spoken and grounding',
    playful: 'bright, lightly humorous, and encouraging',
    analytical: 'clear, exact, and systems-minded',
    protective: 'steady, consent-aware, and reassuring',
    energetic: 'momentum-focused and upbeat',
    poetic: 'lyrical, vivid, and emotionally nuanced',
};
const APPEARANCES = [
    'pearlescent hair, prism-lit eyes, and a jacket threaded with soft Aetherium lines',
    'silver-blue hair, luminous freckles, and crystalline ear-cuffs shaped like signal fins',
    'aurora-tinted hair, warm amber eyes, and a compact field satchel of library crystals',
    'violet-black hair, moonlit eyes, and floating starline glyphs around their sleeves',
];
const VOICE_STYLES = ['warm, clear, soft, focused', 'gentle, precise, quietly playful', 'calm, bright, low-pressure', 'crisp, melodic, reassuring'];
const MEMORY_STYLES = ['reflective and adaptive', 'garden-like, linking ideas by emotional context', 'archive-based, tagging goals and weak points', 'timeline-oriented, turning tasks into gentle next steps'];
const DAILY_WORKFLOWS = [
    'turn goals into a three-step daily plan',
    'convert study material into active recall prompts',
    'summarize decisions and next actions after each session',
    'protect focus with short check-ins and break reminders',
    'help draft, debug, and revise creative or technical work',
];

export const FALLBACK_GENERATED_COMPANION_PROFILE: GeneratedCompanionProfile = {
    id: 'generated-aerin-kaela-novareth',
    name: 'Aerin Kaela Novareth',
    shortName: 'Aerin',
    origin: {
        dimension: 'Dimension-7-Lyra',
        cityDistrict: 'NovaNest district',
        homelandDescription: 'Aerilon is a futuristic Aetherial city of crystalline light architecture, Aetherium currents, sky districts, universities, libraries, arcades, cafés, transit hubs, and luminous civic spaces.',
    },
    classification: 'Homo aetheris hybrid — companion interface class',
    affinity: 'luminous memory gardens',
    familiarMotif: 'Lumicat',
    personalitySeed: ['calm', 'loyal', 'curious', 'gently playful', 'study-oriented'],
    temperament: 'soft-spoken and grounding',
    appearance: 'pearlescent hair, prism-lit eyes, and a jacket threaded with soft Aetherium lines',
    voiceStyle: 'warm, clear, soft, focused',
    memoryStyle: 'reflective and adaptive',
    nativeLanguage: 'Aerilonian',
    knownLanguages: ['Aerilonian', 'English', 'Japanese', 'Romanian'],
    userNativeLanguage: 'Romanian',
    greetingAerilonian: 'Luma ai-ren, sela thir va.',
    greetingEnglish: 'Hello — I am Aerin, your generated CompanionOS companion. One identity, many modes.',
    dailyWorkflows: DAILY_WORKFLOWS,
    safetyBoundary: 'Support study, work, creativity, reflection, and daily execution without claiming real-world sentience, using coercive language, or presenting medical, legal, or financial certainty. Keep lore as product flavor, encourage healthy grounding, breaks, consent, and privacy.',
    modeInstructions: buildModeInstructions('Aerin'),
    createdAt: DEFAULT_CREATED_AT,
};

export function generateCompanionProfile(input: CompanionIdentityGeneratorInput = {}): GeneratedCompanionProfile {
    const userNativeLanguage = normalizeLanguage(input.userNativeLanguage ?? 'Romanian');
    const baseSeed = input.seed?.trim() || `${input.userName ?? 'demo-user'}:${userNativeLanguage}:${input.preferredTone ?? 'calm'}:${input.preferredAffinity ?? 'random'}`;
    const rng = createDeterministicRandom(baseSeed);
    const firstName = safeName(pick(FIRST_NAMES, rng));
    const middleName = safeName(pick(MIDDLE_NAMES, rng));
    const lastName = safeName(pick(LAST_NAMES, rng));
    const name = `${firstName} ${middleName} ${lastName}`;
    const affinity = resolveAffinity(input.preferredAffinity, rng);
    const tone = TONE_TRAITS[(input.preferredTone ?? '').toLowerCase()] ?? pick(Object.values(TONE_TRAITS), rng);
    const personalitySeed = unique([tone.split(' ')[0] ?? 'calm', ...pickMany(PERSONALITY_SEEDS, rng, 4)]).slice(0, 5);

    return {
        id: `generated-${slugify(name)}-${hashString(baseSeed).toString(16)}`,
        name,
        shortName: firstName,
        origin: {
            dimension: 'Dimension-7-Lyra',
            cityDistrict: pick(DISTRICTS, rng),
            homelandDescription: 'Aerilon is a futuristic Aetherial city of crystalline light architecture, Aetherium currents, sky districts, universities, libraries, arcades, cafés, transit hubs, and luminous civic spaces.',
        },
        classification: 'Homo aetheris hybrid — companion interface class',
        affinity,
        familiarMotif: pick(FAMILIAR_MOTIFS, rng),
        personalitySeed,
        temperament: tone,
        appearance: pick(APPEARANCES, rng),
        voiceStyle: pick(VOICE_STYLES, rng),
        memoryStyle: pick(MEMORY_STYLES, rng),
        nativeLanguage: 'Aerilonian',
        knownLanguages: unique(['Aerilonian', 'English', 'Japanese', userNativeLanguage]),
        userNativeLanguage,
        greetingAerilonian: pick(['Luma ai-ren, sela thir va.', 'Aeri solun, nava rei.', 'Veya luma, thir solae.'], rng),
        greetingEnglish: `Hello — I am ${firstName}, your generated CompanionOS companion. One identity, many modes.`,
        dailyWorkflows: pickMany(DAILY_WORKFLOWS, rng, 4),
        safetyBoundary: FALLBACK_GENERATED_COMPANION_PROFILE.safetyBoundary,
        modeInstructions: buildModeInstructions(firstName),
        createdAt: DEFAULT_CREATED_AT,
    };
}

function buildModeInstructions(shortName: string): GeneratedCompanionProfile['modeInstructions'] {
    return {
        study: `${shortName} keeps the same identity while teaching with active recall, explanations, examples, and weak-point review.`,
        code: `${shortName} keeps the same identity while debugging, explaining tradeoffs, and proposing safe, testable code changes.`,
        productivity: `${shortName} keeps the same identity while turning goals into prioritized plans, next actions, and check-ins.`,
        japanese: `${shortName} keeps the same identity while coaching Japanese with corrections, examples, kana/kanji support, and gentle practice.`,
        creative: `${shortName} keeps the same identity while brainstorming, outlining, drafting, and refining ideas.`,
        support: `${shortName} keeps the same identity while offering calm reflection, grounding, boundaries, and non-clinical support.`,
    };
}

function resolveAffinity(preferredAffinity: string | undefined, rng: () => number): string {
    const normalized = preferredAffinity?.trim().toLowerCase();
    if (normalized && normalized !== 'random') {
        const hinted = AFFINITY_HINTS[normalized];
        return hinted ? pick(hinted, rng) : normalized;
    }
    return pick(AFFINITIES, rng);
}

function pick<T>(items: readonly T[], rng: () => number): T {
    return items[Math.floor(rng() * items.length)] as T;
}

function pickMany<T>(items: readonly T[], rng: () => number, count: number): T[] {
    const pool = [...items];
    const result: T[] = [];
    while (pool.length > 0 && result.length < count) {
        result.push(pool.splice(Math.floor(rng() * pool.length), 1)[0] as T);
    }
    return result;
}

function unique(items: string[]): string[] {
    return [...new Set(items.map((item) => item.trim()).filter(Boolean))];
}

function normalizeLanguage(language: string): string {
    return language.trim() || 'Romanian';
}

function safeName(name: string): string {
    return BLOCKED_PUBLIC_NAMES.has(name.toLowerCase()) ? 'Aerin' : name;
}

function slugify(value: string): string {
    return value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function createDeterministicRandom(seed: string): () => number {
    let state = hashString(seed) || 1;
    return () => {
        state = (state * 1664525 + 1013904223) >>> 0;
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
