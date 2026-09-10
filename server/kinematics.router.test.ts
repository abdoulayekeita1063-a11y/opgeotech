import { describe, expect, it, vi } from "vitest";

const stored = vi.hoisted(() => ({ analyses: [] as any[] }));

vi.mock("./db", () => ({
  listStructures: vi.fn(async () => [
    { id: 1, userId: 7, structureId: "J1", structureType: "joint", dip: 45, dipDirection: 95, jrc: 8 },
    { id: 2, userId: 7, structureId: "J2", structureType: "joint", dip: 45, dipDirection: 270, jrc: 8 },
  ]),
  insertKinematicAnalysis: vi.fn(async (row: any) => {
    stored.analyses.push(row);
    return stored.analyses.length;
  }),
  listKinematicAnalyses: vi.fn(async () => stored.analyses),
  getKinematicAnalysis: vi.fn(),
}));

import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function context(): TrpcContext {
  return {
    user: { id: 7, openId: "kinematics-test", email: "kinematics@test.local", name: "Kinematics Test", loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("authenticated kinematics endpoint", () => {
  it("runs an analysis and returns percentage results through the protected procedure", async () => {
    const caller = appRouter.createCaller(context());
    const response = await caller.kinematics.run({
      title: "Authenticated endpoint test",
      slopeDip: 60,
      slopeDipDirection: 90,
      slopeHeight: 30,
      unitWeight: 26,
      basicFrictionAngle: 30,
      jcs: 50,
      lateralLimit: 20,
      structureIds: [1, 2],
    });

    expect(response.id).toBe(1);
    expect(response.result.summary.planarTotal).toBe(2);
    expect(response.result.summary.planarPercentage).toBe(50);
    expect(response.result.summary.wedgeTotal).toBe(1);
    expect(stored.analyses).toHaveLength(1);
    expect(() => JSON.stringify(response)).not.toThrow();
  });
});
