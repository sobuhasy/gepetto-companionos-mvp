import type { RobotBody, RobotStatusLight } from './RobotBody';

/** Browser rendering consumes AvatarLifecycleController state; this backend owns no transport. */
export class NativeBody implements RobotBody {
    async init(): Promise<void> {}
    async free(): Promise<void> {}
    async setExpression(_expression: string, _durationMs?: number): Promise<void> {}
    async speak(_text: string): Promise<void> {}
    async lookAt(_x: number, _y: number): Promise<void> {}
    async moveEar(_left: number, _right: number): Promise<void> {}
    async setStatusLight(_state: RobotStatusLight): Promise<void> {}
}
