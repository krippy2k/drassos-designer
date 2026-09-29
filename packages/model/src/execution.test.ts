import { describe, expect, it } from "vitest";
import { projectExecution } from "./index.ts";

describe("execution projection", () => {
  it("maps engine steps and ordered history onto canvas nodes", () => {
    const view = projectExecution({
      executionId: "run-1",
      workflowId: "order-processing",
      workflowVersion: "1.0.0",
      status: "FAILED",
      output: null,
      error: { name: "Error", message: "card declined" },
      nodeIds: ["start", "validate", "charge"],
      steps: [
        {
          name: "bind-definition",
          status: "COMPLETED",
          attempt: 1,
          input: null,
          output: "{}",
          error: null,
          startedAt: "2026-09-25T12:00:00.000Z",
          completedAt: "2026-09-25T12:00:00.010Z",
        },
        {
          name: "validate",
          status: "COMPLETED",
          attempt: 1,
          input: { orderId: "ORD-1" },
          output: { valid: true },
          error: null,
          startedAt: "2026-09-25T12:00:00.012Z",
          completedAt: "2026-09-25T12:00:00.055Z",
        },
        {
          name: "charge",
          status: "RETRYING",
          attempt: 2,
          input: { amount: 10 },
          output: null,
          error: { name: "PaymentGatewayUnavailable", message: "The payment provider did not respond." },
          startedAt: "2026-09-25T12:00:01.000Z",
          completedAt: null,
        },
      ],
      history: [
        { seq: 2, type: "step.completed", timestamp: "2026-09-25T12:00:00.055Z", payload: { nodeId: "validate" } },
        { seq: 1, type: "step.started", timestamp: "2026-09-25T12:00:00.012Z", payload: { nodeId: "validate" } },
        { seq: 3, type: "step.retrying", timestamp: "2026-09-25T12:00:01.200Z", payload: { nodeId: "charge" } },
      ],
    });

    expect(view.nodes.validate).toMatchObject({ status: "completed", input: { orderId: "ORD-1" }, durationMs: 43 });
    expect(view.nodes.charge).toMatchObject({
      status: "retrying",
      attempts: 2,
      error: { name: "PaymentGatewayUnavailable", message: "The payment provider did not respond." },
    });
    expect(view.nodes.start.status).toBe("not-started");
    expect(view.nodes["bind-definition"]).toBeUndefined();
    expect(view.events.map((event) => event.seq)).toEqual([1, 2, 3]);
    expect(view.events[2]?.nodeId).toBe("charge");
    expect(view.error?.message).toBe("card declined");
  });

  it("shows a running step as waiting when the workflow is waiting", () => {
    const view = projectExecution({
      executionId: "run-2",
      workflowId: "approval",
      workflowVersion: "1.0.0",
      status: "WAITING",
      output: null,
      error: null,
      nodeIds: ["hold"],
      steps: [
        {
          name: "hold",
          status: "RUNNING",
          attempt: 1,
          input: {},
          output: null,
          error: null,
          startedAt: "2026-09-25T12:00:00.000Z",
          completedAt: null,
        },
      ],
      history: [{ seq: 1, type: "step.started", timestamp: "2026-09-25T12:00:00.000Z", payload: { nodeId: "hold" } }],
    });
    expect(view.nodes.hold?.status).toBe("waiting");
  });

  it("marks the code workflow canvas when the activity step name is not a node id", () => {
    const view = projectExecution({
      executionId: "run-3",
      workflowId: "greet",
      workflowVersion: "1",
      status: "COMPLETED",
      output: { message: "hello ada" },
      error: null,
      nodeIds: ["start", "implementation", "end"],
      codeNodeId: "implementation",
      steps: [
        {
          name: "greet",
          status: "COMPLETED",
          attempt: 1,
          input: { name: "ada" },
          output: { message: "hello ada" },
          error: null,
          startedAt: "2026-09-25T12:00:00.000Z",
          completedAt: "2026-09-25T12:00:00.040Z",
        },
      ],
      history: [{ seq: 1, type: "step.completed", timestamp: "2026-09-25T12:00:00.040Z", payload: { name: "greet" } }],
    });

    expect(view.nodes.start?.status).toBe("completed");
    expect(view.nodes.implementation).toMatchObject({
      status: "completed",
      input: { name: "ada" },
      output: { message: "hello ada" },
    });
    expect(view.nodes.end?.status).toBe("completed");
  });

  it("shows the code node as running and leaves the end unmarked while the activity is in progress", () => {
    const view = projectExecution({
      executionId: "run-4",
      workflowId: "greet",
      workflowVersion: "1",
      status: "WAITING",
      output: null,
      error: null,
      nodeIds: ["start", "implementation", "end"],
      codeNodeId: "implementation",
      steps: [
        {
          name: "greet",
          status: "RUNNING",
          attempt: 1,
          input: { name: "ada" },
          output: null,
          error: null,
          startedAt: "2026-09-25T12:00:00.000Z",
          completedAt: null,
        },
      ],
      history: [],
    });

    expect(view.nodes.start?.status).toBe("completed");
    expect(view.nodes.implementation?.status).toBe("waiting");
    expect(view.nodes.end?.status).toBe("not-started");
  });

  it("redacts private inputs and outputs in the execution view", () => {
    const view = projectExecution({
      executionId: "run-4",
      workflowId: "orders",
      workflowVersion: "1",
      status: "COMPLETED",
      output: { email: "ada@example.com", note: "ok" },
      error: null,
      nodeIds: ["lookup"],
      definition: {
        schemaVersion: "1",
        id: "orders",
        name: "Orders",
        version: "1",
        inputs: { email: { type: "string", private: true } },
        outputs: { email: { type: "string", private: true }, note: { type: "string" } },
        nodes: [{
          id: "lookup",
          type: "activity",
          config: {
            contract: {
              input: { email: { type: "string", private: true }, city: { type: "string" } },
              output: { token: { type: "string", private: true }, note: { type: "string" } },
            },
          },
        }],
        edges: [],
      },
      steps: [{
        name: "lookup",
        status: "COMPLETED",
        attempt: 1,
        input: { email: "ada@example.com", city: "Oslo", password: "hunter2" },
        output: { token: "s3cret-token", note: "ok" },
        error: null,
        startedAt: "2026-09-25T12:00:00.000Z",
        completedAt: "2026-09-25T12:00:00.010Z",
      }],
      history: [{ seq: 1, type: "step.log", timestamp: "2026-09-25T12:00:00.010Z", payload: { message: "mail ada@example.com" } }],
    });

    expect(view.nodes.lookup?.input).toEqual({ email: "[redacted]", city: "Oslo", password: "[redacted]" });
    expect(view.nodes.lookup?.output).toEqual({ token: "[redacted]", note: "ok" });
    expect(view.output).toEqual({ email: "[redacted]", note: "ok" });
    expect(view.events[0]?.data).toEqual({ message: "mail [redacted]" });
  });
});
