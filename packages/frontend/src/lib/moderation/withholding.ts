/**
 * Rankability limits over the daily ledger, not proof of fabrication.
 * Model maps can retain historical entries for cost floors, and active time
 * can cover only part of the submitted history. Neither is a volume source.
 */
export const WITHHOLDING_MAX_DAILY_OUTPUT_TOKENS = 10_000_000_000;
export const WITHHOLDING_MAX_DAILY_TOTAL_TOKENS = 500_000_000_000;
export const WITHHOLDING_MAX_TOTAL_TOKENS = 1_000_000_000_000_000;

export type WithholdingTrigger =
  | "daily_output_limit"
  | "daily_token_limit"
  | "total_token_limit";

export interface WithholdingResult {
  shouldWithhold: boolean;
  reason: string;
  trigger?: WithholdingTrigger;
}

type TokenCount = number | string | bigint | null | undefined;

export interface WithholdingUsageTotals {
  totalTokens: TokenCount;
  maxDailyTokens: TokenCount;
  maxDailyOutputTokens: TokenCount;
}

export interface WithholdingDailyRow {
  date: string;
  tokens: TokenCount;
  outputTokens: TokenCount;
}

function toCount(value: TokenCount): number {
  const count = Number(value ?? 0);
  return Number.isFinite(count) ? Math.max(0, count) : 0;
}

/** Group calendar dates across devices using only daily_breakdown scalars. */
export function getWithholdingUsageTotals(
  rows: readonly WithholdingDailyRow[]
): WithholdingUsageTotals {
  const byDate = new Map<string, { tokens: number; output: number }>();
  let totalTokens = 0;
  let maxDailyTokens = 0;
  let maxDailyOutputTokens = 0;
  for (const row of rows) {
    const day = byDate.get(row.date) ?? { tokens: 0, output: 0 };
    const tokens = toCount(row.tokens);
    day.tokens += tokens;
    day.output += toCount(row.outputTokens);
    byDate.set(row.date, day);
    totalTokens += tokens;
    maxDailyTokens = Math.max(maxDailyTokens, day.tokens);
    maxDailyOutputTokens = Math.max(maxDailyOutputTokens, day.output);
  }
  return { totalTokens, maxDailyTokens, maxDailyOutputTokens };
}

/** The caller supplies final ledger totals, never raw request summaries. */
export function evaluateSubmissionForWithholding(
  usage: WithholdingUsageTotals
): WithholdingResult {
  const output = toCount(usage.maxDailyOutputTokens);
  if (output > WITHHOLDING_MAX_DAILY_OUTPUT_TOKENS) {
    return {
      shouldWithhold: true,
      trigger: "daily_output_limit",
      reason: `Daily output ${output.toLocaleString("en-US")} exceeds the leaderboard limit of ${WITHHOLDING_MAX_DAILY_OUTPUT_TOKENS.toLocaleString("en-US")} tokens`,
    };
  }
  const daily = toCount(usage.maxDailyTokens);
  if (daily > WITHHOLDING_MAX_DAILY_TOTAL_TOKENS) {
    return {
      shouldWithhold: true,
      trigger: "daily_token_limit",
      reason: `Daily volume ${daily.toLocaleString("en-US")} exceeds the leaderboard limit of ${WITHHOLDING_MAX_DAILY_TOTAL_TOKENS.toLocaleString("en-US")} tokens`,
    };
  }
  const total = toCount(usage.totalTokens);
  if (total >= WITHHOLDING_MAX_TOTAL_TOKENS) {
    return {
      shouldWithhold: true,
      trigger: "total_token_limit",
      reason: `Lifetime volume ${total.toLocaleString("en-US")} meets the leaderboard limit of ${WITHHOLDING_MAX_TOTAL_TOKENS.toLocaleString("en-US")} tokens`,
    };
  }
  return { shouldWithhold: false, reason: "" };
}

export type SubmissionWithholdingMode = "off" | "observe" | "enforce";

/** Explicit opt-in is required to change account state; unset means observe. */
export function getSubmissionWithholdingMode(
  value: string | undefined
): SubmissionWithholdingMode {
  if (value?.trim() === "0") return "off";
  if (value?.trim() === "1") return "enforce";
  return "observe";
}
