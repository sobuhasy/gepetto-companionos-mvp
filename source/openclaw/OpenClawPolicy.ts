import {
    OpenClawActionDecision,
    OpenClawActionRequest,
    OpenClawToolName,
    PermissionTier,
    ToolRiskLevel,
} from "./OpenClawTypes";

const TOOL_RISK: Record<OpenClawToolName, ToolRiskLevel> = {
    read_file: "safe",
    list_directory: "safe",
    search_web: "safe",
    write_file: "caution",
    run_command: "dangerous",
    delete_file: "dangerous",
    install_package: "dangerous",
    modify_system_settings: "dangerous",
};

const TIER_ALLOWLIST: Record<PermissionTier, OpenClawToolName[]> = {
    read_only: ["read_file", "list_directory", "search_web"],
    workspace: ["read_file", "list_directory", "search_web", "write_file"],
    full_control: [
        "read_file",
        "list_directory",
        "search_web",
        "write_file",
        "run_command",
        "delete_file",
        "install_package",
        "modify_system_settings",
    ],
};

export class OpenClawPolicy {
    constructor(private readonly tier: PermissionTier){}

    public evaluate(request: OpenClawActionRequest): OpenClawActionDecision {
        const allowedTools = TIER_ALLOWLIST[this.tier];
        const riskLevel = TOOL_RISK[request.tool];

        if(!allowedTools.includes(request.tool)){
            return {
                allowed: false,
                requiresConfirmation: false,
                riskLevel,
                reason: `Tool '${request.tool}' is not allowed in permission tier '${this.tier}'.`, 
            };
        }

        if(riskLevel === "dangerous"){
            return {
                allowed: true,
                requiresConfirmation: true,
                riskLevel,
                reason: `Tool '${request.tool}' is dangerous and requires explicit confirmation.`,
            };
        }

        if (riskLevel === "caution"){
            return {
                allowed: true,
                requiresConfirmation: true,
                riskLevel,
                reason: `Tool '${request.tool}' can modify workspace files  and requires confirmation.`,
            };
        }

        return {
            allowed: true,
            requiresConfirmation: false,
            riskLevel,
            reason: `Tool '${request.tool}' is allowed.`,
        };
    }
}