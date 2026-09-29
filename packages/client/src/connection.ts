export type ConnectionStatus =
  | "DISCONNECTED"
  | "CONNECTING"
  | "CONNECTED"
  | "RECONNECTING"
  | "AUTHENTICATION_FAILED"
  | "INCOMPATIBLE"
  | "UNAVAILABLE";

export type EditState = "REMOTE VERSION" | "LOCAL CLEAN" | "LOCAL MODIFIED" | "SAVING" | "SAVE FAILED" | "VERSION CONFLICT";

export interface EngineConnectionProfile {
  id: string;
  name: string;
  endpoint: string;
}

export interface EngineInfo {
  engineVersion: string;
  controlApiVersion: string;
  workflowSchemaVersions: string[];
  features: string[];
  serverId?: string;
  displayName?: string;
}

export const SUPPORTED_CONTROL_API_VERSION = "1";
export const SUPPORTED_SCHEMA_VERSIONS = ["1"];

export function normalizeEndpoint(endpoint: string): string {
  return endpoint.trim().replace(/\/$/, "");
}

export function compatibilityError(info: EngineInfo): string | null {
  if (info.controlApiVersion !== SUPPORTED_CONTROL_API_VERSION) {
    return `Control API version ${info.controlApiVersion} is not supported. This Designer requires version ${SUPPORTED_CONTROL_API_VERSION}.`;
  }
  const supported = info.workflowSchemaVersions.some((version) => SUPPORTED_SCHEMA_VERSIONS.includes(version));
  if (!supported) {
    return `Workflow schema versions ${info.workflowSchemaVersions.join(", ") || "(none)"} are not supported. This Designer requires schema ${SUPPORTED_SCHEMA_VERSIONS.join(", ")}.`;
  }
  return null;
}

export function nextConnectionStatus(current: ConnectionStatus, event: "connect" | "ok" | "auth" | "incompatible" | "unavailable" | "retry" | "disconnect"): ConnectionStatus {
  if (event === "disconnect") {
    return "DISCONNECTED";
  }
  if (event === "connect") {
    return current === "CONNECTED" || current === "RECONNECTING" || current === "UNAVAILABLE" ? "RECONNECTING" : "CONNECTING";
  }
  if (event === "ok") {
    return "CONNECTED";
  }
  if (event === "auth") {
    return "AUTHENTICATION_FAILED";
  }
  if (event === "incompatible") {
    return "INCOMPATIBLE";
  }
  if (event === "unavailable") {
    return current === "DISCONNECTED" ? "DISCONNECTED" : "UNAVAILABLE";
  }
  return "RECONNECTING";
}

export function editState(input: { dirty: boolean; saving: boolean; conflict: boolean; failed: boolean }): EditState {
  if (input.conflict) {
    return "VERSION CONFLICT";
  }
  if (input.saving) {
    return "SAVING";
  }
  if (input.failed) {
    return "SAVE FAILED";
  }
  if (input.dirty) {
    return "LOCAL MODIFIED";
  }
  return "LOCAL CLEAN";
}

export function capabilityAvailability(capability: string, workers: Array<{ status: string; capabilities: string[] }>): { available: number; warning: string | null } {
  const available = workers.filter((worker) => worker.status === "online" && worker.capabilities.includes(capability)).length;
  if (available === 0) {
    return { available, warning: `No connected worker currently provides ${capability}` };
  }
  return { available, warning: null };
}

export function reconnectDelayMs(attempt: number): number {
  return Math.min(10_000, 200 * 2 ** Math.min(attempt, 8));
}
