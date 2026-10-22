import { RobotBody, RobotStatusLight } from "./RobotBody";
import { VTubeBridge } from "../module/VTubeBridge";

const EXPRESSION_FILES: Record<string, string> = {
    love: "Love.exp3.json",
    angry: "Angry.exp3.json",
    sad: "Cry.exp3.json",
    amazed: "Amazed.exp3.json",
    sleepy: "Sleepy.exp3.json",
    nervous: "Nervous.exp3.json",
};

export class VTubeBody implements RobotBody {
    private expressionTimer: ReturnType<typeof setTimeout> | undefined;
    private activeExpression: string | undefined;
    private expressionVersion = 0;
    public constructor(private readonly bridge = new VTubeBridge()) {}

    public async init(): Promise<void> {
        await this.bridge.init();
    }

    public async free(): Promise<void> {
        await this.setExpression('neutral');
        await this.bridge.free();
    }

    public async setExpression(expression: string, durationMs = 5000): Promise<void> {
        const version = ++this.expressionVersion;
        clearTimeout(this.expressionTimer);
        const previous = this.activeExpression;
        this.activeExpression = undefined;
        if (previous) await this.bridge.clearExpression(previous);
        const expressionFile = EXPRESSION_FILES[expression];
        if (!expressionFile || version !== this.expressionVersion) return;
        this.activeExpression = expressionFile;
        await this.bridge.triggerExpression(expressionFile);
        if (version !== this.expressionVersion) return;
        this.expressionTimer = setTimeout(() => {
            if (version !== this.expressionVersion) return;
            this.activeExpression = undefined;
            void this.bridge.clearExpression(expressionFile).catch(() => undefined);
        }, durationMs);
        this.expressionTimer.unref();
    }

    public async speak(text: string): Promise<void> {
        void text;
        // VTube Studio doesn't synthesize speech directly
        // Lip-sync is still handled by the existing TTS + VB-Audio routing
    }

    public async lookAt(x: number, y: number): Promise<void> {
        void x;
        void y;
        // Future: map x/y gaze to Live2D parameters.
        // For now, VTube Studio remains expression/lip-sync body output.
    }

    public async moveEar(left: number, right: number): Promise<void> {
        // Future: map ear movement to Live2D custom parameters.
        // Reference parameters to avoid unused-variable warnings until implemented.
        void left;
        void right;
    }

    public async setStatusLight(state: RobotStatusLight): Promise<void> {
        console.log(`[VTubeBody]: status light -> ${state}`);
    }
}
