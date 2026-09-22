import { describe, expect, it } from "vitest";
import { bartonBandis, runKinematicAnalysis } from "./kinematics";
import { parseDxf } from "./dxf";

describe("bartonBandis", () => {
  it("computes peak friction angle phi_b + JRC*log10(JCS/sigma_n)", () => {
    // sigma_n = 100 kPa, JRC = 10, JCS = 100 MPa (=100000 kPa), phi_b = 30
    // phi_peak = 30 + 10*log10(1000) = 30 + 30 = 60 but capped? cap = phi_b+50=80, abs 70 → 60 ok
    const s = bartonBandis(100, 10, 100, 30);
    expect(s.peakFrictionAngle).toBeCloseTo(60, 0);
    expect(s.instantaneousFrictionAngle).toBeGreaterThan(0);
    expect(s.instantaneousCohesionKpa).toBeGreaterThanOrEqual(0);
  });

  it("caps the peak friction angle at 70 degrees", () => {
    const s = bartonBandis(1, 20, 200, 35);
    expect(s.peakFrictionAngle).toBeLessThanOrEqual(70);
  });

  it("higher normal stress lowers the peak friction angle", () => {
    const low = bartonBandis(50, 12, 80, 30);
    const high = bartonBandis(500, 12, 80, 30);
    expect(high.peakFrictionAngle).toBeLessThan(low.peakFrictionAngle);
  });
});

