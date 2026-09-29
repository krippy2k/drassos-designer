import { afterEach, describe, expect, it } from "vitest";
import { createApi, listenApi } from "@drassos/api";
import { createDrassos, defineAgent, defineApp, RemoteWorker, workflow } from "@drassos/engine";
import type { WorkflowDefinition } from "@drassos/designer-model";
import { connectEngine } from "./remote.ts";

const hello: WorkflowDefinition = {
  schemaVersion: "1",
  id: "hello-remote",
  name: "Hello Remote",
  version: "1.0.0",
  nodes: [
    { id: "start", type: "start", config: {} },
    { id: "end", type: "end", config: { output: { message: { source: "literal", value: "ok" } } } },
  ],
  edges: [{ id: "start-end", source: "start", target: "end" }],
};

const approval: WorkflowDefinition = {
  schemaVersion: "1",
  id: "remote-approval",
  name: "Remote Approval",
  version: "1.0.0",
  nodes: [
    { id: "start", type: "start", config: {} },
    { id: "hold", type: "signal", config: { signal: "approval.granted" } },
    { id: "end", type: "end", config: {} },
  ],
  edges: [
    { id: "start-hold", source: "start", target: "hold" },
    { id: "hold-end", source: "hold", target: "end" },
  ],
};

async function waitFor(fn: () => Promise<boolean>, timeoutMs = 8_000): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await fn()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("timed out");
}

