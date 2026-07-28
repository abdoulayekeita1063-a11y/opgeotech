/**
 * Design compliance verification module.
 * Compares as-built (surveyed) geometry against design geometry
 * for open-pit mine benches.
 */

export interface ComplianceInput {
  designBenchHeight: number;
  actualBenchHeight: number;
  designBermWidth: number;
  actualBermWidth: number;
  designBatterAngle: number;
  actualBatterAngle: number;
  toleranceHeight: number; // m
  toleranceBerm: number; // m
  toleranceAngle: number; // degrees
}

export interface ComplianceItem {
  parameter: string;
  design: number;
  actual: number;
  deviation: number;
  tolerance: number;
  compliant: boolean;
  unit: string;
  severity: "compliant" | "minor" | "major";
}

export interface ComplianceResult {
  compliant: boolean;
  compliancePct: number;
  items: ComplianceItem[];
  interpretation: string;
}

function assess(
  parameter: string,
  design: number,
  actual: number,
  tolerance: number,
  unit: string,
): ComplianceItem {
  const deviation = Math.round((actual - design) * 100) / 100;
  const abs = Math.abs(deviation);
  const compliant = abs <= tolerance;
  const severity: ComplianceItem["severity"] = compliant
    ? "compliant"
    : abs <= tolerance * 2
      ? "minor"
      : "major";
  return { parameter, design, actual, deviation, tolerance, compliant, unit, severity };
}

export function computeCompliance(input: ComplianceInput): ComplianceResult {
  const items: ComplianceItem[] = [
    assess(
      "Bench height",
      input.designBenchHeight,
      input.actualBenchHeight,
      input.toleranceHeight,
      "m",
    ),
    assess(
      "Berm width",
      input.designBermWidth,
      input.actualBermWidth,
      input.toleranceBerm,
      "m",
    ),
    assess(
      "Batter angle",
      input.designBatterAngle,
      input.actualBatterAngle,
      input.toleranceAngle,
      "°",
    ),
  ];

  const nOk = items.filter(i => i.compliant).length;
  const compliancePct = Math.round((nOk / items.length) * 1000) / 10;
  const compliant = nOk === items.length;

  const nonCompliant = items.filter(i => !i.compliant);
  let interpretation: string;
  if (compliant) {
    interpretation =
      "The as-built geometry is COMPLIANT with the design on all three controlled parameters (bench height, berm width, batter angle). No deviation exceeds the allowed tolerances. Continue routine checks after each mining advance.";
  } else {
    const detail = nonCompliant
      .map(
        i =>
          `${i.parameter}: deviation of ${i.deviation > 0 ? "+" : ""}${i.deviation} ${i.unit} (tolerance ± ${i.tolerance} ${i.unit}, ${i.severity} deviation)`,
      )
      .join("; ");
    const hasMajor = nonCompliant.some(i => i.severity === "major");
    interpretation = `The as-built geometry is NON-COMPLIANT with the design (${compliancePct}% compliance). Out-of-tolerance parameters — ${detail}. ${
      hasMajor
        ? "At least one MAJOR deviation was identified: a geotechnical review is required before continuing operations in this sector (risk of berm loss or slope over-steepening)."
        : "Deviations remain minor: correct them during the next pass and notify mine planning."
    } An undersized berm reduces rockfall retention capacity; an over-steepened batter angle degrades the slope factor of safety.`;
  }

  return { compliant, compliancePct, items, interpretation };
}
