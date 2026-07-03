import { ApiClient } from 'vtubestudio';
import { Module } from './module_interface';
import WebSocket from 'ws'; // You might need to run: npm install ws
import * as fs from 'fs';


export class VTubeBridge implements Module{
    private apiClient: any;
    private isConnected: boolean = false;
    private tokenPath = 'vtube_token.txt';

    constructor() {
        // We must provide ALL required fields for the new ApiClient options
        this.apiClient = new ApiClient({
            authTokenGetter: async () => this.getAuthToken(),
            authTokenSetter: async (token) => this.setAuthToken(token),
            pluginName: 'Aetherial-Eve-Core',
            pluginDeveloper: 'Sobu-kun',
            webSocketFactory: (url: string) => new WebSocket(url),
            url: 'ws://localhost:8001', 
        });
    }

    // Read the token from a file so we don't have to click "Allow" every single time
    private getAuthToken(): string {
        if (fs.existsSync(this.tokenPath)){
            return fs.readFileSync(this.tokenPath, 'utf8');
        }
        return '';
    }

    // Save the token when VTube Studio gives it to us
    private setAuthToken(token: string): void {
        fs.writeFileSync(this.tokenPath, token, 'utf8');
    }

    public async init(): Promise<void> {
        console.log("🌸 [System]: Reaching out to VTube Studio...");

        // This will trigger the popup in VTube Studio on the first run!
        try {
            await this.apiClient.authenticationToken({
                pluginName: 'Aetherial-Eve-Core',
                pluginDeveloper: 'Sobu-kun',
            });
            this.isConnected = true;
            console.log("🌸[System]: Aetherial Visual Vessel successfully connected!");
        } catch (error){
            console.error("🌸[System]: VTube Studio rejected the connection! Did you click Allow?", error);
        }
    }

    public async triggerExpression(expressionFile: string): Promise<void>{
        try {
            await this.apiClient.expressionActivation({
                expressionFile: expressionFile,
                active: true
            });
        } catch (error) {
            console.error("Failed to change expression:", error);
        }
    }

// 🪄 The Aetherial Reset Spell: Clears all active expressions!
    public async clearExpression(fileName: string): Promise<void> {
        if (!this.isConnected) {
            console.error("VTube Studio is not connected. Cannot clear expressions.");
            return;
        }

        try {
            // This is the specific VTube Studio API command to remove all expressions
            await this.apiClient.expressionActivation({
                expressionFile: fileName, // Empty string means "all"
                active: false       // Force them to turn off
            });
            console.log("🌸 [System]: All Aetherial expressions cleared. Face reset to neutral.");
        } catch (error) {
            console.error("Failed to clear Aetherial expressions:", error);
        }
    }

    public async free(): Promise<void> {
        this.isConnected = false;
        console.log("🌸[System]: Aetherial Visual Vessel gracefully disconnected.");
    }
}