/** @vitest-environment happy-dom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@drassos/designer-client", async () => {
  const actual = await vi.importActual<typeof import("@drassos/designer-client")>("@drassos/designer-client");
  return {
    ...actual,
    connectEngine: vi.fn(async () => ({
      baseUrl: "https://www.drassos.com/d-engine",
      info: { engineVersion: "0.12.0", controlApiVersion: "1", workflowSchemaVersions: ["1"], features: [] },
      listWorkflows: async () => [],
      listCapabilities: async () => ({ activities: [], agents: [], signals: [], workflows: [] }),
      workers: async () => [],
      getWorkflow: async () => {
        throw new Error("not used");
      },
      validateWorkflow: async () => [],
      saveWorkflow: async () => ({ revision: "saved" }),
      runWorkflow: async () => {
        throw new Error("not used");
      },
      getExecution: async () => {
        throw new Error("not used");
      },
      signal: async () => undefined,
      cancel: async () => ({ status: "CANCELLED" }),
      logs: async () => [],
      runs: async () => [],
    })),
  };
});

import { connectEngine } from "@drassos/designer-client";
import { App } from "./App.tsx";

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  window.location.href = "http://localhost:3000/";
});

describe("designer hosted on Drassos Cloud", () => {
  it("connects the canvas to the cloud engine with the cloud session", async () => {
    sessionStorage.setItem("drassos-cloud-session", JSON.stringify({ token: "cloud-token", user: { name: "Ada" } }));
    window.location.href = "https://www.drassos.com/designer/";
    render(<App />);
    expect(await screen.findByRole("link", { name: "Cloud" })).toBeTruthy();
    expect(connectEngine).toHaveBeenCalledWith("https://www.drassos.com/d-engine", "cloud-token");
  });
});
