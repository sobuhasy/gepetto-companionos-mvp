import { Module } from "../module/module_interface";
export interface LLM extends Module {
    generate(): Promise<void>;
}
//# sourceMappingURL=llm_interface.d.ts.map