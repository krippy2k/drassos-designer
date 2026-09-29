/** @vitest-environment happy-dom */
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkflowDefinition } from "@drassos/designer-model";

vi.mock("@drassos/designer-client", async () => {
  const actual = await vi.importActual<typeof import("@drassos/designer-client")>("@drassos/designer-client");
  return {
    ...actual,
    connectEngine: vi.fn(async () => ({
      baseUrl: "http://127.0.0.1:3100",
      info: { engineVersion: "0.12.0", controlApiVersion: "1", workflowSchemaVersions: ["1"], features: [] },
      listWorkflows: async () => [],
      listCapabilities: async () => ({ activities: [], agents: [], signals: [], workflows: [] }),
      workers: async () => [],
      getWorkflow: async () => {
        throw new Error("engine catalog should not load this workflow");
      },
      validateWorkflow: async () => [],
      saveWorkflow: async () => {
        throw new Error("engine catalog should not save this workflow");
      },
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

import { App } from "./App.tsx";

const definition: WorkflowDefinition = {
  schemaVersion: "1",
  id: "hello",
  name: "Hello",
  version: "1",
  nodes: [
    { id: "start", type: "start", name: "Start", config: {} },
    { id: "end", type: "end", name: "End", config: {} },
  ],
  edges: [{ id: "start-to-end", source: "start", target: "end" }],
};

afterEach(() => {
  cleanup();
});

describe("designer embedded in a host", () => {
  it("loads and saves through the host callbacks", async () => {
    const loadWorkflow = vi.fn(async () => ({ definition, revision: "rev-1" }));
    const saveWorkflow = vi.fn(async () => ({ revision: "rev-2" }));
    render(
      <App
        lockedWorkflowId="hello"
        loadWorkflow={loadWorkflow}
        saveWorkflow={saveWorkflow}
        listWorkflows={async () => [{ id: "hello", name: "Hello", version: "1", schemaVersion: "1" }]}
      />,
    );
    expect(await screen.findByDisplayValue("Hello")).toBeTruthy();
    expect(loadWorkflow).toHaveBeenCalledWith("hello");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(saveWorkflow).toHaveBeenCalledWith(expect.objectContaining({ id: "hello", name: "Hello" }), "rev-1");
  });
});
