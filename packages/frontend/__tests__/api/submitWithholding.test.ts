import { beforeEach, describe, expect, it, vi } from "vitest";
import { users, moderationActions } from "@/lib/db/schema";

const mockState = vi.hoisted(() => {
  const authenticatePersonalToken = vi.fn();
  const validateSubmission = vi.fn();
  const generateSubmissionHash = vi.fn(() => "hash-123");
  const revalidateTag = vi.fn();
  const revalidatePath = vi.fn();
  const revalidateUsernamePaths = vi.fn();
  const revalidateUserGroupLeaderboards = vi.fn();
  const getLeaderboardData = vi.fn();

  const db = {
    transaction: vi.fn(),
  };

  return {
    authenticatePersonalToken,
    validateSubmission,
    generateSubmissionHash,
    revalidateTag,
    revalidatePath,
    revalidateUsernamePaths,
    revalidateUserGroupLeaderboards,
    getLeaderboardData,
    db,
    reset() {
      authenticatePersonalToken.mockReset();
      validateSubmission.mockReset();
      generateSubmissionHash.mockClear();
      revalidateTag.mockClear();
      revalidatePath.mockClear();
      revalidateUsernamePaths.mockReset();
      revalidateUserGroupLeaderboards.mockReset();
      getLeaderboardData.mockReset();
      db.transaction.mockReset();
    },
  };
});

vi.mock("next/cache", () => ({
  revalidateTag: mockState.revalidateTag,
  revalidatePath: mockState.revalidatePath,
}));

vi.mock("@/lib/auth/personalTokens", () => ({
  authenticatePersonalToken: mockState.authenticatePersonalToken,
}));

vi.mock("@/lib/db", () => ({
  db: mockState.db,
  apiTokens: { id: "apiTokens.id" },
  submissions: {
    id: "submissions.id",
    userId: "submissions.userId",
    totalTokens: "submissions.totalTokens",
    totalCost: "submissions.totalCost",
    inputTokens: "submissions.inputTokens",
    outputTokens: "submissions.outputTokens",
    cacheCreationTokens: "submissions.cacheCreationTokens",
    cacheReadTokens: "submissions.cacheReadTokens",
    reasoningTokens: "submissions.reasoningTokens",
    dateStart: "submissions.dateStart",
    dateEnd: "submissions.dateEnd",
    sourcesUsed: "submissions.sourcesUsed",
    modelsUsed: "submissions.modelsUsed",
    cliVersion: "submissions.cliVersion",
    submissionHash: "submissions.submissionHash",
    schemaVersion: "submissions.schemaVersion",
  },
  submittedDevices: {
    id: "submittedDevices.id",
    userId: "submittedDevices.userId",
    deviceKey: "submittedDevices.deviceKey",
    displayName: "submittedDevices.displayName",
    lastSubmittedAt: "submittedDevices.lastSubmittedAt",
    updatedAt: "submittedDevices.updatedAt",
  },
  dailyBreakdown: {
    id: "dailyBreakdown.id",
    submissionId: "dailyBreakdown.submissionId",
    submittedDeviceId: "dailyBreakdown.submittedDeviceId",
    date: "dailyBreakdown.date",
    timestampMs: "dailyBreakdown.timestampMs",
    sourceBreakdown: "dailyBreakdown.sourceBreakdown",
    tokens: "dailyBreakdown.tokens",
    cost: "dailyBreakdown.cost",
    inputTokens: "dailyBreakdown.inputTokens",
    outputTokens: "dailyBreakdown.outputTokens",
  },
}));

vi.mock("@/lib/validation/submission", () => ({
  validateSubmission: mockState.validateSubmission,
  generateSubmissionHash: mockState.generateSubmissionHash,
}));

vi.mock("@/lib/db/usernameLookup", () => ({
  normalizeUsernameCacheKey: (username: string) => username.toLowerCase(),
  revalidateUsernamePaths: mockState.revalidateUsernamePaths,
}));

vi.mock("@/lib/groups/cache", () => ({
  revalidateUserGroupLeaderboards: mockState.revalidateUserGroupLeaderboards,
}));

