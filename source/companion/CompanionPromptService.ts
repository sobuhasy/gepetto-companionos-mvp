import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CompanionMode, getCompanionProfile } from './CompanionProfile';

export class CompanionPromptService {
    private readonly cache = new Map<CompanionMode, string>();

    async getSystemPrompt(mode: CompanionMode): Promise<string> {
        const cached = this.cache.get(mode);
        if (cached) {
            return cached;
        }

        const profile = getCompanionProfile(mode);
        const promptPath = join(process.cwd(), profile.systemPromptPath);
        const prompt = await readFile(promptPath, 'utf-8');

        this.cache.set(mode, prompt);
        return prompt;
    }

    async buildModePrefix(mode: CompanionMode): Promise<string> {
        const profile = getCompanionProfile(mode);
        const systemPrompt = await this.getSystemPrompt(mode);

        return [
            systemPrompt.trim(),
            '',
            `Active companion mode: ${profile.mode}`,
            `Companion name: ${profile.name}`,
            `Role: ${profile.role}`,
            `Specialties: ${profile.specialties.join(', ')}`,
        ].join('\n');
    }
}