describe("runKinematicAnalysis", () => {
  const slope = {
    slopeDip: 60,
    slopeDipDirection: 90,
    slopeHeight: 30,
    unitWeight: 26,
    basicFrictionAngle: 30,
    jcs: 50,
    lateralLimit: 20,
  };

  it("flags a classic daylighting planar mechanism", () => {
    const r = runKinematicAnalysis({
      ...slope,
      structures: [{ id: "J1", dip: 45, dipDirection: 95, jrc: 8 }],
    });
    expect(r.planar[0].feasible).toBe(true);
    expect(r.planar[0].factorOfSafety).toBeGreaterThan(0);
    expect(r.planar[0].blockWeightKn).toBeGreaterThan(0);
    expect(r.summary.planarCount).toBe(1);
  });

  it("uses mapped persistence to limit effective block height and weight", () => {
    const full = runKinematicAnalysis({
      ...slope,
      structures: [{ id: "J-full", dip: 45, dipDirection: 95, persistence: 30, jrc: 8 }],
    });
    const partial = runKinematicAnalysis({
      ...slope,
      structures: [{ id: "J-partial", dip: 45, dipDirection: 95, persistence: 15, jrc: 8 }],
    });
    expect(full.planar[0].persistence).toBe(30);
    expect(partial.planar[0].persistence).toBe(15);
    expect(partial.planar[0].effectiveHeightM).toBeCloseTo(15, 5);
    expect(partial.planar[0].blockWeightKn).toBeLessThan(full.planar[0].blockWeightKn!);
  });

  it("rejects planar sliding when the plane dips into the face", () => {
    const r = runKinematicAnalysis({
      ...slope,
      structures: [{ id: "J2", dip: 45, dipDirection: 270, jrc: 8 }],
    });
    expect(r.planar[0].feasible).toBe(false);
  });

  it("rejects planar sliding when dip is below the friction angle", () => {
    const r = runKinematicAnalysis({
      ...slope,
      structures: [{ id: "J3", dip: 20, dipDirection: 90, jrc: 8 }],
    });
    expect(r.planar[0].feasible).toBe(false);
  });

  it("identifies a wedge from two intersecting planes daylighting in the face", () => {
    const r = runKinematicAnalysis({
      ...slope,
      structures: [
        { id: "JA", dip: 55, dipDirection: 60, jrc: 8 },
        { id: "JB", dip: 55, dipDirection: 120, jrc: 8 },
      ],
    });
    expect(r.wedge.length).toBe(1);
    expect(r.wedge[0].feasible).toBe(true);
    expect(r.wedge[0].lineOfIntersection.plunge).toBeGreaterThan(30);
    expect(r.wedge[0].factorOfSafety).toBeGreaterThan(0);
    expect(r.summary.wedgeCritical).toBe(1);
    expect(r.summary.wedgeTotal).toBe(1);
    expect(r.summary.wedgePercentage).toBe(100);
  });

  it("flags flexural toppling for steep planes dipping into the face", () => {
    const r = runKinematicAnalysis({
      ...slope,
      structures: [{ id: "J5", dip: 80, dipDirection: 270, jrc: 8 }],
    });
    expect(r.toppling[0].feasible).toBe(true);
    expect(r.toppling[0].mode).toBe("flexural");
    expect(r.toppling[0].blockWeightKn).toBeGreaterThan(0);
    expect(r.toppling[0].strength?.instantaneousCohesionKpa).toBeGreaterThanOrEqual(0);
    expect(r.toppling[0].factorOfSafety).toBeGreaterThan(0);
    expect(["Stable", "Marginal", "Unstable"]).toContain(r.toppling[0].status);
    expect(r.summary.topplingCritical).toBe(1);
    expect(r.summary.topplingTotal).toBe(1);
    expect(r.summary.topplingPercentage).toBe(100);
  });

  it("returns a coherent summary with critical FS", () => {
    const r = runKinematicAnalysis({
      ...slope,
      structures: [
        { id: "J1", dip: 45, dipDirection: 95, jrc: 8 },
        { id: "J5", dip: 80, dipDirection: 270, jrc: 8 },
      ],
    });
    expect(r.summary.criticalFs).not.toBeNull();
    expect(r.summary.overallAssessment).toContain("Kinematic feasibility:");
    expect(r.summary.overallAssessment).toContain("Planar 50.0% (1/2 structures)");
  });

  it("processes an analysis with 100 structures", () => {
    const structures = Array.from({ length: 100 }, (_, i) => ({
      id: `J${i + 1}`,
      dip: 45,
      dipDirection: 95,
      jrc: 8,
    }));
    const r = runKinematicAnalysis({ ...slope, structures });

    expect(r.planar).toHaveLength(100);
    expect(r.toppling).toHaveLength(100);
    expect(r.wedge).toHaveLength(4950);
    expect(r.summary.planarTotal).toBe(100);
    expect(r.summary.wedgeTotal).toBe(4950);
    expect(r.summary.topplingTotal).toBe(100);
  });
});

describe("parseDxf", () => {
  const minimalDxf = [
    "0", "SECTION", "2", "ENTITIES",
    "0", "LINE", "8", "BENCH", "10", "0.0", "20", "0.0", "11", "100.0", "21", "50.0",
    "0", "LWPOLYLINE", "8", "CREST", "90", "3", "70", "0",
    "10", "0.0", "20", "0.0",
    "10", "50.0", "20", "25.0",
    "10", "100.0", "20", "0.0",
    "0", "ENDSEC",
    "0", "EOF",
  ].join("\n");

  it("parses lines and polylines with bounds and layers", () => {
    const g = parseDxf(minimalDxf);
    expect(g.entityCount).toBeGreaterThanOrEqual(2);
    expect(g.layers).toContain("BENCH");
    expect(g.layers).toContain("CREST");
    expect(g.layerBounds.BENCH.entityCount).toBe(1);
    expect(g.layerBounds.CREST.maxX).toBe(100);
    expect(g.bounds.maxX).toBe(100);
    expect(g.bounds.maxY).toBe(50);
  });

  it("throws on a DXF with no drawable entities", () => {
    const empty = ["0", "SECTION", "2", "ENTITIES", "0", "ENDSEC", "0", "EOF"].join("\n");
    expect(() => parseDxf(empty)).toThrow();
  });
});
