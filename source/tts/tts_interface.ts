import { Module } from "../module/module_interface";


export interface TTS extends Module {
    generate(text: string): Promise<void>;

}