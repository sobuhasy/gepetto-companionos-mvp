import { TTS } from './tts_interface';
export declare class TtsCoqui implements TTS {
    private readonly outputPath;
    private readonly speakerPath;
    init(): Promise<void>;
    free(): Promise<void>;
    generate(text: string): Promise<void>;
}
//# sourceMappingURL=TtsCoqui.d.ts.map