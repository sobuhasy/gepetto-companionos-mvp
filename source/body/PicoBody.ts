import { RobotBody, RobotStatusLight } from "./RobotBody";
import { PicoSerialClient } from "../hardware/PicoSerialClient";

export class PicoBody implements RobotBody {
    public constructor(private readonly pico = new PicoSerialClient()) {}

    public async init(): Promise<void> {
        await this.pico.init();
        await this.pico.send("PING");
    }

    public async free(): Promise<void> {
        await this.pico.free();
    }

    public async setExpression(expression: string, durationMs = 5000): Promise<void> {
        void durationMs;

        if (expression === "love"){
            await this.moveEar(70, 110);
            return;
        }

        if (expression === "angry") {
            await this.moveEar(120, 60);
            return;
        }

        if (expression === "sleepy") {
            await this.moveEar(45, 45);
            return;
        }

        await this.moveEar(90, 90);
    }

    public async speak(text: string): Promise<void> {
        void text;
        await this.setStatusLight("speaking");
    }

    public async lookAt(x: number, y: number): Promise<void> {
        void x;
        void y;
        // In the future, if we will be able to hoard in the rest of our components, we will map gaze to neck/eye servos.
    }

    public async moveEar(left: number, right: number): Promise<void> {
        await this.pico.send(`EAR ${Math.round(left)} ${Math.round(right)}`);
    }

    public async setStatusLight(state: RobotStatusLight): Promise<void> {
        await this.pico.send(`STATUS ${state}`);
    }
}