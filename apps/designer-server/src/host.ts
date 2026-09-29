import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { ModelProvider, WorkflowDefinitionDocument } from "@drassos/core";
import { validateWorkflowDefinition, WorkflowDefinitionRegistry } from "@drassos/core";
import { createApi, listenApi } from "@drassos/api";
import { createDrassos, installWorkflowDefinition, runInlineActivity, ScriptActivityError, type Drassos, type WorkflowDefinition as ExecutableWorkflow } from "@drassos/engine";
import { projectExecution, revisionOf, type WorkflowDefinition } from "@drassos/designer-model";
import {
  approvalDefinition,
  fraudAgent,
  orderModel,
  orderProcessingDefinition,
  sampleActivities,
} from "../../../examples/order-processing/src/sample.ts";

interface StoredWorkflow {
  definition: WorkflowDefinition;
  revision: string;
}

export interface DesignerHost {
  url: string;
  consoleUrl?: string;
  stop: () => Promise<void>;
  engine: Drassos;
}

export async function createDesignerHost(options: { port?: number; consolePort?: number } = {}): Promise<DesignerHost> {
  const registry = new WorkflowDefinitionRegistry();
  const executables = new Map<string, ExecutableWorkflow>();
  for (const [id, handler] of Object.entries(sampleActivities)) {
    registry.registerActivity(id, handler, { name: id });
  }
  registry.registerAgent("fraud.analyze", fraudAgent, {
    name: "Fraud Analysis",
    description: "Scores whether an order looks risky.",
  });
  registry.registerSignal("approval.granted", { name: "Approval granted" });

  const engine = await createDrassos({
    inMemory: true,
    allowReplace: true,
    logLevel: "silent",
    pollMs: 20,
    models: { scripted: orderModel as ModelProvider },
  });
  await engine.startWorker();
  const saved = new Map<string, StoredWorkflow>();

  const install = (definition: WorkflowDefinition): void => {
    installWorkflowDefinition(engine, registry, definition as WorkflowDefinitionDocument, executables);
    saved.set(storageKey(definition.id, definition.version), {
      definition,
      revision: revisionOf(definition),
    });
  };

  install(orderProcessingDefinition() as WorkflowDefinition);
  install(approvalDefinition() as WorkflowDefinition);

  const server = createServer(async (request, response) => {
    try {
      await route(request, response, { engine, registry, saved, install });
    } catch (error) {
      send(response, 500, {
        origin: "Designer Server",
        message: error instanceof Error ? error.message : "Designer server failed",
      });
    }
  });

  await new Promise<void>((resolve) => {
    server.listen(options.port ?? 0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  const consoleServer = options.consolePort === undefined ? undefined : await listenApi(createApi({ drassos: engine }), { port: options.consolePort });
  return {
    url: `http://127.0.0.1:${port}`,
    consoleUrl: consoleServer ? `http://127.0.0.1:${consoleServer.port}` : undefined,
    engine,
    stop: async () => {
      await consoleServer?.close();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
      await engine.stop();
    },
  };
}

async function route(
  request: IncomingMessage,
  response: ServerResponse,
  context: {
    engine: Drassos;
    registry: WorkflowDefinitionRegistry;
    saved: Map<string, StoredWorkflow>;
    install: (definition: WorkflowDefinition) => void;
  },
): Promise<void> {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  const path = url.pathname;
  if (request.method === "OPTIONS") {
    send(response, 204, null);
    return;
  }
  if (request.method === "GET" && path === "/api/health") {
    send(response, 200, { ok: true });
    return;
  }
  if (request.method === "GET" && path === "/api/workflows") {
    const workflows = context.registry.listWorkflowDefinitions();
    const known = new Set(workflows.map((item) => `${item.id}@${item.version}`));
    for (const stored of context.saved.values()) {
      const key = `${stored.definition.id}@${stored.definition.version}`;
      if (known.has(key)) continue;
      workflows.push({
        id: stored.definition.id,
        name: stored.definition.name,
        description: stored.definition.description,
        version: stored.definition.version,
        schemaVersion: stored.definition.schemaVersion,
      });
    }
    send(response, 200, { workflows });
    return;
  }
  if (request.method === "GET" && path.startsWith("/api/workflows/")) {
    const id = decodeURIComponent(path.slice("/api/workflows/".length));
    const version = url.searchParams.get("version") ?? undefined;
    // The saved document is the latest editor save, including a workflow that
    // could not be installed because an activity is not implemented yet.
    const stored = storedWorkflow(context.saved, id, version);
    if (stored) {
      send(response, 200, { definition: stored.definition, revision: stored.revision });
      return;
    }
    try {
      const definition = context.registry.getWorkflowDefinition(id, version) as WorkflowDefinition;
      send(response, 200, { definition, revision: revisionOf(definition) });
    } catch (error) {
      send(response, 404, { origin: "Drassos Engine", message: error instanceof Error ? error.message : "Workflow not found" });
    }
    return;
  }
  if (request.method === "PUT" && path === "/api/workflows") {
    const body = (await readJson(request)) as { definition?: WorkflowDefinition; revision?: string };
    if (!body.definition?.id || !body.definition.version) {
      send(response, 400, { origin: "Designer", message: "A workflow id and version are required" });
      return;
    }
    const existing = context.saved.get(storageKey(body.definition.id, body.definition.version));
    if (existing && body.revision !== existing.revision) {
      send(response, 409, {
        origin: "Designer Server",
        message: "This workflow changed since you opened it. Reload before saving.",
      });
      return;
    }
    const diagnostics = validateWorkflowDefinition(body.definition as WorkflowDefinitionDocument, context.registry);
    if (diagnostics.some((item) => item.severity === "error")) {
      context.saved.set(storageKey(body.definition.id, body.definition.version), {
        definition: body.definition,
        revision: revisionOf(body.definition),
      });
      send(response, 200, { revision: revisionOf(body.definition) });
      return;
    }
    try {
      context.install(body.definition);
    } catch (error) {
      send(response, 422, { origin: "Drassos Engine", message: error instanceof Error ? error.message : "Save failed" });
      return;
    }
    send(response, 200, { revision: revisionOf(body.definition) });
    return;
  }
  if (request.method === "POST" && path === "/api/validate") {
    const body = (await readJson(request)) as { definition?: WorkflowDefinition };
    if (!body.definition) {
      send(response, 400, { origin: "Designer", message: "definition is required" });
      return;
    }
    send(response, 200, {
      diagnostics: validateWorkflowDefinition(body.definition as WorkflowDefinitionDocument, context.registry),
    });
    return;
  }
  if (request.method === "GET" && path === "/api/capabilities") {
    send(response, 200, {
      activities: context.registry.listActivities(),
      agents: context.registry.listAgents(),
      signals: context.registry.listSignals(),
      workflows: context.registry.listWorkflows(),
    });
    return;
  }
  if (request.method === "POST" && path === "/api/activities/test") {
    const body = (await readJson(request)) as {
      language?: string;
      source?: string;
      input?: unknown;
      activityId?: string;
      grants?: { connectors?: string[]; secrets?: string[] };
      connectors?: Record<string, Record<string, unknown>>;
      secretValues?: Record<string, string>;
      contract?: { input?: Record<string, { type?: string }>; output?: Record<string, { type?: string }> };
    };
    if ((body.language !== "inline-typescript" && body.language !== "inline-javascript") || typeof body.source !== "string") {
      send(response, 400, { origin: "Designer", message: "language and source are required" });
      return;
    }
    try {
      const result = await runInlineActivity({
        language: body.language,
        source: body.source,
        input: body.input ?? {},
        activity: { id: body.activityId ?? "activity" },
        grants: body.grants,
        connectors: body.connectors,
        secretValues: body.secretValues,
        contract: body.contract,
      });
      send(response, 200, { ...result, error: null });
    } catch (error) {
      if (error instanceof ScriptActivityError) {
        send(response, 200, {
          output: null,
          logs: error.logs,
          durationMs: error.durationMs,
          error: { name: error.name, message: error.message, code: error.code },
        });
        return;
      }
      send(response, 500, { origin: "Designer Server", message: error instanceof Error ? error.message : "Activity test failed" });
    }
    return;
  }
  if (request.method === "POST" && path === "/api/runs") {
    const body = (await readJson(request)) as { workflowId?: string; version?: string; input?: unknown };
    if (!body.workflowId) {
      send(response, 400, { origin: "Designer", message: "workflowId is required" });
      return;
    }
    const stored = storedWorkflow(context.saved, body.workflowId, body.version);
    let definition: WorkflowDefinition;
    if (stored) {
      definition = stored.definition;
    } else {
      try {
        definition = context.registry.getWorkflowDefinition(body.workflowId, body.version) as WorkflowDefinition;
      } catch (error) {
        send(response, 404, { origin: "Drassos Engine", message: error instanceof Error ? error.message : "Workflow not found" });
        return;
      }
    }
    const diagnostics = validateWorkflowDefinition(definition as WorkflowDefinitionDocument, context.registry);
    if (diagnostics.some((item) => item.severity === "error")) {
      send(response, 422, { origin: "Definition Validation", message: "Fix validation errors before running", diagnostics });
      return;
    }
    try {
      const run = await context.engine.executor.startRun(definition.id, body.input ?? {}, undefined, { version: definition.version });
      send(response, 201, await snapshot(context.engine, context.saved, run.id, definition.id, definition.version));
    } catch (error) {
      send(response, 502, { origin: "Drassos Engine", message: error instanceof Error ? error.message : "Execution failed to start" });
    }
    return;
  }
  const signalMatch = path.match(/^\/api\/runs\/([^/]+)\/signal$/);
  if (request.method === "POST" && signalMatch) {
    const body = (await readJson(request)) as { name?: string; payload?: unknown };
    if (!body.name) {
      send(response, 400, { origin: "Designer", message: "signal name is required" });
      return;
    }
    try {
      await context.engine.signal(decodeURIComponent(signalMatch[1]!), body.name, body.payload ?? {});
      send(response, 202, { ok: true });
    } catch (error) {
      send(response, 409, { origin: "Drassos Engine", message: error instanceof Error ? error.message : "Signal was rejected" });
    }
    return;
  }
  const eventsMatch = path.match(/^\/api\/runs\/([^/]+)\/events$/);
  if (request.method === "GET" && eventsMatch) {
    await streamEvents(request, response, context.engine, context.saved, decodeURIComponent(eventsMatch[1]!), url.searchParams.get("afterSeq"));
    return;
  }
  const runMatch = path.match(/^\/api\/runs\/([^/]+)$/);
  if (request.method === "GET" && runMatch) {
    const runId = decodeURIComponent(runMatch[1]!);
    const run = await context.engine.store.getRun(runId);
    if (!run) {
      send(response, 404, { origin: "Drassos Engine", message: "Execution not found" });
      return;
    }
    send(response, 200, await snapshot(context.engine, context.saved, run.id, run.workflowName, run.workflowVersion));
    return;
  }
  send(response, 404, { origin: "Designer Server", message: "Not found" });
}

async function snapshot(
  engine: Drassos,
  saved: Map<string, StoredWorkflow>,
  executionId: string,
  workflowId: string,
  workflowVersion: string,
) {
  const run = await engine.store.getRun(executionId);
  const steps = await engine.store.listSteps(executionId);
  const history = await engine.store.listHistory(executionId);
  const stored = saved.get(storageKey(workflowId, workflowVersion));
  return projectExecution({
    executionId,
    workflowId,
    workflowVersion,
    status: run?.status ?? "PENDING",
    output: run?.output ?? null,
    error: run?.error ?? null,
    nodeIds: stored?.definition.nodes.map((node) => node.id) ?? [],
    steps: steps.map((step) => ({
      name: step.name,
      status: step.status,
      attempt: step.attempt,
      input: step.input,
      output: step.output,
      error: step.error,
      startedAt: step.startedAt,
      completedAt: step.completedAt,
    })),
    history: history.map((event) => ({
      seq: event.seq,
      type: event.type,
      timestamp: event.timestamp,
      payload: event.payload,
    })),
    definition: stored?.definition,
  });
}

async function streamEvents(
  request: IncomingMessage,
  response: ServerResponse,
  engine: Drassos,
  saved: Map<string, StoredWorkflow>,
  executionId: string,
  afterSeq: string | null,
): Promise<void> {
  const run = await engine.store.getRun(executionId);
  if (!run) {
    send(response, 404, { origin: "Drassos Engine", message: "Execution not found" });
    return;
  }
  response.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "keep-alive",
    "access-control-allow-origin": "*",
  });
  let last = Number(afterSeq ?? 0);
  let closed = false;
  request.on("close", () => {
    closed = true;
  });
  while (!closed) {
    const view = await snapshot(engine, saved, executionId, run.workflowName, run.workflowVersion);
    for (const event of view.events) {
      if (event.seq <= last) {
        continue;
      }
      response.write(`data: ${JSON.stringify(event)}\n\n`);
      last = event.seq;
    }
    if (view.status === "COMPLETED" || view.status === "FAILED" || view.status === "CANCELLED") {
      response.write(`data: ${JSON.stringify({ type: "designer.snapshot", seq: last, status: view.status, output: view.output, error: view.error, nodes: view.nodes })}\n\n`);
      response.end();
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  response.end();
}

function storageKey(id: string, version: string): string {
  return `${id}@${version}`;
}

function storedWorkflow(saved: Map<string, StoredWorkflow>, id: string, version?: string): StoredWorkflow | undefined {
  return [...saved.values()].find((item) => item.definition.id === id && (!version || item.definition.version === version));
}

function send(response: ServerResponse, status: number, body: unknown): void {
  const payload = body === null ? "" : JSON.stringify(body);
  response.writeHead(status, {
    "content-type": body === null ? "text/plain" : "application/json",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,PUT,OPTIONS",
    "access-control-allow-headers": "content-type",
  });
  response.end(payload);
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) {
    return {};
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
