export const DESIGNER_SCHEMA_VERSION = "1";

export type Duration = string | number;

export type ValueSchemaFormat =
  | "email"
  | "url"
  | "uuid"
  | "cuid"
  | "cuid2"
  | "ulid"
  | "nanoid"
  | "datetime"
  | "date"
  | "time"
  | "duration"
  | "ip"
  | "base64"
  | "emoji";

export interface ValueSchema {
  type?: string;
  required?: boolean;
  nullable?: boolean;
  /** When true, logs and other recorded views replace this value with `[redacted]`. */
  private?: boolean;
  description?: string;
  default?: unknown;
  min?: number;
  max?: number;
  gt?: number;
  lt?: number;
  length?: number;
  multipleOf?: number;
  integer?: boolean;
  positive?: boolean;
  negative?: boolean;
  nonnegative?: boolean;
  nonpositive?: boolean;
  finite?: boolean;
  safe?: boolean;
  format?: ValueSchemaFormat;
  regex?: string;
  startsWith?: string;
  endsWith?: string;
  includes?: string;
  trim?: boolean;
  toLowerCase?: boolean;
  toUpperCase?: boolean;
  values?: string[];
  literal?: string | number | boolean;
  minDate?: string;
  maxDate?: string;
  items?: ValueSchema;
  properties?: Record<string, ValueSchema>;
  options?: ValueSchema[];
}

export type ValueReference =
  | { source: "input"; path: string }
  | { source: "node"; nodeId: string; path?: string }
  | { source: "state"; path: string }
  | { source: "literal"; value: unknown };

export type ValueMapping = Record<string, ValueReference>;

export interface ComparisonExpression {
  type: "comparison";
  operator: "eq" | "neq" | "gt" | "gte" | "lt" | "lte";
  left: ValueReference;
  right: ValueReference;
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourcePort?: string;
  targetPort?: string;
  condition?: ComparisonExpression;
  metadata?: Record<string, unknown>;
}

export interface WorkflowNode {
  id: string;
  type: string;
  name?: string;
  config: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface WorkflowDefinition {
  schemaVersion: string;
  id: string;
  name: string;
  description?: string;
  version: string;
  inputs?: Record<string, ValueSchema>;
  outputs?: Record<string, ValueSchema>;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  metadata?: Record<string, unknown>;
}

export interface WorkflowDiagnostic {
  severity: "error" | "warning";
  code: string;
  message: string;
  nodeId?: string;
  edgeId?: string;
  path?: string;
}

export interface CapabilityDescriptor {
  id: string;
  name?: string;
  description?: string;
  inputSchema?: ValueSchema;
  outputSchema?: ValueSchema;
}

export interface DesignerPoint {
  x: number;
  y: number;
}

export type NodeRunStatus = "not-started" | "running" | "completed" | "failed" | "waiting" | "retrying";

export interface NodeExecutionView {
  nodeId: string;
  status: NodeRunStatus;
  attempts: number;
  durationMs: number | null;
  input: unknown;
  output: unknown;
  error: { name: string; message: string } | null;
  workerId?: string | null;
  capability?: string | null;
  logs?: Array<{ timestamp: string; level: string | null; message: string; attempt: number | null }>;
}

export interface DesignerExecutionEvent {
  executionId: string;
  workflowId: string;
  workflowVersion: string;
  nodeId?: string;
  type: string;
  timestamp: string;
  seq: number;
  data?: unknown;
}

export interface ExecutionProjection {
  executionId: string;
  status: string;
  output: unknown;
  error: { name: string; message: string } | null;
  nodes: Record<string, NodeExecutionView>;
  events: DesignerExecutionEvent[];
}

export const PALETTE_GROUPS = [
  { id: "flow", label: "Flow", types: ["start", "end", "condition"] },
  { id: "execution", label: "Execution", types: ["activity", "agent", "resource", "child-workflow"] },
  { id: "durability", label: "Durability", types: ["wait", "signal"] },
] as const;

export const NODE_TYPE_LABELS: Record<string, string> = {
  start: "Start",
  end: "End",
  activity: "Activity",
  agent: "Agent",
  resource: "Resource",
  condition: "Condition",
  wait: "Wait",
  signal: "Signal",
  "child-workflow": "Child Workflow",
};
