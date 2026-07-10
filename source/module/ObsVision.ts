import OBSWebSocket from 'obs-websocket-js';

function conciseErrorMessage(error: unknown): string {
    let message = '';

    if (error instanceof Error) {
        message = error.message;
    } else if (typeof error === 'string') {
        message = error;
    } else if (typeof error === 'object' && error !== null && 'message' in error) {
        const candidate = (error as { message?: unknown }).message;
        message = typeof candidate === 'string' ? candidate : '';
    }

    return message.replace(/\s+/g, ' ').trim().slice(0, 200);
}

export class ObsVision {
    private readonly obs: OBSWebSocket;
    private readonly sourceName = process.env['OBS_SOURCE_NAME'] ?? 'Display Capture';
    private isConnected = false;

    constructor() {
        this.obs = new OBSWebSocket();
    }

    public async init(): Promise<void> {
        const obsPassword = process.env['OBS_PASSWORD'];
        if (!obsPassword) {
            console.warn('[Vision]: OBS is optional and disabled because OBS_PASSWORD is not configured.');
            return;
        }

        try {
            console.log('[Vision]: Connecting to OBS...');
            const { obsWebSocketVersion } = await this.obs.connect('ws://127.0.0.1:4455', obsPassword);
            this.isConnected = true;
            console.log(`[Vision]: Connected to OBS v${obsWebSocketVersion}.`);
        } catch (error) {
            this.isConnected = false;
            const detail = conciseErrorMessage(error);
            console.warn(`[Vision]: OBS connection unavailable${detail ? `: ${detail}` : ''}. Chat and voice remain available.`);
        }
    }

    public async captureScreen(): Promise<string | undefined> {
        if (!this.isConnected) {
            console.warn('[Vision]: Screen capture is unavailable because OBS is not connected.');
            return undefined;
        }

        try {
            const response = await this.obs.call('GetSourceScreenshot', {
                sourceName: this.sourceName,
                imageFormat: 'png',
                imageWidth: 1920,
                imageHeight: 1080,
            });

            console.log(`[Vision]: Captured OBS source "${this.sourceName}".`);
            return response.imageData;
        } catch (error) {
            const detail = conciseErrorMessage(error);
            if (/no source was found|source.+not found/i.test(detail)) {
                console.warn(`[Vision]: OBS source "${this.sourceName}" was not found. Set OBS_SOURCE_NAME to an available source.`);
            } else {
                console.warn(`[Vision]: Could not capture OBS source "${this.sourceName}"${detail ? `: ${detail}` : ''}.`);
            }
            return undefined;
        }
    }

    public async free(): Promise<void> {
        if (!this.isConnected) {
            return;
        }

        try {
            await this.obs.disconnect();
            console.log('[Vision]: Disconnected from OBS.');
        } catch (error) {
            const detail = conciseErrorMessage(error);
            console.warn(`[Vision]: OBS disconnect did not complete cleanly${detail ? `: ${detail}` : ''}.`);
        } finally {
            this.isConnected = false;
        }
    }
}
