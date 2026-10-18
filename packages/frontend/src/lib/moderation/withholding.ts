import { SLOP_MODEL_PATTERNS, SLOP_MODEL_REGEX } from "./heuristics";

/**
 * Pure evaluation logic for automated leaderboard withholding (Issue #1473).
 *
 * Designed to withhold token spoofers and physically fabricated submissions
 * from competitive leaderboards while strictly protecting innocent, legitimate
 * heavy users and power users against false positive bans.
 *
 * Core principles & safeguards:
 * 1. Physical impossibility over statistical anomaly:
 *    We never penalize prompt caching or high cacheRead volume. Only generation
 *    speeds that violate the physical speed of light / GPU clusters for output
 *    tokens (>10B/day), extreme single-day volume (>500B/day), impossible implied
 *    cost rates (>$5,000/1M tokens), or explicit slop model names with substantial
 *    volume/share trip withholding.
 * 2. Safe against zero/negligible config artifacts (#1265):
 *    Invented model names (e.g. `fake-model`) configured in tools or local proxies
 *    carrying 0 or negligible tokens (<1M tokens AND <5% share) do NOT trigger withholding.
 * 3. Safe for free/local models:
 *    Deliberately no floor on implied cost rate, preserving $0.00 spend on Ollama/vLLM.
 */

/**
 * Substantial volume floor for slop model names: 1,000,000 tokens.
 * Accounts below this volume and below the share floor are treated as
 * config artifacts (#1265) and not withheld.
 */
export const WITHHOLDING_SLOP_TOKEN_FLOOR = 1_000_000;

/**
 * Substantial share floor for slop model names: 5% (0.05).
 */
export const WITHHOLDING_SLOP_SHARE_FLOOR = 0.05;

/**
 * Maximum physically possible output tokens in a single day: 10 Billion.
 * LLM generation speed cannot physically exceed this ceiling in 24 hours.
 * Prompt cache reads are explicitly NOT constrained by this ceiling.
 */
export const WITHHOLDING_MAX_DAILY_OUTPUT_TOKENS = 10_000_000_000;

/**
 * Extreme single-day total token volume ceiling: 500 Billion tokens/day.
 */
export const WITHHOLDING_MAX_DAILY_TOTAL_TOKENS = 500_000_000_000;

/**
 * Absolute lifetime token ceiling: 1 Quadrillion (10^15) tokens.
 * No user or cluster can physically generate or read a quadrillion tokens.
 */
export const WITHHOLDING_MAX_TOTAL_TOKENS = 1_000_000_000_000_000;

/**
 * Maximum plausible implied price per token: $0.005 ($5,000 / 1M tokens).
 * Deliberately NO floor to allow $0 local/free models.
 */
export const WITHHOLDING_MAX_IMPLIED_COST_PER_TOKEN = 0.005;

/**
 * Minimum total cost floor for implied cost ceiling checks: $10.00.
 *
 * Protects against false positive bans from small-spend rounding artifacts
 * (e.g. $0.50 on 12 tokens during test or initial CLI runs). Fabricated cost
 * attacks on leaderboards involve significant dollars, well above $10.
 */
export const WITHHOLDING_MIN_IMPLIED_COST_TOTAL = 10;

/**
 * Maximum physically possible output tokens per active second: 10,000 tok/s.
 *
 * Autoregressive LLM generation runs at ~30-100 tok/s per stream. Even massive
 * parallel orchestration (e.g. 50-100 concurrent streams) rarely reaches
 * 2,500-5,000 tok/s. An active-time rate > 10,000 tok/s is physically impossible.
 * Prompt cache read tokens are explicitly NOT constrained by this rate ceiling.
 */
export const WITHHOLDING_MAX_OUTPUT_TOKENS_PER_ACTIVE_SECOND = 10_000;

/**
 * Substantial output token floor for active-time rate checking: 1,000,000 tokens.
 * Small runs or short CLI sessions are protected against quantization artifacts.
 */
export const WITHHOLDING_ACTIVE_TIME_OUTPUT_TOKEN_FLOOR = 1_000_000;

export const WITHHOLDING_SLOP_MODEL_PATTERNS = SLOP_MODEL_PATTERNS;
export const WITHHOLDING_SLOP_MODEL_REGEX = SLOP_MODEL_REGEX;

