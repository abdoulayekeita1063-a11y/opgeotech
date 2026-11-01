import type {
  BenchInput,
  StabilityInput,
} from "../../../server/geotech/stability";

export type BenchForm = {
  height: string;
  angle: string;
  bermWidth: string;
  unitWeight: string;
  waterCondition: "dry" | "partial" | "saturated";
  cohesion: string;
  frictionAngle: string;
  strengthModel: "mohr-coulomb" | "hoek-brown";
  sigmaCi: string;
  gsi: string;
  mi: string;
  disturbanceFactor: string;
  materialLayer: string;
};

export function defaultBench(overrides: Partial<BenchForm> = {}): BenchForm {
  return {
    height: "15",
    angle: "45",
    bermWidth: "0",
    unitWeight: "20",
    waterCondition: "dry",
    cohesion: "25",
    frictionAngle: "30",
    strengthModel: "mohr-coulomb",
    sigmaCi: "100",
    gsi: "60",
    mi: "10",
    disturbanceFactor: "0.7",
    materialLayer: "",
    ...overrides,
  };
}

function fieldNumber(
  text: string,
  label: string,
  min: number,
  max: number
): number {
  const value = text.trim() ? Number(text) : NaN;
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(
      `${label} must be a valid number between ${min} and ${max}.`
    );
  }
  return value;
}

/** Build legacy summary fields for API/archive compatibility from the bench inputs.
 * There are no editable global physical parameters. The engine uses the individual
 * bench properties; summary values must never override a bench's own inputs.
 */
export function buildBenchStabilityInput(
  benchForms: readonly BenchForm[]
): StabilityInput & { benches: BenchInput[] } {
  if (!benchForms.length || benchForms.length > 50)
    throw new Error("Add between 1 and 50 slope benches.");
  const benches: BenchInput[] = benchForms.map((bench, index) => {
    const prefix = `Bench ${index + 1}`;
    if (!["dry", "partial", "saturated"].includes(bench.waterCondition))
      throw new Error(`${prefix}: select a valid groundwater condition.`);
    if (!["mohr-coulomb", "hoek-brown"].includes(bench.strengthModel))
      throw new Error(`${prefix}: select a valid strength model.`);
    const strengthModel =
      bench.strengthModel === "hoek-brown"
        ? {
            type: "hoek-brown" as const,
            sigmaCi: fieldNumber(
              bench.sigmaCi,
              `${prefix} UCS (MPa)`,
              0.1,
              1000
            ),
            gsi: fieldNumber(bench.gsi, `${prefix} GSI`, 0, 100),
            mi: fieldNumber(bench.mi, `${prefix} mi`, 1, 50),
            disturbanceFactor: fieldNumber(
              bench.disturbanceFactor,
              `${prefix} disturbance D`,
              0,
              1
            ),
          }
        : {
            type: "mohr-coulomb" as const,
            cohesion: fieldNumber(
              bench.cohesion,
              `${prefix} cohesion (kPa)`,
              0,
              1000
            ),
            frictionAngle: fieldNumber(
              bench.frictionAngle,
              `${prefix} friction angle (°)`,
              0,
              60
            ),
          };
    return {
      height: fieldNumber(bench.height, `${prefix} slope height (m)`, 0.1, 500),
      angle: fieldNumber(bench.angle, `${prefix} face angle (°)`, 10, 85),
      bermWidth: fieldNumber(
        bench.bermWidth,
        `${prefix} berm width (m)`,
        0,
        200
      ),
      unitWeight: fieldNumber(
        bench.unitWeight,
        `${prefix} unit weight (kN/m³)`,
        10,
        35
      ),
      waterCondition: bench.waterCondition,
      materialLayer: bench.materialLayer.trim() || undefined,
      strengthModel,
    };
  });
  const totalHeight = benches.reduce((sum, bench) => sum + bench.height, 0);
  if (totalHeight < 1 || totalHeight > 1000)
    throw new Error("Total slope height must be between 1 and 1000 m.");
  const first = benches[0];
  const firstModel = first.strengthModel!;
  return {
    benches,
    cohesion: firstModel.type === "mohr-coulomb" ? firstModel.cohesion! : 0,
    frictionAngle:
      firstModel.type === "mohr-coulomb" ? firstModel.frictionAngle! : 0,
    unitWeight: first.unitWeight!,
    waterCondition: first.waterCondition!,
    slopeHeight: totalHeight,
    slopeAngle: first.angle,
    strengthModel: firstModel,
  };
}
