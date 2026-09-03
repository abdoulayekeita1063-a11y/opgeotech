import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  readings: [] as any[],
  projects: [] as any[],
  summaryRows: [] as any[],
}));

vi.mock("./db", () => ({
  getMonitoringRecord: vi.fn(async (id: number) => id === 1 ? { id: 1, userId: 7 } : undefined),
  insertMonitoringRadarReadings: vi.fn(async (rows: any[]) => { state.readings.push(...rows.map((row, index) => ({ ...row, id: index + 1, createdAt: new Date() }))); return rows.length; }),
  listMonitoringRadarReadings: vi.fn(async () => state.readings),
  createMonitoringProject: vi.fn(async (project: any) => { const id = state.projects.length + 1; state.projects.push({ ...project, id, createdAt: new Date() }); return id; }),
  listMonitoringProjects: vi.fn(async () => state.projects),
  getMonitoringProject: vi.fn(async (id: number) => state.projects.find(project => project.id === id)),
  deleteMonitoringProject: vi.fn(),
  insertRadarMonitoringRows: vi.fn(async (rows: any[]) => { state.summaryRows.push(...rows.map((row, index) => ({ ...row, id: index + 1, createdAt: new Date() }))); return rows.length; }),
  listProjectRadarMonitoringRows: vi.fn(async () => state.summaryRows),
  insertMonitoringRecord: vi.fn(),
  listMonitoringRecords: vi.fn(async () => []),
  deleteMonitoringRecord: vi.fn(),
  insertDxfPlan: vi.fn(), listDxfPlans: vi.fn(), getDxfPlan: vi.fn(), deleteDxfPlan: vi.fn(),
  insertDrillhole: vi.fn(), listDrillholes: vi.fn(), deleteDrillhole: vi.fn(),
  insertStructure: vi.fn(), insertStructuresBulk: vi.fn(), listStructures: vi.fn(), deleteStructure: vi.fn(),
  insertKinematicAnalysis: vi.fn(), listKinematicAnalyses: vi.fn(), getKinematicAnalysis: vi.fn(),
}));

import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function context(): TrpcContext {
  return {
    user: { id: 7, openId: "monitoring-test", email: "monitoring@test.local", name: "Monitoring Test", loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("monitoring radar import contract", () => {
  beforeEach(() => { state.readings.length = 0; state.projects.length = 0; state.summaryRows.length = 0; });

  it("imports readings, lists them and returns a trend warning", async () => {
    const caller = appRouter.createCaller(context());
    const imported = await caller.monitoring.importRadar({
      monitoringRecordId: 1,
      source: "radar-export.csv",
      readings: [
        { radarPointId: "P-01", measuredAt: 86_400_000, displacementMm: 0 },
        { radarPointId: "P-01", measuredAt: 2 * 86_400_000, displacementMm: 2 },
      ],
    });
    const listed = await caller.monitoring.radarReadings({ monitoringRecordId: 1 });
    const analysis = await caller.monitoring.analyzeRadar({ monitoringRecordId: 1, radarPointId: "P-01" });

    expect(imported).toEqual({ count: 2 });
    expect(listed).toHaveLength(2);
    expect(listed[0]?.source).toBe("radar-export.csv");
    expect(analysis.latestVelocityMmPerDay).toBe(2);
    expect(analysis.risk).toBe("Moderate");
  });

  it("creates a project and keeps Excel radar summaries scoped to that project", async () => {
    const caller = appRouter.createCaller(context());
    const project = await caller.monitoring.createProject({ name: "Fekola Radar 2026", site: "Fekola Mine" });
    const imported = await caller.monitoring.importProjectRadarSummary({
      projectId: project.id,
      source: "RadarReport.xlsx",
      rows: [
        { measuredAt: 86_400_000, pit: "Fekola", window: "East", displacementAverageMm: 0, velocityAverageMmPerDay: 0.5 },
        { measuredAt: 2 * 86_400_000, pit: "Fekola", window: "East", displacementAverageMm: 2, velocityAverageMmPerDay: 2 },
        { measuredAt: 3 * 86_400_000, pit: "Fekola", window: "East", displacementAverageMm: 8, velocityAverageMmPerDay: 6 },
      ],
    });
    const projects = await caller.monitoring.projects();
    const rows = await caller.monitoring.projectSummaryRows({ projectId: project.id });
    const analysis = await caller.monitoring.analyzeProjectRadarSummary({ projectId: project.id });

    expect(projects).toHaveLength(1);
    expect(imported).toEqual({ count: 3 });
    expect(rows).toHaveLength(3);
    expect(rows.every(row => row.projectId === project.id)).toBe(true);
    expect(analysis.risk).toBe("High");
  });
});
