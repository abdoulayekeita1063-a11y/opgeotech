export type RadarRisk = "Low" | "Moderate" | "High" | "Critical";
export type RadarForecastStatus = "Forecast available" | "No reliable forecast" | "Insufficient data";

export type RadarReadingInput = {
  radarPointId: string;
  measuredAt: number;
  displacementMm: number;
  velocityMmPerDay?: number | null;
};

export type RadarTrendPoint = RadarReadingInput & {
  calculatedVelocityMmPerDay: number | null;
};

export type RadarFailureForecast = {
  method: "Inverse velocity";
  status: RadarForecastStatus;
  predictedFailureAt: number | null;
  leadTimeHours: number | null;
  rSquared: number | null;
  fitSampleCount: number;
  inverseVelocitySlopePerDay: number | null;
  confidence: "High" | "Moderate" | "Low" | "Not available";
  message: string;
};

export type RadarTrendResult = {
  pointId: string;
  sampleCount: number;
  firstMeasuredAt: number;
  lastMeasuredAt: number;
  displacementChangeMm: number;
  latestDisplacementMm: number;
  latestVelocityMmPerDay: number | null;
  peakVelocityMmPerDay: number | null;
  risk: RadarRisk;
  alert: string;
  basis: string[];
  failureForecast: RadarFailureForecast;
  points: RadarTrendPoint[];
};

export const DEFAULT_RADAR_THRESHOLDS = {
  moderateVelocityMmPerDay: 1,
  highVelocityMmPerDay: 5,
  criticalVelocityMmPerDay: 10,
};

function finiteOrNull(value: number | null | undefined) {
  return value !== null && value !== undefined && Number.isFinite(value) ? value : null;
}

function round(value: number | null) {
  return value === null ? null : Math.round(value * 1000) / 1000;
}

