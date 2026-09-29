/** @vitest-environment happy-dom */
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkflowDefinition } from "@drassos/designer-model";

const getWorkflow = vi.fn(async (id: string) => {
  if (id === "greet") {
    const definition: WorkflowDefinition = {
      schemaVersion: "1",
      id: "greet",
      name: "greet",
      version: "1",
      nodes: [
        { id: "start", type: "start", name: "Start", config: {} },
        { id: "implementation", type: "code", name: "greet", config: { note: "Registered from application code" } },
        { id: "end", type: "end", name: "End", config: {} },
      ],
      edges: [
        { id: "start-implementation", source: "start", target: "implementation" },
        { id: "implementation-end", source: "implementation", target: "end" },
      ],
      metadata: { source: "code" },
    };
    return { definition, revision: "code" };
  }
  throw new Error(`Workflow definition "${id}" is not registered`);
});

vi.mock("@drassos/designer-client", async () => {
  const actual = await vi.importActual<typeof import("@drassos/designer-client")>("@drassos/designer-client");
  return {
    ...actual,
    connectEngine: vi.fn(async () => ({
      baseUrl: "http://127.0.0.1:3100",
      info: { engineVersion: "0.12.0", controlApiVersion: "1", workflowSchemaVersions: ["1"], features: [] },
      listWorkflows: async () => [
        { id: "greet", name: "greet", version: "1", schemaVersion: "1", source: "code" as const, description: "Registered from application code" },
      ],
      listCapabilities: async () => ({ activities: [], agents: [], signals: [], workflows: [] }),
      workers: async () => [],
      getWorkflow,
      validateWorkflow: async () => [],
      saveWorkflow: async () => ({ revision: "saved" }),
      runWorkflow: async () => {
        throw new Error("not used");
      },
      getExecution: async () => {
        throw new Error("not used");
      },
      signal: async () => undefined,
      cancel: async () => ({ status: "CANCELLED" }),
      logs: async () => [],
      runs: async () => [],
    })),
  };
});

import { connectEngine } from "@drassos/designer-client";
import { App } from "./App.tsx";

afterEach(() => {
  cleanup();
  getWorkflow.mockClear();
});

describe("unsaved designer workflows", () => {
  it("reopens a local draft after switching to a registered workflow", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("button", { name: /greet/ });
    expect(connectEngine).toHaveBeenCalledWith("http://127.0.0.1:3100", undefined);

    await user.click(screen.getByRole("button", { name: "New workflow" }));
    await user.type(screen.getByLabelText("Name"), "Test Workflow");
    await user.type(screen.getByLabelText("Workflow ID"), "test-workflow");
    await user.click(screen.getByRole("button", { name: "Create" }));
    expect(screen.getAllByText("Test Workflow *").length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: /greet/ }));
    expect(await screen.findByText(/registered from application code/)).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /test-workflow/ }));
    expect(screen.queryByText(/not registered/)).toBeNull();
    expect(screen.getAllByText("Test Workflow *").length).toBeGreaterThan(0);
    expect(getWorkflow).not.toHaveBeenCalledWith("test-workflow", expect.anything());
  });
});
