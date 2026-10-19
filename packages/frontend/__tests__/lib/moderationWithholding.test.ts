import { describe, expect, it } from "vitest";
import {
  evaluateSubmissionForWithholding,
  getSubmissionWithholdingMode,
  getWithholdingUsageTotals,
  WITHHOLDING_MAX_DAILY_OUTPUT_TOKENS as OUTPUT_LIMIT,
  WITHHOLDING_MAX_DAILY_TOTAL_TOKENS as DAILY_LIMIT,
  WITHHOLDING_MAX_TOTAL_TOKENS as TOTAL_LIMIT,
} from "@/lib/moderation/withholding";

describe("ledger volume withholding", () => {
  it.each([
    { name: "daily output at the limit", totalTokens: OUTPUT_LIMIT, maxDailyTokens: OUTPUT_LIMIT, maxDailyOutputTokens: OUTPUT_LIMIT, trigger: undefined },
    { name: "daily output above the limit", totalTokens: OUTPUT_LIMIT + 1, maxDailyTokens: OUTPUT_LIMIT + 1, maxDailyOutputTokens: OUTPUT_LIMIT + 1, trigger: "daily_output_limit" },
    { name: "daily cached volume at the limit", totalTokens: DAILY_LIMIT, maxDailyTokens: DAILY_LIMIT, maxDailyOutputTokens: 100, trigger: undefined },
    { name: "daily cached volume above the limit", totalTokens: DAILY_LIMIT + 1, maxDailyTokens: DAILY_LIMIT + 1, maxDailyOutputTokens: 100, trigger: "daily_token_limit" },
    { name: "lifetime volume below the limit", totalTokens: TOTAL_LIMIT - 1, maxDailyTokens: DAILY_LIMIT, maxDailyOutputTokens: 100, trigger: undefined },
    { name: "lifetime volume at the limit", totalTokens: TOTAL_LIMIT, maxDailyTokens: DAILY_LIMIT, maxDailyOutputTokens: 100, trigger: "total_token_limit" },
  ])("$name", ({ totalTokens, maxDailyTokens, maxDailyOutputTokens, trigger }) => {
    const result = evaluateSubmissionForWithholding({ totalTokens, maxDailyTokens, maxDailyOutputTokens });
    expect(result.shouldWithhold).toBe(trigger !== undefined);
    expect(result.trigger).toBe(trigger);
  });

  it("combines the same calendar day across devices", () => {
    const usage = getWithholdingUsageTotals([
      { date: "2026-04-30", tokens: 6_000_000_000, outputTokens: 6_000_000_000 },
      { date: "2026-04-30", tokens: "6000000000", outputTokens: 6_000_000_000n },
    ]);
    expect(usage).toEqual({ totalTokens: 12_000_000_000, maxDailyTokens: 12_000_000_000, maxDailyOutputTokens: 12_000_000_000 });
    expect(evaluateSubmissionForWithholding(usage).trigger).toBe("daily_output_limit");
  });

  it("does not treat separate days as one implied day", () => {
    const usage = getWithholdingUsageTotals([
      { date: "2026-04-29", tokens: DAILY_LIMIT, outputTokens: OUTPUT_LIMIT },
      { date: "2026-04-30", tokens: DAILY_LIMIT, outputTokens: OUTPUT_LIMIT },
      { date: "2026-05-01", tokens: DAILY_LIMIT, outputTokens: OUTPUT_LIMIT },
    ]);
    expect(evaluateSubmissionForWithholding(usage)).toEqual({ shouldWithhold: false, reason: "" });
  });

  it("does not inflate ledger scalars from retained model maps or other metadata", () => {
    const rows = [{
      date: "2026-04-30", tokens: 1_600_000, outputTokens: 600_000,
      sourceBreakdown: { claude: { models: { old: { tokens: TOTAL_LIMIT, output: OUTPUT_LIMIT + 1 } } } },
    }];
    expect(getWithholdingUsageTotals(rows)).toEqual({
      totalTokens: 1_600_000, maxDailyTokens: 1_600_000, maxDailyOutputTokens: 600_000,
    });
  });

  it("handles an empty ledger without inferring usage from request summaries", () => {
    expect(evaluateSubmissionForWithholding(getWithholdingUsageTotals([]))).toEqual({
      shouldWithhold: false, reason: "",
    });
  });

  it("recognizes totals beyond the JavaScript safe-integer range", () => {
    expect(evaluateSubmissionForWithholding({
      totalTokens: "9223372036854775807", maxDailyTokens: 0, maxDailyOutputTokens: 0,
    }).trigger).toBe("total_token_limit");
  });
});

describe("submission withholding rollout", () => {
  it.each([
    [undefined, "observe"], ["observe", "observe"], ["unexpected", "observe"],
    ["0", "off"], ["1", "enforce"], [" 1 ", "enforce"],
  ])("%s selects %s", (value, mode) => {
    expect(getSubmissionWithholdingMode(value)).toBe(mode);
  });
});
