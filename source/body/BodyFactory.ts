import { RobotBody } from "./RobotBody";
import { VTubeBody } from "./VTubeBody";
import { PicoBody } from "./PicoBody";
import { HybridBody } from "./HybridBody";
import { NativeBody } from './NativeBody';

export type BodyBackend = 'native' | 'native-pico' | "vtube" | "pico" | "hybrid";

export function toBodyBackend(value: unknown): BodyBackend {
    return value === 'vtube' || value === 'pico' || value === 'hybrid' || value === 'native-pico'
        ? value : 'native';
}

export function createRobotBody(backend: BodyBackend = 'native'): RobotBody {
    if (backend === 'native') return new NativeBody();
    if (backend === 'native-pico') return new HybridBody([new NativeBody(), new PicoBody()]);
    if (backend === "pico"){
        return new PicoBody();
    }

    if (backend === "hybrid"){
        return new HybridBody([
            new VTubeBody(),
            new PicoBody(),
        ]);
    }

    return new VTubeBody();
}
