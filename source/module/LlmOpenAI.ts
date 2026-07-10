import { OpenAI } from 'openai';
import { Module } from './module_interface';
import { Option } from './Option';
import * as dotenv from 'dotenv';

dotenv.config();

const RUNTIME_SYSTEM_PROMPT = [
    'You are the Gepetto CompanionOS chat runtime.',
    'Follow the generated companion identity, active mode instruction, safety boundary, and response contract supplied in the user message.',
    'Do not adopt legacy fixed-persona identities or private project lore.',
    'Do not claim literal real-world sentience.',
].join(' ');

const DEFAULT_CHAT_MODEL = 'gpt-5.4-mini';
const MAX_COMPLETION_TOKENS = 1500;

export class LlmOpenAI implements Module {
    private client: OpenAI | undefined;
    private systemPrompt = RUNTIME_SYSTEM_PROMPT;

    public async init(): Promise<void> {
        const apiKey = process.env['OPENAI_API_KEY'];

        if (!apiKey) {
            console.error('CRITICAL: OPENAI_API_KEY is missing from the environment.');
            return;
        }

        this.client = new OpenAI({
            apiKey,
        });
        this.systemPrompt = RUNTIME_SYSTEM_PROMPT;

        console.log('Gepetto CompanionOS brain successfully initialized.');
    }

    public async free(): Promise<void> {
        this.client = undefined;
        console.log('Gepetto CompanionOS brain disconnected.');
    }

    public async generate(prompt: string, base64Image?: string): Promise<Option<string>> {
        if (!this.client) {
            return { success: false, value: undefined };
        }

        try {
            const contentArray: any[] = [{ type: 'text', text: prompt }];

            if (base64Image) {
                const imageUrl = base64Image.startsWith('data:image') ? base64Image : `data:image/png;base64,${base64Image}`;
                contentArray.push({
                    type: 'image_url',
                    image_url: { url: imageUrl },
                });
            }

            const response = await this.client.chat.completions.create({
                model: process.env['OPENAI_CHAT_MODEL']?.trim() || DEFAULT_CHAT_MODEL,
                messages: [
                    { role: 'system', content: this.systemPrompt },
                    { role: 'user', content: contentArray },
                ],
                // The runtime requests JSON, but AetherialApp must still parse every response defensively.
                max_completion_tokens: MAX_COMPLETION_TOKENS,
            });

            const replyText = response.choices[0]?.message?.content;

            if (response.choices[0]?.finish_reason === 'length') {
                console.warn('[Brain]: Response reached the completion token limit; using the available text safely.');
            }

            if (replyText?.trim()) {
                return { success: true, value: replyText };
            }

            return { success: false, value: undefined };
        } catch (error) {
            console.error('Brain sync error:', error);
            return { success: false, value: undefined };
        }
    }
}
