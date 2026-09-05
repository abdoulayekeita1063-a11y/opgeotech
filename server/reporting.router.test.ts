import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ failures: [] as any[] }));

vi.mock("./db", () => ({
  insertFailureRecord: vi.fn(async (row: any) => {
    const id = state.failures.length + 1;
    state.failures.push({ ...row, id, createdAt: new Date() });
    return id;
  }),
  insertFailureRecords: vi.fn(async (rows: any[]) => {
    state.failures.push(...rows.map((row, index) => ({ ...row, id: state.failures.length + index + 1, createdAt: new Date() })));
    return rows.length;
  }),
  listFailureRecords: vi.fn(async (userId: number) => state.failures.filter(row => row.userId === userId)),
  deleteFailureRecord: vi.fn(async (id: number, userId: number) => {
    const index = state.failures.findIndex(row => row.id === id && row.userId === userId);
    if (index >= 0) state.failures.splice(index, 1);
  }),
  clearFailureRecords: vi.fn(async (userId: number) => {
    state.failures.splice(0, state.failures.length, ...state.failures.filter(row => row.userId !== userId));
  }),
}));

import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function context(): TrpcContext {
  return {
    user: { id: 11, openId: "reporting-test", email: "reporting@test.local", name: "Reporting Test", loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("Failure Records reporting API", () => {
  beforeEach(() => { state.failures.length = 0; });

  it("imports workbook rows and lists only the authenticated user's records", async () => {
    const caller = appRouter.createCaller(context());
    const imported = await caller.reporting.failures.importWorkbook({
      sourceFile: "GeneralreportfailureFekola.xlsx",
      replaceExisting: false,
      rows: [
        { incidentDate: Date.UTC(2026, 5, 12), pit: "Fekola", phase: "8", wall: "West", lithology: "MBX", failureType: "Wedge" },
        { incidentDate: Date.UTC(2026, 6, 4), pit: "Fekola", phase: "North Dump", lithology: "Swell Material", failureType: "Sliding" },
      ],
    });
    const listed = await caller.reporting.failures.list();

    expect(imported).toEqual({ imported: 2 });
    expect(listed).toHaveLength(2);
    expect(listed.every(row => row.userId === 11)).toBe(true);
  });
});

