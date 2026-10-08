import { DEFAULT_CONSENT } from '../privacy/ConsentState';
import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'process';
import { AetherialApp } from './AetherialApp';

async function main() {
    console.log('Starting Gepetto CompanionOS...\n');

    const app = new AetherialApp();
    await app.init();

    const rl = readline.createInterface({ input, output });
    const allowCloud = (await rl.question('Allow cloud chat/voice processing this session? (yes/no): ')).trim().toLowerCase() === 'yes';
    if (!allowCloud) { await app.shutdown(); rl.close(); return; }
    const consent = { ...DEFAULT_CONSENT, localFirst: false };

    console.log('================================================================');
    console.log('[System]: CompanionOS link established.');
    console.log('[System]: Visual vessel online.');
    console.log('[System]: You may now speak with your generated companion.');
    console.log("[System]: Say 'exit' to disconnect.");
    console.log('================================================================\n');

    while (true) {
        try {
            const mode = await rl.question("\n[System]: How will you communicate? Type 'T' for keyboard, or 'S' for microphone: ");
            let userPrompt = '';
            let interactionMode: 'text' | 'speech' = 'text';

            if (mode.toLowerCase() === 't') {
                userPrompt = await rl.question('[User]: ');
            } else if (mode.toLowerCase() === 's') {
                interactionMode = 'speech';
                userPrompt = await app.getPromptFromSpeech({ ...consent, microphone: true });
                console.log(`\n[User]: "${userPrompt}"`);
            } else if (mode.toLowerCase() === 'exit') {
                userPrompt = 'exit';
            } else {
                console.log("[System]: Invalid choice. Please type 'T' to type or 'S' to speak.");
                continue;
            }

            if (userPrompt.toLowerCase().includes('exit')) {
                console.log('\n[Companion]: "Session closed. I will be here when you return."');
                break;
            }

            console.log('...[Companion] is processing...\n');
            const result = await app.interact(userPrompt, interactionMode, undefined, undefined, undefined, false, consent);
            if (result.success) {
                console.log(`[Companion (${result.emotion ?? 'neutral'})]: "${result.responseText}"`);
            } else {
                console.log(`[Companion]: ${result.responseText}\n`);
            }
        } catch (error) {
            console.error('The CompanionOS loop stumbled.', error);
            break;
        }
    }

    rl.close();
    await app.shutdown();
    console.log('\nCompanionOS session complete.');
    process.exit(0);
}

main();
