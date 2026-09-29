/** @vitest-environment happy-dom */
import { useRef, useState } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkflowDefinition } from "@drassos/designer-model";

vi.mock("@drassos/designer-client", async () => {
  const actual = await vi.importActual<typeof import("@drassos/designer-client")>("@drassos/designer-client");
  return {
    ...actual,
    connectEngine: vi.fn(async () => {
      throw new Error("Drassos Engine is unavailable");
    }),
  };
});

import { Designer } from "@drassos/designer-ui";

const withActivity: WorkflowDefinition = {
  schemaVersion: "1",
  id: "hello",
  name: "Hello",
  version: "1",
  nodes: [
    { id: "start", type: "start", name: "Start", config: {} },
    { id: "work", type: "activity", name: "Work", config: { activity: "", resources: [] } },
    { id: "end", type: "end", name: "End", config: {} },
  ],
  edges: [
    { id: "start-work", source: "start", target: "work" },
    { id: "work-end", source: "work", target: "end" },
  ],
};

const startOnly: WorkflowDefinition = {
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

const billing: WorkflowDefinition = {
  schemaVersion: "1",
  id: "billing",
  name: "Billing",
  version: "1",
  nodes: [
    { id: "start", type: "start", name: "Start", config: {} },
    { id: "end", type: "end", name: "End", config: {} },
  ],
  edges: [{ id: "start-to-end", source: "start", target: "end" }],
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function Harness({ loadHello }: { loadHello: (saved: boolean) => Promise<{ definition: WorkflowDefinition; revision: string }> }) {
  const [workflowId, setWorkflowId] = useState("hello");
  const saved = useRef(false);
  return (
    <Designer
      lockedWorkflowId={workflowId}
      listWorkflows={async () => [
        { id: "hello", name: "Hello", version: "1", schemaVersion: "1" },
        { id: "billing", name: "Billing", version: "1", schemaVersion: "1" },
      ]}
      loadWorkflow={async (id) => {
        if (id === "billing") return { definition: billing, revision: "bill-1" };
        return loadHello(saved.current);
      }}
      saveWorkflow={async (definition) => {
        saved.current = true;
        expect(definition.nodes.some((node) => node.id === "work")).toBe(true);
        return { revision: "rev-2" };
      }}
      onOpenWorkflow={(workflow) => setWorkflowId(workflow.id)}
    />
  );
}

describe("saved unimplemented activities", () => {
  it("keeps the activity when switching workflows reloads an older copy", async () => {
    const user = userEvent.setup();
    render(
      <Harness
        loadHello={async (saved) => (saved ? { definition: startOnly, revision: "rev-1" } : { definition: withActivity, revision: "rev-1" })}
      />,
    );
    expect(await screen.findByText("1 not implemented · 0 inline · 0 external")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Save" }));
    await user.click(screen.getByRole("button", { name: /billing · 1/i }));
    expect(await screen.findByDisplayValue("Billing")).toBeTruthy();
    expect(screen.queryByText("1 not implemented · 0 inline · 0 external")).toBeNull();
    await user.click(screen.getByRole("button", { name: /hello · 1/i }));
    expect(await screen.findByText("1 not implemented · 0 inline · 0 external")).toBeTruthy();
    expect(screen.getByDisplayValue("Hello")).toBeTruthy();
  });

  it("shows the activity again when the reloaded workflow is the saved copy", async () => {
    const user = userEvent.setup();
    const stored = new Map<string, { definition: WorkflowDefinition; revision: string }>([
      ["hello", { definition: withActivity, revision: "rev-1" }],
      ["billing", { definition: billing, revision: "bill-1" }],
    ]);
    render(
      <Harness
        loadHello={async () => stored.get("hello")!}
      />,
    );
    expect(await screen.findByText("1 not implemented · 0 inline · 0 external")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Save" }));
    stored.set("hello", { definition: structuredClone(withActivity), revision: "rev-2" });
    await user.click(screen.getByRole("button", { name: /billing · 1/i }));
    expect(await screen.findByDisplayValue("Billing")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /hello · 1/i }));
    expect(await screen.findByText("1 not implemented · 0 inline · 0 external")).toBeTruthy();
  });
});
