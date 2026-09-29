import { contractOf, externalActivityName, implementationKind } from "./activities.ts";
import type { ComparisonExpression, DesignerPoint, ValueReference, ValueSchema, WorkflowDefinition, WorkflowEdge, WorkflowNode } from "./types.ts";

export function cloneDefinition(definition: WorkflowDefinition): WorkflowDefinition {
  return structuredClone(definition);
}

export function createWorkflowDraft(input: {
  id: string;
  name: string;
  version: string;
  description?: string;
}): WorkflowDefinition {
  const definition: WorkflowDefinition = {
    schemaVersion: "1",
    id: input.id.trim(),
    name: input.name.trim(),
    description: input.description?.trim() || undefined,
    version: input.version.trim(),
    inputs: {},
    outputs: {},
    nodes: [
      { id: "start", type: "start", name: "Start", config: {} },
      { id: "end", type: "end", name: "End", config: {} },
    ],
    edges: [{ id: "start-to-end", source: "start", target: "end" }],
    metadata: { designer: { nodes: { start: { x: 80, y: 160 }, end: { x: 420, y: 160 } } } },
  };
  return definition;
}

export function readLayout(definition: WorkflowDefinition): Record<string, DesignerPoint> {
  const designer = definition.metadata?.designer;
  if (!designer || typeof designer !== "object") {
    return {};
  }
  const nodes = (designer as { nodes?: unknown }).nodes;
  if (!nodes || typeof nodes !== "object") {
    return {};
  }
  const layout: Record<string, DesignerPoint> = {};
  for (const [id, value] of Object.entries(nodes as Record<string, unknown>)) {
    if (!value || typeof value !== "object") {
      continue;
    }
    const point = value as { x?: unknown; y?: unknown };
    if (typeof point.x === "number" && typeof point.y === "number") {
      layout[id] = { x: point.x, y: point.y };
    }
  }
  return layout;
}

export function withLayout(definition: WorkflowDefinition, layout: Record<string, DesignerPoint>): WorkflowDefinition {
  const next = cloneDefinition(definition);
  const metadata = { ...(next.metadata ?? {}) };
  const designer = { ...((metadata.designer as Record<string, unknown> | undefined) ?? {}) };
  designer.nodes = layout;
  metadata.designer = designer;
  next.metadata = metadata;
  return next;
}

export function ensureLayout(definition: WorkflowDefinition): WorkflowDefinition {
  const existing = readLayout(definition);
  const missing = definition.nodes.some((node) => !existing[node.id]);
  if (!missing) {
    return definition;
  }
  const depth = new Map<string, number>();
  const start = definition.nodes.find((node) => node.type === "start") ?? definition.nodes[0];
  if (start) {
    const pending = [start.id];
    depth.set(start.id, 0);
    while (pending.length > 0) {
      const id = pending.shift()!;
      const nextDepth = (depth.get(id) ?? 0) + 1;
      for (const edge of definition.edges.filter((item) => item.source === id)) {
        if (!depth.has(edge.target)) {
          depth.set(edge.target, nextDepth);
          pending.push(edge.target);
        }
      }
    }
  }
  const columns = new Map<number, number>();
  const layout = { ...existing };
  definition.nodes.forEach((node, index) => {
    if (layout[node.id]) {
      return;
    }
    const column = depth.get(node.id) ?? index;
    const row = columns.get(column) ?? 0;
    columns.set(column, row + 1);
    layout[node.id] = { x: 80 + column * 280, y: 80 + row * 140 };
  });
  return withLayout(definition, layout);
}

export function addNode(
  definition: WorkflowDefinition,
  type: string,
  position: DesignerPoint,
  name?: string,
): { definition: WorkflowDefinition; nodeId: string } {
  const next = ensureLayout(cloneDefinition(definition));
  const nodeId = uniqueId(next, type === "child-workflow" ? "child" : type);
  const node: WorkflowNode = { id: nodeId, type, name: name ?? defaultName(type), config: defaultConfig(type) };
  next.nodes.push(node);
  const layout = readLayout(next);
  layout[nodeId] = position;
  return { definition: withLayout(next, layout), nodeId };
}

export function deleteNode(definition: WorkflowDefinition, nodeId: string): WorkflowDefinition {
  const next = cloneDefinition(definition);
  next.nodes = next.nodes.filter((node) => node.id !== nodeId);
  next.edges = next.edges.filter((edge) => edge.source !== nodeId && edge.target !== nodeId);
  const layout = readLayout(next);
  delete layout[nodeId];
  return inheritActivityInputs(withLayout(next, layout));
}