export type WithholdingTrigger =
  | "slop_model_name"
  | "impossible_output_tokens"
  | "extreme_single_day_volume"
  | "impossible_implied_cost"
  | "impossible_active_time_rate";

export interface WithholdingResult {
  shouldWithhold: boolean;
  reason: string;
  trigger?: WithholdingTrigger;
  triggers?: WithholdingTrigger[];
}

export type WithholdingEvaluation = WithholdingResult;

export interface WithholdingTokenBreakdown {
  input?: number | string | bigint | null;
  output?: number | string | bigint | null;
  cacheRead?: number | string | bigint | null;
  cacheWrite?: number | string | bigint | null;
  reasoning?: number | string | bigint | null;
}

export interface WithholdingModelBreakdownData {
  tokens?: number | string | bigint | null;
  cost?: number | string | null;
  input?: number | string | bigint | null;
  output?: number | string | bigint | null;
  cacheRead?: number | string | bigint | null;
  cacheWrite?: number | string | bigint | null;
  reasoning?: number | string | bigint | null;
  messages?: number | string | null;
}

export interface WithholdingClientContribution {
  client?: string;
  modelId?: string;
  providerId?: string;
  tokens?: WithholdingTokenBreakdown | number | string | bigint | null;
  cost?: number | string | null;
  messages?: number | string | null;
  models?: Record<string, WithholdingModelBreakdownData | number>;
  output?: number | string | bigint | null;
  input?: number | string | bigint | null;
  cacheRead?: number | string | bigint | null;
  cacheWrite?: number | string | bigint | null;
  reasoning?: number | string | bigint | null;
}

export interface WithholdingDailyContribution {
  date?: string;
  totals?: {
    tokens?: number | string | bigint | null;
    cost?: number | string | null;
    messages?: number | string | null;
    costIsComplete?: boolean;
  };
  intensity?: number;
  tokenBreakdown?: WithholdingTokenBreakdown;
  clients?: WithholdingClientContribution[];
}

export interface WithholdingYearSummary {
  year?: string;
  totalTokens?: number | string | bigint | null;
  totalCost?: number | string | null;
}

export interface WithholdingTimeMetrics {
  totalActiveTimeMs?: number | string | bigint | null;
  longestContinuousMs?: number | string | bigint | null;
  maxConcurrentSessions?: number | string | bigint | null;
  sessionCount?: number | string | bigint | null;
  total_active_time_ms?: number | string | bigint | null;
  longest_continuous_ms?: number | string | bigint | null;
  max_concurrent_sessions?: number | string | bigint | null;
  session_count?: number | string | bigint | null;
}

export interface WithholdingSubmissionInput {
  meta?: unknown;
  summary?: {
    totalTokens?: number | string | bigint | null;
    totalCost?: number | string | null;
    totalDays?: number | string | null;
    activeDays?: number | string | null;
    models?: string[];
    clients?: string[];
    tokenBreakdown?: WithholdingTokenBreakdown;
    timeMetrics?: WithholdingTimeMetrics | null;
    time_metrics?: WithholdingTimeMetrics | null;
  };
  totalTokens?: number | string | bigint | null;
  totalCost?: number | string | null;
  outputTokens?: number | string | bigint | null;
  totalOutputTokens?: number | string | bigint | null;
  tokenBreakdown?: WithholdingTokenBreakdown;
  contributions?: WithholdingDailyContribution[];
  models?: string[];
  modelTokens?: Record<string, number | string | bigint | null>;
  years?: WithholdingYearSummary[];
  timeMetrics?: WithholdingTimeMetrics | null;
  time_metrics?: WithholdingTimeMetrics | null;
}

function toNumeric(val: unknown): number {
  if (typeof val === "number") return Number.isFinite(val) ? Math.max(0, val) : 0;
  if (typeof val === "bigint") {
    if (val <= 0n) return 0;
    const num = Number(val);
    return Number.isFinite(num) ? Math.max(0, num) : Number.MAX_SAFE_INTEGER;
  }
  if (typeof val === "string") {
    const trimmed = val.trim();
    if (!trimmed) return 0;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
  }
  return 0;
}

function sumTokenBreakdown(tokens?: WithholdingTokenBreakdown | null): number {
  if (!tokens) return 0;
  return (
    toNumeric(tokens.input) +
    toNumeric(tokens.output) +
    toNumeric(tokens.cacheRead) +
    toNumeric(tokens.cacheWrite) +
    toNumeric(tokens.reasoning)
  );
}

