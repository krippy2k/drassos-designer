import { projectExecution, type ExecutionProjection, type WorkflowDefinition, type WorkflowDiagnostic } from "@drassos/designer-model";
import type { DesignerClient, WorkflowSummary } from "./client.ts";
import { compatibilityError, normalizeEndpoint, type EngineInfo } from "./connection.ts";

export interface RemoteLogEntry {
  timestamp: string;
  type: string;
  message: string;
  level: string | null;
  workerId: string | null;
  executionId: string | null;
  seq: number;
  payload?: { stepId?: string; nodeId?: string };
}

export interface RemoteRunSummary {
  id: string;
  workflowName: string;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
  durationMs?: number | null;
}

export interface RemoteDesignerClient extends DesignerClient {
  baseUrl: string;
  info: EngineInfo;
  cancel(executionId: string): Promise<{ status: string }>;
  logs(executionId: string): Promise<RemoteLogEntry[]>;
  runs(workflowId: string): Promise<RemoteRunSummary[]>;
  workers(): Promise<Array<{ workerId: string; status: string; capabilities: string[] }>>;
}

export async function connectEngine(endpoint: string, token?: string): Promise<RemoteDesignerClient> {
  const baseUrl = normalizeEndpoint(endpoint);
  const info = await request<EngineInfo>(baseUrl, token, "/engine/info");
  const incompatible = compatibilityError(info);
  if (incompatible) {
    throw new Error(incompatible);
  }
  return createRemoteDesignerClient(baseUrl, token, info);
}

