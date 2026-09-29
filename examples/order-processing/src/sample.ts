import { defineAgent, defineWorkflowDefinition, number, string } from "@drassos/core";
import type { ModelProvider, ModelResponse } from "@drassos/core";

export const fraudAgent = defineAgent({
  name: "fraud-analyze",
  instructions: "Score order risk from 0 to 1.",
  model: "scripted:demo",
});

export const orderModel: ModelProvider = {
  name: "scripted",
  async generate(request): Promise<ModelResponse> {
    const text = JSON.stringify(request.messages);
    const risky = text.includes("9999");
    return { output: { riskScore: risky ? 0.95 : 0.2 }, model: "scripted:demo" };
  },
};

export function orderProcessingDefinition() {
  return defineWorkflowDefinition({
    id: "order-processing",
    name: "Order Processing",
    description: "Validates an order, scores fraud risk, then charges or rejects it.",
    version: "1.0.0",
    input: {
      orderId: string(),
      amount: number(),
    },
    output: {
      confirmationId: string({ required: false }),
      status: string(),
    },
    metadata: {
      designer: {
        nodes: {
          start: { x: 40, y: 180 },
          validate: { x: 280, y: 180 },
          fraud: { x: 540, y: 180 },
          risk: { x: 800, y: 180 },
          charge: { x: 1080, y: 80 },
          reject: { x: 1080, y: 300 },
          "approved-end": { x: 1360, y: 80 },
          "rejected-end": { x: 1360, y: 300 },
        },
      },
    },
    build: (workflow) => {
      const validate = workflow.activity("validate", {
        name: "Validate Order",
        activity: "orders.validate",
        input: {
          orderId: workflow.input("orderId"),
          amount: workflow.input("amount"),
        },
      });
      const fraud = workflow.agent("fraud", {
        name: "Fraud Analysis",
        agent: "fraud.analyze",
        input: {
          orderId: workflow.input("orderId"),
          amount: workflow.input("amount"),
        },
      });
      const risk = workflow.condition("risk", {
        name: "Risk Accepted?",
        expression: {
          type: "comparison",
          operator: "lt",
          left: fraud.output("riskScore"),
          right: workflow.literal(0.7),
        },
      });
      const charge = workflow.activity("charge", {
        name: "Charge Card",
        activity: "payments.chargeCard",
        input: {
          orderId: workflow.input("orderId"),
          amount: workflow.input("amount"),
        },
      });
      const reject = workflow.activity("reject", {
        name: "Reject Order",
        activity: "orders.reject",
        input: { orderId: workflow.input("orderId") },
      });
      const approved = workflow.end("approved-end", {
        name: "Completed",
        output: {
          confirmationId: charge.output("confirmationId"),
          status: workflow.literal("completed"),
        },
      });
      const rejected = workflow.end("rejected-end", {
        name: "Rejected",
        output: {
          status: workflow.literal("rejected"),
          orderId: reject.output("orderId"),
        },
      });
      workflow.start("start").to(validate).to(fraud).to(risk);
      risk.to(charge, { sourcePort: "true" }).to(approved);
      risk.to(reject, { sourcePort: "false" }).to(rejected);
    },
  }).definition;
}

export function approvalDefinition() {
  return defineWorkflowDefinition({
    id: "approval",
    name: "Approval",
    version: "1.0.0",
    description: "Waits for an external approval signal.",
    input: { orderId: string() },
    metadata: {
      designer: {
        nodes: {
          start: { x: 80, y: 160 },
          hold: { x: 360, y: 160 },
          end: { x: 640, y: 160 },
        },
      },
    },
    build: (workflow) => {
      const hold = workflow.signal("hold", { name: "Wait for Approval", signal: "approval.granted" });
      workflow.start("start").to(hold).to(workflow.end("end", { name: "End", output: { orderId: workflow.input("orderId") } }));
    },
  }).definition;
}

export const sampleActivities = {
  "orders.validate": (input: unknown) => {
    const record = (input ?? {}) as { orderId?: string; amount?: number };
    if (!record.orderId) {
      throw new Error("orderId is required");
    }
    return { valid: true, orderId: record.orderId, amount: record.amount ?? 0 };
  },
  "payments.chargeCard": (input: unknown) => {
    const record = (input ?? {}) as { orderId?: string; amount?: number };
    if (record.amount === 0) {
      const error = new Error("The payment provider did not respond.");
      error.name = "PaymentGatewayUnavailable";
      throw error;
    }
    return { confirmationId: `CONF-${record.orderId ?? "ORDER"}`, amount: record.amount };
  },
  "orders.reject": (input: unknown) => {
    const record = (input ?? {}) as { orderId?: string };
    return { orderId: record.orderId, rejected: true };
  },
};
