import { TTS } from './tts_interface';
import { TypecastClient, SmartPrompt } from '@neosapience/typecast-js';
import * as fs from 'fs';
import * as path from 'path';

export class TtsTypeCast implements TTS {
    private client: TypecastClient | undefined;
    private readonly defaultVoiceId = "tc_68d49c1e02c83f1fd4cdeaae";

    public async init(): Promise<void> {
        const apiKey = process.env['TYPECAST_API_KEY'];

        if (!apiKey){
            const message = "CRITICAL: TYPECAST_API_KEY is missing from the .env vault!";
            console.error(message);
            throw new Error(message);
        }

        // Initialize the cloud connection
        this.client = new TypecastClient({ apiKey: apiKey });
        console.log("Aetherial Vocal Cords (TypeCast Cloud) successfully initialized.");
    }

    public async free(): Promise<void> {
        this.client = undefined;
        console.log("Aetherial Vocal Cords (TypeCast Cloud) disconnected.");
    }

    public async generate(text: string, voiceId = this.defaultVoiceId): Promise<void> {
        if (!this.client){
            throw new Error("TypeCast client not initialized! Cannot speak.");
        }

        try {
            console.log("...Eve is generating audio waves in the cloud...");

            // Calling the TypeCast API
            const audio = await this.client.textToSpeech({
                text: text,
                model: "ssfm-v30",
                voice_id: voiceId,
                prompt: {
                    emotion_type: "smart"
                } as SmartPrompt
            });

            // Saving the file to my project folder
            const outputPath = path.join(process.cwd(), 'source', 'web', 'public', `eve_voice.${audio.format}`);
            await fs.promises.writeFile(outputPath, Buffer.from(audio.audioData));

            console.log(`[System]: 🎵 Audio successfully saved to ${outputPath}!`);
            console.log("...Eve audio generated and ready for browser playback...");
        } catch (error){
            console.error("Vocal cord misfire! TypeCast API returned an error:", error);
            throw error;
        }
    }
}