function inverseVelocityForecast(points: RadarTrendPoint[], firstMeasuredAt: number, lastMeasuredAt: number): RadarFailureForecast {
  const series = points
    .filter(point => point.calculatedVelocityMmPerDay !== null && Math.abs(point.calculatedVelocityMmPerDay) > 0)
    .map(point => ({
      timeDays: (point.measuredAt - firstMeasuredAt) / 86_400_000,
      inverseVelocity: 1 / Math.abs(point.calculatedVelocityMmPerDay as number),
    }))
    .filter(point => Number.isFinite(point.timeDays) && Number.isFinite(point.inverseVelocity));

  if (series.length < 3) {
    return {
      method: "Inverse velocity",
      status: "Insufficient data",
      predictedFailureAt: null,
      leadTimeHours: null,
      rSquared: null,
      fitSampleCount: series.length,
      inverseVelocitySlopePerDay: null,
      confidence: "Not available",
      message: "At least three positive velocity readings are required for an inverse-velocity forecast.",
    };
  }

  const n = series.length;
  const sumX = series.reduce((sum, point) => sum + point.timeDays, 0);
  const sumY = series.reduce((sum, point) => sum + point.inverseVelocity, 0);
  const sumXX = series.reduce((sum, point) => sum + point.timeDays * point.timeDays, 0);
  const sumXY = series.reduce((sum, point) => sum + point.timeDays * point.inverseVelocity, 0);
  const denominator = n * sumXX - sumX * sumX;
  if (denominator <= 0) {
    return {
      method: "Inverse velocity",
      status: "No reliable forecast",
      predictedFailureAt: null,
      leadTimeHours: null,
      rSquared: null,
      fitSampleCount: n,
      inverseVelocitySlopePerDay: null,
      confidence: "Not available",
      message: "The radar timestamps do not provide enough time variation for a stable forecast.",
    };
  }

  const slope = (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;
  const meanY = sumY / n;
  const ssTotal = series.reduce((sum, point) => sum + (point.inverseVelocity - meanY) ** 2, 0);
  const ssResidual = series.reduce((sum, point) => {
    const predicted = intercept + slope * point.timeDays;
    return sum + (point.inverseVelocity - predicted) ** 2;
  }, 0);
  const rSquared = ssTotal === 0 ? 1 : Math.max(0, 1 - ssResidual / ssTotal);
  const latestTimeDays = (lastMeasuredAt - firstMeasuredAt) / 86_400_000;
  const predictedTimeDays = slope < 0 ? -intercept / slope : null;
  const isForwardForecast = predictedTimeDays !== null && predictedTimeDays > latestTimeDays;

  if (slope >= 0 || !isForwardForecast || rSquared < 0.5) {
    const reason = slope >= 0
      ? "Inverse velocity is not declining, so the supplied displacement/velocity trend does not support a forward failure-time estimate."
      : !isForwardForecast
        ? "The fitted inverse-velocity line reaches zero before or at the latest observation."
        : `The inverse-velocity fit is weak (R² = ${rSquared.toFixed(2)}).`;
    return {
      method: "Inverse velocity",
      status: "No reliable forecast",
      predictedFailureAt: null,
      leadTimeHours: null,
      rSquared: round(rSquared),
      fitSampleCount: n,
      inverseVelocitySlopePerDay: round(slope),
      confidence: rSquared >= 0.8 ? "High" : rSquared >= 0.5 ? "Moderate" : "Low",
      message: `${reason} Continue monitoring and review the fitting window with the geotechnical engineer.`,
    };
  }

  const predictedFailureAt = firstMeasuredAt + predictedTimeDays * 86_400_000;
  const leadTimeHours = Math.max(0, (predictedFailureAt - lastMeasuredAt) / 3_600_000);
  return {
    method: "Inverse velocity",
    status: "Forecast available",
    predictedFailureAt,
    leadTimeHours: round(leadTimeHours),
    rSquared: round(rSquared),
    fitSampleCount: n,
    inverseVelocitySlopePerDay: round(slope),
    confidence: rSquared >= 0.8 ? "High" : "Moderate",
    message: `Extrapolated inverse velocity reaches zero in approximately ${leadTimeHours.toFixed(1)} hours. Treat this as a trend warning, not a deterministic failure time.`,
  };
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

    if (velocity === null && previous) {
      const days = (current.measuredAt - previous.measuredAt) / 86_400_000;
      if (days > 0) velocity = (current.displacementMm - previous.displacementMm) / days;
    }

    points.push({
      ...current,
      calculatedVelocityMmPerDay: round(velocity),
    });
  }

  const firstMeasuredAt = sorted[0].measuredAt;
  const latest = points[points.length - 1];
  const velocities = points.map(point => point.calculatedVelocityMmPerDay).filter((value): value is number => value !== null);
  const latestVelocity = latest.calculatedVelocityMmPerDay;
  const absoluteVelocity = latestVelocity === null ? 0 : Math.abs(latestVelocity);

  let risk: RadarRisk = "Low";
  if (absoluteVelocity >= thresholds.criticalVelocityMmPerDay) risk = "Critical";
  else if (absoluteVelocity >= thresholds.highVelocityMmPerDay) risk = "High";
  else if (absoluteVelocity >= thresholds.moderateVelocityMmPerDay) risk = "Moderate";

  const failureForecast = inverseVelocityForecast(points, firstMeasuredAt, latest.measuredAt);
  const basis = [
    `Latest velocity: ${latestVelocity === null ? "not available" : `${latestVelocity} mm/day`}.`,
    `Thresholds: moderate ${thresholds.moderateVelocityMmPerDay}, high ${thresholds.highVelocityMmPerDay}, critical ${thresholds.criticalVelocityMmPerDay} mm/day.`,
    `Failure forecast: ${failureForecast.status} using ${failureForecast.method}.`,
  ];
  const alert = risk === "Critical"
    ? "Critical movement velocity — immediately follow the site Trigger Action Response Plan and confirm with the geotechnical engineer."
    : risk === "High"
      ? "High movement velocity — increase observation frequency and verify the radar signal, prism data and field conditions."
      : risk === "Moderate"
        ? "Moderate movement velocity — continue close monitoring and review the trend against site trigger levels."
        : "No velocity threshold exceedance detected in the supplied trend; maintain the monitoring plan.";

  return {
    pointId: latest.radarPointId,
    sampleCount: points.length,
    firstMeasuredAt,
    lastMeasuredAt: latest.measuredAt,
    displacementChangeMm: round(latest.displacementMm - sorted[0].displacementMm) ?? 0,
    latestDisplacementMm: latest.displacementMm,
    latestVelocityMmPerDay: latestVelocity,
    peakVelocityMmPerDay: velocities.length ? round(Math.max(...velocities.map(Math.abs))) : null,
    risk,
    alert,
    basis,
    failureForecast,
    points,
  };
}
