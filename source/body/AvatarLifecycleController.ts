import { randomUUID } from 'node:crypto';
import type { AvatarActivity, AvatarEmotion, AvatarState } from './AvatarState';
import type { RobotBody } from './RobotBody';

/** One owner at a time; all body writes are ordered, including shutdown. */
export class AvatarLifecycleController {
    private owner: string | undefined;
    private state: AvatarState = { activity: 'idle', emotion: 'neutral' };
    private closed = false;
    private queue: Promise<void> = Promise.resolve();
    private watchdog: ReturnType<typeof setTimeout> | undefined;
    private readyForPlayback = false;
    private processingClaimed = false;
    constructor(private readonly body: () => RobotBody, private readonly leaseMs = 30000) {}
    get current(): AvatarState { return { ...this.state }; }
    isCurrent(id: string): boolean { return !this.closed && this.owner === id; }
    private write(action: () => Promise<void>): Promise<void> {
        this.queue = this.queue.then(action).catch(() => { /* Body unavailable: interaction remains usable. */ });
        return this.queue;
    }
    private renew(): void {
        clearTimeout(this.watchdog);
        const id = this.owner;
        this.watchdog = setTimeout(() => { if (id) void this.reset(id); }, this.leaseMs);
        this.watchdog.unref();
    }
    async begin(activity: 'listening' | 'thinking'): Promise<string> {
        if (this.closed) throw new Error('Avatar lifecycle is shut down');
        const id = randomUUID();
        this.owner = id;
        this.readyForPlayback = false;
        this.processingClaimed = false;
        this.state = { activity, emotion: 'neutral' };
        this.renew();
        await this.write(async () => {
            try { await this.body().setExpression('neutral'); }
            finally { await this.body().setStatusLight(activity); }
        });
        return id;
    }
    async event(id: string, event: string): Promise<boolean> {
        if (!this.isCurrent(id)) return false;
        if (event === 'heartbeat') { this.renew(); return true; }
        if (['ended', 'cancel', 'error'].includes(event)) { await this.reset(id); return true; }
        const activity: AvatarActivity | undefined = event === 'processing' && this.state.activity === 'listening'
            ? 'thinking' : event === 'playing' && this.readyForPlayback && ['thinking', 'speaking'].includes(this.state.activity)
                ? 'speaking' : undefined;
        if (!activity) return false;
        this.state.activity = activity;
        this.renew();
        await this.write(() => this.body().setStatusLight(activity));
        return true;
    }
    preparePlayback(id: string): boolean {
        if (!this.isCurrent(id)) return false;
        this.readyForPlayback = true;
        this.renew();
        return true;
    }
    claimProcessing(id: string): boolean {
        if (!this.isCurrent(id) || this.processingClaimed || !['listening', 'thinking'].includes(this.state.activity)) return false;
        this.processingClaimed = true;
        return true;
    }
    async emotion(id: string, emotion: AvatarEmotion, durationMs?: number): Promise<void> {
        if (!this.isCurrent(id)) return;
        this.state.emotion = emotion;
        await this.write(() => this.body().setExpression(emotion, durationMs));
    }
    async reset(id: string): Promise<void> {
        if (!this.isCurrent(id)) return;
        this.owner = undefined;
        clearTimeout(this.watchdog);
        this.readyForPlayback = false;
        this.state = { activity: 'idle', emotion: 'neutral' };
        await this.write(async () => {
            try { await this.body().setStatusLight('idle'); }
            finally { await this.body().setExpression('neutral'); }
        });
    }
    async shutdown(): Promise<void> {
        if (this.closed) return;
        const reset = this.owner ? this.reset(this.owner) : Promise.resolve();
        this.closed = true;
        await reset;
        clearTimeout(this.watchdog);
        await this.write(() => this.body().free());
    }
}
