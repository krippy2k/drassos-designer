import { describe, expect, it } from "vitest";
import type { WorkflowDefinition } from "@drassos/designer-model";
import { SaasStore } from "./store.ts";

const definition: WorkflowDefinition = {
  schemaVersion: "1",
  id: "review",
  name: "Review",
  version: "1",
  nodes: [],
  edges: [],
};

describe("saas accounts and projects", () => {
  it("keeps projects, workflows, and runs inside the registering tenant", () => {
    const store = new SaasStore();
    const alice = store.register({ email: "ada@example.com", password: "secret", name: "Ada" });
    const bob = store.register({ email: "grace@example.com", password: "secret", name: "Grace" });
    const project = store.createProject(alice.user, { name: "Orders" });
    store.saveWorkflow(alice.user, project.id, definition);
    store.rememberRun(alice.user, project.id, store.getWorkflow(alice.user, project.id, "review"), "run-1");

    expect(store.listProjects(bob.user)).toEqual([]);
    expect(() => store.getProject(bob.user, project.id)).toThrow(/not found/i);
    expect(() => store.getWorkflow(bob.user, project.id, "review")).toThrow(/not found/i);
    expect(() => store.getRun(bob.user, project.id, "review", "run-1")).toThrow(/not found/i);
    expect(store.getRun(alice.user, project.id, "review", "run-1").definition.id).toBe("review");
  });

  it("rejects a wrong password and accepts a new session", () => {
    const store = new SaasStore();
    store.register({ email: "ada@example.com", password: "secret", name: "Ada" });
    expect(() => store.login({ email: "ada@example.com", password: "nope" })).toThrow(/incorrect/i);
    const session = store.login({ email: "ada@example.com", password: "secret" });
    expect(store.userForToken(session.token).email).toBe("ada@example.com");
    store.logout(session.token);
    expect(() => store.userForToken(session.token)).toThrow(/sign in/i);
  });
});
