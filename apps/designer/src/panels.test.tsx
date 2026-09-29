/** @vitest-environment happy-dom */
import { useState } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createWorkflowDraft, insertNodeOnEdge, setSchemaField, updateNode, type DesignerExecutionEvent, type NodeExecutionView, type WorkflowDefinition, type WorkflowDiagnostic } from "@drassos/designer-model";
import { Explorer, Inspector, Output, Palette, Problems, Properties, RunDialog, Timeline, toFlow } from "@drassos/designer-ui";

afterEach(() => {
  cleanup();
});

describe("designer panels", () => {
  it("lists workflows and asks to open one", async () => {
    const onOpen = vi.fn();
    render(
      <Explorer
        workflows={[{ id: "order-processing", name: "Order Processing", version: "1.0.0", schemaVersion: "1" }]}
        activeId="order-processing"
        dirty
        onOpen={onOpen}
        onCreate={() => undefined}
        onRefresh={() => undefined}
      />,
    );
    expect(screen.getByText("Order Processing *")).toBeTruthy();
    expect(screen.getByText("order-processing · 1.0.0")).toBeTruthy();
    await userEvent.click(screen.getByText("Order Processing *"));
    expect(onOpen).toHaveBeenCalledOnce();
    cleanup();
    render(
      <Explorer
        workflows={[{ id: "greet", name: "greet", version: "1", schemaVersion: "1", source: "code", description: "Registered from application code" }]}
        dirty={false}
        onOpen={() => undefined}
        onCreate={() => undefined}
        onRefresh={() => undefined}
      />,
    );
    expect(screen.getByText("greet · 1 · code")).toBeTruthy();
    expect(screen.getByText("Registered from application code")).toBeTruthy();
  });

  it("offers the v0.1 node palette", () => {
    render(<Palette />);
    for (const label of ["Start", "End", "Activity", "Agent", "Condition", "Wait", "Signal", "Child Workflow"]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  it("edits an activity mapping from registered capabilities", async () => {
    const onMapping = vi.fn();
    const definition = createWorkflowDraft({ id: "orders", name: "Orders", version: "1.0.0" });
    definition.nodes[0] = {
      id: "validate",
      type: "activity",
      name: "Validate Order",
      config: { activity: "orders.validate", input: { orderId: { source: "input", path: "orderId" } } },
    };
    render(
      <Properties
        definition={definition}
        node={definition.nodes[0]!}
        activities={[{ id: "orders.validate", name: "orders.validate", description: "Validate an order" }]}
        agents={[]}
        workflows={[]}
        onWorkflow={() => undefined}
        onSchema={() => undefined}
        onNode={() => undefined}
        onMapping={onMapping}
        onCondition={() => undefined}
      />,
    );
    expect(screen.getByDisplayValue("orders.validate")).toBeTruthy();
    expect(screen.getByText("Validate an order")).toBeTruthy();
    await userEvent.selectOptions(screen.getByLabelText("orderId source"), "literal");
    expect(onMapping).toHaveBeenCalledWith("validate", "orderId", { source: "literal", value: "" });
  });

  it("shows an activity input inherited from the previous step", async () => {
    const drafted = setSchemaField(createWorkflowDraft({ id: "orders", name: "Orders", version: "1" }), "inputs", "quantity", { type: "number" });
    const inserted = insertNodeOnEdge(drafted, "start-to-end", "activity", { x: 280, y: 160 }, "Price");
    if ("error" in inserted) {
      throw new Error(inserted.error);
    }
    const node = inserted.definition.nodes.find((item) => item.id === inserted.nodeId)!;
    render(
      <Properties
        definition={inserted.definition}
        node={node}
        activities={[]}
        agents={[]}
        workflows={[]}
        onWorkflow={() => undefined}
        onSchema={() => undefined}
        onNode={() => undefined}
        onMapping={() => undefined}
        onCondition={() => undefined}
      />,
    );
    expect(screen.getByText(/quantity number/)).toBeTruthy();
    expect(screen.queryByLabelText("quantity type")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Edit quantity" }));
    expect((screen.getByLabelText("quantity type") as HTMLSelectElement).value).toBe("number");
    expect((screen.getByLabelText("quantity source") as HTMLSelectElement).value).toBe("input");
    expect((screen.getByLabelText("quantity path") as HTMLInputElement).value).toBe("quantity");
  });

  it("adds and edits an input from a popup", async () => {
    const onSchema = vi.fn();
    const definition = createWorkflowDraft({ id: "orders", name: "Orders", version: "1" });
    definition.inputs = { email: { type: "string", required: true } };
    render(
      <Properties
        definition={definition}
        node={null}
        activities={[]}
        agents={[]}
        workflows={[]}
        onWorkflow={() => undefined}
        onSchema={onSchema}
        onNode={() => undefined}
        onMapping={() => undefined}
        onCondition={() => undefined}
      />,
    );
    expect(screen.getByText(/email string/)).toBeTruthy();
    expect(screen.queryByLabelText("email format")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Edit email" }));
    expect((screen.getByLabelText("Field name") as HTMLInputElement).value).toBe("email");
    expect(screen.getByLabelText("email type")).toBeTruthy();
    expect(screen.getByLabelText("email description")).toBeTruthy();
    expect(screen.getByLabelText("email required")).toBeTruthy();
    expect(screen.getByLabelText("email nullable")).toBeTruthy();
    expect(screen.getByLabelText("email private")).toBeTruthy();
    expect(screen.getByLabelText("email default")).toBeTruthy();
    expect(screen.queryByLabelText("email format")).toBeNull();
    await userEvent.click(screen.getByLabelText("email private"));
    await userEvent.click(screen.getByText("Advanced Options"));
    await userEvent.selectOptions(screen.getByLabelText("email format"), "email");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSchema).toHaveBeenCalledWith("inputs", "email", expect.objectContaining({ type: "string", format: "email", required: true, private: true }), "email");
    expect(screen.queryByLabelText("email format")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Add input" }));
    await userEvent.type(screen.getByLabelText("Field name"), "sku");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSchema).toHaveBeenCalledWith("inputs", "sku", expect.objectContaining({ type: "string", required: true }));

    cleanup();
    definition.inputs = { quantity: { type: "number", required: true } };
    render(
      <Properties
        definition={definition}
        node={null}
        activities={[]}
        agents={[]}
        workflows={[]}
        onWorkflow={() => undefined}
        onSchema={onSchema}
        onNode={() => undefined}
        onMapping={() => undefined}
        onCondition={() => undefined}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Edit quantity" }));
    expect(screen.queryByLabelText("quantity minimum")).toBeNull();
    await userEvent.click(screen.getByText("Advanced Options"));
    await userEvent.type(screen.getByLabelText("quantity minimum"), "1");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSchema).toHaveBeenCalledWith("inputs", "quantity", expect.objectContaining({ type: "number", min: 1, required: true }), "quantity");
  });

  it("copies an activity's input parameters onto its outputs", async () => {
    const onNode = vi.fn();
    const definition = createWorkflowDraft({ id: "orders", name: "Orders", version: "1" });
    definition.nodes[0] = {
      id: "price",
      type: "activity",
      name: "Price",
      config: {
        activity: "price",
        contract: {
          input: { quantity: { type: "number", required: true, min: 1 } },
          output: { note: { type: "string" } },
        },
      },
    };
    render(
      <Properties
        definition={definition}
        node={definition.nodes[0]!}
        activities={[]}
        agents={[]}
        workflows={[]}
        onWorkflow={() => undefined}
        onSchema={() => undefined}
        onNode={onNode}
        onMapping={() => undefined}
        onCondition={() => undefined}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Copy inputs to outputs" }));
    expect(onNode).toHaveBeenCalledWith("price", {
      config: {
        contract: {
          input: { quantity: { type: "number", required: true, min: 1 } },
          output: {
            note: { type: "string" },
            quantity: { type: "number", required: true, min: 1 },
          },
        },
      },
    });

    cleanup();
    definition.nodes[0] = { id: "price", type: "activity", name: "Price", config: { activity: "price", contract: { output: { note: { type: "string" } } } } };
    render(
      <Properties
        definition={definition}
        node={definition.nodes[0]!}
        activities={[]}
        agents={[]}
        workflows={[]}
        onWorkflow={() => undefined}
        onSchema={() => undefined}
        onNode={onNode}
        onMapping={() => undefined}
        onCondition={() => undefined}
      />,
    );
    expect((screen.getByRole("button", { name: "Copy inputs to outputs" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("records the worker capability when an activity implementation is chosen", async () => {
    const onNode = vi.fn();
    const definition = createWorkflowDraft({ id: "orders", name: "Orders", version: "1.0.0" });
    definition.nodes[0] = { id: "greet-node", type: "activity", name: "Greet", config: { activity: "" } };
    render(
      <Properties
        definition={definition}
        node={definition.nodes[0]!}
        activities={[{ id: "greet", name: "greet" }]}
        agents={[]}
        workflows={[]}
        onWorkflow={() => undefined}
        onSchema={() => undefined}
        onNode={onNode}
        onMapping={() => undefined}
        onCondition={() => undefined}
      />,
    );
    await userEvent.selectOptions(screen.getByLabelText("Implementation"), "greet");
    expect(onNode).toHaveBeenCalledWith("greet-node", { config: { activity: "greet", capability: "greet" } });
  });

  it("navigates from a problem to its node", async () => {
    const onSelect = vi.fn();
    const diagnostic: WorkflowDiagnostic = {
      severity: "error",
      code: "DRASSOS101",
      message: 'Unknown activity "payments.chargeCard"',
      nodeId: "charge-card",
    };
    render(<Problems diagnostics={[diagnostic]} onSelect={onSelect} />);
    await userEvent.click(screen.getByText('Unknown activity "payments.chargeCard"'));
    expect(onSelect).toHaveBeenCalledWith(diagnostic);
  });

  it("shows the event timeline in engine order and focuses a node", async () => {
    const onSelect = vi.fn();
    const events: DesignerExecutionEvent[] = [
      { executionId: "run", workflowId: "orders", workflowVersion: "1", seq: 1, type: "step.started", timestamp: "2026-09-25T12:04:01.012Z", nodeId: "validate" },
      { executionId: "run", workflowId: "orders", workflowVersion: "1", seq: 2, type: "step.completed", timestamp: "2026-09-25T12:04:01.055Z", nodeId: "validate" },
    ];
    render(<Timeline events={events} onSelect={onSelect} />);
    const items = screen.getAllByRole("button").map((button) => button.textContent);
    expect(items[0]).toContain("step.started");
    expect(items[1]).toContain("step.completed");
    await userEvent.click(screen.getAllByRole("button")[0]!);
    expect(onSelect).toHaveBeenCalledWith(events[0]);
  });

  it("inspects node execution input, output, and error", () => {
    const node: NodeExecutionView = {
      nodeId: "charge",
      status: "failed",
      attempts: 2,
      durationMs: 43,
      input: { orderId: "ORD-1" },
      output: null,
      error: { name: "PaymentGatewayUnavailable", message: "The payment provider did not respond." },
    };
    render(<Inspector node={node} />);
    expect(screen.getByText("Status: failed")).toBeTruthy();
    expect(screen.getByText("Duration: 43 ms")).toBeTruthy();
    expect(screen.getByText(/ORD-1/)).toBeTruthy();
    expect(screen.getByText(/PaymentGatewayUnavailable/)).toBeTruthy();
  });

  it("collects run input and shows a failed workflow output", async () => {
    const onRun = vi.fn();
    render(<RunDialog fields={[{ name: "orderId", type: "string" }, { name: "amount", type: "number" }]} onCancel={() => undefined} onRun={onRun} />);
    await userEvent.type(screen.getByLabelText("orderId"), "ORD-1");
    await userEvent.type(screen.getByLabelText("amount"), "42");
    await userEvent.click(screen.getByText("Run"));
    expect(onRun).toHaveBeenCalledWith({ orderId: "ORD-1", amount: 42 }, "development");
    render(<Output execution={{ executionId: "run", status: "FAILED", output: null, error: { name: "Error", message: "card declined" }, nodes: {}, events: [] }} />);
    expect(screen.getByText(/card declined/)).toBeTruthy();
  });

  it("shows inline source, generated types, and an unimplemented activity on the canvas", async () => {
    const onNode = vi.fn();
    const definition = createWorkflowDraft({ id: "orders", name: "Orders", version: "1.0.0" });
    definition.nodes.push({
      id: "price",
      type: "activity",
      name: "Calculate Price",
      config: {
        activity: "",
        contract: { input: { quantity: { type: "number" } }, output: { total: { type: "number" } } },
      },
    });
    const graph = toFlow(definition, [], {});
    expect(graph.nodes.find((node) => node.id === "price")?.data).toMatchObject({
      subtitle: "⚠ Not Implemented",
      implementation: "unimplemented",
    });
    const { rerender } = render(
      <Properties
        definition={definition}
        node={definition.nodes.find((node) => node.id === "price")!}
        activities={[]}
        agents={[]}
        workflows={[]}
        onWorkflow={() => undefined}
        onSchema={() => undefined}
        onNode={onNode}
        onMapping={() => undefined}
        onCondition={() => undefined}
        testActivity={async () => ({ output: { total: 20 }, logs: [{ level: "info", message: "priced" }], durationMs: 4, error: null })}
      />,
    );
    expect((screen.getByLabelText("Not Implemented") as HTMLInputElement).checked).toBe(true);
    await userEvent.click(screen.getByLabelText("Inline TypeScript"));
    const patch = onNode.mock.calls[0]?.[1] as { config: { activity: string; implementation: { type: string; source: string } } };
    expect(patch.config.activity).toBe("price");
    expect(patch.config.implementation.type).toBe("inline-typescript");
    expect(patch.config.implementation.source).toContain("export default async function execute");
    const node = {
      ...definition.nodes.find((item) => item.id === "price")!,
      config: { ...definition.nodes.find((item) => item.id === "price")!.config, ...patch.config },
    };
    rerender(
      <Properties
        definition={definition}
        node={node}
        activities={[]}
        agents={[]}
        workflows={[]}
        onWorkflow={() => undefined}
        onSchema={() => undefined}
        onNode={onNode}
        onMapping={() => undefined}
        onCondition={() => undefined}
        testActivity={async () => ({ output: { total: 20 }, logs: [{ level: "info", message: "priced" }], durationMs: 4, error: null })}
      />,
    );
    expect(screen.getByLabelText("Generated types").textContent).toContain("quantity: number");
    expect(screen.queryByLabelText("Inline source")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Edit source" }));
    const editor = screen.getByRole("dialog", { name: "Edit inline source" });
    expect(editor).toBeTruthy();
    const source = screen.getByLabelText("Inline source") as HTMLTextAreaElement;
    expect(source.value).toContain("export default async function execute");
    await userEvent.clear(source);
    await userEvent.type(source, "return 2;");
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog", { name: "Edit inline source" })).toBeNull();
    expect(onNode).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole("button", { name: "Edit source" }));
    await userEvent.clear(screen.getByLabelText("Inline source"));
    await userEvent.type(screen.getByLabelText("Inline source"), "return 2;");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.queryByRole("dialog", { name: "Edit inline source" })).toBeNull();
    const savedSource = onNode.mock.calls.at(-1)?.[1] as { config: { implementation: { source: string } } };
    expect(savedSource.config.implementation.source).toBe("return 2;");
    await userEvent.click(screen.getByRole("button", { name: "Run activity" }));
    expect((await screen.findByLabelText("Activity output")).textContent).toContain("20");
    expect(screen.getByText("info: priced")).toBeTruthy();
  });

  it("keeps inline source in the workflow save after the source dialog is saved", async () => {
    const drafted = createWorkflowDraft({ id: "orders", name: "Orders", version: "1" });
    drafted.nodes.push({
      id: "price",
      type: "activity",
      name: "Calculate Price",
      config: {
        activity: "price",
        implementation: { type: "inline-typescript", source: "return 1;" },
      },
    });
    const saved: WorkflowDefinition[] = [];
    function Harness() {
      const [definition, setDefinition] = useState(drafted);
      const node = definition.nodes.find((item) => item.id === "price")!;
      return (
        <>
          <button type="button" onClick={() => saved.push(definition)}>Save workflow</button>
          <Properties
            definition={definition}
            node={node}
            activities={[]}
            agents={[]}
            workflows={[]}
            onWorkflow={() => undefined}
            onSchema={() => undefined}
            onNode={(id, patch) => setDefinition((current) => updateNode(current, id, patch))}
            onMapping={() => undefined}
            onCondition={() => undefined}
          />
        </>
      );
    }
    render(<Harness />);
    expect(screen.queryByLabelText("Inline source")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Edit source" }));
    await userEvent.clear(screen.getByLabelText("Inline source"));
    await userEvent.type(screen.getByLabelText("Inline source"), "return 2;");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await userEvent.click(screen.getByRole("button", { name: "Save workflow" }));
    const activity = saved.at(-1)?.nodes.find((node) => node.id === "price");
    expect(activity?.config.implementation).toMatchObject({ type: "inline-typescript", source: "return 2;" });
  });

  it("projects definition nodes onto the canvas with layout and error marks", () => {
    const definition = createWorkflowDraft({ id: "orders", name: "Orders", version: "1.0.0" });
    const graph = toFlow(definition, [{ severity: "error", code: "DRASSOS205", message: "missing", nodeId: "end" }], { start: "completed" });
    expect(graph.nodes.map((node) => node.id)).toEqual(["start", "end"]);
    expect(graph.edges[0]).toMatchObject({ source: "start", target: "end" });
    expect(graph.nodes[0]?.position).toEqual({ x: 80, y: 160 });
    expect(graph.nodes[0]?.data).toMatchObject({ status: "completed" });
    expect(graph.nodes[1]?.data).toMatchObject({ invalid: true });
  });
});
