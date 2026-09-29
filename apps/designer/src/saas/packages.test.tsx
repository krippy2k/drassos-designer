/** @vitest-environment happy-dom */
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RunView, type UsageReport } from "./RunView.tsx";
import { WorkflowPackageActions } from "./WorkflowPackages.tsx";

const definition = {
  schemaVersion: "1",
  id: "lookup-user",
  name: "Lookup user",
  version: "1",
  nodes: [
    { id: "start", type: "start", name: "Start", config: {} },
    { id: "end", type: "end", name: "End", config: {} },
  ],
  edges: [{ id: "start-to-end", source: "start", target: "end" }],
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("workflow packages", () => {
  it("publishes, exports, and imports through the designer account service", async () => {
    const user = userEvent.setup();
    const requests: Array<{ path: string; body?: { definition?: { id: string }; files?: Record<string, string> } }> = [];
    const downloads: string[] = [];
    let imported = false;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      const body = init?.body ? JSON.parse(String(init.body)) as { definition?: { id: string }; files?: Record<string, string> } : undefined;
      requests.push({ path, body });
      if (path.endsWith("/publish")) {
        return json({ version: "1", packageDigest: "abc123def4567890" });
      }
      if (path.endsWith("/export")) {
        return json({ files: { "workflow.yaml": "kind: Workflow\n" } });
      }
      return json({ definition: { ...definition, name: "Imported" } });
    }));
    const view = render(
      <WorkflowPackageActions
        definition={definition}
        token="session"
        projectId="project-1"
        onPublished={() => undefined}
        onImported={() => {
          imported = true;
        }}
        onError={() => undefined}
        download={(filename) => downloads.push(filename)}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Publish" }));
    expect(await screen.findByText(/Published 1 abc123def456/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Export source" }));
    expect(downloads).toEqual(["lookup-user-source.zip"]);
    const file = new File(["kind: Workflow\n"], "workflow.yaml");
    Object.defineProperty(file, "webkitRelativePath", { value: "orders/workflow.yaml" });
    const input = screen.getByLabelText("Import workflow source");
    await user.upload(input, file);
    expect(imported).toBe(true);
    expect(requests.map((item) => item.path)).toEqual([
      "/api/projects/project-1/workflows/lookup-user/publish",
      "/api/projects/project-1/workflows/lookup-user/export",
      "/api/projects/project-1/workflows/lookup-user/import",
    ]);
    expect(requests[2]?.body?.files).toEqual({ "workflow.yaml": "kind: Workflow\n" });
    await user.click(screen.getByRole("button", { name: "Open published" }));
    expect(requests.at(-1)?.path).toBe("/api/projects/project-1/workflows/lookup-user/published?version=1");
    view.unmount();
  });

  it("shows the package digest on a run", () => {
    render(
      <RunView
        definition={definition}
        detail={{ run: { id: "run-1", status: "COMPLETED", workflowVersion: "1", output: {}, error: null }, steps: [], history: [] }}
        usage={emptyUsage}
        packageDigest="abc123def4567890"
      />,
    );
    expect(screen.getByText(/Package abc123def456/)).toBeTruthy();
  });
});

const emptyUsage: UsageReport = {
  cost: { state: "unavailable", amount: null, currency: null },
  tokens: { input: 0, output: 0, total: 0 },
  events: [],
  nodes: {},
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
