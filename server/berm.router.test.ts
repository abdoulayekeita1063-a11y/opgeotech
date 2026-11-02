import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";
import type {
  BermAnalysisInput,
  BermAnalysisResult,
  BermSavedRecord,
} from "../shared/berm/types";
import { bermAnalysisInputSchema } from "../shared/berm/validation";

const store = vi.hoisted(() => ({
  rows: [] as Array<BermSavedRecord & { userId: number }>,
}));
vi.mock("./db/berm", () => ({
  insertBermComparison: vi.fn(
    async (
      userId: number,
      input: BermAnalysisInput,
      result: BermAnalysisResult
    ) => {
      const id = store.rows.length + 1;
      store.rows.push({
        id,
        userId,
        ...input.metadata,
        status: result.status,
        input,
        result,
        createdAtMs: Date.now(),
      });
      return id;
    }
  ),
  getBermComparison: vi.fn(async (id: number, userId: number) =>
    store.rows.find(row => row.id === id && row.userId === userId)
  ),
  listBermComparisons: vi.fn(async (userId: number) =>
    store.rows.filter(row => row.userId === userId)
  ),
  deleteBermComparison: vi.fn(async (id: number, userId: number) => {
    store.rows = store.rows.filter(
      row => row.id !== id || row.userId !== userId
    );
  }),
  summarizeBermComparisons: vi.fn(async (userId: number) => {
    const rows = store.rows.filter(row => row.userId === userId);
    return {
      total: rows.length,
      nonCompliant: rows.filter(row => row.status === "Non-Compliant").length,
      warning: rows.filter(row => row.status === "Warning").length,
      insufficientData: rows.filter(row => row.status === "Insufficient Data")
        .length,
    };
  }),
}));
import { appRouter } from "./routers";
import { computeBermComparison } from "../shared/berm/comparison";
import * as db from "./db/berm";

const context = (id = 7): TrpcContext => ({
  user: {
    id,
    openId: `berm-regression-${id}`,
    name: "Test",
    email: "test@example.invalid",
    loginMethod: "test",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  },
  req: { protocol: "https", headers: {} } as TrpcContext["req"],
  res: {} as TrpcContext["res"],
});
function fixture(): BermAnalysisInput {
  const source = (layer: string) => ({
    document: {
      filename: `${layer}.dxf`,
      layers: [layer],
      originalEntityCount: 1,
      insunits: 6,
      unitName: "metres",
      unitScale: 1,
      diagnostics: [],
      entities: [
        {
          id: "polyline-1",
          sourceType: "LWPOLYLINE",
          kind: "polyline" as const,
          layer,
          points: [
            [500000, 1300000],
            [500100, 1300000],
            [500100, 1300010],
            [500000, 1300010],
          ].map(([x, y]) => ({ x, y, z: null })),
          closed: true,
          valid: true,
          hasElevation: false,
          issues: [],
        },
      ],
    },
    layers: [layer],
    entityIds: [],
    unitsToMetres: 1,
    crs: "EPSG:32629",
    verticalDatum: "",
  });
  return {
    metadata: {
      bermId: "B-TEST",
      pit: "Test pit",
      bench: "1240 RL",
      surveyDateMs: 1735689600000,
      reviewer: "Test reviewer",
      comments: "Unit test only",
    },
    planned: source("DESIGN"),
    asBuilt: source("ASBUILT"),
    criteria: {
      minWidth: 8,
      areaDeviationPct: 5,
      horizontalDeviation: 1,
      elevationDeviation: null,
      warningRatio: 0.8,
      siteApproved: true,
      requireElevation: false,
      surveyComplete: true,
      crsConfirmed: true,
    },
    widthBearing: 0,
    sampleSpacing: 1,
  };
}
beforeEach(() => {
  store.rows = [];
  vi.clearAllMocks();
});

describe("Berm Monitoring API", () => {
  it("recomputes the result on the server instead of trusting a supplied status", async () => {
    const input = fixture();
    input.asBuilt.document!.entities[0].points[2].y -= 3;
    input.asBuilt.document!.entities[0].points[3].y -= 3;
    const request = { input, result: { status: "Compliant" } };
    const saved = await appRouter.createCaller(context()).berm.save(request);
    expect(saved.result).toEqual(computeBermComparison(input));
    expect(saved.result.status).not.toBe("Compliant");
    expect(store.rows[0]).toMatchObject({
      userId: 7,
      bermId: "B-TEST",
      surveyDateMs: 1735689600000,
    });
    expect(store.rows[0].input.planned.document?.entities[0].points[0].x).toBe(
      500000
    );
    expect(store.rows[0].input.asBuilt.document?.filename).toBe("ASBUILT.dxf");
  });
  it("does not expose another user's comparison or delete their data", async () => {
    const saved = await appRouter
      .createCaller(context(9))
      .berm.save({ input: fixture() });
    await expect(
      appRouter.createCaller(context(7)).berm.get({ id: saved.id })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      appRouter.createCaller(context(7)).berm.delete({ id: saved.id })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(db.deleteBermComparison).not.toHaveBeenCalled();
    expect(store.rows).toHaveLength(1);
    const own = await appRouter
      .createCaller(context(9))
      .berm.get({ id: saved.id });
    expect(own).not.toHaveProperty("userId");
  });
  it("summarizes only the authenticated user's saved comparisons", async () => {
    await appRouter.createCaller(context(9)).berm.save({ input: fixture() });
    await appRouter.createCaller(context(7)).berm.save({ input: fixture() });
    const summary = await appRouter.createCaller(context(7)).berm.summary();
    expect(summary.total).toBe(1);
    expect(db.summarizeBermComparisons).toHaveBeenCalledWith(7);
    await appRouter.createCaller(context(7)).berm.list();
    expect(db.listBermComparisons).toHaveBeenCalledWith(7);
  });
  it("requires authentication for saving a comparison", async () => {
    const ctx = { ...context(), user: null };
    await expect(
      appRouter.createCaller(ctx).berm.save({ input: fixture() })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(db.insertBermComparison).not.toHaveBeenCalled();
  });
  it("rejects a non-DXF source before saving", async () => {
    const input = fixture();
    input.asBuilt.document!.filename = "survey.csv";
    await expect(
      appRouter.createCaller(context()).berm.save({ input })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(store.rows).toHaveLength(0);
  });
});

describe("Berm Monitoring input validation", () => {
  it("rejects invalid coordinates, negative tolerances and invalid sampling directions", () => {
    const input = fixture();
    input.planned.document!.entities[0].points[0].x = Number.NaN;
    expect(bermAnalysisInputSchema.safeParse(input).success).toBe(false);
    const invalid = fixture();
    invalid.criteria.minWidth = -1;
    expect(bermAnalysisInputSchema.safeParse(invalid).success).toBe(false);
    invalid.criteria.minWidth = 8;
    invalid.widthBearing = 361;
    expect(bermAnalysisInputSchema.safeParse(invalid).success).toBe(false);
  });
  it("preserves explicit unknown units or missing data rather than fabricating values", () => {
    const input = fixture();
    input.asBuilt.unitsToMetres = null;
    input.asBuilt.crs = "";
    const parsed = bermAnalysisInputSchema.parse(input);
    expect(parsed.asBuilt.unitsToMetres).toBeNull();
    expect(parsed.asBuilt.crs).toBe("");
  });
  it("rejects duplicate entity identifiers in a stored survey document", () => {
    const input = fixture();
    input.asBuilt.document!.entities.push({
      ...input.asBuilt.document!.entities[0],
    });
    expect(bermAnalysisInputSchema.safeParse(input).success).toBe(false);
  });
});