function sumClientsOutput(clients?: WithholdingClientContribution[] | null): number {
  if (!clients) return 0;
  let total = 0;
  for (const client of clients) {
    let modelsOutput = 0;
    if (client.models && Object.keys(client.models).length > 0) {
      for (const modelData of Object.values(client.models)) {
        if (typeof modelData === "object" && modelData !== null) {
          modelsOutput += toNumeric(modelData.output);
        }
      }
    }
    const scalarOutput =
      typeof client.tokens === "object" && client.tokens !== null
        ? toNumeric(client.tokens.output)
        : toNumeric(client.output);
    total += Math.max(modelsOutput, scalarOutput);
  }
  return total;
}

function sumClientsTokens(clients?: WithholdingClientContribution[] | null): number {
  if (!clients) return 0;
  let total = 0;
  for (const client of clients) {
    let clientModelsSum = 0;
    if (client.models && Object.keys(client.models).length > 0) {
      for (const modelData of Object.values(client.models)) {
        if (typeof modelData === "number") {
          clientModelsSum += toNumeric(modelData);
        } else if (typeof modelData === "object" && modelData !== null) {
          clientModelsSum += Math.max(
            toNumeric(modelData.tokens),
            sumTokenBreakdown(modelData)
          );
        }
      }
    }
    const scalarTokens =
      typeof client.tokens === "number"
        ? toNumeric(client.tokens)
        : typeof client.tokens === "object" && client.tokens !== null
        ? sumTokenBreakdown(client.tokens)
        : 0;
    total += Math.max(clientModelsSum, scalarTokens);
  }
  return total;
}

function sumClientsCost(clients?: WithholdingClientContribution[] | null): number {
  if (!clients) return 0;
  let total = 0;
  for (const client of clients) {
    let modelsCost = 0;
    if (client.models && Object.keys(client.models).length > 0) {
      for (const modelData of Object.values(client.models)) {
        if (typeof modelData === "object" && modelData !== null) {
          modelsCost += toNumeric(modelData.cost);
        }
      }
    }
    total += Math.max(toNumeric(client.cost), modelsCost);
  }
  return total;
}

const SLOP_REGEX = new RegExp(WITHHOLDING_SLOP_MODEL_REGEX, "i");

/**
 * Checks whether a given model name matches known fabrication/slop model patterns.
 */
export function isSlopModelName(modelName: string): boolean {
  if (!modelName || typeof modelName !== "string") return false;
  return SLOP_REGEX.test(modelName.trim());
}

/**
 * Evaluates whether a submission trips physical impossibility or explicit
 * fabrication invariants for automated leaderboard withholding (Issue #1473).
 *
 * Returns `{ shouldWithhold: boolean; reason: string; trigger?: WithholdingTrigger }`.
 */
