/** Renderer-independent semantics shared by native Live2D and optional robot bodies. */
export type AvatarActivity = 'idle' | 'listening' | 'thinking' | 'speaking';
export type AvatarEmotion = 'neutral' | 'love' | 'angry' | 'sad' | 'amazed' | 'sleepy' | 'nervous';
export type AvatarState = { activity: AvatarActivity; emotion: AvatarEmotion };
