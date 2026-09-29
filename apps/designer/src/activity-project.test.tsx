/** @vitest-environment happy-dom */
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkflowDefinition } from "@drassos/designer-model";
import { Designer } from "@drassos/designer-ui";

const definition: WorkflowDefinition = {
  schemaVersion: "1",
  id: "order-workflow",
  name: "Order Workflow",
  version: "1.0.0",
  nodes: [
    { id: "start", type: "start", name: "Start", config: {} },
    { id: "price", type: "activity", name: "Calculate Price", config: { activity: "calculate-price", implementation: { type: "unimplemented" } } },
    { id: "end", type: "end", name: "End", config: {} },
  ],
  edges: [
    { id: "start-to-price", source: "start", target: "price" },
    { id: "price-to-end", source: "price", target: "end" },
  ],
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("activity project export", () => {
  it("shows unimplemented activity counts and downloads a Node project", async () => {
    let blob: Blob | null = null;
    vi.spyOn(URL, "createObjectURL").mockImplementation((value) => {
      blob = value as Blob;
      return "blob:project";
    });
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    render(<Designer initialWorkflow={{ definition, revision: "rev-1" }} />);
    expect(await screen.findByText("1 not implemented · 0 inline · 0 external")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Export project" }));
    expect(blob).toBeTruthy();
    const text = new TextDecoder().decode(new Uint8Array(await blob!.arrayBuffer()));
    expect(text).toContain("package.json");
    expect(text).toContain("Not implemented");
    expect(text).toContain("calculate-price");
  });
});
