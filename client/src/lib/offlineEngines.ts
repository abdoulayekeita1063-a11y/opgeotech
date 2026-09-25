import { computeCompliance } from "../../../server/geotech/compliance";
import { computeGSI, computeQ, computeRMR, computeSMR } from "../../../server/geotech/classification";
import { computeBlastabilityIndex, evaluateBlastControl, evaluateWallControl } from "../../../server/geotech/blastability";
import { computeStability } from "../../../server/geotech/stability";
import { scoreWallRisk } from "../../../server/geotech/wallRisk";
import { runKinematicAnalysis } from "../../../server/geotech/kinematics";
import { latestOfflineResult } from "./offlineStore";

export type OfflineEngineResult = Record<string, unknown>;

function bodyInput(payload: unknown): Record<string, any> {
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const values = Object.values(payload as Record<string, unknown>);
    const first = values[0];
    if (first && typeof first === "object" && "json" in first) return (first as { json: Record<string, any> }).json;
    return payload as Record<string, any>;
  }
  if (Array.isArray(payload)) return bodyInput(payload[0]);
  return {};
}

function unwrapCachedQuery(value: unknown): any {
  if (Array.isArray(value)) return unwrapCachedQuery(value[0]);
  if (value && typeof value === "object" && "result" in value) return unwrapCachedQuery((value as any).result?.data);
  if (value && typeof value === "object" && "json" in value) return (value as any).json;
  return value;
}

export async function runOfflineEngine(operation: string, payload: unknown): Promise<OfflineEngineResult | null> {
  const input = bodyInput(payload);
  if (operation === "stability.compute") return { id: -Date.now(), ...computeStability(input as never) };
  if (operation === "classification.computeRMR") return { id: -Date.now(), ...computeRMR(input as never) };
  if (operation === "classification.computeQ") return { id: -Date.now(), ...computeQ(input as never) };
  if (operation === "classification.computeSMR") return { id: -Date.now(), ...computeSMR(input as never) };
  if (operation === "classification.computeGSI") return { id: -Date.now(), ...computeGSI(input as never) };
  if (operation === "compliance.compute") return { id: -Date.now(), ...computeCompliance(input as never) };
  if (operation === "blast.blastabilityIndex") return { id: -Date.now(), ...computeBlastabilityIndex(input as never) };
  if (operation === "blast.wallControl") return { id: -Date.now(), ...evaluateWallControl(input as never), blastControl: evaluateBlastControl(input as never) };
  if (operation === "monitoring.create") return { id: -Date.now(), ...scoreWallRisk(input as never) };
  if (operation === "kinematics.run") {
    const cachedStructures = unwrapCachedQuery(await latestOfflineResult("mapping.list"));
    const structures = (Array.isArray(cachedStructures) ? cachedStructures : []).filter((structure: any) => input.structureIds?.includes(structure.id));
    if (!structures.length) return null;
    const result = runKinematicAnalysis({
      slopeDip: input.slopeDip,
      slopeDipDirection: input.slopeDipDirection,
      slopeHeight: input.slopeHeight,
      unitWeight: input.unitWeight,
      basicFrictionAngle: input.basicFrictionAngle,
      jcs: input.jcs,
      lateralLimit: input.lateralLimit,
      structures: structures.map((structure: any) => ({
        id: structure.structureId || `#${structure.id}`,
        dip: structure.dip,
        dipDirection: structure.dipDirection,
        persistence: structure.persistence,
        jrc: structure.jrc,
        structureType: structure.structureType,
      })),
    });
    return { id: -Date.now(), result };
  }
  return null;
}
