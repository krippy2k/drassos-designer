/** @vitest-environment happy-dom */
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Deployments } from "./Deployments.tsx";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("project deployments", () => {
  it("configures a provider and shows managed worker health without credentials", async () => {
    const user = userEvent.setup();
    const requests: Array<{ path: string; body?: { config?: { credentials?: { secret?: string } } } }> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      const body = init?.body ? JSON.parse(String(init.body)) as { config?: { credentials?: { secret?: string } } } : undefined;
      requests.push({ path, body });
      if (path.endsWith("/deployment-providers") && init?.method === "POST") {
        return json({ name: body && "name" in body ? body.name : "production-k8s" }, 201);
      }
      if (path.endsWith("/deployment-providers")) {
        return json({ providers: requests.some((item) => item.path.endsWith("/deployment-providers") && item.body) ? [{ name: "production-k8s", type: "kubernetes" }] : [] });
      }
      if (path.endsWith("/deployment-targets")) return json({ targets: [] });
      if (path.endsWith("/worker-definitions")) {
        return json({ workers: [{ name: "postgres-worker", management: "managed", targetName: "production", capabilities: ["postgres.query"], scaling: { minInstances: 1, maxInstances: 20, concurrency: { maxPerInstance: 5 } } }] });
      }
      if (path.endsWith("/instances")) {
        return json({ instances: [{ id: "inst-1", health: "healthy", cpu: "100m", memory: "128Mi", estimatedCost: { amount: "0.010", currency: "USD", estimated: true } }] });
      }
      if (path.endsWith("/deployments") && init?.method !== "POST") {
        return json({ deployments: [{ id: "dep-1", workerName: "postgres-worker", targetName: "production", providerType: "kubernetes", status: "HEALTHY", error: null }] });
      }
      return json({ actions: [{ action: "unchanged", kind: "Workload", name: "postgres-worker" }] });
    }));
    render(<Deployments token="session" projectId="project-1" onError={() => undefined} />);
    expect(await screen.findByText("HEALTHY · kubernetes · production")).toBeTruthy();
    expect(screen.getByText(/HEALTHY · kubernetes · production/)).toBeTruthy();
    expect(screen.getByText(/healthy · 100m · 128Mi · 0.010 USD estimated/)).toBeTruthy();
    expect(screen.getByText(/Managed · production · postgres.query/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "New provider" }));
    await user.type(screen.getByLabelText("Name"), "production-k8s");
    await user.type(screen.getByLabelText("Credential secret"), "prod-kubeconfig");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("production-k8s · kubernetes")).toBeTruthy();
    expect(screen.queryByText("kube-secret-token")).toBeNull();
    expect(JSON.stringify(requests)).not.toContain("kube-secret-token");
    expect(requests.some((item) => item.body?.config?.credentials?.secret === "prod-kubeconfig")).toBe(true);
    await user.click(screen.getByRole("button", { name: "Plan" }));
    expect(await screen.findByText("unchanged Workload postgres-worker")).toBeTruthy();
  });
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
