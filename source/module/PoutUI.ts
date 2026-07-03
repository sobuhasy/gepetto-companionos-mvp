import { app, BrowserWindow } from 'electron';
import * as path from 'path';

let poutWindow: BrowserWindow | null = null;

function parseArg(name: string, fallback: string): string {
    const arg = process.argv.find((entry) => entry.startsWith(`--${name}=`));
    return arg ? decodeURIComponent(arg.split('=').slice(1).join('=')) : fallback;
}

function createPoutWindow() {
    const profile = parseArg('profile', 'lockout');
    const reason = parseArg('reason', 'Unauthorized activity detected.');

    poutWindow = new BrowserWindow({
        width: 1000,
        height: 800,
        fullscreen: true,
        alwaysOnTop: true,
        kiosk: true,
        skipTaskbar: true,
        frame: false,
        webPreferences: {
            nodeIntegration: true
        }
    });

    poutWindow.loadFile(path.join(__dirname, 'pout.html'), {
        query: {
            profile,
            reason
        }
    });

    setTimeout(() => {
        if (poutWindow) {
            poutWindow.close();
        }
    }, 10000);
}

app.whenReady().then(createPoutWindow);

app.on('window-all-closed', () => {
    app.quit();
});