export function createRemoteDesignerClient(baseUrl: string, token: string | undefined, info: EngineInfo): RemoteDesignerClient {
  const call = <T>(path: string, init?: RequestInit) => request<T>(baseUrl, token, path, init);

  async function execution(executionId: string): Promise<ExecutionProjection> {
    const detail = await call<{
      run: { id: string; workflowName: string; workflowVersion: string; status: string; output: unknown; error: { name?: string; message?: string } | null };
      steps: Array<{ name: string; status: string; attempt: number; input: unknown; output: unknown; error: { name?: string; message?: string } | null; startedAt: string | null; completedAt: string | null }>;
      history: Array<{ seq: number; type: string; timestamp: string; payload: unknown }>;
    }>(`/runs/${encodeURIComponent(executionId)}`);
    let nodeIds = detail.steps.map((step) => step.name);
    let codeNodeId: string | undefined;
    let definition: WorkflowDefinition | undefined;
    try {
      const loaded = await call<{ definition: WorkflowDefinition }>(
        `/definitions/${encodeURIComponent(detail.run.workflowName)}?version=${encodeURIComponent(detail.run.workflowVersion)}`,
      );
      definition = loaded.definition;
      nodeIds = loaded.definition.nodes.map((node) => node.id);
      if (loaded.definition.metadata?.source === "code") {
        codeNodeId = loaded.definition.nodes.find((node) => node.type === "code")?.id;
      }
    } catch {
      nodeIds = detail.steps.map((step) => step.name);
    }
    const projected = projectExecution({
      executionId: detail.run.id,
      workflowId: detail.run.workflowName,
      workflowVersion: detail.run.workflowVersion,
      status: detail.run.status,
      output: detail.run.output,
      error: detail.run.error,
      nodeIds,
      codeNodeId,
      steps: detail.steps,
      history: detail.history,
      definition,
    });
    const logs = await call<{ logs: RemoteLogEntry[] }>(`/runs/${encodeURIComponent(executionId)}/logs`).catch(() => ({ logs: [] }));
    for (const entry of logs.logs) {
      const referenced = nodeIdFromLog(entry);
      const nodeId = referenced && projected.nodes[referenced] ? referenced : codeNodeId && (entry.type === "step.log" || entry.type === "step.progress") ? codeNodeId : null;
      const node = nodeId ? projected.nodes[nodeId] : undefined;
      if (!node) {
        continue;
      }
      node.logs = [...(node.logs ?? []), { timestamp: entry.timestamp, level: entry.level, message: entry.message, attempt: null }];
      if (entry.workerId) {
        node.workerId = entry.workerId;
      }
    }
    return projected;
  }

  return {
    baseUrl,
    info,
    async listWorkflows() {
      const body = await call<{ workflows: WorkflowSummary[] }>("/definitions");
      return body.workflows;
    },
    getWorkflow(id, version) {
      const query = version ? `?version=${encodeURIComponent(version)}` : "";
      return call(`/definitions/${encodeURIComponent(id)}${query}`);
    },
    async saveWorkflow(definition, revision) {
      return call("/definitions/" + encodeURIComponent(definition.id), {
        method: "PUT",
        body: JSON.stringify({ definition, baseRevision: revision }),
      });
    },
    async validateWorkflow(definition) {
      const body = await call<{ diagnostics: WorkflowDiagnostic[] }>("/definitions/validate", {
        method: "POST",
        body: JSON.stringify({ definition }),
      });
      return body.diagnostics;
    },
    testActivity(activity) {
      return call("/activities/test", { method: "POST", body: JSON.stringify(activity) });
    },
    async listCapabilities() {
      const workers = await call<{ workers: Array<{ status: string; capabilities: string[] }> }>("/workers");
      const activities = [...new Set(workers.workers.flatMap((worker) => worker.capabilities))].map((id) => ({ id, name: id }));
      const catalog = await call<{ agents?: Array<{ id: string; name?: string; description?: string }> }>("/capabilities").catch(() => ({ agents: [] }));
      return { activities, agents: catalog.agents ?? [], signals: [], workflows: [] };
    },
    async runWorkflow(workflowId, input, version, environment = "development") {
      const started = await call<{ id: string }>(`/workflows/${encodeURIComponent(workflowId)}/runs`, {
        method: "POST",
        body: JSON.stringify({ input, version, environment, metadata: { source: "designer", mode: "test" } }),
      });
      return execution(started.id);
    },
    getExecution: execution,
    async signal(executionId, name, payload) {
      await call(`/workflows/${encodeURIComponent(executionId)}/signals/${encodeURIComponent(name)}`, {
        method: "POST",
        body: JSON.stringify({ payload: payload ?? {} }),
      });
    },
    async cancel(executionId) {
      const run = await call<{ status?: string; run?: { status: string } }>(`/runs/${encodeURIComponent(executionId)}/cancel`, {
        method: "POST",
        body: JSON.stringify({ reason: "Cancelled from Designer" }),
      });
      return { status: run.run?.status ?? run.status ?? "CANCELLED" };
    },
    async logs(executionId) {
      const body = await call<{ logs: RemoteLogEntry[] }>(`/runs/${encodeURIComponent(executionId)}/logs`);
      return body.logs;
    },
    async runs(workflowId) {
      const body = await call<{ runs: RemoteRunSummary[] }>(`/runs?workflow=${encodeURIComponent(workflowId)}`);
      return body.runs;
    },
    async workers() {
      const body = await call<{ workers: Array<{ id: string; workerId?: string; status: string; capabilities: string[] }> }>("/workers");
      return body.workers.map((worker) => ({
        workerId: worker.workerId ?? worker.id,
        status: worker.status,
        capabilities: worker.capabilities,
      }));
    },
  };
}

export async function watchRemoteExecution(
  client: RemoteDesignerClient,
  executionId: string,
  afterSeq: number,
  onUpdate: () => void,
  signal?: AbortSignal,
): Promise<void> {
  const headers: Record<string, string> = {};
  const response = await fetch(`${client.baseUrl}/runs/${encodeURIComponent(executionId)}/stream?after=${afterSeq}`, { signal, headers });
  if (!response.ok || !response.body) {
    throw new Error("Drassos Engine: lost the execution event stream");
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (!signal?.aborted) {
    const chunk = await reader.read();
    if (chunk.done) {
      break;
    }
    buffer += decoder.decode(chunk.value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    if (parts.length > 0) {
      onUpdate();
    }
  }
}

async function request<T>(baseUrl: string, token: string | undefined, path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(init?.headers ?? {}),
      },
    });
  } catch (error) {
    throw new Error(`Drassos Engine is unavailable (${error instanceof Error ? error.message : "network"})`);
  }
  if (response.status === 401) {
    throw new Error("Authentication failed");
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { message?: string; error?: { message?: string }; origin?: string };
    const message = body.error?.message ?? body.message ?? response.statusText;
    throw new Error(body.origin ? `${body.origin}: ${message}` : message);
  }
  return response.json() as Promise<T>;
}

function nodeIdFromLog(entry: RemoteLogEntry): string | null {
  return entry.payload?.nodeId ?? entry.payload?.stepId ?? null;
}
