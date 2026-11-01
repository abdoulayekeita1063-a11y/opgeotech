import {
  calculateLoggingRmrScore,
  getLoggingRoughnessRating,
  getLoggingWaterRating,
  getRoughnessProfile,
} from "./loggingRmr";

export type LoggingStatisticsInput = Record<string, string | undefined>;
export type LoggingMetric = "ucs" | "rqd" | "spacing" | "jrc" | "water";
export const loggingMetrics: LoggingMetric[] = [
  "ucs",
  "rqd",
  "spacing",
  "jrc",
  "water",
];

export type WeightedMetric = {
  average: number | null;
  validLength: number;
  validIntervals: number;
};
export type StratigraphyStatistics = {
  stratigraphy: string;
  loggedLength: number;
  intervalCount: number;
  metrics: Record<LoggingMetric, WeightedMetric>;
  roughnessRating: WeightedMetric;
  rmr: number | null;
};

type Accumulator = {
  stratigraphy: string;
  loggedLength: number;
  intervalCount: number;
  metrics: Record<
    LoggingMetric,
    { sum: number; length: number; count: number }
  >;
  roughnessRating: { sum: number; length: number; count: number };
};

function numberOrNull(value: string | undefined): number | null {
  if (!value?.trim()) return null;
  const text = value.trim().replace(",", ".");
  // Do not treat blanks, text, inequality qualifiers, or malformed values as zero.
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text)) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

function accumulator(stratigraphy: string): Accumulator {
  return {
    stratigraphy,
    loggedLength: 0,
    intervalCount: 0,
    metrics: {
      ucs: { sum: 0, length: 0, count: 0 },
      rqd: { sum: 0, length: 0, count: 0 },
      spacing: { sum: 0, length: 0, count: 0 },
      jrc: { sum: 0, length: 0, count: 0 },
      water: { sum: 0, length: 0, count: 0 },
    },
    roughnessRating: { sum: 0, length: 0, count: 0 },
  };
}

function finish(group: Accumulator): StratigraphyStatistics {
  const metrics = Object.fromEntries(
    loggingMetrics.map(key => {
      const metric = group.metrics[key];
      return [
        key,
        {
          average: metric.length > 0 ? metric.sum / metric.length : null,
          validLength: metric.length,
          validIntervals: metric.count,
        },
      ];
    })
  ) as Record<LoggingMetric, WeightedMetric>;
  const roughnessRating: WeightedMetric = {
    average:
      group.roughnessRating.length > 0
        ? group.roughnessRating.sum / group.roughnessRating.length
        : null,
    validLength: group.roughnessRating.length,
    validIntervals: group.roughnessRating.count,
  };
  return {
    stratigraphy: group.stratigraphy,
    loggedLength: group.loggedLength,
    intervalCount: group.intervalCount,
    metrics,
    roughnessRating,
    rmr: calculateLoggingRmrScore({
      ucs: metrics.ucs.average,
      rqd: metrics.rqd.average,
      spacing: metrics.spacing.average,
      roughnessRating: roughnessRating.average,
      waterRating: metrics.water.average,
    }),
  };
}

/** Length weighted mean = sum(value * (To - From)) / sum(valid metric lengths).
 * RQD uses the percentage column, never the recovered >100 mm length column.
 * All four properties are read directly from Rock mass classification cell values.
 * The caller supplies its displayed jointSpacing and jrc values; do not derive
 * different values here from fracture count or roughness profiles.
 * The total is calculated from intervals, not from rounded group averages.
 * Water and roughness descriptions are converted to their existing logging RMR
 * ratings before length weighting (Dry=15, Wet=0; profile scores unchanged).
 * Summary RMR applies the existing UCS/RQD/spacing bands to their averages and
 * adds the weighted roughness and water ratings. It is not an average of row RMRs.
 */
export function calculateLoggingStatistics(
  rows: readonly LoggingStatisticsInput[]
) {
  const groups = new Map<string, Accumulator>();
  const total = accumulator("All stratigraphies");
  let excludedIntervals = 0;
  let unspecifiedIntervals = 0;

  for (const row of rows) {
    const isRockInterval = [
      "from",
      "to",
      "stratigraphy",
      "rqdPercent",
      "ucs",
      "fractureCount",
      "microRoughness",
      "recovery",
      "rqd",
      "jointSpacing",
      "jrc",
    ].some(key => Boolean(row[key]?.trim()));
    if (!isRockInterval) continue; // Ignore blank rows and discontinuity-only records.
    const from = numberOrNull(row.from);
    const to = numberOrNull(row.to);
    if (from === null || to === null || from < 0 || to <= from) {
      excludedIntervals++;
      continue;
    }
    const length = to - from;
    const label =
      row.stratigraphy?.trim().replace(/\s+/g, " ") || "Unspecified";
    const key = label.toLocaleUpperCase("en");
    if (!row.stratigraphy?.trim()) unspecifiedIntervals++;
    if (!groups.has(key)) groups.set(key, accumulator(label));
    const group = groups.get(key)!;
    const ucs = numberOrNull(row.ucs);
    const rqd = numberOrNull(row.rqdPercent);
    const spacing = numberOrNull(row.jointSpacing);
    const jrc = numberOrNull(row.jrc);
    const waterText = (row.waterCondition ?? "").trim().toLowerCase();
    const validWater =
      ["dry", "wet"].includes(waterText) ||
      numberOrNull(row.waterCondition) !== null;
    const water = validWater ? getLoggingWaterRating(row.waterCondition) : null;
    const roughnessText = row.microRoughness;
    const validRoughness =
      Boolean(getRoughnessProfile(roughnessText)) ||
      numberOrNull(roughnessText) !== null;
    const roughness = validRoughness
      ? getLoggingRoughnessRating(roughnessText)
      : null;
    const values: Record<LoggingMetric, number | null> = {
      ucs: ucs !== null && ucs >= 0 ? ucs : null,
      rqd: rqd !== null && rqd >= 0 && rqd <= 100 ? rqd : null,
      spacing: spacing !== null && spacing >= 0 ? spacing : null,
      jrc: jrc !== null && jrc >= 0 && jrc <= 20 ? jrc : null,
      water,
    };
    for (const target of [group, total]) {
      target.loggedLength += length;
      target.intervalCount++;
      for (const metric of loggingMetrics) {
        const value = values[metric];
        if (value === null || !Number.isFinite(value)) continue;
        target.metrics[metric].sum += value * length;
        target.metrics[metric].length += length;
        target.metrics[metric].count++;
      }
      if (roughness !== null) {
        target.roughnessRating.sum += roughness * length;
        target.roughnessRating.length += length;
        target.roughnessRating.count++;
      }
    }
  }
  return {
    groups: Array.from(groups.values())
      .sort((a, b) =>
        a.stratigraphy.localeCompare(b.stratigraphy, "en", { numeric: true })
      )
      .map(finish),
    total: finish(total),
    excludedIntervals,
    unspecifiedIntervals,
  };
}
