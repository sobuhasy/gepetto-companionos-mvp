/** Renderer-independent semantics. No Face renderer is implemented. */
export type AvatarActivity = 'idle' | 'listening' | 'thinking' | 'speaking';
export type AvatarEmotion = 'neutral' | 'love' | 'angry' | 'sad' | 'amazed' | 'sleepy' | 'nervous';
export type AvatarState = { activity: AvatarActivity; emotion: AvatarEmotion };
