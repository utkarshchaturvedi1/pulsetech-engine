export type ClientLeadOutcome = "unreviewed" | "converted" | "not_converted";

export type ParsedClientLeadOutcome = {
  ok: true;
  outcome: ClientLeadOutcome;
  saleAmountUsd: number | null;
} | {
  ok: false;
  error: string;
};

export function parseClientLeadOutcome(outcome: unknown, rawAmount: unknown): ParsedClientLeadOutcome {
  if (outcome !== "unreviewed" && outcome !== "converted" && outcome !== "not_converted") {
    return { ok: false, error: "Choose a valid lead outcome." };
  }
  if (outcome !== "converted") return { ok: true, outcome, saleAmountUsd: null };
  const amount = typeof rawAmount === "string" || typeof rawAmount === "number" ? Number(rawAmount) : Number.NaN;
  if (!Number.isFinite(amount) || amount < 0 || amount > 1_000_000_000) {
    return { ok: false, error: "Enter the confirmed sale amount in USD." };
  }
  return { ok: true, outcome, saleAmountUsd: Math.round(amount * 100) / 100 };
}
