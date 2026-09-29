import { describe, expect, it } from "vitest";
import {
  capabilityAvailability,
  compatibilityError,
  editState,
  nextConnectionStatus,
  reconnectDelayMs,
} from "./connection.ts";

describe("designer remote connection", () => {
  it("moves through connection states and explains an incompatible engine", () => {
    expect(nextConnectionStatus("DISCONNECTED", "connect")).toBe("CONNECTING");
    expect(nextConnectionStatus("CONNECTING", "ok")).toBe("CONNECTED");
    expect(nextConnectionStatus("CONNECTED", "unavailable")).toBe("UNAVAILABLE");
    expect(nextConnectionStatus("UNAVAILABLE", "connect")).toBe("RECONNECTING");
    expect(nextConnectionStatus("CONNECTING", "auth")).toBe("AUTHENTICATION_FAILED");
    expect(nextConnectionStatus("CONNECTED", "disconnect")).toBe("DISCONNECTED");
    expect(compatibilityError({
      engineVersion: "0.12.0",
      controlApiVersion: "9",
      workflowSchemaVersions: ["1"],
      features: [],
    })).toMatch(/Control API version 9/);
    expect(compatibilityError({
      engineVersion: "0.12.0",
      controlApiVersion: "1",
      workflowSchemaVersions: ["1"],
      features: [],
    })).toBeNull();
  });

  it("tracks unsaved edits separately from a remote revision conflict", () => {
    expect(editState({ dirty: false, saving: false, conflict: false, failed: false })).toBe("LOCAL CLEAN");
    expect(editState({ dirty: true, saving: false, conflict: false, failed: false })).toBe("LOCAL MODIFIED");
    expect(editState({ dirty: true, saving: false, conflict: true, failed: false })).toBe("VERSION CONFLICT");
  });

  it("treats a missing worker capability as availability, not a definition error", () => {
    expect(capabilityAvailability("charge-card", [{ status: "online", capabilities: ["send-email"] }]).warning).toMatch(/charge-card/);
    expect(capabilityAvailability("charge-card", [
      { status: "online", capabilities: ["charge-card"] },
      { status: "offline", capabilities: ["charge-card"] },
    ]).available).toBe(1);
  });

  it("backs off reconnection attempts", () => {
    expect(reconnectDelayMs(0)).toBe(200);
    expect(reconnectDelayMs(2)).toBe(800);
    expect(reconnectDelayMs(20)).toBe(10_000);
  });
});
