export interface Module {
    init(): Promise<void>;
    free(): Promise<void>;
};