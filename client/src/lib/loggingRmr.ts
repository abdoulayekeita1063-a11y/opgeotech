export function parseLoggingNumber(value: string | undefined): number | null {
  const parsed = Number.parseFloat((value ?? "").replace(/[^0-9.+-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

export function calculateJointSpacing(fromText: string | undefined, toText: string | undefined, fractureCountText: string | undefined): string {
  const from = parseLoggingNumber(fromText);
  const to = parseLoggingNumber(toText);
  const fractureCount = parseLoggingNumber(fractureCountText);
  if (from === null || to === null || fractureCount === null || fractureCount <= 0 || to < from) return "";
  return ((to - from) / fractureCount).toFixed(3);
}

function ratingUcs(ucs: number): number {
  if (ucs > 250) return 15;
  if (ucs > 100) return 12;
  if (ucs > 50) return 7;
  if (ucs > 25) return 4;
  if (ucs > 5) return 2;
  if (ucs > 1) return 1;
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
  if (spacing > 2) return 20;
  if (spacing > 0.6) return 15;
  if (spacing > 0.2) return 10;
  if (spacing > 0.06) return 8;
  return 5;
}

/**
 * Calculates Bieniawski RMR from the fields available in an interval row.
 * Roughness is entered on a 0–6 scale and mapped to the 0–30 discontinuity
 * condition contribution. Water condition is entered directly on the standard
 * 0–15 groundwater rating scale, where 15 represents dry conditions.
 */
export function calculateLoggingRmr(row: Record<string, string>): string {
  const ucs = parseLoggingNumber(row.ucs);
  const rqd = parseLoggingNumber(row.rqdPercent ?? row.rqd);
  const spacing = parseLoggingNumber(row.jointSpacing);
  const roughness = parseLoggingNumber(row.roughness);
  const waterCondition = parseLoggingNumber(row.waterCondition);
  if ([ucs, rqd, spacing, roughness, waterCondition].some(value => value === null)) return "";
  if (ucs! < 0 || rqd! < 0 || rqd! > 100 || spacing! < 0 || roughness! < 0 || roughness! > 6 || waterCondition! < 0 || waterCondition! > 15) return "";

  const conditionRating = Math.max(0, Math.min(30, roughness! * 5));
  const groundwaterRating = Math.max(0, Math.min(15, waterCondition!));
  const score = Math.max(0, Math.min(100, ratingUcs(ucs!) + ratingRqd(rqd!) + ratingSpacing(spacing!) + conditionRating + groundwaterRating));
  return (Math.round(score * 10) / 10).toFixed(1);
}

export type RmrQuality = {
  label: string;
  cellClass: string;
  rowClass: string;
};

export function getRmrQuality(rmrText: string | undefined): RmrQuality | null {
  const score = parseLoggingNumber(rmrText);
  if (score === null) return null;
  if (score >= 81) return { label: "Very good", cellClass: "bg-emerald-100 text-emerald-950 border-emerald-500", rowClass: "" };
  if (score >= 61) return { label: "Good", cellClass: "bg-green-100 text-green-950 border-green-500", rowClass: "" };
  if (score >= 41) return { label: "Fair", cellClass: "bg-amber-100 text-amber-950 border-amber-500", rowClass: "bg-amber-50/40" };
  if (score >= 21) return { label: "Poor", cellClass: "bg-orange-200 text-orange-950 border-orange-600 font-semibold", rowClass: "bg-orange-50/60" };
  return { label: "Very poor", cellClass: "bg-red-200 text-red-950 border-red-700 font-bold", rowClass: "bg-red-50/70" };
}
