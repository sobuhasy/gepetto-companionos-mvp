import { randomUUID } from 'node:crypto';

export type StudyTopic = 'rotation-matrices' | 'fk-ik';
export type StudyQuestion = { id: string; prompt: string; answerHint: string };
export type StudySession = { id: string; topic: StudyTopic; question: StudyQuestion };
export type StudyRecord = StudySession & {
    sessionId: string;
    studentAnswer: string;
    feedback: string;
    score: number;
    maxScore: number;
    steps: string[];
    nextReview: { title: string; details: string; suggestedAt: string };
    createdAt: string;
};

export class StudyError extends Error {
    constructor(message: string, public readonly status = 400) { super(message); }
}

type Exercise = {
    title: string;
    question: StudyQuestion;
    expected: number[];
    labels: string[];
    steps: string[];
};

const EXERCISES: Record<StudyTopic, Exercise> = {
    'rotation-matrices': {
        title: 'Robotics rotation matrices',
        question: {
            id: 'rotation-z-90-v1',
            prompt: 'Use an active, right-handed rotation about z: rotate the column vector p = (1, 0, 0) by +90°. What are the three components of Rz(90°) p?',
            answerHint: 'Enter x, y, z as three numbers, for example: 1, 0, 0. This example is an input format, not the solution.',
        },
        expected: [0, 1, 0],
        labels: ['rotated x', 'rotated y', 'rotated z'],
        steps: [
            'An active rotation moves the vector while the coordinate frame stays fixed. Positive angles follow the right-hand rule about +z.',
            'Rz(θ) = ⎡ cos θ  −sin θ  0 ⎤\n        ⎢ sin θ   cos θ  0 ⎥\n        ⎣   0       0    1 ⎦',
            'At θ = 90°: cos θ = 0, sin θ = 1.\nRz(90°) = ⎡ 0  −1  0 ⎤\n          ⎢ 1   0  0 ⎥\n          ⎣ 0   0  1 ⎦',
            'Multiply each row by p = (1, 0, 0)ᵀ:\nx′ = 0·1 − 1·0 + 0·0 = 0\ny′ = 1·1 + 0·0 + 0·0 = 1\nz′ = 0·1 + 0·0 + 1·0 = 0',
            'Therefore p′ = (0, 1, 0)ᵀ. The unit vector along +x now points along +y; its length remains 1.',
        ],
    },
    'fk-ik': {
        title: 'Planar forward and inverse kinematics',
        question: {
            id: 'planar-2r-fk-ik-v1',
            prompt: 'A planar two-link arm has L₁ = L₂ = 1, θ₁ = 0°, θ₂ = 90°. First find its end-point x and y using FK. Then recover θ₁ and θ₂ in degrees using IK for that point, choosing the branch with positive θ₂. Enter x, y, θ₁, θ₂.',
            answerHint: 'Enter four numbers in order: x, y, θ₁ in degrees, θ₂ in degrees. Use the principal angle range −180° to 180°; θ₂ must be positive.',
        },
        expected: [1, 1, 0, 90],
        labels: ['FK x', 'FK y', 'IK θ₁ (degrees)', 'IK θ₂ (degrees)'],
        steps: [
            'FK maps joint angles to an end-point. For a planar 2R arm, θ₂ is relative to the first link:\nx = L₁ cos θ₁ + L₂ cos(θ₁ + θ₂)\ny = L₁ sin θ₁ + L₂ sin(θ₁ + θ₂)',
            'Substitute L₁ = L₂ = 1, θ₁ = 0°, θ₂ = 90°:\nx = 1·cos 0° + 1·cos 90° = 1 + 0 = 1\ny = 1·sin 0° + 1·sin 90° = 0 + 1 = 1',
            'IK maps the end-point back to possible joint angles. From the law of cosines:\nc₂ = (x² + y² − L₁² − L₂²)/(2L₁L₂)\n   = (1 + 1 − 1 − 1)/2 = 0',
            'Choose the positive-θ₂ branch:\ns₂ = +√(1 − c₂²) = 1\nθ₂ = atan2(s₂, c₂) = atan2(1, 0) = 90°',
            'θ₁ = atan2(y, x) − atan2(L₂s₂, L₁ + L₂c₂)\n   = atan2(1, 1) − atan2(1, 1) = 45° − 45° = 0°\nThus x = 1, y = 1, θ₁ = 0°, θ₂ = 90°. A second IK branch exists with negative θ₂, but this question selects the positive branch.',
        ],
    },
};

const NUMBER = '[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[eE][+-]?\\d+)?';
const NUMERIC_TOKEN = new RegExp(`^(${NUMBER})(?:\\/(${NUMBER}))?$`);

