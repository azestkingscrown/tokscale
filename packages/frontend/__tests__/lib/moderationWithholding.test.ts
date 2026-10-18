import { describe, expect, it } from "vitest";
import {
  evaluateSubmissionForWithholding,
  evaluateWithholding,
  getSubmissionWithholding,
  isSubmissionWithheld,
  isSlopModelName,
  WITHHOLDING_MAX_DAILY_OUTPUT_TOKENS,
  WITHHOLDING_MAX_DAILY_TOTAL_TOKENS,
  WITHHOLDING_MAX_TOTAL_TOKENS,
  WITHHOLDING_MAX_IMPLIED_COST_PER_TOKEN,
  WITHHOLDING_SLOP_SHARE_FLOOR,
  WITHHOLDING_SLOP_TOKEN_FLOOR,
  type WithholdingSubmissionInput,
} from "@/lib/moderation/withholding";

describe("moderation withholding evaluation (Issue #1473)", () => {
  describe("Core Required Scenarios", () => {
    it("Trillion-token prompt-cache reuse with normal output -> Clean pass (no false positive)", () => {
      // 1 Trillion total tokens accumulated across multiple days from deep prompt caching.
      // Output tokens are normal, single-day totals are within 500B ceiling, and implied cost is realistic.
      const payload: WithholdingSubmissionInput = {
        summary: {
          totalTokens: 1_000_000_000_000,
          totalCost: 500,
          totalDays: 5,
          models: ["claude-3-5-sonnet-20241022"],
        },
        contributions: [
          {
            date: "2025-01-01",
            totals: { tokens: 200_000_000_000, cost: 100, messages: 500 },
            tokenBreakdown: {
              input: 100_000,
              output: 50_000,
              cacheRead: 199_999_850_000,
              cacheWrite: 0,
              reasoning: 0,
            },
            clients: [
              {
                client: "claude",
                modelId: "claude-3-5-sonnet-20241022",
                tokens: {
                  input: 100_000,
                  output: 50_000,
                  cacheRead: 199_999_850_000,
                  cacheWrite: 0,
                  reasoning: 0,
                },
                cost: 100,
                messages: 500,
              },
            ],
          },
          {
            date: "2025-01-02",
            totals: { tokens: 200_000_000_000, cost: 100, messages: 500 },
            tokenBreakdown: {
              input: 100_000,
              output: 50_000,
              cacheRead: 199_999_850_000,
              cacheWrite: 0,
              reasoning: 0,
            },
            clients: [
              {
                client: "claude",
                modelId: "claude-3-5-sonnet-20241022",
                tokens: {
                  input: 100_000,
                  output: 50_000,
                  cacheRead: 199_999_850_000,
                  cacheWrite: 0,
                  reasoning: 0,
                },
                cost: 100,
                messages: 500,
              },
            ],
          },
          {
            date: "2025-01-03",
            totals: { tokens: 200_000_000_000, cost: 100, messages: 500 },
            tokenBreakdown: {
              input: 100_000,
              output: 50_000,
              cacheRead: 199_999_850_000,
              cacheWrite: 0,
              reasoning: 0,
            },
            clients: [
              {
                client: "claude",
                modelId: "claude-3-5-sonnet-20241022",
                tokens: {
                  input: 100_000,
                  output: 50_000,
                  cacheRead: 199_999_850_000,
                  cacheWrite: 0,
                  reasoning: 0,
                },
                cost: 100,
                messages: 500,
              },
            ],
          },
          {
            date: "2025-01-04",
            totals: { tokens: 200_000_000_000, cost: 100, messages: 500 },
            tokenBreakdown: {
              input: 100_000,
              output: 50_000,
              cacheRead: 199_999_850_000,
              cacheWrite: 0,
              reasoning: 0,
            },
            clients: [
              {
                client: "claude",
                modelId: "claude-3-5-sonnet-20241022",
                tokens: {
                  input: 100_000,
                  output: 50_000,
                  cacheRead: 199_999_850_000,
                  cacheWrite: 0,
                  reasoning: 0,
                },
                cost: 100,
                messages: 500,
              },
            ],
          },
          {
            date: "2025-01-05",
            totals: { tokens: 200_000_000_000, cost: 100, messages: 500 },
            tokenBreakdown: {
              input: 100_000,
              output: 50_000,
              cacheRead: 199_999_850_000,
              cacheWrite: 0,
              reasoning: 0,
            },
            clients: [
              {
                client: "claude",
                modelId: "claude-3-5-sonnet-20241022",
                tokens: {
                  input: 100_000,
                  output: 50_000,
                  cacheRead: 199_999_850_000,
                  cacheWrite: 0,
                  reasoning: 0,
                },
                cost: 100,
                messages: 500,
              },
            ],
          },
        ],
      };

      const result = evaluateSubmissionForWithholding(payload);
      expect(result.shouldWithhold).toBe(false);
      expect(result.reason).toBe("");
      expect(result.trigger).toBeUndefined();
      expect(getSubmissionWithholding(payload)).toBeNull();
      expect(isSubmissionWithheld(payload)).toBe(false);
    });

    it("High-volume local models with $0 cost -> Clean pass", () => {
      // High volume from local inference (e.g. Ollama / LM Studio) producing $0.00 cost.
      // Must NOT be penalized by an implied rate floor.
      const payload: WithholdingSubmissionInput = {
        summary: {
          totalTokens: 100_000_000,
          totalCost: 0,
          models: ["llama-3.3-70b-instruct"],
        },
        contributions: [
          {
            date: "2025-01-10",
            totals: { tokens: 100_000_000, cost: 0, messages: 10_000 },
            tokenBreakdown: {
              input: 80_000_000,
              output: 20_000_000,
              cacheRead: 0,
              cacheWrite: 0,
              reasoning: 0,
            },
            clients: [
              {
                client: "lmstudio",
                modelId: "llama-3.3-70b-instruct",
                tokens: {
                  input: 80_000_000,
                  output: 20_000_000,
                  cacheRead: 0,
                  cacheWrite: 0,
                  reasoning: 0,
                },
                cost: 0,
                messages: 10_000,
              },
            ],
          },
        ],
      };

      const result = evaluateSubmissionForWithholding(payload);
      expect(result.shouldWithhold).toBe(false);
      expect(result.reason).toBe("");
      expect(result.trigger).toBeUndefined();
    });

    it("Config artifact with fake-model and 0 tokens -> Clean pass (#1265 compliance)", () => {
      // Configuration artifact declaring "fake-model" in summary.models with 0 tokens.
      // Adhering to #1265: must not be penalized.
      const payload: WithholdingSubmissionInput = {
        summary: {
          totalTokens: 5_000_000,
          totalCost: 15,
          models: ["claude-3-5-sonnet", "fake-model"],
        },
        contributions: [
          {
            date: "2025-01-15",
            totals: { tokens: 5_000_000, cost: 15, messages: 100 },
            tokenBreakdown: {
              input: 4_000_000,
              output: 1_000_000,
              cacheRead: 0,
              cacheWrite: 0,
              reasoning: 0,
            },
            clients: [
              {
                client: "claude",
                modelId: "claude-3-5-sonnet",
                tokens: {
                  input: 4_000_000,
                  output: 1_000_000,
                  cacheRead: 0,
                  cacheWrite: 0,
                  reasoning: 0,
                },
                cost: 15,
                messages: 100,
              },
              {
                client: "claude",
                modelId: "fake-model",
                tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0 },
                cost: 0,
                messages: 0,
              },
            ],
          },
        ],
      };

      const result = evaluateSubmissionForWithholding(payload);
      expect(result.shouldWithhold).toBe(false);
      expect(result.reason).toBe("");
    });

    it("Single-day output tokens = 20B -> Triggers withholding", () => {
      // 20 Billion output tokens in a single day exceeds LLM physical generation limit (10B).
      const payload: WithholdingSubmissionInput = {
        summary: {
          totalTokens: 20_000_000_000,
          totalCost: 50,
        },
        contributions: [
          {
            date: "2025-01-20",
            totals: { tokens: 20_000_000_000, cost: 50, messages: 100 },
            tokenBreakdown: {
              input: 0,
              output: 20_000_000_000,
              cacheRead: 0,
              cacheWrite: 0,
              reasoning: 0,
            },
            clients: [
              {
                client: "opencode",
                modelId: "gpt-4o",
                tokens: { input: 0, output: 20_000_000_000, cacheRead: 0, cacheWrite: 0, reasoning: 0 },
                cost: 50,
                messages: 100,
              },
            ],
          },
        ],
      };

      const result = evaluateSubmissionForWithholding(payload);
      expect(result.shouldWithhold).toBe(true);
      expect(result.trigger).toBe("impossible_output_tokens");
      expect(result.reason).toContain("Physically impossible output tokens on 2025-01-20");
      expect(result.reason).toContain("20,000,000,000 output tokens");
    });

    it("Quadrillion token spoofer payload -> Triggers withholding", () => {
      // Fabricated quadrillion token payload (e.g. 10^15 tokens in single-day volume).
      const payload: WithholdingSubmissionInput = {
        summary: {
          totalTokens: WITHHOLDING_MAX_TOTAL_TOKENS,
          totalCost: 100,
        },
        contributions: [
          {
            date: "2025-01-25",
            totals: { tokens: WITHHOLDING_MAX_TOTAL_TOKENS, cost: 100, messages: 1 },
            tokenBreakdown: {
              input: WITHHOLDING_MAX_TOTAL_TOKENS,
              output: 0,
              cacheRead: 0,
              cacheWrite: 0,
              reasoning: 0,
            },
            clients: [],
          },
        ],
      };

      const result = evaluateSubmissionForWithholding(payload);
      expect(result.shouldWithhold).toBe(true);
      expect(result.trigger).toBe("extreme_single_day_volume");
      expect(result.reason).toContain("Extreme");
      expect(result.reason).toContain("1,000,000,000,000,000");
    });

    it("Implied price $10,000/1M -> Triggers withholding", () => {
      // Implied price = $10,000 / 1,000,000 tokens = $0.01 / token.
      // Ceiling is $0.005 / token ($5,000 / 1M tokens).
      const payload: WithholdingSubmissionInput = {
        summary: {
          totalTokens: 1_000_000,
          totalCost: 10_000,
        },
        contributions: [
          {
            date: "2025-01-30",
            totals: { tokens: 1_000_000, cost: 10_000, messages: 10 },
            tokenBreakdown: {
              input: 500_000,
              output: 500_000,
              cacheRead: 0,
              cacheWrite: 0,
              reasoning: 0,
            },
            clients: [],
          },
        ],
      };

      const result = evaluateSubmissionForWithholding(payload);
      expect(result.shouldWithhold).toBe(true);
      expect(result.trigger).toBe("impossible_implied_cost");
      expect(result.reason).toContain("Impossible implied cost ceiling exceeded");
      expect(result.reason).toContain("$10,000.00 / 1M tokens");
    });
  });

  describe("Anti-Bypass & Vulnerability Hardening", () => {
    it("catches extreme single-day volume when spoofer understates day.totals.tokens", () => {
      // An attacker sets day.totals.tokens = 100 to mask 600B cacheRead tokens in tokenBreakdown.
      const payload: WithholdingSubmissionInput = {
        contributions: [
          {
            date: "2025-02-01",
            totals: { tokens: 100, cost: 10, messages: 1 },
            tokenBreakdown: {
              input: 0,
              output: 100,
              cacheRead: 600_000_000_000,
              cacheWrite: 0,
              reasoning: 0,
            },
          },
        ],
      };
      const result = evaluateSubmissionForWithholding(payload);
      expect(result.shouldWithhold).toBe(true);
      expect(result.trigger).toBe("extreme_single_day_volume");
    });

    it("catches impossible output tokens when spoofer sets tokenBreakdown.output = 1 while clients report 20B", () => {
      // An attacker sets tokenBreakdown.output = 1 to prevent dayOutput === 0 branch from firing.
      const payload: WithholdingSubmissionInput = {
        contributions: [
          {
            date: "2025-02-02",
            totals: { tokens: 20_000_000_000, cost: 50, messages: 100 },
            tokenBreakdown: {
              input: 0,
              output: 1, // Understated breakdown
              cacheRead: 0,
              cacheWrite: 0,
              reasoning: 0,
            },
            clients: [
              {
                client: "claude",
                modelId: "gpt-4o",
                tokens: {
                  input: 0,
                  output: 20_000_000_000,
                  cacheRead: 0,
                  cacheWrite: 0,
                  reasoning: 0,
                },
                cost: 50,
                messages: 100,
              },
            ],
          },
        ],
      };
      const result = evaluateSubmissionForWithholding(payload);
      expect(result.shouldWithhold).toBe(true);
      expect(result.trigger).toBe("impossible_output_tokens");
    });

    it("catches impossible output tokens from database scalar client.output format", () => {
      // In DB format (daily_breakdown.source_breakdown), client.output is a top-level scalar and models is {}
      const payload: WithholdingSubmissionInput = {
        contributions: [
          {
            date: "2025-02-03",
            clients: [
              {
                client: "codex",
                tokens: 15_000_000_000,
                output: 15_000_000_000,
                cost: 20,
                models: {},
              },
            ],
          },
        ],
      };
      const result = evaluateSubmissionForWithholding(payload);
      expect(result.shouldWithhold).toBe(true);
      expect(result.trigger).toBe("impossible_output_tokens");
    });

    it("evaluates slop model share accurately when only modelTokens is provided", () => {
      // 50,000 slop tokens out of 100,000 total tokens in modelTokens = 50% share (>= 5% floor)
      const payload: WithholdingSubmissionInput = {
        modelTokens: {
          "slop-llm": 50_000,
          "gpt-4o": 50_000,
        },
      };
      const result = evaluateSubmissionForWithholding(payload);
      expect(result.shouldWithhold).toBe(true);
      expect(result.trigger).toBe("slop_model_name");
      expect(result.reason).toContain('"slop-llm"');
      expect(result.reason).toContain("50.0% share");
    });

    it("evaluates 1M slop volume floor accurately when only modelTokens is provided", () => {
      const payload: WithholdingSubmissionInput = {
        modelTokens: {
          "madeup-model": 1_000_000,
          "claude-3-5-sonnet": 99_000_000,
        },
      };
      const result = evaluateSubmissionForWithholding(payload);
      expect(result.shouldWithhold).toBe(true);
      expect(result.trigger).toBe("slop_model_name");
      expect(result.reason).toContain('"madeup-model"');
    });

    it("catches impossible implied cost when spoofer sets summary.totalCost = 0.01 to mask $50,000 daily cost", () => {
      // An attacker writes summary.totalCost = 0.01, but the day's actual cost is $50,000 on 10,000 tokens
      const payload: WithholdingSubmissionInput = {
        summary: {
          totalTokens: 10_000,
          totalCost: 0.01,
        },
        contributions: [
          {
            date: "2025-02-05",
            totals: { tokens: 10_000, cost: 50_000, messages: 10 },
          },
        ],
      };
      const result = evaluateSubmissionForWithholding(payload);
      expect(result.shouldWithhold).toBe(true);
      expect(result.trigger).toBe("impossible_implied_cost");
    });

    it("catches quadrillion token spoofer that includes 1 minimal contribution day", () => {
      // Attacker submits 1 Quadrillion tokens in summary.totalTokens and adds 1 day with 100 tokens to try to bypass empty-contributions check
      const payload: WithholdingSubmissionInput = {
        summary: {
          totalTokens: WITHHOLDING_MAX_TOTAL_TOKENS,
          totalCost: 100,
          totalDays: 2,
        },
        contributions: [
          {
            date: "2025-02-06",
            totals: { tokens: 100, cost: 10, messages: 1 },
          },
        ],
      };
      const result = evaluateSubmissionForWithholding(payload);
      expect(result.shouldWithhold).toBe(true);
      expect(result.trigger).toBe("extreme_single_day_volume");
    });

    it("does not double-count tokens when both summary modelTokens and contributions are present", () => {
      // Legitimate user has 600,000 slop tokens (< 1M floor, 0.6% share) reported in both modelTokens and contributions
      const payload: WithholdingSubmissionInput = {
        totalTokens: 100_000_000,
        modelTokens: {
          "slop-experimental": 600_000,
          "gpt-4o": 99_400_000,
        },
        contributions: [
          {
            date: "2025-02-07",
            totals: { tokens: 100_000_000, cost: 100, messages: 500 },
            clients: [
              {
                client: "opencode",
                modelId: "slop-experimental",
                tokens: { input: 600_000, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0 },
                cost: 0,
                messages: 10,
              },
              {
                client: "opencode",
                modelId: "gpt-4o",
                tokens: { input: 99_400_000, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0 },
                cost: 100,
                messages: 490,
              },
            ],
          },
        ],
      };
      // Should NOT be withheld (must not double-count 600k + 600k = 1.2M)
      const result = evaluateSubmissionForWithholding(payload);
      expect(result.shouldWithhold).toBe(false);
    });

    it("handles null, undefined, or empty submission gracefully without throwing", () => {
      expect(evaluateSubmissionForWithholding(null as unknown as WithholdingSubmissionInput)).toEqual({
        shouldWithhold: false,
        reason: "",
      });
      expect(evaluateSubmissionForWithholding(undefined as unknown as WithholdingSubmissionInput)).toEqual({
        shouldWithhold: false,
        reason: "",
      });
      expect(evaluateSubmissionForWithholding({})).toEqual({
        shouldWithhold: false,
        reason: "",
      });
    });
  });

  describe("Trigger: Slop Model Names with Substantial Volume", () => {
    it("flags slop model with >= 1,000,000 tokens even if token share is small", () => {
      // 1.5M slop tokens out of 100M total (1.5% share < 5%), but meets 1M volume floor
      const payload: WithholdingSubmissionInput = {
        summary: {
          totalTokens: 100_000_000,
          totalCost: 50,
          models: ["slopllm-v1", "claude-3-5-sonnet"],
        },
        contributions: [
          {
            date: "2025-02-01",
            totals: { tokens: 100_000_000, cost: 50, messages: 1000 },
            tokenBreakdown: { input: 90_000_000, output: 10_000_000, cacheRead: 0, cacheWrite: 0, reasoning: 0 },
            clients: [
              {
                client: "claude",
                modelId: "slopllm-v1",
                tokens: { input: 1_500_000, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0 },
                cost: 0,
                messages: 10,
              },
              {
                client: "claude",
                modelId: "claude-3-5-sonnet",
                tokens: { input: 88_500_000, output: 10_000_000, cacheRead: 0, cacheWrite: 0, reasoning: 0 },
                cost: 50,
                messages: 990,
              },
            ],
          },
        ],
      };

      const result = evaluateSubmissionForWithholding(payload);
      expect(result.shouldWithhold).toBe(true);
      expect(result.trigger).toBe("slop_model_name");
      expect(result.reason).toContain('"slopllm-v1"');
      expect(result.reason).toContain("1,500,000 tokens");
    });

    it("flags slop model with >= 5% share even if volume < 1M tokens", () => {
      // 100,000 slop tokens out of 1,000,000 total = 10% share (>= 5%)
      const payload: WithholdingSubmissionInput = {
        summary: {
          totalTokens: 1_000_000,
          totalCost: 5,
        },
        contributions: [
          {
            date: "2025-02-02",
            totals: { tokens: 1_000_000, cost: 5, messages: 100 },
            tokenBreakdown: { input: 900_000, output: 100_000, cacheRead: 0, cacheWrite: 0, reasoning: 0 },
            clients: [
              {
                client: "opencode",
                modelId: "dummy-test-llm",
                tokens: { input: 100_000, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0 },
                cost: 0,
                messages: 10,
              },
              {
                client: "opencode",
                modelId: "gpt-4o",
                tokens: { input: 800_000, output: 100_000, cacheRead: 0, cacheWrite: 0, reasoning: 0 },
                cost: 5,
                messages: 90,
              },
            ],
          },
        ],
      };

      const result = evaluateSubmissionForWithholding(payload);
      expect(result.shouldWithhold).toBe(true);
      expect(result.trigger).toBe("slop_model_name");
      expect(result.reason).toContain('"dummy-test-llm"');
      expect(result.reason).toContain("10.0% share");
    });

    it("does not flag negligible slop tokens (< 1M tokens AND < 5% share)", () => {
      // 100 tokens out of 10,000,000 total = 0.001% share (< 5%) and < 1M tokens
      const payload: WithholdingSubmissionInput = {
        summary: {
          totalTokens: 10_000_000,
          totalCost: 20,
        },
        contributions: [
          {
            date: "2025-02-03",
            totals: { tokens: 10_000_000, cost: 20, messages: 100 },
            tokenBreakdown: { input: 9_000_000, output: 1_000_000, cacheRead: 0, cacheWrite: 0, reasoning: 0 },
            clients: [
              {
                client: "opencode",
                modelId: "bogus-model",
                tokens: { input: 100, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0 },
                cost: 0,
                messages: 1,
              },
              {
                client: "opencode",
                modelId: "claude-3-5-sonnet",
                tokens: { input: 8_999_900, output: 1_000_000, cacheRead: 0, cacheWrite: 0, reasoning: 0 },
                cost: 20,
                messages: 99,
              },
            ],
          },
        ],
      };

      const result = evaluateSubmissionForWithholding(payload);
      expect(result.shouldWithhold).toBe(false);
      expect(result.reason).toBe("");
    });

    it("detects slop model in database nested format (client.models)", () => {
      const payload: WithholdingSubmissionInput = {
        summary: {
          totalTokens: 2_000_000,
          totalCost: 10,
        },
        contributions: [
          {
            date: "2025-02-04",
            totals: { tokens: 2_000_000, cost: 10, messages: 50 },
            tokenBreakdown: { input: 1_800_000, output: 200_000, cacheRead: 0, cacheWrite: 0, reasoning: 0 },
            clients: [
              {
                client: "claude",
                modelId: "",
                cost: 10,
                messages: 50,
                models: {
                  "notreal-frontier-3": {
                    tokens: 500_000, // 25% share
                    cost: 0,
                    input: 500_000,
                    output: 0,
                    cacheRead: 0,
                    cacheWrite: 0,
                    reasoning: 0,
                    messages: 10,
                  },
                  "claude-3-5-sonnet": {
                    tokens: 1_500_000,
                    cost: 10,
                    input: 1_300_000,
                    output: 200_000,
                    cacheRead: 0,
                    cacheWrite: 0,
                    reasoning: 0,
                    messages: 40,
                  },
                },
              },
            ],
          },
        ],
      };

      const result = evaluateSubmissionForWithholding(payload);
      expect(result.shouldWithhold).toBe(true);
      expect(result.trigger).toBe("slop_model_name");
      expect(result.reason).toContain('"notreal-frontier-3"');
    });

    it("handles boundary values for slop model thresholds", () => {
      // Exactly 1,000,000 tokens on 50,000,000 total (2% share) -> meets volume floor
      const payloadVolumeBoundary: WithholdingSubmissionInput = {
        totalTokens: 50_000_000,
        totalCost: 10,
        modelTokens: {
          "madeup-model": WITHHOLDING_SLOP_TOKEN_FLOOR,
          "gpt-4o": 49_000_000,
        },
      };
      expect(evaluateSubmissionForWithholding(payloadVolumeBoundary).shouldWithhold).toBe(true);

      // Exactly 999,999 tokens on 50,000,000 total (1.99% share) -> clean pass
      const payloadUnderVolume: WithholdingSubmissionInput = {
        totalTokens: 50_000_000,
        totalCost: 10,
        modelTokens: {
          "madeup-model": WITHHOLDING_SLOP_TOKEN_FLOOR - 1,
          "gpt-4o": 49_000_001,
        },
      };
      expect(evaluateSubmissionForWithholding(payloadUnderVolume).shouldWithhold).toBe(false);

      // Exactly 5% share (50,000 on 1,000,000) -> meets share floor
      const payloadShareBoundary: WithholdingSubmissionInput = {
        totalTokens: 1_000_000,
        totalCost: 5,
        modelTokens: {
          "fake-api": 1_000_000 * WITHHOLDING_SLOP_SHARE_FLOOR,
          "gpt-4o": 1_000_000 * (1 - WITHHOLDING_SLOP_SHARE_FLOOR),
        },
      };
      expect(evaluateSubmissionForWithholding(payloadShareBoundary).shouldWithhold).toBe(true);

      // Exactly 4.9% share (49,000 on 1,000,000) -> clean pass
      const payloadUnderShare: WithholdingSubmissionInput = {
        totalTokens: 1_000_000,
        totalCost: 5,
        modelTokens: {
          "fake-api": 1_000_000 * (WITHHOLDING_SLOP_SHARE_FLOOR - 0.001),
          "gpt-4o": 1_000_000 - 1_000_000 * (WITHHOLDING_SLOP_SHARE_FLOOR - 0.001),
        },
      };
      expect(evaluateSubmissionForWithholding(payloadUnderShare).shouldWithhold).toBe(false);
    });
  });

  describe("Trigger: Physically Impossible Output Tokens Boundaries & Safeguards", () => {
    it("passes at exactly 10,000,000,000 output tokens", () => {
      const payload: WithholdingSubmissionInput = {
        contributions: [
          {
            date: "2025-02-10",
            tokenBreakdown: {
              input: 1_000_000,
              output: WITHHOLDING_MAX_DAILY_OUTPUT_TOKENS,
              cacheRead: 0,
              cacheWrite: 0,
              reasoning: 0,
            },
          },
        ],
      };
      expect(evaluateSubmissionForWithholding(payload).shouldWithhold).toBe(false);
    });

    it("triggers at 10,000,000,001 output tokens", () => {
      const payload: WithholdingSubmissionInput = {
        contributions: [
          {
            date: "2025-02-10",
            tokenBreakdown: {
              input: 1_000_000,
              output: WITHHOLDING_MAX_DAILY_OUTPUT_TOKENS + 1,
              cacheRead: 0,
              cacheWrite: 0,
              reasoning: 0,
            },
          },
        ],
      };
      const result = evaluateSubmissionForWithholding(payload);
      expect(result.shouldWithhold).toBe(true);
      expect(result.trigger).toBe("impossible_output_tokens");
    });

    it("catches impossible output tokens across multi-day submission", () => {
      const payload: WithholdingSubmissionInput = {
        contributions: [
          {
            date: "2025-02-11",
            tokenBreakdown: { input: 100_000, output: 50_000, cacheRead: 0, cacheWrite: 0, reasoning: 0 },
          },
          {
            date: "2025-02-12",
            tokenBreakdown: { input: 100_000, output: 15_000_000_000, cacheRead: 0, cacheWrite: 0, reasoning: 0 },
          },
        ],
      };
      const result = evaluateSubmissionForWithholding(payload);
      expect(result.shouldWithhold).toBe(true);
      expect(result.trigger).toBe("impossible_output_tokens");
      expect(result.reason).toContain("2025-02-12");
    });
  });

  describe("Trigger: Extreme Single-Day Volume Ceiling Boundaries", () => {
    it("passes at exactly 500,000,000,000 tokens in a single day", () => {
      const payload: WithholdingSubmissionInput = {
        contributions: [
          {
            date: "2025-02-15",
            totals: { tokens: WITHHOLDING_MAX_DAILY_TOTAL_TOKENS, cost: 100, messages: 1000 },
            tokenBreakdown: { input: 1000, output: 1000, cacheRead: WITHHOLDING_MAX_DAILY_TOTAL_TOKENS - 2000, cacheWrite: 0, reasoning: 0 },
          },
        ],
      };
      expect(evaluateSubmissionForWithholding(payload).shouldWithhold).toBe(false);
    });

    it("triggers at 500,000,000,001 tokens in a single day", () => {
      const payload: WithholdingSubmissionInput = {
        contributions: [
          {
            date: "2025-02-15",
            totals: { tokens: WITHHOLDING_MAX_DAILY_TOTAL_TOKENS + 1, cost: 100, messages: 1000 },
            tokenBreakdown: { input: 1000, output: 1000, cacheRead: WITHHOLDING_MAX_DAILY_TOTAL_TOKENS - 1999, cacheWrite: 0, reasoning: 0 },
          },
        ],
      };
      const result = evaluateSubmissionForWithholding(payload);
      expect(result.shouldWithhold).toBe(true);
      expect(result.trigger).toBe("extreme_single_day_volume");
    });

    it("triggers when payload has no contributions but totalTokens > 500B", () => {
      const payload: WithholdingSubmissionInput = {
        summary: {
          totalTokens: 800_000_000_000,
          totalCost: 100,
        },
        contributions: [],
      };
      const result = evaluateSubmissionForWithholding(payload);
      expect(result.shouldWithhold).toBe(true);
      expect(result.trigger).toBe("extreme_single_day_volume");
    });
  });

  describe("Trigger: Impossible Implied Cost Ceiling Boundaries", () => {
    it("passes at exactly $5,000 / 1M tokens ($0.005/token)", () => {
      const payload: WithholdingSubmissionInput = {
        totalTokens: 1_000_000,
        totalCost: 1_000_000 * WITHHOLDING_MAX_IMPLIED_COST_PER_TOKEN, // $5,000
      };
      expect(evaluateSubmissionForWithholding(payload).shouldWithhold).toBe(false);
    });

    it("triggers at $5,001 / 1M tokens", () => {
      const payload: WithholdingSubmissionInput = {
        totalTokens: 1_000_000,
        totalCost: 5_001,
      };
      const result = evaluateSubmissionForWithholding(payload);
      expect(result.shouldWithhold).toBe(true);
      expect(result.trigger).toBe("impossible_implied_cost");
      expect(result.reason).toContain("$5,001.00 / 1M tokens");
    });

    it("does not trigger when totalCost is 0 (safeguard for free & local models)", () => {
      const payload: WithholdingSubmissionInput = {
        totalTokens: 500_000_000,
        totalCost: 0,
      };
      expect(evaluateSubmissionForWithholding(payload).shouldWithhold).toBe(false);
    });

    it("does not trigger when totalTokens is 0", () => {
      const payload: WithholdingSubmissionInput = {
        totalTokens: 0,
        totalCost: 10,
      };
      expect(evaluateSubmissionForWithholding(payload).shouldWithhold).toBe(false);
    });
  });

  describe("isSlopModelName Pattern Matching", () => {
    it("matches slop model names", () => {
      expect(isSlopModelName("slopllm")).toBe(true);
      expect(isSlopModelName("SlopLLM")).toBe(true);
      expect(isSlopModelName("slop-llm")).toBe(true);
      expect(isSlopModelName("slopai/slopllm:5m")).toBe(true);
      expect(isSlopModelName("fake")).toBe(true);
      expect(isSlopModelName("fake-model")).toBe(true);
      expect(isSlopModelName("gpt-4-fake")).toBe(true);
      expect(isSlopModelName("dummy")).toBe(true);
      expect(isSlopModelName("my_dummy_model")).toBe(true);
      expect(isSlopModelName("bogus")).toBe(true);
      expect(isSlopModelName("bogus-v1")).toBe(true);
      expect(isSlopModelName("notreal")).toBe(true);
      expect(isSlopModelName("notreal-coder")).toBe(true);
      expect(isSlopModelName("madeup")).toBe(true);
      expect(isSlopModelName("madeup-ai")).toBe(true);
    });

    it("does not match legitimate model names or embedded substrings", () => {
      expect(isSlopModelName("notaslopname")).toBe(false);
      expect(isSlopModelName("xfakey")).toBe(false);
      expect(isSlopModelName("claude-3-5-sonnet-20241022")).toBe(false);
      expect(isSlopModelName("gpt-4o")).toBe(false);
      expect(isSlopModelName("deepseek-v3")).toBe(false);
      expect(isSlopModelName("qwen-2.5-coder-32b")).toBe(false);
      expect(isSlopModelName("gemini-2.5-flash")).toBe(false);
      expect(isSlopModelName("")).toBe(false);
    });
  });

  describe("Trigger: Impossible Active Time Rate & Duration Invariant Boundaries", () => {
    it("passes legitimate multi-stream run within active time ceiling (e.g. 50 parallel agents)", () => {
      // 50 parallel streams generating for 1 hour (3,600s = 3,600,000ms active time).
      // 50 streams * 50 tok/s * 3,600s = 9,000,000 output tokens.
      // Rate = 9,000,000 / 3,600 = 2,500 tok/s (well within 10,000 tok/s ceiling).
      const payload: WithholdingSubmissionInput = {
        totalTokens: 15_000_000,
        totalCost: 50,
        outputTokens: 9_000_000,
        timeMetrics: {
          totalActiveTimeMs: 3_600_000,
          longestContinuousMs: 1_800_000,
          maxConcurrentSessions: 50,
          sessionCount: 50,
        },
      };

      const result = evaluateSubmissionForWithholding(payload);
      expect(result.shouldWithhold).toBe(false);
    });

    it("passes boundary active-time generation rate at exactly 10,000 output tokens/sec", () => {
      // Exactly 10,000,000 output tokens in 1,000s (1,000,000ms active time) = 10,000 tok/s.
      const payload: WithholdingSubmissionInput = {
        totalTokens: 10_000_000,
        totalCost: 30,
        outputTokens: 10_000_000,
        timeMetrics: {
          totalActiveTimeMs: 1_000_000,
          longestContinuousMs: 500_000,
        },
      };

      const result = evaluateSubmissionForWithholding(payload);
      expect(result.shouldWithhold).toBe(false);
    });

    it("triggers withholding when output rate exceeds 10,000 output tokens/sec", () => {
      // 10,000,001 output tokens in 1,000s (1,000,000ms active time) = 10,000.001 tok/s.
      const payload: WithholdingSubmissionInput = {
        totalTokens: 10_000_001,
        totalCost: 30,
        outputTokens: 10_000_001,
        timeMetrics: {
          totalActiveTimeMs: 1_000_000,
          longestContinuousMs: 500_000,
        },
      };

      const result = evaluateSubmissionForWithholding(payload);
      expect(result.shouldWithhold).toBe(true);
      expect(result.trigger).toBe("impossible_active_time_rate");
      expect(result.reason).toContain("Impossible active-time output generation rate");
      expect(result.reason).toContain("10,000 tok/s");
    });

    it("triggers withholding for spoofer fabricating 50M output tokens in 10s active time", () => {
      // 50,000,000 output tokens in 10,000ms (10s) = 5,000,000 tok/s >> 10,000 ceiling.
      const payload: WithholdingSubmissionInput = {
        totalTokens: 50_000_000,
        totalCost: 100,
        outputTokens: 50_000_000,
        timeMetrics: {
          totalActiveTimeMs: 10_000,
          longestContinuousMs: 10_000,
          sessionCount: 1,
        },
      };

      const result = evaluateSubmissionForWithholding(payload);
      expect(result.shouldWithhold).toBe(true);
      expect(result.trigger).toBe("impossible_active_time_rate");
      expect(result.reason).toContain("5,000,000 output tokens/sec");
    });

    it("safeguard: prompt cacheRead tokens are explicitly NOT constrained by active-time rate", () => {
      // 100 Billion prompt cache reads in 10s active time, but output is only 50,000 tokens (< 1M floor, rate 5,000 tok/s).
      const payload: WithholdingSubmissionInput = {
        totalTokens: 100_000_050_000,
        totalCost: 200,
        tokenBreakdown: {
          input: 100_000,
          output: 50_000,
          cacheRead: 99_999_900_000,
          cacheWrite: 0,
          reasoning: 0,
        },
        timeMetrics: {
          totalActiveTimeMs: 10_000,
          longestContinuousMs: 10_000,
        },
      };

      const result = evaluateSubmissionForWithholding(payload);
      expect(result.shouldWithhold).toBe(false);
    });

    it("safeguard: output token floor protects small runs or short test scripts (< 1,000,000 output tokens)", () => {
      // 500,000 output tokens in 10s active time (50,000 tok/s > 10,000, but < 1M floor).
      const payload: WithholdingSubmissionInput = {
        totalTokens: 500_000,
        totalCost: 2,
        outputTokens: 500_000,
        timeMetrics: {
          totalActiveTimeMs: 10_000,
          longestContinuousMs: 10_000,
        },
      };

      const result = evaluateSubmissionForWithholding(payload);
      expect(result.shouldWithhold).toBe(false);
    });

    it("triggers withholding when longestContinuousMs > totalActiveTimeMs (impossible duration invariant)", () => {
      // Invariant violation: single session continuous duration cannot physically exceed total active time.
      const payload: WithholdingSubmissionInput = {
        totalTokens: 10_000,
        totalCost: 1,
        timeMetrics: {
          totalActiveTimeMs: 60_000,
          longestContinuousMs: 120_000,
        },
      };

      const result = evaluateSubmissionForWithholding(payload);
      expect(result.shouldWithhold).toBe(true);
      expect(result.trigger).toBe("impossible_active_time_rate");
      expect(result.reason).toContain("Impossible active time duration invariant");
      expect(result.reason).toContain("120,000ms");
      expect(result.reason).toContain("60,000ms");
    });

    it("passes when longestContinuousMs === totalActiveTimeMs (single uninterrupted session)", () => {
      const payload: WithholdingSubmissionInput = {
        totalTokens: 10_000,
        totalCost: 1,
        timeMetrics: {
          totalActiveTimeMs: 60_000,
          longestContinuousMs: 60_000,
        },
      };

      const result = evaluateSubmissionForWithholding(payload);
      expect(result.shouldWithhold).toBe(false);
    });

    it("supports snake_case time_metrics payload structure", () => {
      const payload: WithholdingSubmissionInput = {
        totalTokens: 50_000_000,
        totalCost: 100,
        outputTokens: 50_000_000,
        time_metrics: {
          total_active_time_ms: 10_000,
          longest_continuous_ms: 5_000,
        },
      };

      const result = evaluateSubmissionForWithholding(payload);
      expect(result.shouldWithhold).toBe(true);
      expect(result.trigger).toBe("impossible_active_time_rate");
    });

    it("handles zero or missing active time gracefully without division by zero", () => {
      const payload: WithholdingSubmissionInput = {
        totalTokens: 2_000_000,
        totalCost: 5,
        outputTokens: 2_000_000,
        timeMetrics: {
          totalActiveTimeMs: 0,
          longestContinuousMs: 0,
        },
      };

      const result = evaluateSubmissionForWithholding(payload);
      expect(result.shouldWithhold).toBe(false);
    });

    it("triggers withholding when totalActiveTimeMs is 0 but longestContinuousMs > 0", () => {
      const payload: WithholdingSubmissionInput = {
        totalTokens: 50_000,
        totalCost: 1,
        outputTokens: 25_000,
        timeMetrics: {
          totalActiveTimeMs: 0,
          longestContinuousMs: 10_000, // 10s continuous session cannot exist with 0ms active time
        },
      };

      const result = evaluateSubmissionForWithholding(payload);
      expect(result.shouldWithhold).toBe(true);
      expect(result.trigger).toBe("impossible_active_time_rate");
      expect(result.reason).toContain("Impossible active time duration invariant");
    });

    it("accepts timeMetrics nested under summary.timeMetrics", () => {
      const payload: WithholdingSubmissionInput = {
        summary: {
          totalTokens: 50_000_000,
          totalCost: 100,
          timeMetrics: {
            totalActiveTimeMs: 10_000,
            longestContinuousMs: 5_000,
          },
        },
        outputTokens: 50_000_000,
      };

      const result = evaluateSubmissionForWithholding(payload);
      expect(result.shouldWithhold).toBe(true);
      expect(result.trigger).toBe("impossible_active_time_rate");
    });

    it("accepts snake_case time_metrics nested under summary.time_metrics", () => {
      const payload: WithholdingSubmissionInput = {
        summary: {
          totalTokens: 50_000_000,
          totalCost: 100,
          time_metrics: {
            total_active_time_ms: 10_000,
            longest_continuous_ms: 5_000,
          },
        },
        outputTokens: 50_000_000,
      };

      const result = evaluateSubmissionForWithholding(payload);
      expect(result.shouldWithhold).toBe(true);
      expect(result.trigger).toBe("impossible_active_time_rate");
    });
  });

  describe("API helpers", () => {
    it("evaluateWithholding is identical to evaluateSubmissionForWithholding", () => {
      const payload: WithholdingSubmissionInput = {
        totalTokens: 10_000,
        totalCost: 1,
      };
      expect(evaluateWithholding(payload)).toEqual(evaluateSubmissionForWithholding(payload));
    });

    it("getSubmissionWithholding returns null on clean submission and object on violation", () => {
      const cleanPayload: WithholdingSubmissionInput = {
        totalTokens: 10_000,
        totalCost: 1,
      };
      expect(getSubmissionWithholding(cleanPayload)).toBeNull();

      const invalidPayload: WithholdingSubmissionInput = {
        totalTokens: 1_000_000,
        totalCost: 10_000,
      };
      const res = getSubmissionWithholding(invalidPayload);
      expect(res).not.toBeNull();
      expect(res?.shouldWithhold).toBe(true);
    });

    it("isSubmissionWithheld returns boolean", () => {
      expect(isSubmissionWithheld({ totalTokens: 10_000, totalCost: 1 })).toBe(false);
      expect(isSubmissionWithheld({ totalTokens: 1_000_000, totalCost: 10_000 })).toBe(true);
    });
  });
});