export function evaluateSubmissionForWithholding(
  submission: WithholdingSubmissionInput
): WithholdingResult {
  if (!submission) {
    return {
      shouldWithhold: false,
      reason: "",
    };
  }

  const contributions = submission.contributions ?? [];

  let calculatedDailyTokens = 0;
  let calculatedDailyCost = 0;
  let calculatedDailyOutput = 0;

  for (const day of contributions) {
    const dayTokens = Math.max(
      toNumeric(day.totals?.tokens),
      sumTokenBreakdown(day.tokenBreakdown),
      sumClientsTokens(day.clients)
    );
    calculatedDailyTokens += dayTokens;

    const dayCost = Math.max(
      toNumeric(day.totals?.cost),
      sumClientsCost(day.clients)
    );
    calculatedDailyCost += dayCost;

    const dayOutput = Math.max(
      toNumeric(day.tokenBreakdown?.output),
      sumClientsOutput(day.clients)
    );
    calculatedDailyOutput += dayOutput;
  }

  // Model-level tokens aggregation from daily contributions
  const contributionsModelTokens = new Map<string, number>();
  for (const day of contributions) {
    for (const client of day.clients ?? []) {
      let nestedTokensSum = 0;
      if (client.models && Object.keys(client.models).length > 0) {
        for (const [modelId, mData] of Object.entries(client.models)) {
          const tokens =
            typeof mData === "number"
              ? toNumeric(mData)
              : Math.max(toNumeric(mData?.tokens), sumTokenBreakdown(mData));
          nestedTokensSum += tokens;
          contributionsModelTokens.set(
            modelId,
            (contributionsModelTokens.get(modelId) ?? 0) + tokens
          );
        }
      }
      if (client.modelId) {
        const scalarTokens =
          typeof client.tokens === "object" && client.tokens !== null
            ? sumTokenBreakdown(client.tokens)
            : toNumeric(client.tokens);
        const remainderTokens = Math.max(0, scalarTokens - nestedTokensSum);
        if (remainderTokens > 0 || !contributionsModelTokens.has(client.modelId)) {
          contributionsModelTokens.set(
            client.modelId,
            (contributionsModelTokens.get(client.modelId) ?? 0) + remainderTokens
          );
        }
      }
    }
  }

  // Unified model tokens map (reconciling explicit summary modelTokens vs daily contributions)
  const modelTokensMap = new Map<string, number>();

  if (submission.modelTokens) {
    for (const [m, t] of Object.entries(submission.modelTokens)) {
      modelTokensMap.set(
        m,
        Math.max(toNumeric(t), contributionsModelTokens.get(m) ?? 0)
      );
    }
  }

  for (const [m, t] of contributionsModelTokens.entries()) {
    if (!modelTokensMap.has(m)) {
      modelTokensMap.set(m, t);
    }
  }

  for (const m of submission.summary?.models ?? submission.models ?? []) {
    if (!modelTokensMap.has(m)) {
      modelTokensMap.set(m, 0);
    }
  }

  let sumModelTokens = 0;
  for (const tokens of modelTokensMap.values()) {
    sumModelTokens += Math.max(0, tokens);
  }

  let yearsTokens = 0;
  let yearsCost = 0;
  if (submission.years) {
    for (const yr of submission.years) {
      yearsTokens += toNumeric(yr.totalTokens);
      yearsCost += toNumeric(yr.totalCost);
    }
  }

  const totalTokens = Math.max(
    toNumeric(submission.summary?.totalTokens),
    toNumeric(submission.totalTokens),
    calculatedDailyTokens,
    sumModelTokens,
    yearsTokens,
    0
  );

  const totalCost = Math.max(
    toNumeric(submission.summary?.totalCost),
    toNumeric(submission.totalCost),
    calculatedDailyCost,
    yearsCost,
    0
  );

  // 1. Physically impossible output tokens (> 10 Billion output tokens/day)
  // LLM inference output speeds have hard physical limits. Prompt cache read is unaffected.
  const outputByDate = new Map<string, number>();
  for (const day of contributions) {
    const dayOutput = Math.max(
      toNumeric(day.tokenBreakdown?.output),
      sumClientsOutput(day.clients)
    );
    const dateKey =
      typeof day.date === "string" && day.date.trim() ? day.date.trim() : null;
    const effectiveDayOutput = dateKey
      ? (outputByDate.get(dateKey) ?? 0) + dayOutput
      : dayOutput;
    if (dateKey) {
      outputByDate.set(dateKey, effectiveDayOutput);
    }

    if (effectiveDayOutput > WITHHOLDING_MAX_DAILY_OUTPUT_TOKENS) {
      const dayLabel = dateKey ? `on ${dateKey}` : "in a single day";
      return {
        shouldWithhold: true,
        trigger: "impossible_output_tokens",
        reason: `Physically impossible output tokens ${dayLabel}: ${effectiveDayOutput.toLocaleString("en-US")} output tokens exceeds daily ceiling of ${WITHHOLDING_MAX_DAILY_OUTPUT_TOKENS.toLocaleString("en-US")} tokens`,
      };
    }
  }

  // 2. Extreme single-day volume ceiling (> 500 Billion tokens/day)
  const totalByDate = new Map<string, number>();
  for (const day of contributions) {
    const dayTotal = Math.max(
      toNumeric(day.totals?.tokens),
      sumTokenBreakdown(day.tokenBreakdown),
      sumClientsTokens(day.clients)
    );
    const dateKey =
      typeof day.date === "string" && day.date.trim() ? day.date.trim() : null;
    const effectiveDayTotal = dateKey
      ? (totalByDate.get(dateKey) ?? 0) + dayTotal
      : dayTotal;
    if (dateKey) {
      totalByDate.set(dateKey, effectiveDayTotal);
    }

    if (effectiveDayTotal > WITHHOLDING_MAX_DAILY_TOTAL_TOKENS) {
      const dayLabel = dateKey ? `on ${dateKey}` : "in a single day";
      return {
        shouldWithhold: true,
        trigger: "extreme_single_day_volume",
        reason: `Extreme single-day volume ceiling exceeded ${dayLabel}: ${effectiveDayTotal.toLocaleString("en-US")} tokens exceeds daily volume ceiling of ${WITHHOLDING_MAX_DAILY_TOTAL_TOKENS.toLocaleString("en-US")} tokens`,
      };
    }
  }

  // 2b. Extreme volume ceiling for total volume unaccounted by daily rows
  // Or absolute quadrillion token spoofer payload (> 500B unaccounted tokens per implied day, or >= 10^15 total tokens)
  if (totalTokens >= WITHHOLDING_MAX_TOTAL_TOKENS) {
    return {
      shouldWithhold: true,
      trigger: "extreme_single_day_volume",
      reason: `Extreme volume ceiling exceeded: ${totalTokens.toLocaleString("en-US")} total tokens exceeds absolute physical ceiling of ${WITHHOLDING_MAX_TOTAL_TOKENS.toLocaleString("en-US")} tokens`,
    };
  }

  const unaccountedTokens = Math.max(0, totalTokens - calculatedDailyTokens);
  if (unaccountedTokens > WITHHOLDING_MAX_DAILY_TOTAL_TOKENS) {
    const totalDays = toNumeric(submission.summary?.totalDays);
    const unaccountedDays = Math.max(
      1,
      totalDays > contributions.length ? totalDays - contributions.length : 1
    );
    const impliedDailyVolume = unaccountedTokens / unaccountedDays;
    if (impliedDailyVolume > WITHHOLDING_MAX_DAILY_TOTAL_TOKENS) {
      const dayContext =
        contributions.length === 0
          ? "without daily distribution"
          : `across ${unaccountedDays} unaccounted day(s)`;
      return {
        shouldWithhold: true,
        trigger: "extreme_single_day_volume",
        reason: `Extreme volume ceiling exceeded: ${unaccountedTokens.toLocaleString("en-US")} tokens ${dayContext} exceeds daily volume ceiling of ${WITHHOLDING_MAX_DAILY_TOTAL_TOKENS.toLocaleString("en-US")} tokens`,
      };
    }
  }

  // 3. Impossible implied cost ceiling (totalCost / totalTokens > $0.005 / token, i.e. $5,000 / 1M tokens)
  // Evaluated only when totalTokens > 0 and totalCost >= $10.00.
  // Preserves $0.00 local/free models and prevents false-positive bans on small-dollar test runs.
  if (totalTokens > 0 && totalCost >= WITHHOLDING_MIN_IMPLIED_COST_TOTAL) {
    const impliedRate = totalCost / totalTokens;
    if (impliedRate > WITHHOLDING_MAX_IMPLIED_COST_PER_TOKEN) {
      const impliedRatePerMillion = impliedRate * 1_000_000;
      const maxRatePerMillion = WITHHOLDING_MAX_IMPLIED_COST_PER_TOKEN * 1_000_000;
      return {
        shouldWithhold: true,
        trigger: "impossible_implied_cost",
        reason: `Impossible implied cost ceiling exceeded: $${impliedRatePerMillion.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / 1M tokens exceeds ceiling of $${maxRatePerMillion.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / 1M tokens`,
      };
    }
  }

  const totalOutputTokens = Math.max(
    toNumeric(submission.summary?.tokenBreakdown?.output),
    toNumeric(submission.totalOutputTokens),
    toNumeric(submission.outputTokens),
    toNumeric(submission.tokenBreakdown?.output),
    calculatedDailyOutput,
    0
  );

  const rawTimeMetrics =
    submission.timeMetrics ??
    submission.time_metrics ??
    submission.summary?.timeMetrics ??
    submission.summary?.time_metrics;

  const totalActiveTimeMs = toNumeric(
    rawTimeMetrics?.totalActiveTimeMs ??
      rawTimeMetrics?.total_active_time_ms ??
      (submission as Record<string, unknown>).totalActiveTimeMs ??
      (submission as Record<string, unknown>).total_active_time_ms
  );

  const longestContinuousMs = toNumeric(
    rawTimeMetrics?.longestContinuousMs ??
      rawTimeMetrics?.longest_continuous_ms ??
      (submission as Record<string, unknown>).longestContinuousMs ??
      (submission as Record<string, unknown>).longest_continuous_ms
  );

  // 4. Impossible active-time invariants (Issue #1473)
  // 4a. Duration invariant: longest continuous session cannot physically exceed total active time
  if (longestContinuousMs > totalActiveTimeMs) {
    return {
      shouldWithhold: true,
      trigger: "impossible_active_time_rate",
      reason: `Impossible active time duration invariant: longest continuous session duration (${longestContinuousMs.toLocaleString("en-US")}ms) exceeds total active time (${totalActiveTimeMs.toLocaleString("en-US")}ms)`,
    };
  }

  // 4b. Generation rate ceiling: autoregressive output cannot physically exceed 10,000 tok/s
  // Safeguard: only output tokens are constrained; prompt cache reads are explicitly never restricted.
  if (
    totalActiveTimeMs > 0 &&
    totalOutputTokens >= WITHHOLDING_ACTIVE_TIME_OUTPUT_TOKEN_FLOOR
  ) {
    const activeSeconds = totalActiveTimeMs / 1000;
    if (activeSeconds > 0) {
      const outputTokensPerSecond = totalOutputTokens / activeSeconds;
      if (
        outputTokensPerSecond > WITHHOLDING_MAX_OUTPUT_TOKENS_PER_ACTIVE_SECOND
      ) {
        return {
          shouldWithhold: true,
          trigger: "impossible_active_time_rate",
          reason: `Impossible active-time output generation rate: ${Math.round(
            outputTokensPerSecond
          ).toLocaleString(
            "en-US"
          )} output tokens/sec exceeds physical ceiling of ${WITHHOLDING_MAX_OUTPUT_TOKENS_PER_ACTIVE_SECOND.toLocaleString(
            "en-US"
          )} tok/s (${totalOutputTokens.toLocaleString(
            "en-US"
          )} output tokens across ${activeSeconds.toFixed(1)}s active time)`,
        };
      }
    }
  }

  // 5. Slop model names with substantial volume (>= 1M tokens OR >= 5% token share)
  let totalSlopTokens = 0;
  const matchedSlopModels: string[] = [];

  for (const [modelName, tokens] of modelTokensMap.entries()) {
    if (isSlopModelName(modelName)) {
      matchedSlopModels.push(modelName);
      totalSlopTokens += Math.max(0, tokens);
    }
  }

  if (matchedSlopModels.length > 0 && totalSlopTokens > 0) {
    const meetsVolumeFloor = totalSlopTokens >= WITHHOLDING_SLOP_TOKEN_FLOOR;
    const slopShare = totalTokens > 0 ? Math.min(1, totalSlopTokens / totalTokens) : 0;
    const meetsShareFloor = totalTokens > 0 && slopShare >= WITHHOLDING_SLOP_SHARE_FLOOR;

    if (meetsVolumeFloor || meetsShareFloor) {
      const quotedModels = matchedSlopModels.slice(0, 3).map((m) => `"${m}"`).join(", ");
      const extra = matchedSlopModels.length > 3 ? ` and ${matchedSlopModels.length - 3} more` : "";
      return {
        shouldWithhold: true,
        trigger: "slop_model_name",
        reason: `Fabricated model name(s) with substantial volume (${totalSlopTokens.toLocaleString("en-US")} tokens, ${(slopShare * 100).toFixed(1)}% share): ${quotedModels}${extra}`,
      };
    }
  }

  return {
    shouldWithhold: false,
    reason: "",
  };
}

/**
 * Convenient alias for `evaluateSubmissionForWithholding`.
 */
export const evaluateWithholding = evaluateSubmissionForWithholding;

/**
 * Returns a `WithholdingResult` if the submission should be withheld, or `null` if clean.
 */
export function getSubmissionWithholding(
  submission: WithholdingSubmissionInput
): WithholdingResult | null {
  const result = evaluateSubmissionForWithholding(submission);
  return result.shouldWithhold ? result : null;
}

/**
 * Convenience boolean helper for withholding check.
 */
export function isSubmissionWithheld(submission: WithholdingSubmissionInput): boolean {
  return evaluateSubmissionForWithholding(submission).shouldWithhold;
}
