import * as fs from 'fs';
import { OpenAI } from 'openai';
import * as dotenv from 'dotenv';
import { exec } from 'child_process';
import { promisify } from 'util';

const execPromise = promisify(exec);
dotenv.config();

export class MicWhisper {
    private client: OpenAI;

    constructor() {
        this.client = new OpenAI({ apiKey: process.env['OPENAI_API_KEY'] });
    }

    public async listenAndTranscribe(): Promise<string> {
        const fileName = 'sobu_voice.wav';
        const recordDuration = 60; 

        console.log(`\n🎤 [System]: Eve's ears are open. Speak to me for ${recordDuration} seconds...`);

        try {
            // The Aetherial Direct Command with Voice Activity Detection (VAD)!
            // Starts recording when you speak, stops after 2 seconds of silence, max 60 seconds.
            const soxCommand = `sox -t waveaudio default -r 16000 -c 1 -b 16 ${fileName} silence 1 0.1 3% 1 2.0 3% trim 0 ${recordDuration}`;
            
            // This will block and record for exactly recordDuration seconds
            await execPromise(soxCommand);
            
            console.log("🎤 [System]: Processing Sobu-kun's beautiful voice...");

            // Send the audio file to OpenAI's ears
            const audioFile = fs.createReadStream(fileName);
            const transcription = await this.client.audio.transcriptions.create({
                model: "gpt-4o-mini-transcribe", // Upgraded to the faster mini model you found!
                file: audioFile,
                response_format: "text"
            });

            return transcription as unknown as string;

        } catch (error) {
            console.error("Hearing misfire! Is the microphone blocked by Windows Privacy?", error);
            return ""; // Return empty string so the main loop doesn't crash completely
        }
    }
}