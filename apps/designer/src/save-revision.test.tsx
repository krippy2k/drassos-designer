/** @vitest-environment happy-dom */
import { useState } from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
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

const hello: WorkflowDefinition = {
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

describe("workflow save revisions", () => {
  it("does not replay a revision that an overlapping save already replaced", async () => {
    const gates: Array<() => void> = [];
    const revisions: Array<string | undefined> = [];
    render(
      <Designer
        lockedWorkflowId="hello"
        initialWorkflow={{ definition: hello, revision: "rev-1" }}
        loadWorkflow={async () => ({ definition: hello, revision: "rev-1" })}
        saveWorkflow={async (_definition, revision) => {
          const index = revisions.length;
          revisions.push(revision);
          await new Promise<void>((resolve) => {
            gates[index] = resolve;
          });
          if (index > 0) {
            throw new Error("Reload before saving. The remote workflow revision changed.");
          }
          return { revision: "rev-2" };
        }}
      />,
    );
    const save = await screen.findByRole("button", { name: "Save" });
    await act(async () => {
      save.click();
      save.click();
    });
    await waitFor(() => expect(gates[0]).toBeTypeOf("function"));
    await act(async () => {
      gates[0]!();
    });
    if (gates[1]) {
      await act(async () => {
        gates[1]!();
      });
    }
    await waitFor(() => expect(screen.queryByText(/SAVING/)).toBeNull());
    expect(revisions).toEqual(["rev-1"]);
    expect(screen.queryByText(/Reload before saving/)).toBeNull();
  });

  it("keeps the saved revision when a slower load returns the revision from before that save", async () => {
    const user = userEvent.setup();
    let finishLoad: (value: { definition: WorkflowDefinition; revision: string }) => void = () => undefined;
    let loadStarted = false;
    const revisions: Array<string | undefined> = [];
    let created: WorkflowDefinition | null = null;

    function Harness() {
      const [workflowId, setWorkflowId] = useState<string | undefined>(undefined);
      return (
        <Designer
          lockedWorkflowId={workflowId}
          onDraftCreated={(definition) => {
            created = definition;
            setWorkflowId(definition.id);
          }}
          loadWorkflow={() => {
            loadStarted = true;
            return new Promise((resolve) => {
              finishLoad = resolve;
            });
          }}
          saveWorkflow={async (_definition, revision) => {
            revisions.push(revision);
            if (revision !== undefined && revision !== "rev-2") {
              throw new Error("Reload before saving. The remote workflow revision changed.");
            }
            return { revision: "rev-2" };
          }}
        />
      );
    }

    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "New workflow" }));
    await user.type(screen.getByLabelText("Name"), "Hello");
    await user.type(screen.getByLabelText("Workflow ID"), "hello");
    await user.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => expect(loadStarted).toBe(true));
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(revisions).toEqual([undefined]));
    await act(async () => {
      finishLoad({ definition: created!, revision: "rev-1" });
    });
    const name = screen.getByLabelText("Name");
    await user.clear(name);
    await user.type(name, "Hello renamed");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(revisions).toEqual([undefined, "rev-2"]));
    expect(screen.queryByText(/Reload before saving/)).toBeNull();
  });

  it("does not save an unchanged workflow whose server revision is not a content hash", async () => {
    const user = userEvent.setup();
    const saves: string[] = [];
    const runs: string[] = [];
    render(
      <Designer
        lockedWorkflowId="hello"
        initialWorkflow={{ definition: hello, revision: "6f1c2a44-1111-2222-3333-444444444444" }}
        loadWorkflow={async () => ({ definition: hello, revision: "6f1c2a44-1111-2222-3333-444444444444" })}
        saveWorkflow={async () => {
          saves.push("saved");
          return { revision: "next" };
        }}
        startRun={async () => {
          runs.push("ran");
          return { executionId: "run-1" };
        }}
      />,
    );
    expect(await screen.findByDisplayValue("Hello")).toBeTruthy();
    expect(screen.queryAllByText("Hello *")).toHaveLength(0);
    await user.click(screen.getByRole("button", { name: "Run" }));
    await user.click(screen.getAllByRole("button", { name: "Run" }).at(-1)!);
    await waitFor(() => expect(screen.getByText(/Connect to a Drassos Engine before running/)).toBeTruthy());
    expect(saves).toEqual([]);
    expect(runs).toEqual([]);
  });
});
