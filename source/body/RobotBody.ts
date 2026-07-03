import { Module } from "../module/module_interface";

export type RobotStatusLight =
    | "idle"
    | "listening"
    | "thinking"
    | "speaking";

export interface RobotBody extends Module {
    setExpression(expression: string, durationMs?: number): Promise<void>;
    speak(text: string): Promise<void>;
    lookAt(x: number, y: number): Promise<void>;
    moveEar(left: number, right: number): Promise<void>;
    setStatusLight(state: RobotStatusLight): Promise<void>;
}