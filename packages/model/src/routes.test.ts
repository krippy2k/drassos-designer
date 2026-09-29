import { describe, expect, it } from "vitest";
import { designerHref, parseDesignerRoute } from "./routes.ts";

describe("designer routes", () => {
  it("maps project, workflow, and run urls", () => {
    expect(parseDesignerRoute("#/projects")).toEqual({ name: "projects" });
    expect(parseDesignerRoute("#/projects/p1/runs")).toEqual({ name: "project", projectId: "p1", section: "runs" });
    expect(parseDesignerRoute("#/projects/p1/resources")).toEqual({ name: "project", projectId: "p1", section: "resources" });
    expect(parseDesignerRoute("#/projects/p1/deployments")).toEqual({ name: "project", projectId: "p1", section: "deployments" });
    expect(parseDesignerRoute("#/projects/p1/workflows/orders/runs/run-1")).toEqual({
      name: "run",
      projectId: "p1",
      workflowId: "orders",
      runId: "run-1",
    });
    expect(designerHref({ name: "login" })).toBe("#/login");
  });

  it("treats an unknown location as sign-in", () => {
    expect(parseDesignerRoute("#/events/leftover")).toEqual({ name: "login" });
  });
});
