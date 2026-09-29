import { describe, expect, it } from "vitest";
import { shellGridRows } from "./layout.ts";

describe("designer shell layout", () => {
  it("keeps the canvas in the flexible row when a run has no banner", () => {
    expect(shellGridRows(false)).toBe("auto minmax(0, 1fr) 220px");
  });

  it("keeps the canvas in the flexible row when a banner is showing", () => {
    expect(shellGridRows(true)).toBe("auto auto minmax(0, 1fr) 220px");
  });
});
