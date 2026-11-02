import { jsPDF } from "jspdf";
import type {
  BermAnalysisInput,
  BermAnalysisResult,
  BermCheck,
  BermStatus,
  MultiPolygon,
  XY,
} from "@shared/berm/types";

export type BermReportOptions = {
  input: BermAnalysisInput;
  result: BermAnalysisResult;
  filename?: string;
};

type Bounds = { minX: number; minY: number; maxX: number; maxY: number };

const STATUS_COLOURS: Record<BermStatus, [number, number, number]> = {
  Compliant: [22, 128, 92],
  Warning: [202, 138, 4],
  "Non-Compliant": [190, 38, 38],
  "Insufficient Data": [100, 116, 139],
};

function finite(value: number | null | undefined) {
  return value !== null && value !== undefined && Number.isFinite(value);
}

function metric(value: number | null | undefined, unit = "") {
  return finite(value)
    ? `${value!.toLocaleString(undefined, { maximumFractionDigits: 3 })}${unit}`
    : "Not available";
}

function percent(value: number | null | undefined) {
  return finite(value)
    ? `${value!.toLocaleString(undefined, { maximumFractionDigits: 3, signDisplay: "always" })}%`
    : "Not available";
}

function utcDate(value: number | null) {
  if (!finite(value)) return "Not recorded";
  const date = new Date(value!);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")} UTC`;
}

function safeFilename(filename: string) {
  const cleaned = filename
    .replace(/\.pdf$/i, "")
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return `${cleaned || "berm-monitoring-report"}.pdf`;
}

function allPoints(geometries: MultiPolygon[]) {
  return geometries.flatMap(geometry =>
    geometry.flatMap(polygon => polygon.flatMap(ring => ring))
  );
}

function boundsFor(geometries: MultiPolygon[]): Bounds | null {
  const points = allPoints(geometries);
  if (!points.length) return null;
  const xs = points.map(point => point[0]);
  const ys = points.map(point => point[1]);
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}

function pathFor(
  geometry: MultiPolygon,
  bounds: Bounds,
  width: number,
  height: number
) {
  const spanX = Math.max(bounds.maxX - bounds.minX, 1e-9);
  const spanY = Math.max(bounds.maxY - bounds.minY, 1e-9);
  const pad = 34;
  const scale = Math.min((width - pad * 2) / spanX, (height - pad * 2) / spanY);
  const offsetX = (width - spanX * scale) / 2;
  const offsetY = (height - spanY * scale) / 2;
  const point = ([x, y]: XY) =>
    [
      offsetX + (x - bounds.minX) * scale,
      height - offsetY - (y - bounds.minY) * scale,
    ] as const;

  return geometry
    .flatMap(polygon =>
      polygon.map(ring => {
        if (!ring.length) return "";
        const [firstX, firstY] = point(ring[0]);
        return `M ${firstX.toFixed(2)} ${firstY.toFixed(2)} ${ring
          .slice(1)
          .map(coordinate => {
            const [x, y] = point(coordinate);
            return `L ${x.toFixed(2)} ${y.toFixed(2)}`;
          })
          .join(" ")} Z`;
      })
    )
    .join(" ");
}

