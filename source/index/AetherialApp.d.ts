export type InteractionMode = 'text' | 'speech';
export type AetherialReply = {
    success: boolean;
    responseText: string;
    spokenText?: string;
    emotion?: string;
};
export declare class AetherialApp {
    private eveBrain?;
    private eveVoice?;
    private eveVoiceBackup?;
    private eveEars?;
    private eveBody?;
    private eveEyes?;
    private initialized;
    init(): Promise<void>;
    getPromptFromSpeech(): Promise<string>;
    interact(userPrompt: string, mode?: InteractionMode, uploadedImage?: string): Promise<AetherialReply>;
    shutdown(): Promise<void>;
    private triggerExpression;
    private requireBrain;
    private requireVoice;
    private requireBackupVoice;
    private requireEars;
    private requireBody;
    private requireEyes;
}
//# sourceMappingURL=AetherialApp.d.ts.map