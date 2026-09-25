import { describe, expect, it } from "vitest";
import { runOfflineEngine } from "./offlineEngines";

describe("browser-local geotechnical engines", () => {
  it("runs classification locally from a tRPC-shaped payload", async () => {
    const result = await runOfflineEngine("classification.computeRMR", [{ json: {
      ucs: 80, rqd: 70, spacing: 1, conditionRating: 20, groundwaterRating: 10, orientationAdjustment: -5,
    } }]);
    expect(result?.score).toBeTypeOf("number");
    expect(result?.interpretation).toBeTypeOf("string");
  });

  it("runs stability locally with a multi-bench profile", async () => {
    const result = await runOfflineEngine("stability.compute", [{ json: {
      cohesion: 20, frictionAngle: 32, unitWeight: 26, slopeHeight: 30, slopeAngle: 60, waterCondition: "dry",
      benches: [{ height: 15, angle: 65, bermWidth: 8 }, { height: 15, angle: 60, bermWidth: 8 }],
    } }]);
    expect(result?.fsBishop).toBeTypeOf("number");
    expect(result?.status).toBeTypeOf("string");
  });

  it("runs blastability, compliance and wall-risk locally", async () => {
    const blast = await runOfflineEngine("blast.blastabilityIndex", [{ json: { rmd: 20, jps: 20, jpo: 20, density: 2.7, ucs: 100 } }]);
    const compliance = await runOfflineEngine("compliance.compute", [{ json: {
      mode: "presplit", benchFaceAngleRating: 45, benchWidthRating: 35, toePositionRating: 10,
      halfBarrelsRating: 18, intactRockBreakageRating: 14, openJointsRating: 8, looseMaterialRating: 18,
      faceProfileRating: 18, crestConditionRating: 14,
    } }]);
    const wall = await runOfflineEngine("monitoring.create", [{ json: { bermWidth: 8, slopeHeight: 20, slopeAngle: 60, rockMassRating: 60 } }]);
    expect(blast?.bi).toBeTypeOf("number");
    expect(compliance?.compliancePct).toBeTypeOf("number");
    expect(wall?.score).toBeTypeOf("number");
  });
});
