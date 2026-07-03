import { promisify } from "node:util";
import { exec as execCb } from "node:child_process";
import net from "node:net";

const exec = promisify(execCb);

export type HealthStatus = "online" | "offline" | "degraded" | "unknown";

export type SystemHealthReport = {
    llm: HealthStatus;
    ttsPrimary: HealthStatus;
    ttsBackup: HealthStatus;
    obsVision: HealthStatus;
    vtubeStudio: HealthStatus;
    microphone: HealthStatus;
    webGui: HealthStatus;
    openClaw: HealthStatus;
    checkedAt: string;
};

export class SystemHealthService {
    public async check(webGuiReady: boolean): Promise<SystemHealthReport> {
        const [ttsBackup, microphone, obsVision, vtubeStudio, openClaw] = await Promise.all([
            this.checkCommand("tts --help"),
            this.checkCommand("sox --version"),
            this.checkTcpPort("127.0.0.1", 4455),
            this.checkTcpPort("127.0.0.1", 8001),
            this.checkOpenClaw(),
        ]);

        return {
            llm: this.checkEnv("OPENAI_API_KEY"),
            ttsPrimary: this.checkEnv("TYPECAST_API_KEY"),
            ttsBackup,
            obsVision,
            vtubeStudio,
            microphone,
            webGui: webGuiReady ? "online" : "degraded",
            openClaw,
            checkedAt: new Date().toISOString(),
        };
    }

    private checkEnv(key: string): HealthStatus {
        return process.env[key] ? "online" : "offline";
    }

    private async checkCommand(command: string): Promise<HealthStatus> {
        try {
            await exec(command);
            return "online";
        } catch {
            return "offline";
        }
    }

    private checkTcpPort(host: string, port: number): Promise<HealthStatus> {
        return new Promise((resolve) => {
            const socket = new net.Socket();

            socket.setTimeout(1200);

            socket.once("connect", () => {
                socket.destroy();
                resolve("online");
            });

            socket.once("timeout", () => {
                socket.destroy();
                resolve("offline");
            });

            socket.once("error", () => {
                socket.destroy();
                resolve("offline");
            });

            socket.connect(port, host);
        });
    }

    private async checkOpenClaw(): Promise<HealthStatus> {
        const openClawHealthUrl = process.env["OPENCLAW_HEALTH_URL"];

        if (!openClawHealthUrl) {
            return "unknown";
        }

        try {
            const response = await fetch(openClawHealthUrl);
            return response.ok ? "online" :  "degraded";
        } catch {
            return "offline";
        }
    }
}