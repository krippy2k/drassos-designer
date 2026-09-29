import type {
  ActivityTestRequest,
  ActivityTestResult,
  CapabilityDescriptor,
  DesignerExecutionEvent,
  ExecutionProjection,
  WorkflowDefinition,
  WorkflowDiagnostic,
} from "@drassos/designer-model";

export interface WorkflowSummary {
  id: string;
  name: string;
  version: string;
  description?: string;
  schemaVersion: string;
  source?: "code" | "document";
}

export interface DesignerClient {
  listWorkflows(): Promise<WorkflowSummary[]>;
  getWorkflow(id: string, version?: string): Promise<{ definition: WorkflowDefinition; revision: string }>;
  saveWorkflow(definition: WorkflowDefinition, revision?: string): Promise<{ revision: string }>;
  validateWorkflow(definition: WorkflowDefinition): Promise<WorkflowDiagnostic[]>;
  listCapabilities(): Promise<{
    activities: CapabilityDescriptor[];
    agents: CapabilityDescriptor[];
    signals: CapabilityDescriptor[];
    workflows: CapabilityDescriptor[];
  }>;
  testActivity(request: ActivityTestRequest): Promise<ActivityTestResult>;
  runWorkflow(workflowId: string, input: unknown, version?: string, environment?: string): Promise<ExecutionProjection>;
  getExecution(executionId: string): Promise<ExecutionProjection>;
  signal(executionId: string, name: string, payload?: unknown): Promise<void>;
}

export function createDesignerClient(baseUrl: string): DesignerClient {
  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${baseUrl}${path}`, {
        ...init,
        headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
      });
    } catch (error) {
      throw new Error(`Drassos Engine is unavailable (${error instanceof Error ? error.message : "network"})`);
    }
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { origin?: string; message?: string };
      const origin = body.origin ?? "Designer Server";
      throw new Error(`${origin}: ${body.message ?? response.statusText}`);
    }
    return response.json() as Promise<T>;
  }

  return {
    listWorkflows: async () => (await request<{ workflows: WorkflowSummary[] }>("/api/workflows")).workflows,
    getWorkflow: (id, version) => request(`/api/workflows/${encodeURIComponent(id)}${version ? `?version=${encodeURIComponent(version)}` : ""}`),
    saveWorkflow: (definition, revision) =>
      request("/api/workflows", { method: "PUT", body: JSON.stringify({ definition, revision }) }),
    validateWorkflow: async (definition) =>
      (await request<{ diagnostics: WorkflowDiagnostic[] }>("/api/validate", { method: "POST", body: JSON.stringify({ definition }) })).diagnostics,
    listCapabilities: () => request("/api/capabilities"),
    testActivity: (activity) => request("/api/activities/test", { method: "POST", body: JSON.stringify(activity) }),
    runWorkflow: (workflowId, input, version) =>
      request("/api/runs", { method: "POST", body: JSON.stringify({ workflowId, version, input }) }),
    getExecution: (executionId) => request(`/api/runs/${encodeURIComponent(executionId)}`),
    signal: async (executionId, name, payload) => {
      await request(`/api/runs/${encodeURIComponent(executionId)}/signal`, {
        method: "POST",
        body: JSON.stringify({ name, payload }),
      });
    },
  };
}

export async function watchExecution(
  baseUrl: string,
  executionId: string,
  afterSeq: number,
  onEvent: (event: DesignerExecutionEvent & { status?: string; output?: unknown; error?: ExecutionProjection["error"]; nodes?: ExecutionProjection["nodes"] }) => void,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch(`${baseUrl}/api/runs/${encodeURIComponent(executionId)}/events?afterSeq=${afterSeq}`, { signal });
  if (!response.ok || !response.body) {
    throw new Error("Designer Server: lost the execution event stream");
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) {
      break;
    }
    buffer += decoder.decode(chunk.value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      const line = part.split("\n").find((item) => item.startsWith("data:"));
      if (!line) {
        continue;
      }
      onEvent(JSON.parse(line.slice(5).trim()) as DesignerExecutionEvent);
    }
  }
}

export async function readExecutionEvents(
  baseUrl: string,
  executionId: string,
  afterSeq = 0,
  signal?: AbortSignal,
): Promise<DesignerExecutionEvent[]> {
  const response = await fetch(`${baseUrl}/api/runs/${encodeURIComponent(executionId)}/events?afterSeq=${afterSeq}`, { signal });
  if (!response.ok || !response.body) {
    throw new Error("Designer Server: lost the execution event stream");
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const events: DesignerExecutionEvent[] = [];
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) {
      break;
    }
    buffer += decoder.decode(chunk.value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      const line = part.split("\n").find((item) => item.startsWith("data:"));
      if (!line) {
        continue;
      }
      events.push(JSON.parse(line.slice(5).trim()) as DesignerExecutionEvent);
    }
  }
  return events;
}
