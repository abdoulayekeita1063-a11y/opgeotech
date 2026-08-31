export type RadarRisk = "Low" | "Moderate" | "High" | "Critical";

export type RadarReadingInput = {
  radarPointId: string;
  measuredAt: number;
  displacementMm: number;
  velocityMmPerDay?: number | null;
  accelerationMmPerDay2?: number | null;
};

export type RadarTrendPoint = RadarReadingInput & {
  calculatedVelocityMmPerDay: number | null;
  calculatedAccelerationMmPerDay2: number | null;
};

export type RadarTrendResult = {
  pointId: string;
  sampleCount: number;
  firstMeasuredAt: number;
  lastMeasuredAt: number;
  displacementChangeMm: number;
  latestDisplacementMm: number;
  latestVelocityMmPerDay: number | null;
  latestAccelerationMmPerDay2: number | null;
  peakVelocityMmPerDay: number | null;
  peakAccelerationMmPerDay2: number | null;
  risk: RadarRisk;
  alert: string;
  basis: string[];
  points: RadarTrendPoint[];
};

export const DEFAULT_RADAR_THRESHOLDS = {
  moderateVelocityMmPerDay: 1,
  highVelocityMmPerDay: 5,
  criticalVelocityMmPerDay: 10,
  moderateAccelerationMmPerDay2: 0.1,
  highAccelerationMmPerDay2: 0.5,
  criticalAccelerationMmPerDay2: 1,
};

function finiteOrNull(value: number | null | undefined) {
  return value !== null && value !== undefined && Number.isFinite(value) ? value : null;
}

function round(value: number | null) {
  return value === null ? null : Math.round(value * 1000) / 1000;
}

export function analyzeRadarTrend(
  input: RadarReadingInput[],
  thresholds = DEFAULT_RADAR_THRESHOLDS,
): RadarTrendResult {
  if (!input.length) throw new Error("At least one radar reading is required");

  const sorted = [...input].sort((a, b) => a.measuredAt - b.measuredAt);
  const points: RadarTrendPoint[] = [];

  for (let i = 0; i < sorted.length; i += 1) {
    const current = sorted[i];
    const previous = sorted[i - 1];
    let velocity = finiteOrNull(current.velocityMmPerDay);
    let acceleration = finiteOrNull(current.accelerationMmPerDay2);

    if (velocity === null && previous) {
      const days = (current.measuredAt - previous.measuredAt) / 86_400_000;
      if (days > 0) velocity = (current.displacementMm - previous.displacementMm) / days;
    }
    if (acceleration === null && previous && velocity !== null) {
      const previousVelocity = points[i - 1].calculatedVelocityMmPerDay;
      const days = (current.measuredAt - previous.measuredAt) / 86_400_000;
      if (previousVelocity !== null && days > 0) acceleration = (velocity - previousVelocity) / days;
    }

    points.push({
      ...current,
      calculatedVelocityMmPerDay: round(velocity),
      calculatedAccelerationMmPerDay2: round(acceleration),
    });
  }

  const latest = points[points.length - 1];
  const velocities = points.map(point => point.calculatedVelocityMmPerDay).filter((value): value is number => value !== null);
  const accelerations = points.map(point => point.calculatedAccelerationMmPerDay2).filter((value): value is number => value !== null);
  const latestVelocity = latest.calculatedVelocityMmPerDay;
  const latestAcceleration = latest.calculatedAccelerationMmPerDay2;
  const absoluteVelocity = latestVelocity === null ? 0 : Math.abs(latestVelocity);
  const absoluteAcceleration = latestAcceleration === null ? 0 : Math.abs(latestAcceleration);

  let risk: RadarRisk = "Low";
  if (absoluteVelocity >= thresholds.criticalVelocityMmPerDay || absoluteAcceleration >= thresholds.criticalAccelerationMmPerDay2) risk = "Critical";
  else if (absoluteVelocity >= thresholds.highVelocityMmPerDay || absoluteAcceleration >= thresholds.highAccelerationMmPerDay2) risk = "High";
  else if (absoluteVelocity >= thresholds.moderateVelocityMmPerDay || absoluteAcceleration >= thresholds.moderateAccelerationMmPerDay2) risk = "Moderate";

  const basis = [
    `Latest velocity: ${latestVelocity === null ? "not available" : `${latestVelocity} mm/day`}.`,
    `Latest acceleration: ${latestAcceleration === null ? "not available" : `${latestAcceleration} mm/day²`}.`,
    `Thresholds: moderate ${thresholds.moderateVelocityMmPerDay}, high ${thresholds.highVelocityMmPerDay}, critical ${thresholds.criticalVelocityMmPerDay} mm/day.`,
  ];
  const alert = risk === "Critical"
    ? "Critical movement trend — immediately follow the site Trigger Action Response Plan and confirm with the geotechnical engineer."
    : risk === "High"
      ? "High movement trend — increase observation frequency and verify the radar signal, prism data and field conditions."
      : risk === "Moderate"
        ? "Moderate movement trend — continue close monitoring and review the trend against site trigger levels."
        : "No threshold exceedance detected in the supplied trend; maintain the monitoring plan.";

  return {
    pointId: latest.radarPointId,
    sampleCount: points.length,
    firstMeasuredAt: sorted[0].measuredAt,
    lastMeasuredAt: latest.measuredAt,
    displacementChangeMm: round(latest.displacementMm - sorted[0].displacementMm) ?? 0,
    latestDisplacementMm: latest.displacementMm,
    latestVelocityMmPerDay: latestVelocity,
    latestAccelerationMmPerDay2: latestAcceleration,
    peakVelocityMmPerDay: velocities.length ? round(Math.max(...velocities.map(Math.abs))) : null,
    peakAccelerationMmPerDay2: accelerations.length ? round(Math.max(...accelerations.map(Math.abs))) : null,
    risk,
    alert,
    basis,
    points,
  };
}
