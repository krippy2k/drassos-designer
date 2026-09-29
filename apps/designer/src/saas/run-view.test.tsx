/** @vitest-environment happy-dom */
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import type { WorkflowDefinition } from "@drassos/designer-model";
import { RunView } from "./RunView.tsx";

const definition: WorkflowDefinition = {
  schemaVersion: "1",
  id: "review",
  name: "Review",
  version: "1.0.0",
  nodes: [
    { id: "start", type: "start", name: "Start", config: {} },
    { id: "analyst", type: "agent", name: "Research Agent", config: { agent: "analyst" } },
    { id: "end", type: "end", name: "End", config: {} },
  ],
  edges: [
    { id: "start-analyst", source: "start", target: "analyst" },
    { id: "analyst-end", source: "analyst", target: "end" },
  ],
  metadata: { designer: { layout: { start: { x: 0, y: 0 }, analyst: { x: 220, y: 0 }, end: { x: 440, y: 0 } } } },
};

afterEach(() => cleanup());

describe("run view", () => {
  it("shows run cost on the graph and agent usage in the inspector", async () => {
    render(
      <RunView
        definition={definition}
        detail={{
          run: { id: "run-1", status: "COMPLETED", workflowVersion: "1.0.0", output: { summary: "done" }, error: null, startedAt: "2026-09-25T00:00:00.000Z", completedAt: "2026-09-25T00:00:04.210Z" },
          steps: [
            { name: "analyst", status: "COMPLETED", attempt: 2, input: { topic: "menus" }, output: { summary: "done" }, error: null, startedAt: "2026-09-25T00:00:00.000Z", completedAt: "2026-09-25T00:00:04.210Z" },
          ],
          history: [],
        }}
        usage={{
          cost: { state: "complete", amount: "0.088700", currency: "USD" },
          tokens: { input: 5240, output: 721, total: 5961 },
          events: [],
          nodes: {
            analyst: {
              cost: { state: "complete", amount: "0.088700", currency: "USD" },
              tokens: { input: 5240, output: 721, total: 5961 },
              events: [
                { id: "a", stepName: "analyst", attempt: 1, type: "llm.call", provider: "scripted", model: "demo", cost: { amount: "0.021400", currency: "USD" }, metadata: { inputTokens: 100, outputTokens: 10 } },
                { id: "b", stepName: "analyst", attempt: 2, type: "llm.call", provider: "scripted", model: "demo", cost: { amount: "0.067300", currency: "USD" }, metadata: { inputTokens: 5140, outputTokens: 711 } },
              ],
            },
          },
        }}
      />,
    );
    expect(screen.getByText("Cost: $0.088700")).toBeTruthy();
    expect(screen.getByText("$0.088700")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: /Research Agent/ }));
    expect(screen.getByText(/menus/)).toBeTruthy();
    expect(screen.getByText(/"summary": "done"/)).toBeTruthy();
    expect(screen.getByText("Input tokens: 5240")).toBeTruthy();
    expect(screen.getByText(/Attempt 1/)).toBeTruthy();
    expect(screen.getByText(/Attempt 2/)).toBeTruthy();
  });
});
