/** @vitest-environment happy-dom */
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Properties } from "@drassos/designer-ui";
import { Resources } from "./Resources.tsx";
import { RunView, type UsageReport } from "./RunView.tsx";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("project resources", () => {
  it("creates a postgres resource from a dialog and keeps the password off the page", async () => {
    const requests: Array<{ path: string; body?: unknown }> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      requests.push({ path, body });
      if (path.endsWith("/secrets") && init?.method === "POST") {
        return json({ id: "secret-1", name: "db-password" }, 201);
      }
      if (path.endsWith("/resources") && init?.method === "POST") {
        return json({ key: body.key }, 201);
      }
      if (path.endsWith("/actions") && init?.method === "POST") {
        return json({ name: body.name }, 201);
      }
      if (path.endsWith("/secrets")) {
        return json({ secrets: [] });
      }
      if (requests.filter((item) => item.path.endsWith("/resources") && item.body).length > 0) {
        return json({
          resources: [{
            key: "customer-db",
            actions: [{ name: "find-user-by-email", sql: "SELECT id FROM users WHERE email = $1" }],
            bindings: [
              { environment: "development", host: "localhost", database: "app", username: "app", secretName: "db-password", policy: { action: true, client: true, direct: false } },
              { environment: "production", host: "prod-db", database: "app", username: "app", secretName: "db-password", policy: { action: true, client: true, direct: false } },
            ],
          }],
        });
      }
      return json({ resources: [] });
    }));
    render(<Resources token="token" projectId="project-1" onError={() => undefined} />);
    expect(await screen.findByText("No resources yet.")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "New resource" }));
    await userEvent.type(screen.getByPlaceholderText("customer-db"), "customer-db");
    await userEvent.type(screen.getByLabelText("New secret name"), "db-password");
    await userEvent.type(screen.getByLabelText("New secret value"), "s3cret");
    const hosts = screen.getAllByRole("textbox").filter((element) => element.getAttribute("name")?.endsWith("-host"));
    await userEvent.type(hosts[0]!, "localhost");
    await userEvent.type(hosts[1]!, "prod-db");
    for (const name of ["development-database", "production-database"]) {
      await userEvent.type(document.querySelector(`[name="${name}"]`) as HTMLInputElement, "app");
    }
    for (const name of ["development-username", "production-username"]) {
      await userEvent.type(document.querySelector(`[name="${name}"]`) as HTMLInputElement, "app");
    }
    await userEvent.type(screen.getByPlaceholderText("find-user-by-email"), "find-user-by-email");
    await userEvent.type(screen.getByPlaceholderText("SELECT id FROM users WHERE email = $1"), "SELECT id FROM users WHERE email = $1");
    await userEvent.type(screen.getByPlaceholderText("email"), "email");
    await userEvent.click(screen.getByRole("button", { name: "Create resource" }));
    expect(await screen.findByText("customer-db")).toBeTruthy();
    expect(screen.getByText(/localhost/)).toBeTruthy();
    expect(screen.getByText(/prod-db/)).toBeTruthy();
    expect(screen.queryByText("s3cret")).toBeNull();
    const created = requests.find((item) => item.path.endsWith("/resources") && item.body);
    expect(JSON.stringify(created?.body)).not.toContain("s3cret");
    expect(requests.some((item) => item.path.endsWith("/secrets") && (item.body as { value?: string })?.value === "s3cret")).toBe(true);
  });

  it("warns when a worker step uses Direct Access", () => {
    render(
      <Properties
        definition={{ schemaVersion: "1", id: "lookup", name: "Lookup", version: "1", nodes: [], edges: [] }}
        node={{ id: "load", type: "activity", config: { activity: "load-user", resources: [{ key: "customer-db", access: "direct" }] } }}
        activities={[]}
        agents={[]}
        workflows={[]}
        resources={[{ key: "customer-db", actions: [] }]}
        onWorkflow={() => undefined}
        onSchema={() => undefined}
        onNode={() => undefined}
        onMapping={() => undefined}
        onCondition={() => undefined}
      />,
    );
    expect(screen.getByText(/will not record individual SQL statements/)).toBeTruthy();
  });

  it("shows the resource access mode used by a run", () => {
    render(
      <RunView
        definition={{ schemaVersion: "1", id: "lookup", name: "Lookup", version: "1", nodes: [{ id: "start", type: "start", config: {} }], edges: [] }}
        detail={{ run: { id: "run-1", status: "COMPLETED", workflowVersion: "1", output: {}, error: null }, steps: [], history: [] }}
        usage={emptyUsage()}
        resources={[{ resourceKey: "customer-db", accessMode: "direct", operation: "handoff", outcome: "success" }]}
      />,
    );
    expect(screen.getByText(/customer-db · direct · handoff · success/)).toBeTruthy();
    expect(screen.getByText(/does not record individual SQL statements/)).toBeTruthy();
  });
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function emptyUsage(): UsageReport {
  return { cost: { state: "unavailable", amount: null, currency: null }, tokens: { input: 0, output: 0, total: 0 }, events: [], nodes: {} };
}
