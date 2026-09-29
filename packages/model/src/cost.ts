export interface CostSummary {
  state: "complete" | "partial" | "unavailable" | "calculating";
  amount: string | null;
  currency: string | null;
}

export function formatCost(summary: CostSummary): string {
  if (summary.state === "calculating") {
    return "Calculating";
  }
  if (summary.state === "unavailable" || summary.amount == null) {
    return "Unavailable";
  }
  const shown = summary.currency === "USD" ? `$${summary.amount}` : `${summary.amount} ${summary.currency ?? ""}`.trim();
  return summary.state === "partial" ? `${shown}+` : shown;
}

export function formatTokenCount(total: number): string {
  if (total >= 1000) {
    const scaled = Math.round(total / 100) / 10;
    return `${scaled}K tokens`;
  }
  return `${total} tokens`;
}