export function moveNode(definition: WorkflowDefinition, nodeId: string, position: DesignerPoint): WorkflowDefinition {
  const layout = readLayout(ensureLayout(definition));
  layout[nodeId] = { x: position.x, y: position.y };
  return withLayout(definition, layout);
}

export function addEdge(
  definition: WorkflowDefinition,
  source: string,
  target: string,
  sourcePort?: string,
): WorkflowDefinition | { error: string } {
  if (source === target) {
    return { error: "A node cannot connect to itself" };
  }
  if (!definition.nodes.some((node) => node.id === source) || !definition.nodes.some((node) => node.id === target)) {
    return { error: "Both ends of an edge must be nodes on the canvas" };
  }
  const sourceNode = definition.nodes.find((node) => node.id === source);
  if (sourceNode?.type === "end") {
    return { error: "End nodes cannot have outgoing edges" };
  }
  if (sourceNode?.type !== "condition" && definition.edges.some((edge) => edge.source === source && !edge.sourcePort)) {
    return { error: "This node already has an outgoing edge" };
  }
  if (sourceNode?.type === "condition" && sourcePort && definition.edges.some((edge) => edge.source === source && edge.sourcePort === sourcePort)) {
    return { error: `The ${sourcePort} port is already connected` };
  }
  const next = cloneDefinition(definition);
  const edge: WorkflowEdge = {
    id: uniqueEdgeId(next, source, target, sourcePort),
    source,
    target,
    sourcePort,
  };
  next.edges.push(edge);
  return inheritActivityInputs(next);
}

const NODE_WIDTH = 180;
const NODE_HEIGHT = 76;
const EDGE_HIT_PX = 28;

export function insertNodeOnEdge(
  definition: WorkflowDefinition,
  edgeId: string,
  type: string,
  position: DesignerPoint,
  name?: string,
): { definition: WorkflowDefinition; nodeId: string } | { error: string } {
  const edge = definition.edges.find((item) => item.id === edgeId);
  if (!edge) {
    return { error: "That line is no longer on the canvas" };
  }
  const removed = deleteEdge(definition, edgeId);
  const added = addNode(removed, type, position, name);
  const incoming = addEdge(added.definition, edge.source, added.nodeId, edge.sourcePort);
  if ("error" in incoming) {
    return incoming;
  }
  if (type === "end") {
    return { definition: incoming, nodeId: added.nodeId };
  }
  const outgoing = addEdge(incoming, added.nodeId, edge.target, type === "condition" ? "true" : undefined);
  if ("error" in outgoing) {
    return outgoing;
  }
  return { definition: outgoing, nodeId: added.nodeId };
}

export function edgeUnderPoint(definition: WorkflowDefinition, point: DesignerPoint, threshold = EDGE_HIT_PX): string | undefined {
  const layout = readLayout(definition);
  const onNode = definition.nodes.some((node) => {
    const origin = layout[node.id];
    return origin ? nodeContains(origin, point) : false;
  });
  if (onNode) {
    return undefined;
  }
  let closest: { id: string; distance: number } | undefined;
  for (const edge of definition.edges) {
    const source = layout[edge.source];
    const target = layout[edge.target];
    if (!source || !target) {
      continue;
    }
    const distance = distanceToSegment(point, handlePoint(source, "out"), handlePoint(target, "in"));
    if (distance <= threshold && (!closest || distance < closest.distance)) {
      closest = { id: edge.id, distance };
    }
  }
  return closest?.id;
}

function nodeContains(origin: DesignerPoint, point: DesignerPoint): boolean {
  return point.x >= origin.x && point.x <= origin.x + NODE_WIDTH && point.y >= origin.y && point.y <= origin.y + NODE_HEIGHT;
}

function handlePoint(origin: DesignerPoint, side: "out" | "in"): DesignerPoint {
  return { x: origin.x + (side === "out" ? NODE_WIDTH : 0), y: origin.y + NODE_HEIGHT / 2 };
}

function distanceToSegment(point: DesignerPoint, start: DesignerPoint, end: DesignerPoint): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) {
    return Math.hypot(point.x - start.x, point.y - start.y);
  }
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
  return Math.hypot(point.x - (start.x + t * dx), point.y - (start.y + t * dy));
}

export function deleteEdge(definition: WorkflowDefinition, edgeId: string): WorkflowDefinition {
  const next = cloneDefinition(definition);
  next.edges = next.edges.filter((edge) => edge.id !== edgeId);
  return inheritActivityInputs(next);
}