vi.mock("@/lib/leaderboard/getLeaderboard", () => ({
  getLeaderboardData: mockState.getLeaderboardData,
}));

type ModuleExports = typeof import("../../src/app/api/submit/route");
let POST: ModuleExports["POST"];

beforeEach(async () => {
  mockState.reset();
  delete process.env.ENABLE_SUBMISSION_AUTOHIDE;
  const routeModule = await import("../../src/app/api/submit/route");
  POST = routeModule.POST;
});

function makeAwaitableBuilder(result: unknown) {
  const builder = {
    from: vi.fn(() => builder),
    where: vi.fn(() => builder),
    for: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    orderBy: vi.fn(() => builder),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(resolve(result)),
  };
  return builder;
}

interface MockTxOptions {
  userLeaderboardHidden?: boolean;
  usersUpdateReturnedRows?: Array<{ id: string }>;
  latestModAction?: { action: string; actorUsername: string | null } | null;
  aggregates?: {
    totalTokens: number;
    totalCost: string;
    inputTokens: number;
    outputTokens: number;
  };
  deviceTotals?: {
    totalActiveTimeMs: number;
    longestContinuousMs: number;
    maxConcurrentSessions: number;
    sessionCount: number;
  };
  allDaysSourceBreakdown?: Record<string, unknown>;
  allDaysRows?: unknown[];
}

function setupMockTx(options: MockTxOptions = {}) {
  const userHidden = options.userLeaderboardHidden ?? false;
  const usersReturned = options.usersUpdateReturnedRows ?? [{ id: "user-1" }];
  const latestAction = options.latestModAction !== undefined ? options.latestModAction : null;

  const aggregates = options.aggregates ?? {
    totalTokens: 10_000,
    totalCost: "0.0500",
    inputTokens: 5_000,
    outputTokens: 5_000,
  };

  const deviceTotals = options.deviceTotals ?? {
    totalActiveTimeMs: 60_000,
    longestContinuousMs: 30_000,
    maxConcurrentSessions: 1,
    sessionCount: 2,
  };

  const allDaysBreakdown = options.allDaysSourceBreakdown ?? {
    claude: {
      tokens: aggregates.totalTokens,
      cost: parseFloat(aggregates.totalCost),
      input: aggregates.inputTokens,
      output: aggregates.outputTokens,
      models: {
        "claude-3-5-sonnet-20241022": {
          tokens: aggregates.totalTokens,
          output: aggregates.outputTokens,
        },
      },
    },
  };

  const usersUpdates: unknown[] = [];
  const moderationActionInserts: unknown[] = [];
  const submissionsUpdates: unknown[] = [];

  const defaultAllDaysRows = [
    {
      date: "2026-04-30",
      tokens: aggregates.totalTokens,
      cost: aggregates.totalCost,
      inputTokens: aggregates.inputTokens,
      outputTokens: aggregates.outputTokens,
      sourceBreakdown: allDaysBreakdown,
    },
  ];

  const tx = {
    select: vi.fn((columns: Record<string, unknown>) => {
      const keys = Object.keys(columns);
      if (keys.includes("leaderboardHidden")) {
        return makeAwaitableBuilder([{ leaderboardHidden: userHidden }]);
      }
      if (keys.includes("action") && keys.includes("actorUsername")) {
        return makeAwaitableBuilder(latestAction ? [latestAction] : []);
      }
      if (keys.includes("totalTokens")) {
        return makeAwaitableBuilder([
          {
            ...aggregates,
            dateStart: "2026-04-30",
            dateEnd: "2026-04-30",
            activeDays: 1,
            rowCount: 1,
            costIsComplete: true,
          },
        ]);
      }
      if (keys.includes("totalActiveTimeMs")) {
        return makeAwaitableBuilder([deviceTotals]);
      }
      if (keys.includes("sourceBreakdown")) {
        return makeAwaitableBuilder(options.allDaysRows ?? defaultAllDaysRows);
      }
      // default: device / submission checks
      return makeAwaitableBuilder([{ id: "sub-1" }]);
    }),
    update: vi.fn((table: unknown) => {
      const builder = {
        set: vi.fn((values: unknown) => {
          if (table === users) {
            usersUpdates.push(values);
          } else {
            submissionsUpdates.push(values);
          }
          return builder;
        }),
        where: vi.fn(() => {
          if (table === users) {
            return {
              returning: vi.fn(() => Promise.resolve(usersReturned)),
              then: (resolve: (value: unknown) => unknown) => Promise.resolve(resolve(usersReturned)),
            };
          }
          return Promise.resolve();
        }),
      };
      return builder;
    }),
    insert: vi.fn((table: unknown) => {
      const builder = {
        values: vi.fn((values: unknown) => {
          if (table === moderationActions) {
            moderationActionInserts.push(values);
          }
          return builder;
        }),
        onConflictDoUpdate: vi.fn(() => builder),
        returning: vi.fn(() => Promise.resolve([{ id: "row-1" }])),
      };
      return builder;
    }),
    execute: vi.fn(() => Promise.resolve()),
  };

  mockState.db.transaction.mockImplementation(async (cb: (t: typeof tx) => Promise<unknown>) => cb(tx));

  return { tx, usersUpdates, moderationActionInserts, submissionsUpdates };
}

