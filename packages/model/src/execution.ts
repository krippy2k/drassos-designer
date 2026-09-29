import type { DesignerExecutionEvent, ExecutionProjection, NodeExecutionView, NodeRunStatus, ValueSchema, WorkflowDefinition } from "./types.ts";
import { contractOf } from "./activities.ts";

export interface ProjectionStep {
  name: string;
  status: string;
  attempt: number;
  input: unknown;
  output: unknown;
  error: { name?: string; message?: string } | null;
  startedAt: string | null;
  completedAt: string | null;
}

export interface ProjectionHistoryEvent {
  seq: number;
  type: string;
  timestamp: string;
  payload: unknown;
}

export function projectExecution(input: {
  executionId: string;
  workflowId: string;
  workflowVersion: string;
  status: string;
  output: unknown;
  error: { name?: string; message?: string } | null;
  nodeIds: string[];
  codeNodeId?: string;
  steps: ProjectionStep[];
  history: ProjectionHistoryEvent[];
  definition?: WorkflowDefinition;
}): ExecutionProjection {
  const keys = privateKeys(input.definition);
  const secrets: string[] = [];
  for (const step of input.steps) {
    collectPrivateStrings(step.input, keys, secrets);
    collectPrivateStrings(step.output, keys, secrets);
  }
  collectPrivateStrings(input.output, keys, secrets);
  const redact = (value: unknown) => redactLogged(value, keys, secrets);
  const nodes: Record<string, NodeExecutionView> = {};
  for (const nodeId of input.nodeIds) {
    nodes[nodeId] = {
      nodeId,
      status: "not-started",
      attempts: 0,
      durationMs: null,
      input: null,
      output: null,
      error: null,
    };
  }
  for (const step of input.steps) {
    if (!nodes[step.name]) {
      continue;
    }
    const waiting = input.status === "WAITING" && (step.status === "RUNNING" || step.status === "WAITING");
    nodes[step.name] = {
      nodeId: step.name,
      status: waiting ? "waiting" : stepStatus(step.status),
      attempts: step.attempt,
      durationMs: durationMs(step.startedAt, step.completedAt),
      input: redact(step.input),
      output: redact(step.output),
      error: step.error?.message ? { name: step.error.name ?? "Error", message: scrubText(step.error.message, secrets) } : null,
    };
  }
  if (input.codeNodeId) {
    applyCodeWorkflowMarks(nodes, input.codeNodeId, input.status, input.steps, redact);
  }
  const events = [...input.history]
    .sort((left, right) => left.seq - right.seq)
    .map((event) => toDesignerEvent(input, { ...event, payload: redact(event.payload) }));
  return {
    executionId: input.executionId,
    status: input.status,
    output: redact(input.output),
    error: input.error?.message ? { name: input.error.name ?? "Error", message: input.error.message } : null,
    nodes,
    events,
  };
}

export function toDesignerEvent(
  run: { executionId: string; workflowId: string; workflowVersion: string },
  event: ProjectionHistoryEvent,
): DesignerExecutionEvent {
  const payload = event.payload && typeof event.payload === "object" ? (event.payload as Record<string, unknown>) : {};
  const nodeId = typeof payload.nodeId === "string" ? payload.nodeId : undefined;
  return {
    executionId: run.executionId,
    workflowId: typeof payload.workflowId === "string" ? payload.workflowId : run.workflowId,
    workflowVersion: typeof payload.workflowVersion === "string" ? payload.workflowVersion : run.workflowVersion,
    nodeId,
    type: event.type,
    timestamp: event.timestamp,
    seq: event.seq,
    data: event.payload,
  };
}