export function updateNode(
  definition: WorkflowDefinition,
  nodeId: string,
  patch: { name?: string; config?: Record<string, unknown> },
): WorkflowDefinition {
  const next = cloneDefinition(definition);
  next.nodes = next.nodes.map((node) => {
    if (node.id !== nodeId) {
      return node;
    }
    const config = patch.config ? { ...node.config, ...patch.config } : node.config;
    if (node.type === "activity" && patch.config && Object.prototype.hasOwnProperty.call(patch.config, "contract")) {
      const before = contractOf(node).input;
      const after = contractOf({ ...node, config }).input;
      if (schemaKey(before) !== schemaKey(after)) {
        config.inputsCustomized = true;
      }
    }
    return {
      ...node,
      name: patch.name ?? node.name,
      config,
    };
  });
  return inheritActivityInputs(next);
}

export function setInputMapping(
  definition: WorkflowDefinition,
  nodeId: string,
  field: string,
  reference: ValueReference | null,
): WorkflowDefinition {
  const next = cloneDefinition(definition);
  const node = next.nodes.find((item) => item.id === nodeId);
  if (!node) {
    return next;
  }
  const input = { ...((node.config.input as Record<string, ValueReference> | undefined) ?? {}) };
  if (reference) {
    input[field] = reference;
  } else {
    delete input[field];
  }
  node.config = { ...node.config, input, inputsCustomized: true };
  return inheritActivityInputs(next);
}

export function setCondition(definition: WorkflowDefinition, nodeId: string, expression: ComparisonExpression): WorkflowDefinition {
  return updateNode(definition, nodeId, { config: { expression } });
}

export function updateWorkflowDetails(
  definition: WorkflowDefinition,
  patch: { name?: string; description?: string; version?: string },
): WorkflowDefinition {
  return { ...cloneDefinition(definition), ...patch, description: patch.description === "" ? undefined : (patch.description ?? definition.description) };
}

export function setSchemaField(
  definition: WorkflowDefinition,
  kind: "inputs" | "outputs",
  name: string,
  schema: ValueSchema | null,
): WorkflowDefinition {
  const next = cloneDefinition(definition);
  const fields = { ...(next[kind] ?? {}) };
  if (schema) {
    fields[name] = schema;
  } else {
    delete fields[name];
  }
  next[kind] = fields;
  return kind === "inputs" ? inheritActivityInputs(next) : next;
}

export function nodeSubtitle(node: WorkflowNode): string {
  const config = node.config;
  if (node.type === "activity") {
    const kind = implementationKind(node);
    if (kind === "unimplemented") {
      return "⚠ Not Implemented";
    }
    if (kind === "inline-typescript") {
      return "Inline TypeScript";
    }
    if (kind === "inline-javascript") {
      return "Inline JavaScript";
    }
    return externalActivityName(node) || "External activity";
  }
  if (node.type === "agent" && typeof config.agent === "string") {
    return config.agent || "Choose an agent";
  }
  if (node.type === "signal" && typeof config.signal === "string") {
    return config.signal || "Choose a signal";
  }
  if (node.type === "wait") {
    return String(config.duration ?? config.until ?? "duration");
  }
  if (node.type === "child-workflow" && typeof config.workflow === "string") {
    return config.workflow || "Choose a workflow";
  }
  if (node.type === "resource") {
    const resource = typeof config.resource === "string" ? config.resource : "";
    const action = typeof config.action === "string" ? config.action : "";
    return resource && action ? `${resource} · ${action}` : "Choose a resource action";
  }
  if (node.type === "code") {
    return typeof config.note === "string" ? config.note : "application code";
  }
  if (node.type === "condition") {
    const expression = config.expression as ComparisonExpression | undefined;
    return expression ? `${expression.operator}` : "comparison";
  }
  return node.type;
}

function inheritActivityInputs(definition: WorkflowDefinition): WorkflowDefinition {
  let next: WorkflowDefinition | null = null;
  for (const node of definition.nodes) {
    if (!inheritsInputs(node)) {
      continue;
    }
    const first = isFirstActivity(definition, node.id);
    const predecessor = first ? undefined : predecessorId(definition, node.id);
    const outputs = first ? { ...(definition.inputs ?? {}) } : predecessor ? outputFields(definition, predecessor) : {};
    const mapping = first ? workflowInputMapping(outputs) : mappingFrom(predecessor, outputs);
    if (schemaKey(contractOf(node).input) === schemaKey(outputs) && mappingKey(node.config.input) === mappingKey(mapping)) {
      continue;
    }
    next ??= cloneDefinition(definition);
    const target = next.nodes.find((item) => item.id === node.id);
    if (!target) {
      continue;
    }
    target.config = {
      ...target.config,
      inputsCustomized: false,
      contract: { ...contractOf(target), input: structuredClone(outputs) },
      input: mapping,
    };
  }
  return next ?? definition;
}

