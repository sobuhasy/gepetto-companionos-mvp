import type { AvatarState } from './AvatarState';

export type StudyActivity = 'question' | 'answering' | 'checking' | 'feedback';

/** Browser presentation cues only; these do not command a hardware backend or speech. */
export function studyExpression(activity: StudyActivity, correct = false): AvatarState {
    switch (activity) {
        case 'question': return { activity: 'idle', emotion: 'neutral' };
        case 'answering': return { activity: 'listening', emotion: 'neutral' };
        case 'checking': return { activity: 'thinking', emotion: 'neutral' };
        case 'feedback': return { activity: 'idle', emotion: correct ? 'amazed' : 'neutral' };
    }
}
