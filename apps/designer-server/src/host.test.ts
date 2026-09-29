import { afterEach, describe, expect, it } from "vitest";
import { createDesignerClient, readExecutionEvents } from "../../../packages/client/src/index.ts";
import { addEdge, addNode, createWorkflowDraft, deleteEdge, setInputMapping, updateNode } from "@drassos/designer-model";
import { createDesignerHost } from "./host.ts";

describe("designer server", () => {
  const hosts: Array<{ stop: () => Promise<void> }> = [];
  afterEach(async () => {
    while (hosts.length > 0) {
      await hosts.pop()?.stop();
    }
  });

  it("loads, edits, validates, and saves a workflow definition", async () => {
    const host = await createDesignerHost();
    hosts.push(host);
    const client = createDesignerClient(host.url);
    const listed = await client.listWorkflows();
    expect(listed.map((item) => item.id)).toEqual(expect.arrayContaining(["order-processing", "approval"]));
    const opened = await client.getWorkflow("order-processing", "1.0.0");
    expect(opened.definition.nodes.map((node) => node.id)).toContain("fraud");
    expect(opened.definition.metadata?.designer).toBeTruthy();

    let draft = createWorkflowDraft({ id: "refund", name: "Refund", version: "1.0.0" });
    draft = deleteEdge(draft, "start-to-end");
    const added = addNode(draft, "activity", { x: 240, y: 160 }, "Validate Order");
    draft = updateNode(added.definition, added.nodeId, { config: { activity: "orders.validate" } });
    draft = setInputMapping(draft, added.nodeId, "orderId", { source: "input", path: "orderId" });
    const connected = addEdge(draft, "start", added.nodeId);
    expect("error" in connected).toBe(false);
    if ("error" in connected) {
      return;
    }
    const toEnd = addEdge(connected, added.nodeId, "end");
    expect("error" in toEnd).toBe(false);
    if ("error" in toEnd) {
      return;
    }
    expect(toEnd.edges.map((edge) => [edge.source, edge.target])).toEqual([
      ["start", added.nodeId],
      [added.nodeId, "end"],
    ]);
    const diagnostics = await client.validateWorkflow(toEnd);
    expect(diagnostics.filter((item) => item.severity === "error")).toEqual([]);
    const saved = await client.saveWorkflow(toEnd);
    const reloaded = await client.getWorkflow("refund", "1.0.0");
    expect(reloaded.revision).toBe(saved.revision);
    expect(reloaded.definition.nodes.find((node) => node.id === added.nodeId)?.config.activity).toBe("orders.validate");
    await expect(client.saveWorkflow(toEnd, "stale")).rejects.toThrow(/Reload before saving/);
  });

  it("runs a workflow and reconstructs node status from engine history", async () => {
    const host = await createDesignerHost();
    hosts.push(host);
    const client = createDesignerClient(host.url);
    const started = await client.runWorkflow("order-processing", { orderId: "ORD-1", amount: 42 }, "1.0.0");
    const events = await readExecutionEvents(host.url, started.executionId);
    expect(events.some((event) => event.type === "step.completed" && event.nodeId === "validate")).toBe(true);
    expect(events.some((event) => event.nodeId === "charge")).toBe(true);
    const finished = await client.getExecution(started.executionId);
    expect(finished.status).toBe("COMPLETED");
    expect(finished.nodes.validate?.status).toBe("completed");
    expect(finished.nodes.charge?.status).toBe("completed");
    expect(finished.nodes.reject?.status).toBe("not-started");
    expect(finished.output).toMatchObject({ status: "completed" });
    expect(finished.events.map((event) => event.seq)).toEqual([...finished.events].sort((a, b) => a.seq - b.seq).map((event) => event.seq));
  });

  it("keeps a waiting execution intact when the live stream is gone", async () => {
    const host = await createDesignerHost();
    hosts.push(host);
    const client = createDesignerClient(host.url);
    const started = await client.runWorkflow("approval", { orderId: "ORD-9" }, "1.0.0");
    const waiting = await waitForStatus(client, started.executionId, "WAITING");
    expect(waiting.nodes.hold?.status).toBe("waiting");
    const controller = new AbortController();
    const streaming = readExecutionEvents(host.url, started.executionId, 0, controller.signal).catch(() => []);
    controller.abort();
    await streaming;
    const again = await client.getExecution(started.executionId);
    expect(again.nodes.hold?.status).toBe("waiting");
    expect(again.status).toBe("WAITING");
    await client.signal(started.executionId, "approval.granted", { ok: true });
    const done = await waitForStatus(client, started.executionId, "COMPLETED");
    expect(done.output).toEqual({ orderId: "ORD-9" });
    expect(done.nodes.hold?.status).toBe("completed");
  });

  it("lists a designer run on the console API for the same engine", async () => {
    const host = await createDesignerHost({ consolePort: 0 });
    hosts.push(host);
    expect(host.consoleUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    const client = createDesignerClient(host.url);
    const started = await client.runWorkflow("order-processing", { orderId: "ORD-7", amount: 42 }, "1.0.0");
    const response = await fetch(`${host.consoleUrl}/runs`);
    expect(response.ok).toBe(true);
    const body = (await response.json()) as { runs: Array<{ id: string; workflowName: string; status: string }> };
    expect(body.runs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: started.executionId, workflowName: "order-processing", status: "COMPLETED" }),
      ]),
    );
  });

  it("reports an activity failure on the node that threw", async () => {
    const host = await createDesignerHost();
    hosts.push(host);
    const client = createDesignerClient(host.url);
    const started = await client.runWorkflow("order-processing", { orderId: "ORD-0", amount: 0 }, "1.0.0");
    const failed = await waitForStatus(client, started.executionId, "FAILED");
    expect(failed.nodes.charge?.status).toBe("failed");
    expect(failed.nodes.charge?.error?.name).toBe("PaymentGatewayUnavailable");
    expect(failed.error?.message).toMatch(/payment provider/i);
  });

  it("reloads an unimplemented activity saved after the workflow was installed", async () => {
    const host = await createDesignerHost();
    hosts.push(host);
    const client = createDesignerClient(host.url);
    const draft = createWorkflowDraft({ id: "checkout", name: "Checkout", version: "1" });
    const installed = await client.saveWorkflow(draft);
    const added = addNode(draft, "activity", { x: 240, y: 160 }, "Charge");
    const saved = await client.saveWorkflow(added.definition, installed.revision);
    const reloaded = await client.getWorkflow("checkout", "1");
    expect(reloaded.definition.nodes.map((node) => node.name)).toContain("Charge");
    expect(reloaded.revision).toBe(saved.revision);
    await expect(client.runWorkflow("checkout", {}, "1")).rejects.toThrow(/validation errors/i);
  });

  it("tests an inline activity without running the workflow", async () => {
    const host = await createDesignerHost();
    hosts.push(host);
    const client = createDesignerClient(host.url);
    const result = await client.testActivity({
      language: "inline-javascript",
      source: "export default function execute(input) { return { total: input.quantity * 2 }; }",
      input: { quantity: 4 },
      activityId: "calculate-price",
    });
    expect(result.error).toBeNull();
    expect(result.output).toEqual({ total: 8 });
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});

async function waitForStatus(
  client: ReturnType<typeof createDesignerClient>,
  executionId: string,
  status: string,
): Promise<Awaited<ReturnType<typeof client.getExecution>>> {
  const started = Date.now();
  let latest = await client.getExecution(executionId);
  while (Date.now() - started < 15_000) {
    latest = await client.getExecution(executionId);
    if (latest.status === status) {
      return latest;
    }
    if (latest.status === "FAILED" && status !== "FAILED") {
      throw new Error(latest.error?.message ?? "workflow failed");
    }
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  throw new Error(`timed out waiting for ${status}, last status ${latest.status}`);
}
