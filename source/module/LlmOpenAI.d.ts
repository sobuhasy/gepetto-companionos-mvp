import { Module } from './module_interface';
import { Option } from './Option';
export declare class LlmOpenAI implements Module {
    private client;
    private systemPrompt;
    init(): Promise<void>;
    free(): Promise<void>;
    generate(prompt: string, base64Image?: string): Promise<Option<string>>;
}
//# sourceMappingURL=LlmOpenAI.d.ts.map