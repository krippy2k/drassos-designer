import { describe, expect, it } from "vitest";
import { formatCost, formatTokenCount } from "./cost.ts";

describe("cost display", () => {
  it("shows a complete total, a partial total, and unknown cost", () => {
    expect(formatCost({ state: "complete", amount: "0.1842", currency: "USD" })).toBe("$0.1842");
    expect(formatCost({ state: "partial", amount: "0.1842", currency: "USD" })).toBe("$0.1842+");
    expect(formatCost({ state: "calculating", amount: null, currency: null })).toBe("Calculating");
    expect(formatCost({ state: "unavailable", amount: null, currency: null })).toBe("Unavailable");
  });

  it("shortens token totals", () => {
    expect(formatTokenCount(12400)).toBe("12.4K tokens");
    expect(formatTokenCount(80)).toBe("80 tokens");
  });
});