/** A static, measured plot used in the exported report. No coordinates are changed or invented. */
export function createBermComparisonPlotSvg(result: BermAnalysisResult) {
  const width = 760;
  const height = 450;
  const bounds = boundsFor([
    result.plannedGeometry,
    result.asBuiltGeometry,
    result.overlapGeometry,
    result.missingGeometry,
    result.excessGeometry,
  ]);

  if (!bounds) return null;
  const planned = pathFor(result.plannedGeometry, bounds, width, height);
  const asBuilt = pathFor(result.asBuiltGeometry, bounds, width, height);
  const overlap = pathFor(result.overlapGeometry, bounds, width, height);
  const missing = pathFor(result.missingGeometry, bounds, width, height);
  const excess = pathFor(result.excessGeometry, bounds, width, height);
  const min = result.minimumWidthLocation;

  const spanX = Math.max(bounds.maxX - bounds.minX, 1e-9);
  const spanY = Math.max(bounds.maxY - bounds.minY, 1e-9);
  const pad = 34;
  const scale = Math.min((width - pad * 2) / spanX, (height - pad * 2) / spanY);
  const offsetX = (width - spanX * scale) / 2;
  const offsetY = (height - spanY * scale) / 2;
  const screenPoint = ([x, y]: XY) =>
    [
      offsetX + (x - bounds.minX) * scale,
      height - offsetY - (y - bounds.minY) * scale,
    ] as const;
  const minSegment = min
    ? (() => {
        const [x1, y1] = screenPoint(min.from);
        const [x2, y2] = screenPoint(min.to);
        return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#dc2626" stroke-width="4" />`;
      })()
    : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="#ffffff"/>
  <rect x="1" y="1" width="${width - 2}" height="${height - 2}" fill="none" stroke="#111827" stroke-width="2"/>
  <path d="${overlap}" fill="#94a3b8" fill-opacity="0.38" fill-rule="evenodd"/>
  <path d="${missing}" fill="#dc2626" fill-opacity="0.28" fill-rule="evenodd"/>
  <path d="${excess}" fill="#d97706" fill-opacity="0.28" fill-rule="evenodd"/>
  <path d="${planned}" fill="none" stroke="#2563eb" stroke-width="3" fill-rule="evenodd"/>
  <path d="${asBuilt}" fill="none" stroke="#0f766e" stroke-width="3" fill-rule="evenodd"/>
  ${minSegment}
  <g font-family="Helvetica, Arial, sans-serif" font-size="13" fill="#111827">
    <text x="18" y="22">E ${bounds.minX.toFixed(3)} → ${bounds.maxX.toFixed(3)}</text>
    <text x="18" y="${height - 16}">N ${bounds.minY.toFixed(3)} → ${bounds.maxY.toFixed(3)}</text>
  </g>
  <g font-family="Helvetica, Arial, sans-serif" font-size="12" fill="#111827">
    <rect x="${width - 245}" y="16" width="220" height="72" fill="#ffffff" fill-opacity="0.9" stroke="#cbd5e1"/>
    <line x1="${width - 231}" y1="34" x2="${width - 209}" y2="34" stroke="#2563eb" stroke-width="3"/><text x="${width - 201}" y="38">Planned outline</text>
    <line x1="${width - 231}" y1="52" x2="${width - 209}" y2="52" stroke="#0f766e" stroke-width="3"/><text x="${width - 201}" y="56">As-Built outline</text>
    <rect x="${width - 231}" y="64" width="14" height="10" fill="#94a3b8" fill-opacity="0.55"/><text x="${width - 209}" y="73">Overlap / missing / excess</text>
  </g>
</svg>`;
}

async function rasterizeSvg(svg: string): Promise<string | null> {
  try {
    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const image = new Image();
    const loaded = new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () =>
        reject(new Error("Could not render comparison plot"));
    });
    image.src = url;
    await loaded;
    const canvas = document.createElement("canvas");
    canvas.width = 1520;
    canvas.height = 900;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas is unavailable");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(url);
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}

function sourceSummary(label: string, source: BermAnalysisInput["planned"]) {
  const document = source.document;
  const entities =
    document?.entities.filter(
      entity =>
        source.layers.includes(entity.layer) && entity.valid && entity.closed
    ) ?? [];
  const selected = source.entityIds.length
    ? source.entityIds.length
    : entities.length;
  return [
    ["Source", label],
    ["DXF filename", document?.filename || "Not imported"],
    [
      "Selected layers",
      source.layers.length ? source.layers.join(", ") : "None",
    ],
    [
      "Boundary selection",
      source.entityIds.length
        ? `${selected} selected entity ID(s)`
        : `All ${selected} valid closed boundary/faces on selected layers`,
    ],
    ["DXF units", document?.unitName || "Not declared"],
    [
      "Metre conversion",
      finite(source.unitsToMetres)
        ? `1 drawing unit = ${source.unitsToMetres} m`
        : "Not supplied",
    ],
    ["CRS", source.crs || "Not supplied"],
    ["Vertical datum", source.verticalDatum || "Not supplied"],
  ];
}

/** Generates and downloads a real PDF file from the currently computed, deterministic result. */
export async function exportBermMonitoringPdf({
  input,
  result,
  filename = "berm-monitoring-report",
}: BermReportOptions) {
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 13;
  const contentWidth = pageWidth - margin * 2;
  let y = 16;

  const drawChrome = () => {
    pdf.setDrawColor(215, 215, 215);
    pdf.line(margin, 9, pageWidth - margin, 9);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(7);
    pdf.setTextColor(95, 95, 95);
    pdf.text("OPGEOTECH  /  GEOTECHNICAL ENGINEERING PLATFORM", margin, 6.5);
    pdf.text("BERM MONITORING", pageWidth - margin, 6.5, { align: "right" });
    pdf.setTextColor(24, 24, 24);
  };
  const space = (height: number) => {
    if (y + height <= pageHeight - 14) return;
    pdf.addPage();
    y = 16;
    drawChrome();
  };
  const heading = (text: string) => {
    space(13);
    pdf.setFillColor(211, 47, 47);
    pdf.rect(margin, y - 4, 3, 7, "F");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(11);
    pdf.setTextColor(20, 20, 20);
    pdf.text(text.toUpperCase(), margin + 6, y + 1.5);
    y += 9;
  };
  const text = (value: string, size = 8.5) => {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(size);
    pdf.setTextColor(35, 35, 35);
    const lines = pdf.splitTextToSize(value, contentWidth);
    space(lines.length * (size * 0.47) + 3);
    pdf.text(lines, margin, y);
    y += lines.length * (size * 0.47) + 3;
  };
  const row = (cells: string[], widths: number[], header = false) => {
    const fontSize = header ? 7 : 7.5;
    pdf.setFont("helvetica", header ? "bold" : "normal");
    pdf.setFontSize(fontSize);
    const lines = cells.map((cell, index) =>
      pdf.splitTextToSize(cell, widths[index] - 4)
    );
    const height = Math.max(
      header ? 7 : 8,
      ...lines.map(value => value.length * 3.6 + 3)
    );
    space(height);
    let x = margin;
    if (header) {
      pdf.setFillColor(244, 245, 246);
      pdf.rect(
        margin,
        y - 3.5,
        widths.reduce((sum, value) => sum + value, 0),
        height,
        "F"
      );
    }
    cells.forEach((_, index) => {
      pdf.setDrawColor(210, 212, 214);
      pdf.rect(x, y - 3.5, widths[index], height);
      pdf.setTextColor(35, 35, 35);
      pdf.text(lines[index], x + 2, y);
      x += widths[index];
    });
    y += height;
  };

  drawChrome();
  const statusColour = STATUS_COLOURS[result.status];
  pdf.setFillColor(22, 22, 24);
  pdf.rect(margin, y - 5, contentWidth, 25, "F");
  pdf.setTextColor(255, 255, 255);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(18);
  pdf.text("BERM MONITORING", margin + 7, y + 2);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  pdf.text("Planned versus As-Built DXF comparison", margin + 7, y + 9);
  pdf.text(
    `Generated ${new Date().toISOString().replace("T", " ").slice(0, 19)} UTC`,
    pageWidth - margin - 7,
    y + 9,
    { align: "right" }
  );
  y += 31;

  pdf.setFillColor(...statusColour);
  pdf.roundedRect(margin, y - 4, contentWidth, 18, 1.5, 1.5, "F");
  pdf.setTextColor(255, 255, 255);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  pdf.text("OVERALL COMPARISON STATUS", margin + 6, y + 1);
  pdf.setFontSize(15);
  pdf.text(result.status, margin + 6, y + 9);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  pdf.text(
    input.metadata.bermId || "Berm ID not supplied",
    pageWidth - margin - 6,
    y + 6,
    { align: "right" }
  );
  pdf.setTextColor(25, 25, 25);
  y += 24;

  heading("Survey and review record");
  row(
    ["BERM ID", "PIT", "BENCH", "SURVEY DATE (UTC)", "REVIEWER"],
    [37, 34, 28, 47, contentWidth - 146],
    true
  );
  row(
    [
      input.metadata.bermId || "Not supplied",
      input.metadata.pit || "Not supplied",
      input.metadata.bench || "Not supplied",
      utcDate(input.metadata.surveyDateMs),
      input.metadata.reviewer || "Not supplied",
    ],
    [37, 34, 28, 47, contentWidth - 146]
  );

  heading("Measured comparison KPIs");
  row(
    ["METRIC", "MEASURED VALUE", "METHOD / INTERPRETATION"],
    [54, 43, contentWidth - 97],
    true
  );
  [
    [
      "Planned footprint area",
      metric(result.plannedArea, " m²"),
      "2D planimetric footprint",
    ],
    [
      "As-Built footprint area",
      metric(result.asBuiltArea, " m²"),
      "2D planimetric footprint; not a terrain surface",
    ],
    [
      "Signed area deviation",
      percent(result.areaDeviationPct),
      "(As-Built − Planned) / Planned × 100",
    ],
    [
      "Absolute area difference",
      metric(result.absoluteAreaDifference, " m²"),
      "Absolute 2D footprint difference",
    ],
    [
      "Overlap / missing / excess",
      `${metric(result.overlapArea, " m²")} / ${metric(result.missingArea, " m²")} / ${metric(result.excessArea, " m²")}`,
      "Polygon-overlay footprint areas",
    ],
    [
      "Planned / mean As-Built width",
      `${metric(result.plannedWidth, " m")} / ${metric(result.asBuiltWidth, " m")}`,
      "Sampled transverse widths",
    ],
    [
      "Minimum sampled width",
      metric(result.minimumWidth, " m"),
      `Discrete sampling at ${input.sampleSpacing} m; not a continuous exact minimum`,
    ],
    [
      "Maximum horizontal deviation",
      metric(result.horizontalDeviation, " m"),
      "Boundary-only horizontal comparison",
    ],
    [
      "Maximum elevation deviation",
      metric(result.elevationDeviation, " m"),
      "Boundary-only elevation comparison; unavailable where elevations are absent",
    ],
    [
      "As-Built true 3D surface area",
      metric(result.asBuiltSurfaceArea3D, " m²"),
      "Only valid non-overlapping 3DFACE coverage is eligible",
    ],
  ].forEach(values => row(values, [54, 43, contentWidth - 97]));

  const plot = createBermComparisonPlotSvg(result);
  if (plot) {
    const image = await rasterizeSvg(plot);
    if (image) {
      heading("Static comparison plot");
      space(104);
      pdf.addImage(
        image,
        "PNG",
        margin,
        y - 2,
        contentWidth,
        contentWidth * (450 / 760),
        undefined,
        "FAST"
      );
      y += contentWidth * (450 / 760) + 4;
      text(
        "Blue = planned outline; teal = As-Built outline; grey = overlap; red = missing and minimum-width segment; amber = excess. Axis labels show the original DXF coordinate envelope.",
        7.5
      );
    }
  }

  heading("Criteria and checks");
  row(
    ["CRITERION", "CONFIGURED THRESHOLD", "STATUS / MEASURED"],
    [57, 55, contentWidth - 112],
    true
  );
  [
    [
      "Minimum width",
      finite(input.criteria.minWidth)
        ? `${input.criteria.minWidth} m`
        : "Not supplied",
    ],
    [
      "Area deviation",
      finite(input.criteria.areaDeviationPct)
        ? `±${input.criteria.areaDeviationPct}%`
        : "Not supplied",
    ],
    [
      "Horizontal deviation",
      finite(input.criteria.horizontalDeviation)
        ? `${input.criteria.horizontalDeviation} m`
        : "Not supplied",
    ],
    [
      "Elevation deviation",
      input.criteria.requireElevation
        ? finite(input.criteria.elevationDeviation)
          ? `${input.criteria.elevationDeviation} m (required)`
          : "Required; threshold not supplied"
        : finite(input.criteria.elevationDeviation)
          ? `${input.criteria.elevationDeviation} m (informational)`
          : "Not required",
    ],
    [
      "Warning ratio",
      `${input.criteria.warningRatio} (warning begins at approximately ${(input.criteria.warningRatio * 100).toFixed(0)}% of threshold)`,
    ],
    [
      "Width bearing",
      finite(input.widthBearing)
        ? `${input.widthBearing}° clockwise from North`
        : "Not supplied; width KPI may be unavailable",
    ],
  ].forEach(([name, threshold]) =>
    row([name, threshold, "See checks below"], [57, 55, contentWidth - 112])
  );
  result.checks.forEach((check: BermCheck) =>
    row(
      [
        check.name,
        check.criterion,
        `${check.status}: ${check.measured}\n${check.explanation}`,
      ],
      [57, 55, contentWidth - 112]
    )
  );

  heading("Geometry provenance and data completeness");
  row(
    ["FIELD", "PLANNED", "AS-BUILT"],
    [43, (contentWidth - 43) / 2, (contentWidth - 43) / 2],
    true
  );
  const plannedRows = sourceSummary("Planned", input.planned);
  const asBuiltRows = sourceSummary("As-Built", input.asBuilt);
  const rowCount = Math.max(plannedRows.length, asBuiltRows.length);
  for (let index = 0; index < rowCount; index += 1) {
    row(
      [
        plannedRows[index]?.[0] || asBuiltRows[index]?.[0] || "",
        plannedRows[index]?.[1] || "",
        asBuiltRows[index]?.[1] || "",
      ],
      [43, (contentWidth - 43) / 2, (contentWidth - 43) / 2]
    );
  }
  text(
    `CRS confirmation: ${input.criteria.crsConfirmed ? "Confirmed" : "Not confirmed"}. Survey complete: ${input.criteria.surveyComplete ? "Yes" : "No"}. Site approval recorded: ${input.criteria.siteApproved ? "Yes" : "No"}.`
  );

  heading("Data limitations, diagnostics and review notes");
  const diagnostics = Array.from(
    new Set([
      ...(input.planned.document?.diagnostics ?? []).map(
        note => `Planned DXF: ${note}`
      ),
      ...(input.asBuilt.document?.diagnostics ?? []).map(
        note => `As-Built DXF: ${note}`
      ),
      ...result.issues.map(issue => `Comparison: ${issue}`),
      ...result.methodNotes.map(note => `Method: ${note}`),
    ])
  );
  if (diagnostics.length) diagnostics.forEach(note => text(`• ${note}`));
  else text("No diagnostics were supplied by the parser or comparison engine.");
  if (input.metadata.comments.trim()) {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8.5);
    space(7);
    pdf.text("Reviewer comments", margin, y);
    y += 4;
    text(input.metadata.comments.trim());
  }

  const file = safeFilename(filename);
  const blob = pdf.output("blob");
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = file;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