function applyCodeWorkflowMarks(
  nodes: Record<string, NodeExecutionView>,
  codeNodeId: string,
  runStatus: string,
  steps: ProjectionStep[],
  redact: (value: unknown) => unknown,
): void {
  const codeNode = nodes[codeNodeId];
  if (!codeNode) {
    return;
  }
  const activity = displayedCodeStep(steps.filter((step) => step.name !== "bind-definition" && !nodes[step.name]));
  if (activity) {
    const waiting = runStatus === "WAITING" && (activity.status === "RUNNING" || activity.status === "WAITING");
    nodes[codeNodeId] = {
      nodeId: codeNodeId,
      status: waiting ? "waiting" : stepStatus(activity.status),
      attempts: activity.attempt,
      durationMs: durationMs(activity.startedAt, activity.completedAt),
      input: redact(activity.input),
      output: redact(activity.output),
      error: activity.error?.message ? { name: activity.error.name ?? "Error", message: activity.error.message } : null,
    };
  }
  const begun = runStatus === "RUNNING" || runStatus === "WAITING" || runStatus === "COMPLETED" || runStatus === "FAILED" || runStatus === "CANCELLED";
  if (begun && nodes.start?.status === "not-started") {
    nodes.start = { ...nodes.start, status: "completed", attempts: 1 };
  }
  if (runStatus === "COMPLETED" && nodes.end?.status === "not-started") {
    nodes.end = { ...nodes.end, status: "completed", attempts: 1 };
  }
}

function displayedCodeStep(steps: ProjectionStep[]): ProjectionStep | undefined {
  const urgency = (status: string) => {
    switch (status) {
      case "FAILED":
      case "CANCELLED":
        return 0;
      case "RETRYING":
        return 1;
      case "RUNNING":
      case "WAITING":
        return 2;
      case "COMPLETED":
        return 3;
      default:
        return 4;
    }
  };
  return [...steps].sort((left, right) => {
    const byUrgency = urgency(left.status) - urgency(right.status);
    if (byUrgency !== 0) {
      return byUrgency;
    }
    return (right.completedAt ?? right.startedAt ?? "").localeCompare(left.completedAt ?? left.startedAt ?? "");
  })[0];
}

function stepStatus(status: string): NodeRunStatus {
  switch (status) {
    case "RUNNING":
      return "running";
    case "COMPLETED":
      return "completed";
    case "FAILED":
    case "CANCELLED":
      return "failed";
    case "WAITING":
      return "waiting";
    case "RETRYING":
      return "retrying";
    default:
      return "not-started";
  }
}

const SECRET_KEY = /secret|password|token|apikey|api_key|authorization|credential|private[_-]?key/i;

function privateKeys(definition?: WorkflowDefinition): Set<string> {
  const keys = new Set<string>();
  const visit = (fields?: Record<string, ValueSchema>) => {
    for (const [key, schema] of Object.entries(fields ?? {})) {
      if (schema.private) {
        keys.add(key);
      }
      visit(schema.properties);
    }
  };
  if (!definition) {
    return keys;
  }
  visit(definition.inputs);
  visit(definition.outputs);
  for (const node of definition.nodes) {
    if (node.type !== "activity") {
      continue;
    }
    const contract = contractOf(node);
    visit(contract.input);
    visit(contract.output);
  }
  return keys;
}

function collectPrivateStrings(value: unknown, keys: Set<string>, found: string[]): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectPrivateStrings(item, keys, found);
    }
    return;
  }
  if (!value || typeof value !== "object") {
    return;
  }
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (keys.has(key) || SECRET_KEY.test(key)) {
      if (typeof nested === "string" && nested.length > 0) {
        found.push(nested);
      }
      continue;
    }
    collectPrivateStrings(nested, keys, found);
  }
}

function redactLogged(value: unknown, keys: Set<string>, secrets: string[]): unknown {
  if (typeof value === "string") {
    return scrubText(value, secrets);
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactLogged(item, keys, secrets));
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  const result: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    result[key] = keys.has(key) || SECRET_KEY.test(key) ? "[redacted]" : redactLogged(nested, keys, secrets);
  }
  return result;
}

function scrubText(text: string, secrets: string[]): string {
  let next = text;
  for (const secret of secrets) {
    if (secret.length >= 4 || next.trim() === secret) {
      next = next.split(secret).join("[redacted]");
    }
  }
  return next;
}

function durationMs(startedAt: string | null, completedAt: string | null): number | null {
  if (!startedAt || !completedAt) {
    return null;
  }
  const duration = new Date(completedAt).getTime() - new Date(startedAt).getTime();
  return Number.isFinite(duration) ? Math.max(0, duration) : null;
}
