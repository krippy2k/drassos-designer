import { stringify } from "yaml";
import type { ValueSchema, WorkflowDefinition, WorkflowNode } from "./types.ts";

export type ActivityImplementationKind = "unimplemented" | "inline-typescript" | "inline-javascript" | "external";

export interface ActivityContractFields {
  input?: Record<string, ValueSchema>;
  output?: Record<string, ValueSchema>;
}

export interface ActivityTestRequest {
  language: "inline-typescript" | "inline-javascript";
  source: string;
  input: unknown;
  activityId?: string;
  contract?: ActivityContractFields;
  grants?: { connectors?: string[]; secrets?: string[] };
  connectors?: Record<string, Record<string, unknown>>;
  secretValues?: Record<string, string>;
}

export interface ActivityTestResult {
  output: unknown;
  logs: Array<{ level: string; message: string }>;
  durationMs: number;
  error: { name: string; message: string; code?: string } | null;
}

export interface ImplementationCounts {
  unimplemented: number;
  inline: number;
  external: number;
  total: number;
}

interface ImplementationRecord {
  type?: string;
  source?: string;
  activityName?: string;
}

export function implementationKind(node: WorkflowNode): ActivityImplementationKind {
  const implementation = node.config.implementation as ImplementationRecord | undefined;
  if (implementation?.type === "inline-typescript" || implementation?.type === "inline-javascript" || implementation?.type === "external" || implementation?.type === "unimplemented") {
    return implementation.type;
  }
  return typeof node.config.activity === "string" && node.config.activity ? "external" : "unimplemented";
}

export function implementationCounts(definition: WorkflowDefinition): ImplementationCounts {
  const counts: ImplementationCounts = { unimplemented: 0, inline: 0, external: 0, total: 0 };
  for (const node of definition.nodes) {
    if (node.type !== "activity") {
      continue;
    }
    counts.total += 1;
    const kind = implementationKind(node);
    if (kind === "inline-typescript" || kind === "inline-javascript") {
      counts.inline += 1;
    } else if (kind === "external") {
      counts.external += 1;
    } else {
      counts.unimplemented += 1;
    }
  }
  return counts;
}

export function activityStableId(node: WorkflowNode): string {
  const implementation = node.config.implementation as ImplementationRecord | undefined;
  if (implementation?.type === "external" && implementation.activityName) {
    return implementation.activityName;
  }
  if (typeof node.config.activity === "string" && node.config.activity) {
    return node.config.activity;
  }
  return node.id;
}

export function externalActivityName(node: WorkflowNode): string {
  return activityStableId(node);
}

export function contractOf(node: WorkflowNode): ActivityContractFields {
  const contract = node.config.contract;
  if (!contract || typeof contract !== "object" || Array.isArray(contract)) {
    return {};
  }
  return contract as ActivityContractFields;
}

export function contractTypeSource(contract: ActivityContractFields): string {
  return `${interfaceBlock("Input", contract.input)}\n\n${interfaceBlock("Output", contract.output)}\n`;
}

export function defaultInlineSource(language: "inline-typescript" | "inline-javascript", activityId: string): string {
  if (language === "inline-javascript") {
    return `export default async function execute(input, context) {\n  context.log.info(${JSON.stringify(activityId)});\n  return input;\n}\n`;
  }
  return `export default async function execute(input: Input, context: ActivityContext): Promise<Output> {\n  context.log.info(${JSON.stringify(activityId)});\n  return input;\n}\n`;
}

export function extractInlineActivity(node: WorkflowNode): { config: Record<string, unknown>; path: string; source: string } {
  const implementation = node.config.implementation as ImplementationRecord | undefined;
  if (implementation?.type !== "inline-typescript" && implementation?.type !== "inline-javascript") {
    throw new Error("Only an inline activity can be extracted");
  }
  const id = activityStableId(node);
  const path = activityPath(id, node.id, new Set());
  const source = implementation.source ?? "";
  return {
    path,
    source: source.endsWith("\n") ? source : `${source}\n`,
    config: {
      ...node.config,
      activity: id,
      capability: id,
      implementation: { type: "external", activityName: id },
    },
  };
}