/** A numeric tuple only: never evaluate expressions or accept a partial parse. */
function parseAnswer(answer: unknown, count: number): { text: string; values: number[] } {
    if (typeof answer !== 'string' || !answer.trim() || answer.length > 500) {
        throw new StudyError('Enter a numeric answer of at most 500 characters.');
    }
    const text = answer.trim();
    let tuple = text;
    if (tuple.startsWith('(') && tuple.endsWith(')') || tuple.startsWith('[') && tuple.endsWith(']')) {
        tuple = tuple.slice(1, -1).trim();
    }
    const tokens = tuple.includes(',') ? tuple.split(',').map(token => token.trim()) : tuple.split(/\s+/);
    if (tokens.length !== count) throw new StudyError(`Enter exactly ${count} numbers in the stated order.`);
    const values = tokens.map(token => {
        const match = NUMERIC_TOKEN.exec(token);
        if (!match) throw new StudyError('Use numbers or numeric fractions, separated by commas or spaces.');
        const numerator = Number(match[1]);
        const denominator = match[2] === undefined ? 1 : Number(match[2]);
        const value = numerator / denominator;
        if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || !Number.isFinite(value)) {
            throw new StudyError('All answer components must be finite numbers.');
        }
        return value;
    });
    return { text, values };
}

/** Fixed, offline exercises. No provider, media capture, memory lookup or disk access. */
export class StudyService {
    private readonly sessions = new Map<string, { session: StudySession; expiresAt: number; result?: StudyRecord }>();
    constructor(private readonly clock: () => number = Date.now, private readonly ttlMs = 30 * 60 * 1000, private readonly capacity = 100) {
        if (ttlMs <= 0 || capacity < 1 || !Number.isInteger(capacity)) throw new Error('Invalid study session limits.');
    }

    topics(): { id: StudyTopic; title: string }[] {
        return (Object.keys(EXERCISES) as StudyTopic[]).map(id => ({ id, title: EXERCISES[id].title }));
    }

    private prune(): void {
        for (const [id, entry] of this.sessions) {
            if (entry.expiresAt <= this.clock()) this.sessions.delete(id);
        }
    }

    start(topic: unknown): StudySession {
        if (topic !== 'rotation-matrices' && topic !== 'fk-ik') throw new StudyError('Choose a supported robotics topic.');
        this.prune();
        while (this.sessions.size >= this.capacity) this.sessions.delete(this.sessions.keys().next().value!);
        const session: StudySession = { id: randomUUID(), topic, question: { ...EXERCISES[topic].question } };
        this.sessions.set(session.id, { session, expiresAt: this.clock() + this.ttlMs });
        return structuredClone(session);
    }

    answer(sessionId: unknown, answer: unknown): StudyRecord {
        this.prune();
        if (typeof sessionId !== 'string') throw new StudyError('A study session ID is required.');
        const entry = this.sessions.get(sessionId);
        if (!entry) throw new StudyError('Study session not found or expired. Start a new session.', 404);
        const exercise = EXERCISES[entry.session.topic];
        const { text, values } = parseAnswer(answer, exercise.expected.length);
        if (entry.result) {
            if (entry.result.studentAnswer === text) return structuredClone(entry.result);
            throw new StudyError('This session was already scored. Start a new session to try again.', 409);
        }
        const correct = exercise.expected.map((value, index) => Math.abs(value - values[index]!) <= 0.001);
        const score = correct.filter(Boolean).length;
        const weakPoints = exercise.labels.filter((_, index) => !correct[index]);
        const maxScore = exercise.expected.length;
        const now = this.clock();
        const nextReview = {
            title: `Review ${exercise.title.toLowerCase()}`,
            details: score === maxScore
                ? `Re-solve the ${exercise.title.toLowerCase()} exercise from memory, then explain each intermediate step. Try a different angle next.`
                : `Practice ${weakPoints.join(', ')}. Re-solve the exercise and compare each intermediate step with the worked solution.`,
            suggestedAt: new Date(now + (score === maxScore ? 3 : 1) * 24 * 60 * 60 * 1000).toISOString(),
        };
        entry.result = {
            ...structuredClone(entry.session), id: randomUUID(), sessionId,
            studentAnswer: text,
            feedback: score === maxScore
                ? `Correct: ${score}/${maxScore} components. Review the steps to check your reasoning.`
                : `${score}/${maxScore} components correct. Recheck ${weakPoints.join(', ')} using the worked steps below.`,
            score, maxScore, steps: [...exercise.steps], nextReview, createdAt: new Date(now).toISOString(),
        };
        return structuredClone(entry.result);
    }

    record(id: unknown): StudyRecord {
        this.prune();
        if (typeof id !== 'string' || !id) throw new StudyError('A scored study record ID is required.');
        for (const entry of this.sessions.values()) {
            if (entry.result?.id === id) return structuredClone(entry.result);
        }
        throw new StudyError('Scored study record not found or expired.', 404);
    }
}