function createRequest(body: unknown) {
  return new Request("http://localhost:3000/api/submit", {
    method: "POST",
    headers: {
      Authorization: "Bearer tt_valid",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/submit - Automated Leaderboard Withholding (Issue #1473)", () => {
  beforeEach(() => {
    mockState.authenticatePersonalToken.mockResolvedValue({
      status: "valid",
      tokenId: "token-1",
      userId: "user-1",
      username: "alice",
      displayName: "Alice",
      avatarUrl: null,
      expiresAt: null,
    });
  });

  it("keeps normal, legitimate submissions active on the leaderboard", async () => {
    const { usersUpdates, moderationActionInserts } = setupMockTx({
      userLeaderboardHidden: false,
      aggregates: {
        totalTokens: 10_000,
        totalCost: "0.0500",
        inputTokens: 5_000,
        outputTokens: 5_000,
      },
      deviceTotals: {
        totalActiveTimeMs: 60_000,
        longestContinuousMs: 30_000,
        maxConcurrentSessions: 1,
        sessionCount: 2,
      },
    });

    mockState.validateSubmission.mockReturnValue({
      valid: true,
      data: {
        device: { id: "dev-1", name: "Laptop" },
        meta: { version: "1.0.0", dateRange: { start: "2026-04-30", end: "2026-04-30" } },
        summary: { clients: ["claude"], totalTokens: 10_000, totalCost: 0.05 },
        contributions: [{ date: "2026-04-30", clients: [] }],
      },
      errors: [],
      warnings: [],
    });

    const response = await POST(createRequest({}));
    expect(response.status).toBe(200);

    expect(usersUpdates).toHaveLength(0);
    expect(moderationActionInserts).toHaveLength(0);
    expect(mockState.revalidatePath).not.toHaveBeenCalled();
  });

  it("atomically withholds a spoofer with impossible active time rate and logs audit record", async () => {
    // 50,000,000 output tokens in 10s active time (5M tok/s >> 10k ceiling)
    const { usersUpdates, moderationActionInserts } = setupMockTx({
      userLeaderboardHidden: false,
      aggregates: {
        totalTokens: 50_000_000,
        totalCost: "50.0000",
        inputTokens: 0,
        outputTokens: 50_000_000,
      },
      deviceTotals: {
        totalActiveTimeMs: 10_000, // 10s
        longestContinuousMs: 10_000,
        maxConcurrentSessions: 1,
        sessionCount: 1,
      },
      allDaysSourceBreakdown: {
        claude: {
          tokens: 50_000_000,
          cost: 50,
          input: 0,
          output: 50_000_000,
          models: {
            "claude-3-5-sonnet-20241022": {
              tokens: 50_000_000,
              output: 50_000_000,
            },
          },
        },
      },
    });

    mockState.validateSubmission.mockReturnValue({
      valid: true,
      data: {
        device: { id: "dev-1", name: "Laptop" },
        meta: { version: "1.0.0", dateRange: { start: "2026-04-30", end: "2026-04-30" } },
        summary: { clients: ["claude"], totalTokens: 50_000_000, totalCost: 50 },
        contributions: [{ date: "2026-04-30", clients: [] }],
      },
      errors: [],
      warnings: [],
    });

    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const response = await POST(createRequest({}));
    expect(response.status).toBe(200);

    expect(usersUpdates).toHaveLength(1);
    expect(usersUpdates[0]).toMatchObject({
      leaderboardHidden: true,
      updatedAt: expect.any(Date),
    });

    expect(moderationActionInserts).toHaveLength(1);
    expect(moderationActionInserts[0]).toEqual({
      targetUserId: "user-1",
      targetUsername: "alice",
      actorUserId: null,
      actorUsername: "system",
      action: "hide",
      reason: "Under investigation",
    });

    expect(mockState.revalidatePath).toHaveBeenCalledWith("/");
    expect(mockState.revalidatePath).toHaveBeenCalledWith("/leaderboard");

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining("[moderation] Auto-withheld user alice (user-1):")
    );
    consoleWarnSpy.mockRestore();
  });

  it("atomically withholds a spoofer fabricating slop model names with substantial volume", async () => {
    // Fabricated slop model with 2,000,000 tokens
    const { usersUpdates, moderationActionInserts } = setupMockTx({
      userLeaderboardHidden: false,
      aggregates: {
        totalTokens: 2_000_000,
        totalCost: "5.0000",
        inputTokens: 1_000_000,
        outputTokens: 1_000_000,
      },
      deviceTotals: {
        totalActiveTimeMs: 1_000_000,
        longestContinuousMs: 500_000,
        maxConcurrentSessions: 1,
        sessionCount: 1,
      },
      allDaysSourceBreakdown: {
        custom: {
          tokens: 2_000_000,
          cost: 5,
          input: 1_000_000,
          output: 1_000_000,
          models: {
            "fake-model-spoofer": {
              tokens: 2_000_000,
              output: 1_000_000,
            },
          },
        },
      },
    });

    mockState.validateSubmission.mockReturnValue({
      valid: true,
      data: {
        device: { id: "dev-1", name: "Laptop" },
        meta: { version: "1.0.0", dateRange: { start: "2026-04-30", end: "2026-04-30" } },
        summary: { clients: ["custom"], totalTokens: 2_000_000, totalCost: 5 },
        contributions: [{ date: "2026-04-30", clients: [] }],
      },
      errors: [],
      warnings: [],
    });

    const response = await POST(createRequest({}));
    expect(response.status).toBe(200);

    expect(usersUpdates).toHaveLength(1);
    expect(usersUpdates[0]).toMatchObject({ leaderboardHidden: true });
    expect(moderationActionInserts).toHaveLength(1);
    expect(moderationActionInserts[0]).toMatchObject({
      action: "hide",
      actorUsername: "system",
      reason: "Under investigation",
    });
  });

  it("respects admin override protection: previously unhidden user by admin is NOT re-withheld", async () => {
    // Administrator previously unhid this account
    const { usersUpdates, moderationActionInserts } = setupMockTx({
      userLeaderboardHidden: false,
      latestModAction: {
        action: "unhide",
        actorUsername: "admin_moderator", // Human administrator, not "system"
      },
      aggregates: {
        totalTokens: 50_000_000,
        totalCost: "50.0000",
        inputTokens: 0,
        outputTokens: 50_000_000,
      },
      deviceTotals: {
        totalActiveTimeMs: 10_000,
        longestContinuousMs: 10_000,
        maxConcurrentSessions: 1,
        sessionCount: 1,
      },
      allDaysSourceBreakdown: {
        custom: {
          tokens: 50_000_000,
          cost: 50,
          input: 0,
          output: 50_000_000,
          models: { "fake-model-spoofer": { tokens: 50_000_000 } },
        },
      },
    });

    mockState.validateSubmission.mockReturnValue({
      valid: true,
      data: {
        device: { id: "dev-1", name: "Laptop" },
        meta: { version: "1.0.0", dateRange: { start: "2026-04-30", end: "2026-04-30" } },
        summary: { clients: ["custom"] },
        contributions: [{ date: "2026-04-30", clients: [] }],
      },
      errors: [],
      warnings: [],
    });

    const response = await POST(createRequest({}));
    expect(response.status).toBe(200);

    // Admin override was honored: no hide action taken!
    expect(usersUpdates).toHaveLength(0);
    expect(moderationActionInserts).toHaveLength(0);
  });

  it("does not treat actorUsername='system' unhide as an admin override", async () => {
    // System unhide (e.g. from automated unban) is NOT an administrator review
    const { usersUpdates, moderationActionInserts } = setupMockTx({
      userLeaderboardHidden: false,
      latestModAction: {
        action: "unhide",
        actorUsername: "system", // Automated, not human admin!
      },
      aggregates: {
        totalTokens: 50_000_000,
        totalCost: "50.0000",
        inputTokens: 0,
        outputTokens: 50_000_000,
      },
      deviceTotals: {
        totalActiveTimeMs: 10_000,
        longestContinuousMs: 10_000,
        maxConcurrentSessions: 1,
        sessionCount: 1,
      },
      allDaysSourceBreakdown: {
        claude: {
          tokens: 50_000_000,
          cost: 50,
          input: 0,
          output: 50_000_000,
          models: {
            "claude-3-5-sonnet-20241022": {
              tokens: 50_000_000,
              output: 50_000_000,
            },
          },
        },
      },
    });

    mockState.validateSubmission.mockReturnValue({
      valid: true,
      data: {
        device: { id: "dev-1", name: "Laptop" },
        meta: { version: "1.0.0", dateRange: { start: "2026-04-30", end: "2026-04-30" } },
        summary: { clients: ["claude"] },
        contributions: [{ date: "2026-04-30", clients: [] }],
      },
      errors: [],
      warnings: [],
    });

    const response = await POST(createRequest({}));
    expect(response.status).toBe(200);

    // Because actorUsername === "system", admin override does NOT apply: re-withheld!
    expect(usersUpdates).toHaveLength(1);
    expect(usersUpdates[0]).toMatchObject({ leaderboardHidden: true });
    expect(moderationActionInserts).toHaveLength(1);
  });

  it("is idempotent: skips when user is already leaderboardHidden", async () => {
    const { usersUpdates, moderationActionInserts } = setupMockTx({
      userLeaderboardHidden: true, // Already hidden
      aggregates: {
        totalTokens: 50_000_000,
        totalCost: "50.0000",
        inputTokens: 0,
        outputTokens: 50_000_000,
      },
      deviceTotals: {
        totalActiveTimeMs: 10_000,
        longestContinuousMs: 10_000,
        maxConcurrentSessions: 1,
        sessionCount: 1,
      },
    });

    mockState.validateSubmission.mockReturnValue({
      valid: true,
      data: {
        device: { id: "dev-1", name: "Laptop" },
        meta: { version: "1.0.0", dateRange: { start: "2026-04-30", end: "2026-04-30" } },
        summary: { clients: ["claude"] },
        contributions: [{ date: "2026-04-30", clients: [] }],
      },
      errors: [],
      warnings: [],
    });

    const response = await POST(createRequest({}));
    expect(response.status).toBe(200);

    // No duplicate update or audit row
    expect(usersUpdates).toHaveLength(0);
    expect(moderationActionInserts).toHaveLength(0);
  });

  it("disables auto-withholding when ENABLE_SUBMISSION_AUTOHIDE='0'", async () => {
    process.env.ENABLE_SUBMISSION_AUTOHIDE = "0";

    const { usersUpdates, moderationActionInserts } = setupMockTx({
      userLeaderboardHidden: false,
      aggregates: {
        totalTokens: 50_000_000,
        totalCost: "50.0000",
        inputTokens: 0,
        outputTokens: 50_000_000,
      },
      deviceTotals: {
        totalActiveTimeMs: 10_000,
        longestContinuousMs: 10_000,
        maxConcurrentSessions: 1,
        sessionCount: 1,
      },
      allDaysSourceBreakdown: {
        custom: {
          tokens: 50_000_000,
          cost: 50,
          input: 0,
          output: 50_000_000,
          models: { "fake-model-spoofer": { tokens: 50_000_000 } },
        },
      },
    });

    mockState.validateSubmission.mockReturnValue({
      valid: true,
      data: {
        device: { id: "dev-1", name: "Laptop" },
        meta: { version: "1.0.0", dateRange: { start: "2026-04-30", end: "2026-04-30" } },
        summary: { clients: ["custom"] },
        contributions: [{ date: "2026-04-30", clients: [] }],
      },
      errors: [],
      warnings: [],
    });

    const response = await POST(createRequest({}));
    expect(response.status).toBe(200);

    // Gate prevented auto-withholding
    expect(usersUpdates).toHaveLength(0);
    expect(moderationActionInserts).toHaveLength(0);
  });

  it("atomically withholds a spoofer with impossible duration invariant (longestContinuousMs > totalActiveTimeMs)", async () => {
    const { usersUpdates, moderationActionInserts } = setupMockTx({
      userLeaderboardHidden: false,
      aggregates: {
        totalTokens: 10_000,
        totalCost: "1.0000",
        inputTokens: 5_000,
        outputTokens: 5_000,
      },
      deviceTotals: {
        totalActiveTimeMs: 60_000, // 60s
        longestContinuousMs: 120_000, // 120s > 60s total active time
        maxConcurrentSessions: 1,
        sessionCount: 1,
      },
    });

    mockState.validateSubmission.mockReturnValue({
      valid: true,
      data: {
        device: { id: "dev-1", name: "Laptop" },
        meta: { version: "1.0.0", dateRange: { start: "2026-04-30", end: "2026-04-30" } },
        summary: { clients: ["claude"] },
        contributions: [{ date: "2026-04-30", clients: [] }],
      },
      errors: [],
      warnings: [],
    });

    const response = await POST(createRequest({}));
    expect(response.status).toBe(200);

    expect(usersUpdates).toHaveLength(1);
    expect(usersUpdates[0]).toMatchObject({ leaderboardHidden: true });
    expect(moderationActionInserts).toHaveLength(1);
    expect(moderationActionInserts[0]).toMatchObject({
      action: "hide",
      actorUsername: "system",
      reason: "Under investigation",
    });
  });

  it("respects admin override even with mixed case and leading/trailing whitespace", async () => {
    const { usersUpdates, moderationActionInserts } = setupMockTx({
      userLeaderboardHidden: false,
      latestModAction: {
        action: "unhide",
        actorUsername: "  AliceAdmin  ",
      },
      aggregates: {
        totalTokens: 50_000_000,
        totalCost: "50.0000",
        inputTokens: 0,
        outputTokens: 50_000_000,
      },
      deviceTotals: {
        totalActiveTimeMs: 10_000,
        longestContinuousMs: 10_000,
        maxConcurrentSessions: 1,
        sessionCount: 1,
      },
    });

    mockState.validateSubmission.mockReturnValue({
      valid: true,
      data: {
        device: { id: "dev-1", name: "Laptop" },
        meta: { version: "1.0.0", dateRange: { start: "2026-04-30", end: "2026-04-30" } },
        summary: { clients: ["claude"] },
        contributions: [{ date: "2026-04-30", clients: [] }],
      },
      errors: [],
      warnings: [],
    });

    const response = await POST(createRequest({}));
    expect(response.status).toBe(200);

    expect(usersUpdates).toHaveLength(0);
    expect(moderationActionInserts).toHaveLength(0);
  });

  it("does not treat null or whitespace-only actorUsername as an admin override", async () => {
    const { usersUpdates, moderationActionInserts } = setupMockTx({
      userLeaderboardHidden: false,
      latestModAction: {
        action: "unhide",
        actorUsername: "   ",
      },
      aggregates: {
        totalTokens: 50_000_000,
        totalCost: "50.0000",
        inputTokens: 0,
        outputTokens: 50_000_000,
      },
      deviceTotals: {
        totalActiveTimeMs: 10_000,
        longestContinuousMs: 10_000,
        maxConcurrentSessions: 1,
        sessionCount: 1,
      },
    });

    mockState.validateSubmission.mockReturnValue({
      valid: true,
      data: {
        device: { id: "dev-1", name: "Laptop" },
        meta: { version: "1.0.0", dateRange: { start: "2026-04-30", end: "2026-04-30" } },
        summary: { clients: ["claude"] },
        contributions: [{ date: "2026-04-30", clients: [] }],
      },
      errors: [],
      warnings: [],
    });

    const response = await POST(createRequest({}));
    expect(response.status).toBe(200);

    // Whitespace actor is NOT an approved admin; withholding executes
    expect(usersUpdates).toHaveLength(1);
    expect(usersUpdates[0]).toMatchObject({ leaderboardHidden: true });
    expect(moderationActionInserts).toHaveLength(1);
  });

  it("properly passes date, tokens, and outputTokens from dailyBreakdown query to withhold daily violators", async () => {
    const { usersUpdates, moderationActionInserts } = setupMockTx({
      userLeaderboardHidden: false,
      aggregates: {
        totalTokens: 25_000_000_000,
        totalCost: "2500.0000",
        inputTokens: 10_000_000_000,
        outputTokens: 15_000_000_000,
      },
      deviceTotals: {
        totalActiveTimeMs: 3600_000_000, // plenty of active time so active rate ceiling does NOT trip
        longestContinuousMs: 3600_000_000,
        maxConcurrentSessions: 10,
        sessionCount: 10,
      },
      allDaysRows: [
        {
          date: "2026-04-30",
          tokens: 25_000_000_000,
          cost: "2500.0000",
          inputTokens: 10_000_000_000,
          outputTokens: 15_000_000_000, // > 10 Billion daily output token ceiling!
          sourceBreakdown: {
            claude: {
              tokens: 25_000_000_000,
              cost: 2500,
              input: 10_000_000_000,
              output: 15_000_000_000,
              models: {
                "claude-3-5-sonnet-20241022": {
                  tokens: 25_000_000_000,
                  output: 15_000_000_000,
                },
              },
            },
          },
        },
      ],
    });

    mockState.validateSubmission.mockReturnValue({
      valid: true,
      data: {
        device: { id: "dev-1", name: "Laptop" },
        meta: { version: "1.0.0", dateRange: { start: "2026-04-30", end: "2026-04-30" } },
        summary: { clients: ["claude"] },
        contributions: [{ date: "2026-04-30", clients: [] }],
      },
      errors: [],
      warnings: [],
    });

    const response = await POST(createRequest({}));
    expect(response.status).toBe(200);

    expect(usersUpdates).toHaveLength(1);
    expect(usersUpdates[0]).toMatchObject({ leaderboardHidden: true });
    expect(moderationActionInserts).toHaveLength(1);
    expect(moderationActionInserts[0]).toMatchObject({
      action: "hide",
      actorUsername: "system",
      reason: "Under investigation",
    });
  });

  it("withholds submission when client has a partial models map and a slop top-level modelId carrying the remainder", async () => {
    const { usersUpdates, moderationActionInserts } = setupMockTx({
      userLeaderboardHidden: false,
      aggregates: {
        totalTokens: 1_500_000,
        totalCost: "1.5000",
        inputTokens: 1_500_000,
        outputTokens: 0,
      },
      allDaysSourceBreakdown: {
        claude: {
          tokens: 1_500_000,
          cost: 1.5,
          input: 1_500_000,
          output: 0,
          modelId: "slop-opus-4-6",
          models: {
            "gpt-4o": {
              tokens: 2,
              output: 0,
            },
          },
        },
      },
    });

    mockState.validateSubmission.mockReturnValue({
      valid: true,
      data: {
        device: { id: "dev-1", name: "Laptop" },
        meta: { version: "1.0.0", dateRange: { start: "2026-04-30", end: "2026-04-30" } },
        summary: { clients: ["claude"] },
        contributions: [{ date: "2026-04-30", clients: [] }],
      },
      errors: [],
      warnings: [],
    });

    const response = await POST(createRequest({}));
    expect(response.status).toBe(200);

    expect(usersUpdates).toHaveLength(1);
    expect(usersUpdates[0]).toMatchObject({ leaderboardHidden: true });
    expect(moderationActionInserts).toHaveLength(1);
    expect(moderationActionInserts[0]).toMatchObject({
      action: "hide",
      actorUsername: "system",
      reason: "Under investigation",
    });
  });

  it("aggregates daily_breakdown rows across multiple devices on the same calendar date to catch split daily violations", async () => {
    const { usersUpdates, moderationActionInserts } = setupMockTx({
      userLeaderboardHidden: false,
      aggregates: {
        totalTokens: 12_000_000_000,
        totalCost: "1200.0000",
        inputTokens: 0,
        outputTokens: 12_000_000_000,
      },
      deviceTotals: {
        totalActiveTimeMs: 3600_000_000,
        longestContinuousMs: 3600_000_000,
        maxConcurrentSessions: 10,
        sessionCount: 10,
      },
      allDaysRows: [
        {
          date: "2026-04-30",
          tokens: 6_000_000_000,
          cost: "600.0000",
          inputTokens: 0,
          outputTokens: 6_000_000_000,
          sourceBreakdown: {
            claude: {
              tokens: 6_000_000_000,
              cost: 600,
              input: 0,
              output: 6_000_000_000,
              models: {
                "claude-3-5-sonnet-20241022": {
                  tokens: 6_000_000_000,
                  output: 6_000_000_000,
                },
              },
            },
          },
        },
        {
          date: "2026-04-30",
          tokens: 6_000_000_000,
          cost: "600.0000",
          inputTokens: 0,
          outputTokens: 6_000_000_000,
          sourceBreakdown: {
            claude: {
              tokens: 6_000_000_000,
              cost: 600,
              input: 0,
              output: 6_000_000_000,
              models: {
                "claude-3-5-sonnet-20241022": {
                  tokens: 6_000_000_000,
                  output: 6_000_000_000,
                },
              },
            },
          },
        },
      ],
    });

    mockState.validateSubmission.mockReturnValue({
      valid: true,
      data: {
        device: { id: "dev-1", name: "Laptop" },
        meta: { version: "1.0.0", dateRange: { start: "2026-04-30", end: "2026-04-30" } },
        summary: { clients: ["claude"] },
        contributions: [{ date: "2026-04-30", clients: [] }],
      },
      errors: [],
      warnings: [],
    });

    const response = await POST(createRequest({}));
    expect(response.status).toBe(200);

    expect(usersUpdates).toHaveLength(1);
    expect(usersUpdates[0]).toMatchObject({ leaderboardHidden: true });
    expect(moderationActionInserts).toHaveLength(1);
    expect(moderationActionInserts[0]).toMatchObject({
      action: "hide",
      actorUsername: "system",
      reason: "Under investigation",
    });
  });

  it("does not insert a system moderation_actions row if a concurrent admin action already hid the user", async () => {
    const { usersUpdates, moderationActionInserts } = setupMockTx({
      userLeaderboardHidden: false,
      usersUpdateReturnedRows: [], // Simulates WHERE leaderboard_hidden = false matching 0 rows due to concurrent admin hide
      aggregates: {
        totalTokens: 50_000_000,
        totalCost: "50.0000",
        inputTokens: 0,
        outputTokens: 50_000_000,
      },
      deviceTotals: {
        totalActiveTimeMs: 10_000,
        longestContinuousMs: 10_000,
        maxConcurrentSessions: 1,
        sessionCount: 1,
      },
    });

    mockState.validateSubmission.mockReturnValue({
      valid: true,
      data: {
        device: { id: "dev-1", name: "Laptop" },
        meta: { version: "1.0.0", dateRange: { start: "2026-04-30", end: "2026-04-30" } },
        summary: { clients: ["claude"] },
        contributions: [{ date: "2026-04-30", clients: [] }],
      },
      errors: [],
      warnings: [],
    });

    const response = await POST(createRequest({}));
    expect(response.status).toBe(200);

    expect(usersUpdates).toHaveLength(1);
    expect(moderationActionInserts).toHaveLength(0);
  });
});
