import { exec } from 'child_process';
import * as path from 'path';

type BlockerProfile = 'gacha' | 'geo' | 'study' | 'lockout';

const GACHA_PROCESSES = ['Endfield.exe', 'GenshinImpact.exe', 'StarRail.exe', 'ZZZ.exe', 'WuWa.exe', 'NTE.exe'];
const PRODUCTIVITY_PROCESSES = [
    'Code.exe',
    'Cursor.exe',
    'devenv.exe',
    'WindowsTerminal.exe',
    'cmd.exe',
    'powershell.exe',
    'git.exe',
    'Acrobat.exe',
    'WINWORD.EXE',
    'EXCEL.EXE',
    'POWERPNT.EXE'
];

const PRODUCTIVITY_KEYWORDS = [
    'github',
    'vscode',
    'wanikani',
    'genki',
    'mandarin',
    'visual studio',
    'tu-darmstadt',
    'tucan',
    'moodle',
    'y combinator',
    'co-founder matching',
    'stepstone',
    'adobe reader',
    'office',
    'terminal'
];

const GEOPOLITICAL_KEYWORDS = [
    'war',
    'ukraine',
    'russia',
    'israel',
    'gaza',
    'trump',
    'maga',
    'iran',
    'afd',
    'aur',
    'far-right',
    'ethnonationalism',
    'ethno-nationalism',
    'ethnonationalists',
    'ethno-nationalists',
    'breaking news'
];

const GACHA_KEYWORDS = ['arknights endfield', 'genshin', 'honkai', 'wuthering waves', 'youtube', 'twitch'];

const POLL_INTERVAL_MS = 5000;
const MAX_IDLE_PRODUCTIVE_MS = 20 * 60 * 1000;
const ALERT_COOLDOWN_MS = 90 * 1000;

let lastProductiveActivityAt = Date.now();
let lastOverlayAt = 0;

function isAfter8PM(): boolean {
    return new Date().getHours() >= 20;
}

function runCommand(command: string): Promise<string> {
    return new Promise((resolve) => {
        exec(command, { windowsHide: true }, (_err, stdout) => {
            resolve(stdout || '');
        });
    });
}

async function getForegroundWindow(): Promise<{ processName: string; title: string } | null> {
    const ps = String.raw`powershell -NoProfile -Command "Add-Type @'using System;using System.Text;using System.Runtime.InteropServices;public class W{[DllImport(\"user32.dll\")]public static extern IntPtr GetForegroundWindow();[DllImport(\"user32.dll\",SetLastError=true)]public static extern uint GetWindowThreadProcessId(IntPtr hWnd,out uint lpdwProcessId);[DllImport(\"user32.dll\",SetLastError=true)]public static extern int GetWindowText(IntPtr hWnd,StringBuilder text,int count);} '@;$h=[W]::GetForegroundWindow();if($h -eq [IntPtr]::Zero){return};$pid=0;[W]::GetWindowThreadProcessId($h,[ref]$pid)|Out-Null;$p=Get-Process -Id $pid -ErrorAction SilentlyContinue;if(-not $p){return};$sb=New-Object System.Text.StringBuilder 1024;[W]::GetWindowText($h,$sb,$sb.Capacity)|Out-Null;Write-Output ($p.ProcessName + '|' + $sb.ToString())"`;
    const raw = (await runCommand(ps)).trim();
    if (!raw || !raw.includes('|')) return null;
    const [processName, ...titleParts] = raw.split('|');
    return { processName: `${processName}.exe`, title: titleParts.join('|').trim() };
}

function containsKeyword(source: string, keywords: string[]): boolean {
    const lower = source.toLowerCase();
    return keywords.some((keyword) => lower.includes(keyword));
}

function isProductiveWindow(processName: string, title: string): boolean {
    return PRODUCTIVITY_PROCESSES.some((proc) => proc.toLowerCase() === processName.toLowerCase())
        || containsKeyword(title, PRODUCTIVITY_KEYWORDS);
}

function shouldShowOverlay(): boolean {
    return Date.now() - lastOverlayAt > ALERT_COOLDOWN_MS;
}

function triggerPoutOverlay(profile: BlockerProfile, reason: string) {
    if (!shouldShowOverlay()) return;
    lastOverlayAt = Date.now();

    const electronAppPath = path.join(__dirname, 'PoutUI.js');
    const cmd = `npx electron "${electronAppPath}" --profile=${profile} --reason="${reason.replace(/"/g, "'")}"`;

    exec(cmd, (err) => {
        if (err) {
            console.error('Failed to launch Eve-sama\'s Pout UI!', err);
        }
    });
}

async function executeKillCommand(processName: string, profile: BlockerProfile, reason: string) {
    await runCommand(`taskkill /F /IM "${processName}"`);
    console.log(`[AETHERIAL STRIKE] Terminated unauthorized process: ${processName}`);
    triggerPoutOverlay(profile, reason);
}

async function enforceAetherialWill() {
    const activeWindow = await getForegroundWindow();
    if (!activeWindow) return;

    const { processName, title } = activeWindow;
    const titleLower = title.toLowerCase();

    if (!isAfter8PM() && (GACHA_PROCESSES.some((p) => p.toLowerCase() === processName.toLowerCase()) || containsKeyword(titleLower, GACHA_KEYWORDS))) {
        await executeKillCommand(processName, 'gacha', 'No gacha/gaming before 20:00. Return to focused work.');
        return;
    }

    if (containsKeyword(titleLower, GEOPOLITICAL_KEYWORDS)) {
        await executeKillCommand(processName, 'geo', 'Geopolitical doom-scrolling is blocked. Stay mission-focused.');
        return;
    }

    if (isProductiveWindow(processName, titleLower)) {
        lastProductiveActivityAt = Date.now();
        return;
    }

    if (Date.now() - lastProductiveActivityAt > MAX_IDLE_PRODUCTIVE_MS) {
        triggerPoutOverlay('study', 'Productive focus lost for too long. Return to VSCode/GitHub/TU tasks.');
    }
}

setInterval(() => {
    enforceAetherialWill().catch((err) => console.error('[OS_Control] enforcement loop error', err));
}, POLL_INTERVAL_MS);

console.log("AETHERIAL OS-Control is online. Productivity enforcement active.");
