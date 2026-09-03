export type MonitoringRiskLevel = "Low" | "Moderate" | "High" | "Critical";

export type MonitoringVelocityThresholds = {
  moderate: number;
  high: number;
  critical: number;
};

export function validateMonitoringThresholds(thresholds: MonitoringVelocityThresholds) {
  if (![thresholds.moderate, thresholds.high, thresholds.critical].every(value => Number.isFinite(value) && value >= 0)) {
    return "Thresholds must be non-negative numeric values.";
  }
  if (!(thresholds.moderate < thresholds.high && thresholds.high < thresholds.critical)) {
    return "Threshold order must be Moderate < High < Critical.";
  }
  return null;
}

export function classifyMonitoringRisk(value: number, thresholds: MonitoringVelocityThresholds): MonitoringRiskLevel {
  const absoluteVelocity = Math.abs(value);
  if (absoluteVelocity >= thresholds.critical) return "Critical";
  if (absoluteVelocity >= thresholds.high) return "High";
  if (absoluteVelocity >= thresholds.moderate) return "Moderate";
  return "Low";
}

export function classifyMonitoringRiskFromVelocities(values: number[], thresholds: MonitoringVelocityThresholds) {
  const finite = values.filter(Number.isFinite).map(Math.abs);
  const maxVelocity = finite.length ? Math.max(...finite) : 0;
  return { maxVelocity, risk: classifyMonitoringRisk(maxVelocity, thresholds) };
}
