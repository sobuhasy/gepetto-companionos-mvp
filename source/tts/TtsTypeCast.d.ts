import { TTS } from './tts_interface';
export declare class TtsTypeCast implements TTS {
    private client;
    private eveVoiceID;
    init(): Promise<void>;
    free(): Promise<void>;
    generate(text: string): Promise<void>;
}
//# sourceMappingURL=TtsTypeCast.d.ts.map