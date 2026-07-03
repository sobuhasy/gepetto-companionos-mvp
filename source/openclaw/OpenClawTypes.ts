export type PermissionTier = "read_only" | "workspace" | "full_control";

export type ToolRiskLevel = "safe" | "caution" | "dangerous";

export type OpenClawToolName = 
    | "read_file"
    | "list_directory"
    | "search_web"
    | "write_file"
    | "run_command"
    | "delete_file"
    | "install_package"
    | "modify_system_settings";

export type OpenClawActionRequest = {
    tool: OpenClawToolName;
    args: Record<string, unknown>;
    reason: string;
    dryRun?: boolean;
};

export type OpenClawActionDecision = {
    allowed: boolean;
    requiresConfirmation: boolean;
    riskLevel: ToolRiskLevel;
    reason: string;
};

export type OpenClawAuditRecord = {
    id: string;
    tool: OpenClawToolName;
    args: Record<string, unknown>;
    reason: string;
    decision: OpenClawActionDecision;
    createdAt: string;
};