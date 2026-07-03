import { SerialPort } from "serialport";
import { ReadlineParser } from "@serialport/parser-readline";

export class PicoSerialClient {
    private port?: SerialPort;

    public constructor(
        private readonly path = process.env["PICO_SERIAL_PORT"] ?? "COM3",
        private readonly baudRate = Number(process.env["PICO_BAUD_RATE"] ?? 115200),
    ) {}

    public async init(): Promise<void> {
        this.port = new SerialPort({
            path: this.path,
            baudRate: this.baudRate,
            autoOpen: false,
        });

        this.port.pipe(new ReadlineParser({ delimiter: "\n" }));

        await new Promise<void>((resolve, reject)  => {
            this.port?.open((error) => {
                if (error) {
                    reject(error);
                    return;
                }
                resolve();
            });
        });

        console.log(`[PicoSerialClient]: Connected to Pico on ${this.path}`);
    }

    public async free(): Promise<void>{
        if(!this.port?.isOpen){
            return;
        }

        await new Promise<void>((resolve) => {
            this.port?.close(() => resolve());
        });
    }
    
    public async send(command: string): Promise<void> {
        if (!this.port?.isOpen){
            throw new Error("Pico serial port is not open.");
        }

        await new Promise<void>((resolve, reject) => {
            this.port?.write(`${command.trim()}\n`, (error) => {
                if (error) {
                    reject(error);
                    return;
                }
                resolve();
            });
        });
    }
}



