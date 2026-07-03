import { Module } from './module_interface';
export declare class VTubeBridge implements Module {
    private apiClient;
    private isConnected;
    private tokenPath;
    constructor();
    private getAuthToken;
    private setAuthToken;
    init(): Promise<void>;
    triggerExpression(expressionFile: string): Promise<void>;
    clearExpression(fileName: string): Promise<void>;
    free(): Promise<void>;
}
//# sourceMappingURL=VTubeBridge.d.ts.map