export function generateNodeProject(definition: WorkflowDefinition): Record<string, string> {
  const files: Record<string, string> = {};
  const used = new Set<string>();
  const steps = definition.nodes
    .filter((node) => node.type !== "start")
    .map((node) => stepFor(node, files, used));
  files["sdk/activity.ts"] = SDK_SOURCE;
  files["package.json"] = packageJson(definition);
  files["tsconfig.json"] = TSCONFIG;
  files["README.md"] = readme(definition);
  files["drassos.yaml"] = stringify({
    apiVersion: "drassos.io/v1",
    kind: "Project",
    metadata: {
      name: definition.id,
      exportedFrom: { workflow: definition.id, version: definition.version },
    },
    entrypoint: "workflow.yaml",
  });
  const workflow = {
    apiVersion: "drassos.io/v1",
    kind: "Workflow",
    metadata: {
      name: definition.id,
      title: definition.name,
      version: definition.version,
      ...(definition.description ? { description: definition.description } : {}),
    },
    ...(definition.inputs ? { inputs: definition.inputs } : {}),
    ...(definition.outputs ? { outputs: definition.outputs } : {}),
    steps,
    edges: definition.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      ...(edge.sourcePort ? { sourcePort: edge.sourcePort } : {}),
    })),
  };
  files["workflow.yaml"] = stringify(workflow);
  files[`workflows/${safeSegment(definition.id)}.workflow.ts`] = `export const workflowId = ${JSON.stringify(definition.id)};\nexport const workflowVersion = ${JSON.stringify(definition.version)};\nexport const entrypoint = "../workflow.yaml";\n`;
  const designer = definition.metadata?.designer;
  if (designer) {
    files["designer/layout.yaml"] = stringify({ designer });
  }
  return Object.fromEntries(Object.entries(files).sort(([left], [right]) => left.localeCompare(right)));
}

export function zipTextFiles(files: Record<string, string>): Uint8Array {
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const [path, content] of Object.entries(files)) {
    const name = new TextEncoder().encode(path);
    const data = new TextEncoder().encode(content);
    const crc = crc32(data);
    const local = new Uint8Array(30 + name.length + data.length);
    write32(local, 0, 0x04034b50);
    write32(local, 14, crc);
    write32(local, 18, data.length);
    write32(local, 22, data.length);
    local[26] = name.length & 0xff;
    local[27] = (name.length >> 8) & 0xff;
    local.set(name, 30);
    local.set(data, 30 + name.length);
    locals.push(local);
    const central = new Uint8Array(46 + name.length);
    write32(central, 0, 0x02014b50);
    write32(central, 16, crc);
    write32(central, 20, data.length);
    write32(central, 24, data.length);
    central[28] = name.length & 0xff;
    central[29] = (name.length >> 8) & 0xff;
    write32(central, 42, offset);
    central.set(name, 46);
    centrals.push(central);
    offset += local.length;
  }
  const centralSize = centrals.reduce((sum, item) => sum + item.length, 0);
  const end = new Uint8Array(22);
  write32(end, 0, 0x06054b50);
  end[8] = centrals.length & 0xff;
  end[10] = centrals.length & 0xff;
  write32(end, 12, centralSize);
  write32(end, 16, offset);
  const output = new Uint8Array(offset + centralSize + end.length);
  let cursor = 0;
  for (const part of [...locals, ...centrals, end]) {
    output.set(part, cursor);
    cursor += part.length;
  }
  return output;
}

function stepFor(node: WorkflowNode, files: Record<string, string>, used: Set<string>): Record<string, unknown> {
  const config = { ...node.config };
  if (node.type === "activity") {
    const id = activityStableId(node);
    const path = activityPath(id, node.id, used);
    const kind = implementationKind(node);
    const contract = contractOf(node);
    const types = contractTypeSource(contract);
    files[`activities/${safeSegment(id)}.types.ts`] = types;
    if (Object.keys(contract.input ?? {}).length > 0) {
      files[`schemas/${safeSegment(id)}.input.json`] = `${JSON.stringify(contract.input, null, 2)}\n`;
    }
    if (Object.keys(contract.output ?? {}).length > 0) {
      files[`schemas/${safeSegment(id)}.output.json`] = `${JSON.stringify(contract.output, null, 2)}\n`;
    }
    const implementation = config.implementation as ImplementationRecord | undefined;
    if ((kind === "inline-typescript" || kind === "inline-javascript") && implementation?.source) {
      files[path] = withContractTypes(implementation.source, types);
      config.implementation = { type: kind, sourceFile: path };
    } else if (kind === "external") {
      files[path] = externalReference(id);
      config.implementation = { type: "external", activityName: id };
    } else {
      files[path] = stubSource(id, contract);
      config.implementation = { type: "unimplemented" };
    }
    files[`tests/activities/${safeSegment(id)}.test.ts`] = testSource(id, path, kind);
  }
  const step: Record<string, unknown> = {
    id: node.id,
    type: node.type,
    ...(node.name ? { name: node.name } : {}),
  };
  if (Object.keys(config).length > 0) {
    step.config = config;
  }
  return step;
}

