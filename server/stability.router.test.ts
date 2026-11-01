import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";
import {
  buildBenchStabilityInput,
  defaultBench,
} from "../client/src/lib/stabilityForm";

const stored = vi.hoisted(() => ({ rows: [] as Array<Record<string, any>> }));
vi.mock("./db", () => ({
  insertStabilityCalc: vi.fn(async (row: Record<string, any>) => {
    stored.rows.push(row);
    return stored.rows.length;
  }),
}));
import { appRouter } from "./routers";

const context = (): TrpcContext => ({
  user: {
    id: 7,
    openId: "stability-regression",
    name: "Regression Test",
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
beforeEach(() => {
  stored.rows.length = 0;
});

describe("stability per-bench API", () => {
  it("accepts and archives each bench's material and groundwater fields", async () => {
    const input = buildBenchStabilityInput([
      defaultBench({
        height: "12",
        bermWidth: "6",
        unitWeight: "20",
        waterCondition: "dry",
        cohesion: "15",
        frictionAngle: "25",
      }),
      defaultBench({
        height: "12",
        unitWeight: "28",
        waterCondition: "saturated",
        cohesion: "40",
        frictionAngle: "35",
      }),
    ]);
    const result = await appRouter
      .createCaller(context())
      .stability.compute({ title: "Per-bench API regression", ...input });
    expect(stored.rows).toHaveLength(1);
    expect(stored.rows[0].details.benches[1]).toMatchObject({
      unitWeight: 28,
      waterCondition: "saturated",
      strengthModel: { type: "mohr-coulomb", cohesion: 40, frictionAngle: 35 },
    });
    expect(result.benchStrengths[0]).toMatchObject({
      cohesion: 15,
      frictionAngle: 25,
      unitWeight: 20,
      ru: 0,
    });
    expect(result.benchStrengths[1]).toMatchObject({
      cohesion: 40,
      frictionAngle: 35,
      unitWeight: 28,
      ru: 0.5,
    });
  });

  it("rejects an invalid per-bench unit weight without archiving a result", async () => {
    const input = buildBenchStabilityInput([defaultBench()]);
    input.benches[0].unitWeight = 99;
    await expect(
      appRouter
        .createCaller(context())
        .stability.compute({ title: "Invalid bench", ...input })
    ).rejects.toThrow();
    expect(stored.rows).toHaveLength(0);
  });
});
