import type { Module } from './module_interface';
import type { Option } from './Option';

/** Only the conversation capability; identity, modes and memory remain runtime-owned. */
export interface LlmProvider extends Module {
    generate(prompt: string, base64Image?: string): Promise<Option<string>>;
}