function withContractTypes(source: string, types: string): string {
  const body = source.endsWith("\n") ? source : `${source}\n`;
  const contextImport = /\bActivityContext\b/.test(body) && !/ActivityContext[\s\S]{0,80}from\s+["']/.test(body)
    ? "import type { ActivityContext } from \"../sdk/activity.ts\";\n\n"
    : "";
  if (/\binterface\s+Input\b/.test(body) || /\binterface\s+Output\b/.test(body)) {
    return `${contextImport}${body}`;
  }
  if (!/\bInput\b/.test(body) && !/\bOutput\b/.test(body)) {
    return `${contextImport}${body}`;
  }
  return `${contextImport}${types}\n${body}`;
}

function stubSource(id: string, contract: ActivityContractFields): string {
  const input = typeName(id, "Input");
  const output = typeName(id, "Output");
  const fields = contractTypeSource(contract)
    .replace("interface Input", `interface ${input}`)
    .replace("interface Output", `interface ${output}`);
  return `import { defineActivity, type ActivityContext } from "../sdk/activity.ts";

${fields}
export const activityId = ${JSON.stringify(id)};

export default defineActivity<${input}, ${output}>({
  id: ${JSON.stringify(id)},
  name: ${JSON.stringify(id)},
  async execute(_input: ${input}, _context: ActivityContext): Promise<${output}> {
    throw new Error("Not implemented");
  },
});
`;
}

function externalReference(id: string): string {
  return `export const activityId = ${JSON.stringify(id)};\nexport const activityName = ${JSON.stringify(id)};\nexport default { activityId, activityName };\n`;
}

function testSource(id: string, activityFile: string, kind: ActivityImplementationKind): string {
  const relative = JSON.stringify(`../../${activityFile}`);
  if (kind === "unimplemented") {
    return `import test from "node:test";
import assert from "node:assert/strict";
import activity from ${relative};

const context = { log: { info() {}, warn() {}, error() {} }, connectors: {}, secrets: { get() { return ""; } }, signal: { aborted: false } };

test(${JSON.stringify(`${id} is a compilable stub`)}, async () => {
  await assert.rejects(() => activity.execute({}, context), /Not implemented/);
});

test(${JSON.stringify(`${id} preserves its stable id`)}, () => {
  assert.equal(activity.id, ${JSON.stringify(id)});
});
`;
  }
  if (kind === "external") {
    return `import test from "node:test";
import assert from "node:assert/strict";
import activity from ${relative};

test(${JSON.stringify(`${id} keeps its external id`)}, () => {
  assert.equal(activity.activityName, ${JSON.stringify(id)});
});
`;
  }
  return `import test from "node:test";
import assert from "node:assert/strict";
import activity from ${relative};

test(${JSON.stringify(`${id} keeps its inline implementation`)}, () => {
  assert.equal(typeof activity, "function");
});
`;
}

function interfaceBlock(name: string, fields: Record<string, ValueSchema> | undefined): string {
  const entries = Object.entries(fields ?? {}).sort(([left], [right]) => left.localeCompare(right));
  const body = entries.length === 0
    ? "  [key: string]: unknown;"
    : entries.map(([key, schema]) => `  ${safeField(key)}${schema.required === false ? "?" : ""}: ${tsType(schema)};`).join("\n");
  return `export interface ${name} {\n${body}\n}`;
}

function tsType(schema: ValueSchema | undefined): string {
  const base = baseTs(schema);
  return schema?.nullable ? `${base} | null` : base;
}

function baseTs(schema: ValueSchema | undefined): string {
  switch (schema?.type) {
    case "number":
    case "integer":
    case "nan":
      return "number";
    case "bigint":
      return "bigint";
    case "boolean":
      return "boolean";
    case "date":
      return "Date";
    case "enum":
      return schema.values && schema.values.length > 0 ? schema.values.map((value) => JSON.stringify(value)).join(" | ") : "string";
    case "literal":
      return JSON.stringify(schema.literal ?? "");
    case "array": {
      const item = tsType(schema.items);
      return item.includes("|") ? `(${item})[]` : `${item}[]`;
    }
    case "object":
      return objectTs(schema.properties);
    case "record":
      return `Record<string, ${tsType(schema.items)}>`;
    case "union":
      return schema.options && schema.options.length > 0 ? schema.options.map((option) => tsType(option)).join(" | ") : "unknown";
    case "any":
      return "any";
    case "unknown":
      return "unknown";
    case "null":
      return "null";
    case "undefined":
    case "void":
      return "undefined";
    case "never":
      return "never";
    default:
      return "string";
  }
}

function objectTs(properties: Record<string, ValueSchema> | undefined): string {
  const entries = Object.entries(properties ?? {});
  if (entries.length === 0) {
    return "Record<string, unknown>";
  }
  return `{ ${entries.map(([key, schema]) => `${safeField(key)}${schema.required === false ? "?" : ""}: ${tsType(schema)}`).join("; ")} }`;
}

function typeName(id: string, suffix: string): string {
  const parts = id.split(/[^A-Za-z0-9]+/).filter(Boolean);
  const base = parts.map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join("") || "Activity";
  return `${base}${suffix}`;
}

function activityPath(activityId: string, nodeId: string, used: Set<string>): string {
  const preferred = `activities/${safeSegment(activityId)}.ts`;
  if (!used.has(preferred)) {
    used.add(preferred);
    return preferred;
  }
  const fallback = `activities/${safeSegment(nodeId)}.ts`;
  used.add(fallback);
  return fallback;
}

function safeSegment(value: string): string {
  const cleaned = value.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned || "activity";
}

function safeField(value: string): string {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(value) ? value : JSON.stringify(value);
}

function packageJson(definition: WorkflowDefinition): string {
  return `${JSON.stringify({
    name: safeSegment(definition.id),
    private: true,
    type: "module",
    scripts: {
      build: "drassos validate",
      test: "node --experimental-strip-types --test tests/activities",
      validate: "drassos validate",
      package: "drassos package",
    },
  }, null, 2)}\n`;
}

function readme(definition: WorkflowDefinition): string {
  return `# ${definition.name}\n\nGenerated from Drassos Designer workflow \`${definition.id}\` version \`${definition.version}\`.\n\nActivity files under \`activities/\` keep the stable activity id used by the workflow.\nUnimplemented activities are compilable stubs. Inline activities contain the source written in Designer.\n\n\`\`\`\nnpm test\ndrassos validate\ndrassos package\n\`\`\`\n`;
}

const SDK_SOURCE = `export interface ActivityContext {
  log: {
    info(message: string): void;
    warn(message: string): void;
    error(message: string): void;
  };
  connectors: Record<string, Record<string, (input?: unknown) => Promise<unknown>>>;
  secrets: { get(name: string): string };
  signal: { aborted: boolean };
}

export interface ActivityDefinition<TInput, TOutput> {
  id: string;
  name: string;
  execute(input: TInput, context: ActivityContext): Promise<TOutput>;
}

export function defineActivity<TInput, TOutput>(definition: ActivityDefinition<TInput, TOutput>): ActivityDefinition<TInput, TOutput> {
  return definition;
}
`;

const TSCONFIG = `${JSON.stringify({
  compilerOptions: {
    target: "ES2022",
    module: "ESNext",
    moduleResolution: "Bundler",
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    allowImportingTsExtensions: true,
  },
  include: ["activities", "sdk", "tests", "workflows"],
}, null, 2)}\n`;

function write32(target: Uint8Array, offset: number, value: number): void {
  target[offset] = value & 0xff;
  target[offset + 1] = (value >>> 8) & 0xff;
  target[offset + 2] = (value >>> 16) & 0xff;
  target[offset + 3] = (value >>> 24) & 0xff;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
