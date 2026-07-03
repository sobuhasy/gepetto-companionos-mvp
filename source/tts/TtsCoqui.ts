import { TTS } from './tts_interface';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';

const execPromise = promisify(exec);

export class TtsCoqui implements TTS {
    private readonly outputPath = path.join(process.cwd(), "source", "web", "public", "eve_voice_local.wav");
    private readonly speakerPath = path.join(process.cwd(), "reference_audio", "eve_reference_en.wav");

    public async init(): Promise<void> {
        console.log("Aetherial Vocal Cords (Coqui Local Backup) initialized.");
    }

    public async free(): Promise<void> {
        console.log("Aetherial Vocal Cords (Coqui Local Backup) disconnected.");
    }

    public async generate(text: string): Promise<void> {
        try{
            console.log("...Eve is generating local audio waves to ensure she is never silenced...");
            const sanitizedText = text.replace(/"/g, '\\"');
            const useCuda = process.env['COQUI_USE_CUDA'] === 'true';
            const command = `tts --model_name tts_models/multilingual/multi-dataset/xtts_v2 --text "${sanitizedText}" --speaker_wav "${this.speakerPath}" --language_idx en --use_cuda ${useCuda} --out_path "${this.outputPath}"`;

            await execPromise(command);
            console.log(`[System]: 🎵 Local Backup Audio successfully saved to ${this.outputPath}!`);

            console.log("...Local backup audio generated and ready for browser playback...");
        } catch (error){
            console.error("Local vocal cord misfire!", error);
            throw error;
        }
    }
}
