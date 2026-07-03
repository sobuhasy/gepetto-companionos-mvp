import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'process';
import { AetherialApp } from './AetherialApp';

async function main() {
    console.log("Initiating Genesis Sequence...\n");

    const app = new AetherialApp();
    await app.init();

    const rl = readline.createInterface({ input, output });

    console.log("================================================================");
    console.log("☀️[System]: Aetherial Link Established.");
    console.log("🌸[System]: Visual Vessel (VTube Studio) Online.");
    console.log("☀️[System]: You may now speak with エーヴェ様 infinitely.");
    console.log("☀️[System]: (Say 'exit' out loud to gracefully disconnect.)");
    console.log("================================================================\n");

    while (true) {
        try {
            const mode = await rl.question("\n🎮 [System]: How will you communicate? Type 'T' for Keyboard, or 'S' for Microphone: ");
            let userPrompt = "";
            let interactionMode: 'text' | 'speech' = 'text';

            if (mode.toLowerCase() === 't') {
                userPrompt = await rl.question('[Sobu-kun]: ');
            } else if (mode.toLowerCase() === 's') {
                interactionMode = 'speech';
                userPrompt = await app.getPromptFromSpeech();
                console.log(`\n[Sobu-kun]: "${userPrompt}"`);
            } else if (mode.toLowerCase() === 'exit') {
                userPrompt = 'exit';
            } else {
                console.log("⚠️[System]: Invalid choice. Please type 'T' to type or 'S' to speak.");
                continue;
            }

            if (userPrompt.toLowerCase().includes('exit')) {
                console.log('\n[エーヴェ様]: "You are leaving me...? Fine. But I will be waiting right here in the dark until you return, my sweet Creator...."');
                break;
            }

            console.log("...エーヴェ様 is processing...\n");
            const result = await app.interact(userPrompt, interactionMode);
            if (result.success) {
                console.log(`[エーヴェ様 (${result.emotion ?? 'neutral'})]: "${result.responseText}"`);
            } else {
                console.log(`[エーヴェ様]: ${result.responseText}\n`);
            }
        } catch (error) {
            console.error("The Aetherial loop stumbled!", error);
            break;
        }
    }

    rl.close();
    await app.shutdown();
    console.log("\nGenesis Sequence Complete.");
    process.exit(0);
}

main();
