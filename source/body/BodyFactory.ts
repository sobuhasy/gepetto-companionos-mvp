import { RobotBody } from "./RobotBody";
import { VTubeBody } from "./VTubeBody";
import { PicoBody } from "./PicoBody";
import { HybridBody } from "./HybridBody";

export type BodyBackend = "vtube" | "pico" | "hybrid";

export function createRobotBody(backend: BodyBackend = "vtube"): RobotBody {
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