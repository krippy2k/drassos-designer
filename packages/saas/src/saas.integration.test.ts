import { afterEach, describe, expect, it } from "vitest";
import { createApi, listenApi } from "@drassos/api";
import { createDrassos, defineAgent, defineApp, ScriptedAgentProvider } from "@drassos/engine";
import type { WorkflowDefinition } from "@drassos/designer-model";
import { startSaasServer } from "./server.ts";

const definition: WorkflowDefinition = {
  schemaVersion: "1",
  id: "review",
  name: "Review",
  version: "1.0.0",
  nodes: [
    { id: "start", type: "start", name: "Start", config: {} },
    { id: "analyst", type: "agent", name: "Research Agent", config: { agent: "analyst" } },
    { id: "end", type: "end", name: "End", config: { output: { summary: { source: "node", nodeId: "analyst", path: "summary" } } } },
  ],
  edges: [
    { id: "start-analyst", source: "start", target: "analyst" },
    { id: "analyst-end", source: "analyst", target: "end" },
  ],
};

describe("designer saas", () => {
  const stops: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (stops.length > 0) {
      await stops.pop()?.();
    }
  });

  it("runs an AI workflow, keeps its cost and graph, and rejects another tenant", async () => {
    const engine = await createDrassos({
      inMemory: true,
      allowReplace: true,
      logLevel: "silent",
      pollMs: 20,
      app: defineApp({
        workflows: [],
        agents: [
          defineAgent({
            name: "analyst",
            instructions: "Summarize the input.",
            provider: new ScriptedAgentProvider([
              {
                output: { summary: "done" },
                tokenInput: 12000,
                tokenOutput: 400,
                model: "scripted:demo",
                cost: { amount: "0.067300", currency: "USD" },
              },
            ]),
          }),
        ],
      }),
    });
    await engine.startWorker();
    const api = await listenApi(createApi({ drassos: engine }), { port: 0 });
    const saas = await startSaasServer({ port: 0, engineUrl: `http://127.0.0.1:${api.port}` });
    stops.push(async () => {
      await saas.close();
      await api.close();
      await engine.stop();
    });

    const alice = await call(saas.url, "POST", "/api/register", { email: "ada@example.com", password: "secret", name: "Ada" });
    const project = await call(saas.url, "POST", "/api/projects", { name: "Orders" }, alice.token);
    const created = await call(saas.url, "POST", `/api/projects/${project.id}/workflows`, { definition }, alice.token);
    const started = await call(saas.url, "POST", `/api/projects/${project.id}/workflows/review/runs`, { input: {} }, alice.token);
    const finished = await waitForRun(saas.url, alice.token, project.id, started.executionId);
    expect(finished.detail.run.status).toBe("COMPLETED");
    expect(finished.detail.run.output).toMatchObject({ summary: "done" });
    expect(finished.usage.cost).toMatchObject({ state: "complete", amount: "0.067300", currency: "USD" });
    expect(finished.usage.nodes.analyst.tokens).toMatchObject({ input: 12000, output: 400 });
    expect(finished.usage.nodes.analyst.events[0]).toMatchObject({ provider: "scripted", model: "scripted:demo", attempt: 1 });
    expect(finished.definition.nodes.map((node: { id: string }) => node.id)).toContain("analyst");

    const replaced = {
      ...definition,
      name: "Review renamed",
      nodes: [
        { id: "start", type: "start", name: "Start", config: {} },
        { id: "end", type: "end", name: "End", config: {} },
      ],
      edges: [{ id: "start-end", source: "start", target: "end" }],
    };
    await call(saas.url, "PUT", `/api/projects/${project.id}/workflows/review`, { definition: replaced, baseRevision: created.revision }, alice.token);
    const reopened = await call(saas.url, "GET", `/api/projects/${project.id}/workflows/review/runs/${started.executionId}`, undefined, alice.token);
    expect(reopened.definition.nodes.map((node: { id: string }) => node.id)).toEqual(["start", "analyst", "end"]);
    expect(reopened.usage.cost.amount).toBe("0.067300");

    const listed = await call(saas.url, "GET", `/api/projects/${project.id}/workflows/review/runs`, undefined, alice.token);
    expect(listed.runs.map((run: { id: string }) => run.id)).toContain(started.executionId);

    const grace = await call(saas.url, "POST", "/api/register", { email: "grace@example.com", password: "secret", name: "Grace" });
    const denied = await call(saas.url, "GET", `/api/projects/${project.id}/workflows/review/runs/${started.executionId}`, undefined, grace.token, true);
    expect(denied.status).toBe(404);
    const deniedProject = await call(saas.url, "GET", `/api/projects/${project.id}`, undefined, grace.token, true);
    expect(deniedProject.status).toBe(404);
  });
});

async function waitForRun(base: string, token: string, projectId: string, runId: string) {
  const started = Date.now();
  while (Date.now() - started < 8_000) {
    const body = await call(base, "GET", `/api/projects/${projectId}/workflows/review/runs/${runId}`, undefined, token);
    if (body.detail?.run?.status === "COMPLETED" || body.detail?.run?.status === "FAILED") {
      return body;
    }
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
  throw new Error("timed out waiting for the run");
}

async function call(base: string, method: string, path: string, body?: unknown, token?: string, allowError = false) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = response.status === 204 ? {} : await response.json();
  if (!response.ok) {
    if (allowError) {
      return { status: response.status, ...payload };
    }
    throw new Error(`${response.status} ${JSON.stringify(payload)}`);
  }
  return payload;
}
