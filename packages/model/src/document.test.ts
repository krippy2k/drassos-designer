import { describe, expect, it } from "vitest";
import {
  addEdge,
  addNode,
  createWorkflowDraft,
  deleteEdge,
  deleteNode,
  edgeUnderPoint,
  ensureLayout,
  insertNodeOnEdge,
  readLayout,
  revisionOf,
  setCondition,
  setInputMapping,
  setSchemaField,
  updateNode,
} from "./index.ts";

describe("workflow document editing", () => {
  it("creates a start-to-end draft and keeps layout in metadata", () => {
    const draft = createWorkflowDraft({
      id: "order-fulfillment",
      name: "Order Fulfillment",
      version: "1.0.0",
      description: "Processes a customer order.",
    });
    expect(draft.schemaVersion).toBe("1");
    expect(draft.nodes.map((node) => node.type)).toEqual(["start", "end"]);
    expect(draft.edges).toEqual([{ id: "start-to-end", source: "start", target: "end" }]);
    expect(readLayout(draft).start).toEqual({ x: 80, y: 160 });
    expect(revisionOf(draft)).toBe(revisionOf(structuredClone(draft)));
  });

  it("adds, connects, configures, and deletes nodes without dropping layout", () => {
    let definition = createWorkflowDraft({ id: "orders", name: "Orders", version: "1.0.0" });
    definition = deleteEdge(definition, "start-to-end");
    const activity = addNode(definition, "activity", { x: 300, y: 160 }, "Validate Order");
    definition = activity.definition;
    const connected = addEdge(definition, "start", activity.nodeId);
    expect("error" in connected).toBe(false);
    if ("error" in connected) {
      return;
    }
    definition = setInputMapping(connected, activity.nodeId, "orderId", { source: "input", path: "orderId" });
    definition = updateNode(definition, activity.nodeId, { config: { activity: "orders.validate" } });
    const condition = addNode(definition, "condition", { x: 560, y: 160 }, "Risk Accepted?");
    definition = condition.definition;
    definition = setCondition(definition, condition.nodeId, {
      type: "comparison",
      operator: "lt",
      left: { source: "node", nodeId: activity.nodeId, path: "riskScore" },
      right: { source: "literal", value: 0.7 },
    });
    definition = setSchemaField(definition, "inputs", "orderId", { type: "string", required: true });
    expect(readLayout(definition)[activity.nodeId]).toEqual({ x: 300, y: 160 });
    expect(definition.nodes.find((node) => node.id === activity.nodeId)?.config).toMatchObject({
      activity: "orders.validate",
      input: { orderId: { source: "input", path: "orderId" } },
    });
    definition = deleteNode(definition, activity.nodeId);
    expect(definition.nodes.some((node) => node.id === activity.nodeId)).toBe(false);
    expect(definition.edges.some((edge) => edge.source === activity.nodeId || edge.target === activity.nodeId)).toBe(false);
    expect(readLayout(definition)[activity.nodeId]).toBeUndefined();
  });

  it("rejects a self-connection and a second unconditional edge", () => {
    const definition = createWorkflowDraft({ id: "orders", name: "Orders", version: "1" });
    expect(addEdge(definition, "start", "start")).toMatchObject({ error: expect.stringMatching(/itself/) });
    expect(addEdge(definition, "start", "end")).toMatchObject({ error: expect.stringMatching(/already/) });
  });

  it("restores missing canvas positions without moving saved ones", () => {
    const definition = createWorkflowDraft({ id: "orders", name: "Orders", version: "1" });
    definition.metadata = {};
    definition.nodes.push({ id: "validate", type: "activity", config: { activity: "orders.validate" } });
    const laidOut = ensureLayout(definition);
    expect(readLayout(laidOut).validate).toBeTruthy();
    expect(readLayout(laidOut).start).toBeTruthy();
  });

  it("splits a line when a node is dropped on it", () => {
    const draft = createWorkflowDraft({ id: "orders", name: "Orders", version: "1.0.0" });
    const inserted = insertNodeOnEdge(draft, "start-to-end", "activity", { x: 280, y: 160 });
    expect("error" in inserted).toBe(false);
    if ("error" in inserted) {
      return;
    }
    expect(inserted.definition.nodes.map((node) => node.id)).toEqual(["start", "end", inserted.nodeId]);
    expect(inserted.definition.edges.map((edge) => [edge.source, edge.target, edge.sourcePort])).toEqual([
      ["start", inserted.nodeId, undefined],
      [inserted.nodeId, "end", undefined],
    ]);
    expect(readLayout(inserted.definition)[inserted.nodeId]).toEqual({ x: 280, y: 160 });
  });

  it("keeps a condition port when a node is dropped on that branch", () => {
    let definition = createWorkflowDraft({ id: "orders", name: "Orders", version: "1.0.0" });
    definition = deleteEdge(definition, "start-to-end");
    const condition = addNode(definition, "condition", { x: 200, y: 160 });
    definition = condition.definition;
    const fromStart = addEdge(definition, "start", condition.nodeId);
    if ("error" in fromStart) {
      throw new Error(fromStart.error);
    }
    const branch = addEdge(fromStart, condition.nodeId, "end", "true");
    if ("error" in branch) {
      throw new Error(branch.error);
    }
    const branchEdge = branch.edges.find((edge) => edge.sourcePort === "true");
    const inserted = insertNodeOnEdge(branch, branchEdge!.id, "signal", { x: 360, y: 80 });
    if ("error" in inserted) {
      throw new Error(inserted.error);
    }
    expect(inserted.definition.edges.map((edge) => [edge.source, edge.target, edge.sourcePort])).toEqual([
      ["start", condition.nodeId, undefined],
      [condition.nodeId, inserted.nodeId, "true"],
      [inserted.nodeId, "end", undefined],
    ]);
  });

  it("inherits an activity's inputs from the previous step until they are edited", () => {
    let definition = setSchemaField(createWorkflowDraft({ id: "orders", name: "Orders", version: "1" }), "inputs", "quantity", { type: "number", required: true });
    const price = insertNodeOnEdge(definition, "start-to-end", "activity", { x: 280, y: 160 }, "Price");
    if ("error" in price) {
      throw new Error(price.error);
    }
    definition = price.definition;
    expect(definition.nodes.find((node) => node.id === price.nodeId)?.config).toMatchObject({
      contract: { input: { quantity: { type: "number", required: true } } },
      input: { quantity: { source: "input", path: "quantity" } },
    });

    definition = updateNode(definition, price.nodeId, {
      config: { contract: { input: { quantity: { type: "number", required: true } }, output: { total: { type: "number" } } } },
    });
    const priceEdge = definition.edges.find((edge) => edge.source === price.nodeId);
    const tax = insertNodeOnEdge(definition, priceEdge!.id, "activity", { x: 520, y: 160 }, "Tax");
    if ("error" in tax) {
      throw new Error(tax.error);
    }
    definition = tax.definition;
    expect(definition.nodes.find((node) => node.id === tax.nodeId)?.config).toMatchObject({
      contract: { input: { total: { type: "number" } } },
      input: { total: { source: "node", nodeId: price.nodeId, path: "total" } },
    });

    definition = updateNode(definition, price.nodeId, {
      config: {
        contract: {
          input: { quantity: { type: "number", required: true } },
          output: { total: { type: "number" }, currency: { type: "string" } },
        },
      },
    });
    expect(definition.nodes.find((node) => node.id === tax.nodeId)?.config.input).toEqual({
      total: { source: "node", nodeId: price.nodeId, path: "total" },
      currency: { source: "node", nodeId: price.nodeId, path: "currency" },
    });

    definition = setInputMapping(definition, tax.nodeId, "total", { source: "literal", value: 1 });
    definition = updateNode(definition, price.nodeId, {
      config: {
        contract: {
          input: { quantity: { type: "number", required: true } },
          output: { total: { type: "number" } },
        },
      },
    });
    expect(definition.nodes.find((node) => node.id === tax.nodeId)?.config.input).toEqual({
      total: { source: "literal", value: 1 },
      currency: { source: "node", nodeId: price.nodeId, path: "currency" },
    });
  });

  it("copies workflow input constraints onto the first activity, including one after a wait", () => {
    let definition = setSchemaField(createWorkflowDraft({ id: "orders", name: "Orders", version: "1" }), "inputs", "email", {
      type: "string",
      format: "email",
      min: 3,
      required: true,
    });
    definition = deleteEdge(definition, "start-to-end");
    const wait = addNode(definition, "wait", { x: 240, y: 160 }, "Pause");
    definition = wait.definition;
    const fromStart = addEdge(definition, "start", wait.nodeId);
    if ("error" in fromStart) {
      throw new Error(fromStart.error);
    }
    const added = addNode(fromStart, "activity", { x: 480, y: 160 }, "Notify");
    const connected = addEdge(added.definition, wait.nodeId, added.nodeId);
    if ("error" in connected) {
      throw new Error(connected.error);
    }
    expect(connected.nodes.find((node) => node.id === added.nodeId)?.config).toMatchObject({
      contract: { input: { email: { type: "string", format: "email", min: 3, required: true } } },
      input: { email: { source: "input", path: "email" } },
    });
  });

  it("keeps an activity input that was already mapped", () => {
    let definition = setSchemaField(createWorkflowDraft({ id: "orders", name: "Orders", version: "1" }), "inputs", "quantity", { type: "number" });
    definition = deleteEdge(definition, "start-to-end");
    definition.nodes.push({
      id: "validate",
      type: "activity",
      name: "Validate",
      config: { activity: "orders.validate", input: { orderId: { source: "input", path: "orderId" } } },
    });
    const connected = addEdge(definition, "start", "validate");
    if ("error" in connected) {
      throw new Error(connected.error);
    }
    expect(connected.nodes.find((node) => node.id === "validate")?.config.input).toEqual({ orderId: { source: "input", path: "orderId" } });
  });

  it("treats a drop on the line as that line and a drop on a node as empty canvas", () => {
    const draft = createWorkflowDraft({ id: "orders", name: "Orders", version: "1.0.0" });
    expect(edgeUnderPoint(draft, { x: 340, y: 198 })).toBe("start-to-end");
    expect(edgeUnderPoint(draft, { x: 120, y: 180 })).toBeUndefined();
    expect(edgeUnderPoint(draft, { x: 340, y: 260 })).toBeUndefined();
  });
});
