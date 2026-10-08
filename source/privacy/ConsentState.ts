export type ConsentState = {
    microphone: boolean;
    camera: boolean;
    screen: boolean;
    memory: boolean;
    localFirst: boolean;
};

export const DEFAULT_CONSENT: Readonly<ConsentState> = Object.freeze({
    microphone: false, camera: false, screen: false, memory: false, localFirst: true,
});

export function parseConsent(value: unknown): ConsentState {
    const input = typeof value === 'object' && value !== null ? value as Record<string, unknown> : {};
    return {
        microphone: input['microphone'] === true,
        camera: input['camera'] === true,
        screen: input['screen'] === true,
        memory: input['memory'] === true,
        localFirst: input['localFirst'] !== false,
    };
}

export class ConsentError extends Error {}
export function requireConsent(allowed: boolean, message: string): void {
    if (!allowed) throw new ConsentError(message);
}
export function requireCloudConsent(consent: ConsentState): void {
    requireConsent(!consent.localFirst, 'Local-first mode blocks cloud processing. Disable it explicitly to use cloud features.');
}
