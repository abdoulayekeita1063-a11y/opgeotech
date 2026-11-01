export function parseLoggingNumber(value: string | undefined): number | null {
  const parsed = Number.parseFloat((value ?? "").replace(/[^0-9.+-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

export function calculateJointSpacing(
  fromText: string | undefined,
  toText: string | undefined,
  fractureCountText: string | undefined
): string {
  const from = parseLoggingNumber(fromText);
  const to = parseLoggingNumber(toText);
  const fractureCount = parseLoggingNumber(fractureCountText);
  if (
    from === null ||
    to === null ||
    fractureCount === null ||
    fractureCount <= 0 ||
    to < from
  )
    return "";
  return ((to - from) / fractureCount).toFixed(3);
}

export const roughnessOptions = [
  "Planar polished",
  "Planar smooth",
  "Planar rough",
  "Undulating Polished",
  "Undulating Smooth",
  "Undulating Rough",
  "Stepped Polished",
  "Stepped smooth",
  "Stepped Irregular",
] as const;

export const roughnessCodes: Record<(typeof roughnessOptions)[number], string> =
  {
    "Planar polished": "PP",
    "Planar smooth": "PS",
    "Planar rough": "PR",
    "Undulating Polished": "UP",
    "Undulating Smooth": "US",
    "Undulating Rough": "UR",
    "Stepped Polished": "SP",
    "Stepped smooth": "SS",
    "Stepped Irregular": "SI",
  };

const roughnessProfiles: Record<
  string,
  { jrc: number; state: string; rmrScore: number }
> = {
  "Planar polished": { jrc: 0.5, state: "Very smooth", rmrScore: 6 },
  "Planar smooth": { jrc: 1.5, state: "Very smooth", rmrScore: 6 },
  "Planar rough": { jrc: 2.5, state: "Rough", rmrScore: 20 },
  "Undulating Polished": { jrc: 7, state: "Rough", rmrScore: 20 },
  "Undulating Smooth": { jrc: 11, state: "Very rough", rmrScore: 25 },
  "Undulating Rough": { jrc: 14, state: "Very rough", rmrScore: 25 },
  "Stepped Polished": { jrc: 11, state: "Very rough", rmrScore: 25 },
  "Stepped smooth": { jrc: 14, state: "Very rough", rmrScore: 25 },
  "Stepped Irregular": { jrc: 20, state: "Extremely rough", rmrScore: 25 },
};

export function getRoughnessProfile(value: string | undefined) {
  return roughnessProfiles[(value ?? "").trim()] ?? null;
}

function ratingUcs(ucs: number): number {
  if (ucs > 200) return 15;
  if (ucs >= 100) return 12;
  if (ucs >= 50) return 7;
  if (ucs >= 25) return 4;
  if (ucs >= 10) return 2;
  if (ucs >= 3) return 1;
  return 0;
}

function ratingRqd(rqd: number): number {
  if (rqd >= 90) return 20;
  if (rqd >= 75) return 17;
  if (rqd >= 50) return 13;
  if (rqd >= 25) return 8;
  return 3;
}

function ratingSpacing(spacing: number): number {
  if (spacing > 3) return 30;
  if (spacing >= 1) return 25;
  if (spacing >= 0.3) return 20;
  if (spacing >= 0.05) return 10;
  return 5;
}

function ratingJointNature(roughness: number): number {
  if (roughness >= 6) return 25;
  if (roughness >= 4) return 20;
  if (roughness >= 2) return 12;
  if (roughness > 0) return 6;
  return 0;
}

function ratingWaterCondition(
  waterConditionText: string | undefined
): number | null {
  const normalized = (waterConditionText ?? "").trim().toLowerCase();
  if (normalized === "dry") return 15;
  if (normalized === "wet") return 0;
  const waterCondition = parseLoggingNumber(waterConditionText);
  if (waterCondition === null) return null;
  if (waterCondition >= 10) return 10;
  if (waterCondition >= 7) return 7;
  if (waterCondition >= 4) return 4;
  return 0;
}

/** The same surface-description score used by Rock mass classification. */
export function getLoggingRoughnessRating(
  value: string | undefined
): number | null {
  const profile = getRoughnessProfile(value);
  if (profile) return profile.rmrScore;
  const numeric = parseLoggingNumber(value);
  if (numeric === null || numeric < 0 || numeric > 6) return null;
  return ratingJointNature(numeric);
}

/** Dry/Wet labels and legacy numerical water values use the existing logging scale. */
export function getLoggingWaterRating(
  value: string | undefined
): number | null {
  const normalized = (value ?? "").trim().toLowerCase();
  if (normalized === "dry" || normalized === "wet")
    return ratingWaterCondition(value);
  const numeric = parseLoggingNumber(value);
  if (numeric === null || numeric < 0 || numeric > 15) return null;
  return ratingWaterCondition(value);
}

/** Applies the existing UCS, RQD and spacing bands, then adds already-resolved
 * roughness/water ratings. This permits length-weighted category scores in Statistics
 * without reinterpreting an averaged JRC or converting Dry=15 into a legacy value.
 */
export function calculateLoggingRmrScore({
  ucs,
  rqd,
  spacing,
  roughnessRating,
  waterRating,
}: {
  ucs: number | null;
  rqd: number | null;
  spacing: number | null;
  roughnessRating: number | null;
  waterRating: number | null;
}): number | null {
  if (
    ucs === null ||
    rqd === null ||
    spacing === null ||
    roughnessRating === null ||
    waterRating === null
  )
    return null;
  if (![ucs, rqd, spacing, roughnessRating, waterRating].every(Number.isFinite))
    return null;
  if (
    ucs < 0 ||
    rqd < 0 ||
    rqd > 100 ||
    spacing < 0 ||
    roughnessRating < 0 ||
    roughnessRating > 30 ||
    waterRating < 0 ||
    waterRating > 15
  )
    return null;
  const score = Math.max(
    0,
    Math.min(
      100,
      ratingUcs(ucs) +
        ratingRqd(rqd) +
        ratingSpacing(spacing) +
        roughnessRating +
        waterRating
    )
  );
  return Math.round(score * 10) / 10;
}

/**
 * Calculates Bieniawski RMR from the fields available in an interval row.
 * Roughness is selected from the supplied surface descriptions and mapped to the supplied joint-nature
 * notes (25 / 20 / 12 / 6 / 0). Water condition accepts Dry/Wet labels:
 * Dry contributes 15 points and Wet contributes 0 points. Legacy numeric
 * values remain supported and continue to map to 10 / 7 / 4 / 0.
 */
export function calculateLoggingRmr(row: Record<string, string>): string {
  const ucs = parseLoggingNumber(row.ucs);
  const rqd = parseLoggingNumber(row.rqdPercent ?? row.rqd);
  const spacing = parseLoggingNumber(row.jointSpacing);
  const score = calculateLoggingRmrScore({
    ucs,
    rqd,
    spacing,
    roughnessRating: getLoggingRoughnessRating(row.roughness),
    waterRating: getLoggingWaterRating(row.waterCondition),
  });
  return score === null ? "" : score.toFixed(1);
}

export type RmrQuality = {
  label: string;
  cellClass: string;
  rowClass: string;
};

export function getRmrQuality(rmrText: string | undefined): RmrQuality | null {
  const score = parseLoggingNumber(rmrText);
  if (score === null) return null;
  if (score >= 81)
    return {
      label: "Very good",
      cellClass: "bg-emerald-100 text-emerald-950 border-emerald-500",
      rowClass: "",
    };
  if (score >= 61)
    return {
      label: "Good",
      cellClass: "bg-green-100 text-green-950 border-green-500",
      rowClass: "",
    };
  if (score >= 41)
    return {
      label: "Fair",
      cellClass: "bg-amber-100 text-amber-950 border-amber-500",
      rowClass: "bg-amber-50/40",
    };
  if (score >= 21)
    return {
      label: "Poor",
      cellClass:
        "bg-orange-200 text-orange-950 border-orange-600 font-semibold",
      rowClass: "bg-orange-50/60",
    };
  return {
    label: "Very poor",
    cellClass: "bg-red-200 text-red-950 border-red-700 font-bold",
    rowClass: "bg-red-50/70",
  };
}
