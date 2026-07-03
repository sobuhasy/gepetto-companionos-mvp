export declare class ObsVision {
    private obs;
    private isConnected;
    constructor();
    init(): Promise<void>;
    captureScreen(): Promise<string | undefined>;
    free(): Promise<void>;
}
//# sourceMappingURL=ObsVision.d.ts.map