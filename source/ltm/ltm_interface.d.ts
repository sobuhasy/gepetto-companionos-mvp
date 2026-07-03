import { Module } from "../module/module_interface";
export interface LTM extends Module {
    store(): Promise<void>;
    query(): Promise<void>;
}
//# sourceMappingURL=ltm_interface.d.ts.map