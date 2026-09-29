/** @vitest-environment happy-dom */
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Shell } from "./Shell.tsx";

const SESSION_KEY = "drassos-designer-session";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  window.location.hash = "";
  vi.unstubAllGlobals();
});

describe("designer session routing", () => {
  it("sends an unauthenticated run link to sign-in", async () => {
    window.location.hash = "#/projects/p1/workflows/orders/runs/run-1";
    render(<Shell />);
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeTruthy();
    expect(screen.getByText((_, node) => node?.className === "brand" && node.textContent === "Drassos")).toBeTruthy();
    expect(window.location.hash).toBe("#/login");
    expect(screen.queryByText("run-1")).toBeNull();
  });

  it("explains when account registration cannot reach the service", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("Error", { status: 500 })));
    window.location.hash = "#/register";
    render(<Shell />);
    await userEvent.type(screen.getByLabelText("Name"), "Ada");
    await userEvent.type(screen.getByLabelText("Email"), "ada@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "secret");
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByText(/account service is unavailable/i)).toBeTruthy();
  });

  it("creates a project from a dialog", async () => {
    const projects: Array<{ id: string; name: string; description?: string }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = String(input);
        if (init?.method === "POST" && path === "/api/projects") {
          const body = JSON.parse(String(init.body)) as { name: string; description?: string };
          const project = { id: "p1", name: body.name, description: body.description };
          projects.push(project);
          return json(project, 201);
        }
        return json({ projects });
      }),
    );
    sessionStorage.setItem(SESSION_KEY, "token");
    window.location.hash = "#/projects";
    render(<Shell />);
    expect(await screen.findByRole("heading", { name: "Projects" })).toBeTruthy();
    expect(screen.queryByLabelText(/project name/i)).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "New project" }));
    expect(await screen.findByRole("dialog", { name: "New project" })).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "New project" }));
    await userEvent.type(screen.getByLabelText("Name"), "Orders");
    await userEvent.type(screen.getByLabelText("Description"), "Dinner service");
    await userEvent.click(screen.getByRole("button", { name: "Create project" }));
    expect(await screen.findByRole("link", { name: /Orders/ })).toBeTruthy();
    expect(screen.getByText("Dinner service")).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(projects).toEqual([{ id: "p1", name: "Orders", description: "Dinner service" }]);
  });

  it("clears a leftover run url on sign-out", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { message: "not found" } }), { status: 404, headers: { "content-type": "application/json" } })));
    sessionStorage.setItem(SESSION_KEY, "token");
    window.location.hash = "#/projects/p1/workflows/orders/runs/run-1";
    render(<Shell />);
    await userEvent.click(await screen.findByRole("button", { name: "Sign out" }));
    expect(window.location.hash).toBe("#/login");
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();
    expect(screen.getByRole("heading", { name: "Sign in" })).toBeTruthy();
    expect(screen.queryByText("run-1")).toBeNull();
  });
});
