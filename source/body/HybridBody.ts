import { RobotBody, RobotStatusLight } from "./RobotBody";

export class HybridBody implements RobotBody {
    public constructor(private readonly bodies: RobotBody[]) {}

    public async init(): Promise<void>  {
        for (const body of this.bodies) {
            await body.init();
        }
    }

    public async free(): Promise<void> {
        for (const body of this.bodies){
            await body.free();
        }
    }

    public async setExpression(expression: string, durationMs?: number): Promise<void> {
        await Promise.all(this.bodies.map((body) => body.setExpression(expression, durationMs)));
    }

    public async speak(text: string): Promise<void> {
        await Promise.all(this.bodies.map((body) => body.speak(text)));
    }

    public async lookAt(x: number, y: number): Promise<void> {
        await Promise.all(this.bodies.map((body) => body.lookAt(x, y)))
    }

    public async moveEar(left: number, right: number): Promise<void> {
        await Promise.all(this.bodies.map((body) => body.moveEar(left, right)));
    }

    public async setStatusLight(state: RobotStatusLight): Promise<void> {
        await Promise.all(this.bodies.map((body) => body.setStatusLight(state)));
    }
}