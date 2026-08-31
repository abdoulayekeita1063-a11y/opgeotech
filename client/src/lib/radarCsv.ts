export type ParsedRadarReading = {
  radarPointId: string;
  measuredAt: number;
  displacementMm: number;
  velocityMmPerDay?: number;
  accelerationMmPerDay2?: number;
};

function parseCsvLine(line: string) {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') { cell += '"'; index += 1; }
      else quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(cell.trim()); cell = "";
    } else cell += char;
  }
  cells.push(cell.trim());
  return cells;
}

export function parseRadarCsv(text: string): ParsedRadarReading[] {
  const lines = text.split(/\r?\n/).filter(line => line.trim());
  if (lines.length < 2) throw new Error("CSV must contain a header and at least one reading");
  const headers = parseCsvLine(lines[0]).map(header => header.toLowerCase().replace(/[^a-z0-9]/g, ""));
  const find = (...names: string[]) => names.map(name => headers.indexOf(name)).find(index => index >= 0) ?? -1;
  const pointIndex = find("radarpointid", "pointid", "point", "id");
  const timeIndex = find("measuredat", "timestamp", "datetime", "date", "time");
  const displacementIndex = find("displacementmm", "displacement", "deformationmm", "deformation");
  const velocityIndex = find("velocitymmperday", "velocity", "velocitymmd", "rate");
  const accelerationIndex = find("accelerationmmperday2", "acceleration", "accelerationrate");
  if (timeIndex < 0 || displacementIndex < 0) throw new Error("CSV needs measuredAt/timestamp and displacementMm columns");
  const parseTime = (value: string) => {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric < 10_000_000_000 ? numeric * 1000 : numeric;
    const parsed = Date.parse(value);
    if (!Number.isFinite(parsed)) throw new Error(`Invalid radar timestamp: ${value}`);
    return parsed;
  };
  return lines.slice(1).map((line, rowIndex) => {
    const cells = parseCsvLine(line);
    const displacementMm = Number(cells[displacementIndex]);
    if (!Number.isFinite(displacementMm)) throw new Error(`Invalid displacement on CSV row ${rowIndex + 2}`);
    const optional = (index: number) => index >= 0 && cells[index] ? Number(cells[index]) : undefined;
    return {
      radarPointId: pointIndex >= 0 && cells[pointIndex] ? cells[pointIndex] : "RADAR-POINT-01",
      measuredAt: parseTime(cells[timeIndex]),
      displacementMm,
      velocityMmPerDay: optional(velocityIndex),
      accelerationMmPerDay2: optional(accelerationIndex),
    };
  });
}
