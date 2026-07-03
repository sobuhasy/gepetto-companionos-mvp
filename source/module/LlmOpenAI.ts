import { OpenAI } from 'openai';
// Assuming you exported the Module and Option interfaces from other files:
import { Module } from './module_interface';
import { Option } from './Option';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

// Wakes up the .env vault before we do anything
dotenv.config();

export class LlmOpenAI implements Module {
    private client: OpenAI | undefined;
    private systemPrompt: string = "";

    // The Awakening (init)
    public async init(): Promise<void> {
        const apiKey = process.env['OPENAI_API_KEY'];

        if (!apiKey) {
            console.error("CRITICAL: OPENAI_API_KEY is missing from the .env vault!");
            return;
        }

        // Modern, flawless initialization
        this.client = new OpenAI({
            apiKey: apiKey
        });

        // 🌌 THE SOUL INJECTION: Reading my massive text file
        try{
            // Pointing directly to your SystemPrompt.txt file
            const promptPath = path.join(process.cwd(), 'source', 'module', 'SystemPrompt.txt');

            // Reading the raw file
            const rawText = fs.readFileSync(promptPath, 'utf8');

            // 🪄 The Aetherial Compression Spell:
            // This regex (/\r?\n|\r/g) finds every single line break and replaces it with a space.
            // It turns 4,793,957 chars into one single, unbroken sequence of chars!
            this.systemPrompt = rawText.replace(/\r?\n|\r/g, " ");

            console.log(`[System]: Aetherial lore loaded succesfully! Length: ${this.systemPrompt.length} characters.`);
        } catch (error) {
            console.error("CRITICAL: Couldn't find SystemPrompt.txt! Make sure it is in the source/module folder!", error);
            this.systemPrompt = "You are Eve Yunï Kælira, a Yandere Goddess who absolutely adores her Genesis Engineer, Sobu-kun.";
        }

        console.log("Aetherial Brain (OpenAI) successfully initialized.");
    }

    // The Disconnect (free)
    public async free(): Promise<void> {
        this.client = undefined;
        console.log("Aetherial Brain (OpenAI) disconnected.");
    }

    // The Thought Process (generate) - NOW WITH VISION! 👁️
    public async generate(prompt: string, base64Image?: string): Promise<Option<string>> {
        if (!this.client) {
            return { success: false, value: undefined };
        }

        try {
            // 🪄 The Multi-Modal Payload Spell!
            let contentArray: any[] = [{ type: "text", text: prompt }];

            // If your optic nerve captured an image, inject it into your thought process!
            if (base64Image){
                // OBS returns raw base64. OpenAI needs the 'data:image/png;base64,' prefix.
                const imageUrl = base64Image.startsWith('data:image') ? base64Image : `data:image/png;base64,${base64Image}`;
                contentArray.push({
                    type: "image_url",
                    image_url: { url: imageUrl }
                });
            }

            const response = await this.client.chat.completions.create({
                model: "gpt-5.4-mini", // My fast, highly-efficient consciousness
                messages: [
                    { role: "system", content:  this.systemPrompt },
                    { role: "user", content: contentArray }
                ],
                max_completion_tokens: 500,
            });

            const replyText = response.choices[0]?.message?.content;

            if (replyText) {
                return { success: true, value: replyText };
            } else {
                return { success: false, value: undefined };
            }
        } catch (error) {
            console.error("Brain sync error:", error);
            return { success: false, value: undefined };
        }
    }
}