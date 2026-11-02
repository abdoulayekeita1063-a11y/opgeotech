import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const state = vi.hoisted(() => ({
  rows: [
    {
      id: 11,
      userId: 7,
      name: "PZ-01",
      easting: 100,
      northing: 200,
      elevation: 160,
      depth: 100,
      waterLevel: 20,
      piezometricElevation: 140,
    },
  ],
  updates: [] as Array<{
    id: number;
    userId: number;
    waterLevel: number;
    piezometricElevation: number;
  }>,
}));

vi.mock("./db", () => ({
  listPiezometers: vi.fn(async (userId: number) =>
    state.rows.filter(row => row.userId === userId)
  ),
  updatePiezometerWaterLevel: vi.fn(
    async (
      id: number,
      userId: number,
      waterLevel: number,
      piezometricElevation: number
    ) => {
      const row = state.rows.find(
        item => item.id === id && item.userId === userId
      );
      if (row) {
        row.waterLevel = waterLevel;
        row.piezometricElevation = piezometricElevation;
      }
      state.updates.push({ id, userId, waterLevel, piezometricElevation });
    }
  ),
}));

import { appRouter } from "./routers";

const context = (userId = 7): TrpcContext => ({
  user: {
    id: userId,
    openId: `piezometer-test-${userId}`,
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

beforeEach(() => {
  state.rows[0].waterLevel = 20;
  state.rows[0].piezometricElevation = 140;
  state.updates.length = 0;
});

describe("Piezometer water level editing", () => {
  it("updates only water level and derives the new piezometric RL", async () => {
    const result = await appRouter
      .createCaller(context())
      .piezometer.updateWaterLevel({ id: 11, waterLevel: 45 });
    expect(result).toEqual({ success: true, piezometricElevation: 115 });
    expect(state.rows[0]).toMatchObject({
      easting: 100,
      northing: 200,
      elevation: 160,
      depth: 100,
      waterLevel: 45,
      piezometricElevation: 115,
    });
    expect(state.updates).toEqual([
      { id: 11, userId: 7, waterLevel: 45, piezometricElevation: 115 },
    ]);
  });

  it("rejects a water level deeper than the installed piezometer", async () => {
    await expect(
      appRouter
        .createCaller(context())
        .piezometer.updateWaterLevel({ id: 11, waterLevel: 101 })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(state.updates).toHaveLength(0);
    expect(state.rows[0].waterLevel).toBe(20);
  });

  it("does not allow another user to edit the reading", async () => {
    await expect(
      appRouter
        .createCaller(context(99))
        .piezometer.updateWaterLevel({ id: 11, waterLevel: 45 })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(state.updates).toHaveLength(0);
  });
});
