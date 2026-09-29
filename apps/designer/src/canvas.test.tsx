/** @vitest-environment happy-dom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createWorkflowDraft } from "@drassos/designer-model";
import { Canvas } from "@drassos/designer-ui";

afterEach(() => {
  cleanup();
});

const handlers = {
  onSelectNode: () => undefined,
  onSelectEdge: () => undefined,
  onMove: () => undefined,
  onConnect: () => undefined,
  onDeleteNode: () => undefined,
  onDeleteEdge: () => undefined,
  onAddNode: () => undefined,
};

describe("workflow canvas during a run", () => {
  it("keeps the workflow nodes visible when execution status arrives", () => {
    const definition = createWorkflowDraft({ id: "orders", name: "Orders", version: "1.0.0" });
    const onDeleteNode = vi.fn();
    const { rerender } = render(
      <div style={{ width: 900, height: 600 }}>
        <Canvas definition={definition} diagnostics={[]} statuses={{}} {...handlers} onDeleteNode={onDeleteNode} />
      </div>,
    );
    expect(screen.getByText("Start")).toBeTruthy();
    expect(screen.getByText("End")).toBeTruthy();

    rerender(
      <div style={{ width: 900, height: 600 }}>
        <Canvas
          definition={definition}
          diagnostics={[]}
          statuses={{ start: "completed", end: "running" }}
          {...handlers}
          onDeleteNode={onDeleteNode}
        />
      </div>,
    );

    expect(screen.getByText("Start")).toBeTruthy();
    expect(screen.getByText("End")).toBeTruthy();
    expect(onDeleteNode).not.toHaveBeenCalled();
  });
});
