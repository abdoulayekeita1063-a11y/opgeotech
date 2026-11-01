import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { BarChart3, Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SectionLabel } from "@/components/ModuleHeader";
import { getRmrQuality } from "@/lib/loggingRmr";
import {
  calculateLoggingStatistics,
  loggingMetrics,
  type LoggingMetric,
  type LoggingStatisticsInput,
  type StratigraphyStatistics,
} from "@/lib/loggingStatistics";

const metricLabels: Record<
  LoggingMetric,
  { label: string; unit: string; decimals: number }
> = {
  ucs: { label: "UCS", unit: "MPa", decimals: 1 },
  rqd: { label: "RQD", unit: "%", decimals: 1 },
  spacing: { label: "Joint spacing", unit: "m", decimals: 3 },
  jrc: { label: "Joint roughness", unit: "JRC", decimals: 1 },
  water: { label: "Water", unit: "RMR points, 0–15", decimals: 1 },
};
const formatted = (value: number | null, decimals = 1) =>
  value === null ? "—" : value.toFixed(decimals);

export default function LoggingStatistics({
  rows,
  visibleRows,
  hasFilters,
  fileName,
}: {
  rows: readonly LoggingStatisticsInput[];
  visibleRows: readonly LoggingStatisticsInput[];
  hasFilters: boolean;
  fileName: string;
}) {
  const [useTableFilters, setUseTableFilters] = useState(false);
  const [showCoverage, setShowCoverage] = useState(false);
  const filtered = hasFilters && useTableFilters;
  const statistics = useMemo(
    () => calculateLoggingStatistics(filtered ? visibleRows : rows),
    [filtered, visibleRows, rows]
  );
  const summaryRows = [statistics.total, ...statistics.groups];
  const scope = filtered
    ? "Filtered Rock mass classification rows"
    : "All Rock mass classification rows in the current workbook";
  const coveragePercent = (row: StratigraphyStatistics, key: LoggingMetric) =>
    row.loggedLength
      ? (row.metrics[key].validLength / row.loggedLength) * 100
      : 0;

  const exportStatistics = () => {
    const header = [
      "Rock type / Stratigraphy",
      ...loggingMetrics.map(
        key =>
          `Average LW ${metricLabels[key].label} (${metricLabels[key].unit})`
      ),
      "RMR (from summary properties)",
    ];
    const matrix = [
      header,
      ...summaryRows.map(row => [
        row.stratigraphy,
        ...loggingMetrics.map(key => row.metrics[key].average),
        row.rmr,
      ]),
    ];
    const sheet = XLSX.utils.aoa_to_sheet(matrix);
    sheet["!cols"] = [
      { wch: 26 },
      ...loggingMetrics.map(() => ({ wch: 27 })),
      { wch: 32 },
    ];
    summaryRows.forEach((_, index) => {
      loggingMetrics.forEach((key, metricIndex) => {
        const cell =
          sheet[XLSX.utils.encode_cell({ r: index + 1, c: metricIndex + 1 })];
        if (cell?.t === "n")
          cell.z =
            key === "rqd" ? '0.0"%"' : key === "spacing" ? "0.000" : "0.0";
      });
      const rmrCell =
        sheet[
          XLSX.utils.encode_cell({ r: index + 1, c: loggingMetrics.length + 1 })
        ];
      if (rmrCell?.t === "n") rmrCell.z = "0.0";
    });
    const coverage = XLSX.utils.aoa_to_sheet([
      ["Scope", scope],
      [
        "Source",
        "Values displayed in Rock mass classification: UCS (MPa), RQD (%), Joint Spacing (m), JRC, roughness profile and water condition.",
      ],
      [
        "Method",
        "Average LW = SUM(table value × interval length) / SUM(interval lengths with a valid table value)",
      ],
      [
        "Interval length",
        "To − From (m), used only as an internal weight. Missing or invalid depths and non-positive lengths are excluded.",
      ],
      [
        "RQD",
        "RQD (%) = RQD (>100 mm) length (m) / Recovery length (m) × 100 for each interval, then length-weighted by To − From. Imported/stored percentages are not used. Zero recovery, negative/missing lengths or RQD > Recovery are excluded. Excel cells store 0–100 percentage points and show the % symbol without multiplying the value again.",
      ],
      ["UCS", "Uses the UCS (MPa) column. Negative values are excluded."],
      [
        "Joint spacing",
        "Uses the Joint Spacing (m) value displayed in Rock mass classification; no separate recalculation in Statistics.",
      ],
      [
        "Joint roughness",
        "Uses the JRC value displayed in Rock mass classification; no separate conversion in Statistics.",
      ],
      [
        "Water",
        "Average LW of the existing logging water ratings. Dry = 15; Wet = 0. Legacy numeric entries retain the same 10 / 7 / 4 / 0 rating mapping as Rock mass classification.",
      ],
      [
        "RMR",
        "Existing logging ratings of average UCS, average RQD (%) and average Joint spacing + average LW roughness rating + average LW water rating, clamped to 0–100 and rounded to 0.1. This is not an average of interval RMR values.",
      ],
      [
        "Roughness rating",
        "Each source roughness profile uses the same RMR score as Rock mass classification before length weighting. Averaged JRC is not reclassified. Numeric legacy roughness uses the existing logging scale.",
      ],
      [
        "RMR limitations",
        "Roughness-based estimate using available summary properties; no joint-orientation adjustment and no complete persistence, aperture, filling or weathering assessment. Per-property valid-data coverage may differ.",
      ],
      [
        "Missing data",
        "Excluded separately from each metric denominator, not replaced with zero. Valid zero values remain included.",
      ],
      [
        "Unspecified stratigraphy",
        "Valid rows with a blank stratigraphy appear under Unspecified.",
      ],
      [],
      [
        "Rock type / Stratigraphy",
        "Average LW roughness RMR score",
        "Roughness valid data coverage (%)",
      ],
      ...summaryRows.map(row => [
        row.stratigraphy,
        row.roughnessRating.average,
        row.loggedLength
          ? (row.roughnessRating.validLength / row.loggedLength) * 100
          : 0,
      ]),
      [],
      ["Rock type / Stratigraphy", "Metric", "Valid data coverage (%)"],
      ...summaryRows.flatMap(row =>
        loggingMetrics.map(key => [
          row.stratigraphy,
          metricLabels[key].label,
          coveragePercent(row, key),
        ])
      ),
    ]);
    coverage["!cols"] = [{ wch: 28 }, { wch: 100 }, { wch: 28 }];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Statistics");
    XLSX.utils.book_append_sheet(workbook, coverage, "Method and coverage");
    const safeName = (fileName || "OPGeotech").replace(/[^a-z0-9_-]+/gi, "_");
    XLSX.writeFile(workbook, `${safeName}_Stratigraphy_Statistics.xlsx`);
    toast.success("Stratigraphy statistics exported to Excel");
  };

  const renderRow = (row: StratigraphyStatistics, total = false) => (
    <tr
      key={total ? "total" : `group-${row.stratigraphy}`}
      className={
        total
          ? "border-b border-sky-200 bg-sky-50 font-bold"
          : "border-b border-slate-100 odd:bg-slate-50"
      }
    >
      <th scope="row" className="px-4 py-3 text-left font-semibold">
        {row.stratigraphy}
      </th>
      {loggingMetrics.map(key => (
        <td
          key={key}
          className="px-4 py-3 text-right font-mono tabular-nums"
          title={`${formatted(coveragePercent(row, key))}% valid data coverage`}
          data-metric={key}
        >
          {formatted(row.metrics[key].average, metricLabels[key].decimals)}
          {key === "rqd" && row.metrics[key].average !== null ? "%" : ""}
          {showCoverage && (
            <span className="mt-1 block text-[10px] font-normal text-slate-500">
              {formatted(coveragePercent(row, key))}% coverage
            </span>
          )}
        </td>
      ))}
      <td
        className="px-4 py-3 text-right font-mono tabular-nums"
        title={`RMR calculated from summary properties. Roughness RMR contribution: ${formatted(row.roughnessRating.average)}; water contribution: ${formatted(row.metrics.water.average)}. Same ratings as Rock mass classification; Dry=15 and Wet=0.`}
      >
        {row.rmr === null ? (
          "—"
        ) : (
          <span
            className={`inline-block border px-2 py-1 font-semibold ${getRmrQuality(String(row.rmr))?.cellClass ?? ""}`}
          >
            {formatted(row.rmr)}
          </span>
        )}
        {row.rmr !== null && (
          <span className="mt-1 block text-[10px] font-normal text-slate-600">
            {getRmrQuality(String(row.rmr))?.label}
          </span>
        )}
        {showCoverage && (
          <span className="mt-1 block text-[10px] font-normal text-slate-500">
            {formatted(
              Math.min(
                ...(["ucs", "rqd", "spacing", "water"] as LoggingMetric[]).map(
                  key => coveragePercent(row, key)
                ),
                row.loggedLength
                  ? (row.roughnessRating.validLength / row.loggedLength) * 100
                  : 0
              )
            )}
            % min. component coverage
          </span>
        )}
      </td>
    </tr>
  );

  return (
    <section
      id="logging-statistics"
      className="mt-8 scroll-mt-6 border border-foreground bg-background"
      aria-label="Logging statistics by stratigraphy"
    >
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-foreground p-5">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            <SectionLabel>Statistics</SectionLabel>
          </div>
          <h3 className="text-xl font-semibold tracking-tight">
            Stratigraphy summary
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Length-weighted averages using values from the Rock mass
            classification table.
          </p>
        </div>
        <Button
          variant="outline"
          className="rounded-none border-foreground"
          onClick={exportStatistics}
          disabled={!statistics.total.intervalCount}
        >
          <Download className="mr-2 h-4 w-4" />
          Export statistics Excel
        </Button>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 bg-muted/30 px-5 py-3 text-xs">
        <p>
          <strong>{statistics.groups.length}</strong> stratigraphies
        </p>
        <div className="flex flex-wrap items-center gap-4">
          {hasFilters && (
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={useTableFilters}
                onChange={event => setUseTableFilters(event.target.checked)}
                className="accent-primary"
              />
              Apply Hole ID / RMR table filters
            </label>
          )}
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={showCoverage}
              onChange={event => setShowCoverage(event.target.checked)}
              className="accent-primary"
            />
            Show data coverage
          </label>
        </div>
      </div>
      <p className="px-5 py-2 text-xs text-muted-foreground">
        {scope}.{" "}
        {filtered
          ? "Active table filters are included in these averages."
          : "Table filters do not change this summary unless explicitly applied."}
      </p>
      <div className="overflow-x-auto">
        <table
          className="w-full min-w-[900px] text-sm text-slate-900"
          aria-label="Length-weighted statistics table"
        >
          <thead className="border-y-2 border-sky-700 bg-slate-100">
            <tr>
              <th scope="col" className="px-4 py-4 text-left">
                Rock type
                <span className="block text-xs font-normal text-slate-600">
                  Stratigraphy
                </span>
              </th>
              {loggingMetrics.map(key => (
                <th key={key} scope="col" className="px-4 py-4 text-right">
                  Average LW
                  <span className="block">{metricLabels[key].label}</span>
                  <span className="block text-xs font-normal text-slate-600">
                    ({metricLabels[key].unit})
                  </span>
                </th>
              ))}
              <th scope="col" className="px-4 py-4 text-right">
                RMR
                <span className="block text-xs font-normal text-slate-600">
                  From summary<span className="block">(0–100)</span>
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {statistics.total.intervalCount ? (
              <>
                {renderRow(statistics.total, true)}
                {statistics.groups.map(row => renderRow(row))}
              </>
            ) : (
              <tr>
                <td
                  colSpan={7}
                  className="px-6 py-10 text-center text-muted-foreground"
                >
                  {filtered
                    ? "No valid rock mass rows match the selected filters."
                    : "Enter or import data into Rock mass classification with valid From and To depths to calculate statistics."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