function inheritsInputs(node: WorkflowNode): boolean {
  if (node.type !== "activity") {
    return false;
  }
  if (node.config.inputsCustomized === true) {
    return false;
  }
  if (node.config.inputsCustomized === false) {
    return true;
  }
  const hasInputSchema = Object.keys(contractOf(node).input ?? {}).length > 0;
  const mapping = node.config.input;
  const hasMapping = !!mapping && typeof mapping === "object" && !Array.isArray(mapping) && Object.keys(mapping).length > 0;
  return !hasInputSchema && !hasMapping;
}

function isFirstActivity(definition: WorkflowDefinition, activityId: string): boolean {
  const start = definition.nodes.find((node) => node.type === "start");
  if (!start) {
    return false;
  }
  const seen = new Set<string>();
  const pending = [start.id];
  while (pending.length > 0) {
    const id = pending.shift()!;
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);
    for (const edge of definition.edges) {
      if (edge.source !== id) {
        continue;
      }
      if (edge.target === activityId) {
        return true;
      }
      const target = definition.nodes.find((node) => node.id === edge.target);
      if (target && target.type !== "activity") {
        pending.push(target.id);
      }
    }
  }
  return false;
}

function workflowInputMapping(outputs: Record<string, ValueSchema>): Record<string, ValueReference> {
  return Object.fromEntries(Object.keys(outputs).map((field) => [field, { source: "input", path: field }]));
}

function predecessorId(definition: WorkflowDefinition, nodeId: string): string | undefined {
  const incoming = definition.edges.filter((edge) => edge.target === nodeId);
  return incoming.length === 1 ? incoming[0]?.source : undefined;
}

function outputFields(definition: WorkflowDefinition, nodeId: string): Record<string, ValueSchema> {
  const node = definition.nodes.find((item) => item.id === nodeId);
  if (!node) {
    return {};
  }
  if (node.type === "start") {
    return { ...(definition.inputs ?? {}) };
  }
  return { ...(contractOf(node).output ?? {}) };
}

function mappingFrom(nodeId: string | undefined, outputs: Record<string, ValueSchema>): Record<string, ValueReference> {
  if (!nodeId) {
    return {};
  }
  return Object.fromEntries(Object.keys(outputs).map((field) => [field, { source: "node", nodeId, path: field }]));
}

function schemaKey(fields: Record<string, ValueSchema> | undefined): string {
  return JSON.stringify(Object.entries(fields ?? {}).sort(([left], [right]) => left.localeCompare(right)));
}

function mappingKey(mapping: unknown): string {
  if (!mapping || typeof mapping !== "object" || Array.isArray(mapping)) {
    return "{}";
  }
  return JSON.stringify(Object.entries(mapping as Record<string, ValueReference>).sort(([left], [right]) => left.localeCompare(right)));
}

function defaultConfig(type: string): Record<string, unknown> {
  switch (type) {
    case "activity":
      return { activity: "", resources: [], inputsCustomized: false };
    case "resource":
      return { resource: "", action: "query" };
    case "agent":
      return { agent: "" };
    case "condition":
      return {
        expression: {
          type: "comparison",
          operator: "eq",
          left: { source: "literal", value: true },
          right: { source: "literal", value: true },
        },
      };
    case "wait":
      return { duration: "1s" };
    case "signal":
      return { signal: "" };
    case "child-workflow":
      return { workflow: "", awaitCompletion: true };
    default:
      return {};
  }
}

function defaultName(type: string): string {
  switch (type) {
    case "child-workflow":
      return "Child workflow";
    default:
      return type.slice(0, 1).toUpperCase() + type.slice(1);
  }
}

function uniqueId(definition: WorkflowDefinition, prefix: string): string {
  let index = 1;
  while (definition.nodes.some((node) => node.id === `${prefix}-${index}`)) {
    index += 1;
  }
  return `${prefix}-${index}`;
}

function uniqueEdgeId(definition: WorkflowDefinition, source: string, target: string, sourcePort?: string): string {
  const base = `${source}-to-${target}${sourcePort ? `-${sourcePort}` : ""}`;
  if (!definition.edges.some((edge) => edge.id === base)) {
    return base;
  }
  let index = 2;
  while (definition.edges.some((edge) => edge.id === `${base}-${index}`)) {
    index += 1;
  }
  return `${base}-${index}`;
}