describe("designer remote engine client", () => {
  const stops: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (stops.length > 0) {
      await stops.pop()?.();
    }
  });

  async function engineAt(token?: string) {
    const engine = await createDrassos({ inMemory: true, allowReplace: true, logLevel: "silent", pollMs: 20, workerToken: token });
    await engine.startWorker();
    const server = await listenApi(createApi({ drassos: engine }), { port: 0 });
    stops.push(async () => {
      await server.close();
      await engine.stop();
    });
    return `http://127.0.0.1:${server.port}`;
  }

  it("saves, runs, lists history, and rejects a stale revision", async () => {
    const base = await engineAt();
    const client = await connectEngine(base);
    expect(client.info.controlApiVersion).toBe("1");
    const saved = await client.saveWorkflow(hello);
    const listed = await client.listWorkflows();
    expect(listed.map((item) => item.id)).toContain("hello-remote");
    const loaded = await client.getWorkflow("hello-remote", "1.0.0");
    expect(loaded.revision).toBe(saved.revision);
    const started = await client.runWorkflow("hello-remote", {}, "1.0.0");
    await waitFor(async () => (await client.getExecution(started.executionId)).status === "COMPLETED");
    const finished = await client.getExecution(started.executionId);
    expect(finished.nodes.end?.status).toBe("completed");
    expect(finished.output).toMatchObject({ message: "ok" });
    const history = await client.runs("hello-remote");
    expect(history.some((run) => run.id === started.executionId && run.status === "COMPLETED")).toBe(true);
    const logs = await client.logs(started.executionId);
    expect(logs.length).toBeGreaterThan(0);
    await expect(client.saveWorkflow(hello, "stale")).rejects.toThrow(/Reload before saving/);
  });

  it("lists a code-registered workflow and runs that code", async () => {
    const greet = workflow("greet", async (ctx) => ctx.activity("greet", { name: "ada" }));
    const engine = await createDrassos({
      inMemory: true,
      allowReplace: true,
      logLevel: "silent",
      pollMs: 20,
      app: { workflows: [greet] },
    });
    await engine.startWorker();
    engine.worker.activity("greet", async () => ({ message: "hello ada" }));
    const server = await listenApi(createApi({ drassos: engine }), { port: 0 });
    stops.push(async () => {
      await server.close();
      await engine.stop();
    });
    const client = await connectEngine(`http://127.0.0.1:${server.port}`);
    const listed = await client.listWorkflows();
    expect(listed).toEqual(expect.arrayContaining([expect.objectContaining({ id: "greet", name: "greet", version: "1", source: "code" })]));
    const loaded = await client.getWorkflow("greet", "1");
    expect(loaded.definition.metadata).toMatchObject({ source: "code" });
    expect(loaded.definition.nodes.map((node) => node.name ?? node.id)).toContain("greet");
    await expect(client.saveWorkflow(loaded.definition, loaded.revision)).rejects.toThrow(/application code/);
    const started = await client.runWorkflow("greet", {}, "1");
    await waitFor(async () => (await client.getExecution(started.executionId)).status === "COMPLETED");
    const finished = await client.getExecution(started.executionId);
    expect(finished.output).toMatchObject({ message: "hello ada" });
    expect(finished.nodes.start?.status).toBe("completed");
    expect(finished.nodes.implementation?.status).toBe("completed");
    expect(finished.nodes.end?.status).toBe("completed");
  });

  it("runs a designer activity on a worker registered for that capability", async () => {
    const engine = await createDrassos({ inMemory: true, allowReplace: true, logLevel: "silent", pollMs: 20, controlPlane: true });
    await engine.startWorker();
    const server = await listenApi(createApi({ drassos: engine }), { port: 0 });
    const base = `http://127.0.0.1:${server.port}`;
    const worker = new RemoteWorker({ server: base });
    worker.step("greet", async (_ctx, input) => {
      const name = String((input as { name?: string } | null)?.name ?? "world");
      return { message: `hello ${name}` };
    });
    await worker.start();
    stops.push(async () => {
      await worker.stop();
      await server.close();
      await engine.stop();
    });
    const client = await connectEngine(base);
    const greeting: WorkflowDefinition = {
      schemaVersion: "1",
      id: "greeting",
      name: "Greeting",
      version: "1.0.0",
      nodes: [
        { id: "start", type: "start", config: {} },
        {
          id: "greet",
          type: "activity",
          name: "Greet",
          config: {
            activity: "greet",
            capability: "greet",
            input: { name: { source: "input", path: "name" } },
          },
        },
        {
          id: "end",
          type: "end",
          config: { output: { message: { source: "node", nodeId: "greet", path: "message" } } },
        },
      ],
      edges: [
        { id: "start-greet", source: "start", target: "greet" },
        { id: "greet-end", source: "greet", target: "end" },
      ],
    };
    await client.saveWorkflow(greeting);
    const started = await client.runWorkflow("greeting", { name: "Ada" }, "1.0.0");
    await waitFor(async () => (await client.getExecution(started.executionId)).status === "COMPLETED");
    const finished = await client.getExecution(started.executionId);
    expect(finished.nodes.greet?.status).toBe("completed");
    expect(finished.output).toMatchObject({ message: "hello Ada" });
  });

  it("lists an engine agent so a designer agent node can select it", async () => {
    const engine = await createDrassos({
      inMemory: true,
      allowReplace: true,
      logLevel: "silent",
      pollMs: 20,
      app: defineApp({
        workflows: [],
        agents: [defineAgent({ name: "analyst", instructions: "Summarize the input.", model: "scripted:demo" })],
      }),
    });
    await engine.startWorker();
    const server = await listenApi(createApi({ drassos: engine }), { port: 0 });
    stops.push(async () => {
      await server.close();
      await engine.stop();
    });
    const client = await connectEngine(`http://127.0.0.1:${server.port}`);
    const capabilities = await client.listCapabilities();
    expect(capabilities.agents).toEqual([expect.objectContaining({ id: "analyst", name: "analyst", description: "Summarize the input." })]);
    const diagnostics = await client.validateWorkflow({
      schemaVersion: "1",
      id: "with-agent",
      name: "With Agent",
      version: "1",
      nodes: [
        { id: "start", type: "start", config: {} },
        { id: "review", type: "agent", config: { agent: "analyst" } },
        { id: "end", type: "end", config: {} },
      ],
      edges: [
        { id: "start-review", source: "start", target: "review" },
        { id: "review-end", source: "review", target: "end" },
      ],
    });
    expect(diagnostics.filter((item) => item.severity === "error")).toEqual([]);
  });

  it("signals a waiting run, cancels another, and fails authentication", async () => {
    const base = await engineAt("secret");
    await expect(connectEngine(base)).rejects.toThrow(/Authentication failed/);
    await expect(connectEngine("http://127.0.0.1:1")).rejects.toThrow(/unavailable/);
    const client = await connectEngine(base, "secret");
    await client.saveWorkflow(approval);
    const waitingRun = await client.runWorkflow("remote-approval", {}, "1.0.0");
    await waitFor(async () => (await client.getExecution(waitingRun.executionId)).status === "WAITING");
    await client.signal(waitingRun.executionId, "approval.granted", { ok: true });
    await waitFor(async () => (await client.getExecution(waitingRun.executionId)).status === "COMPLETED");

    const second = await client.runWorkflow("remote-approval", {}, "1.0.0");
    await waitFor(async () => (await client.getExecution(second.executionId)).status === "WAITING");
    await client.cancel(second.executionId);
    await waitFor(async () => {
      const status = (await client.getExecution(second.executionId)).status;
      return status === "CANCELLED" || status === "FAILED";
    });
  });
});
