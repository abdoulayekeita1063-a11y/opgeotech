# Radar Reference Notes

## Excel reference: `RadarReport..xlsx`

The workbook contains one sheet (`Sheet1`) with a tabular daily monitoring structure.

### Column layout

| Column group | Fields |
|---|---|
| General | `Date`, `Pit`, `Window`, `Observations` |
| Displacement | `Max`, `min`, `average` |
| Velocity | `Max`, `min`, `average` |

### Interpreted row structure

| Field | Meaning |
|---|---|
| Date | Monitoring date |
| Pit | Pit name, e.g. `Fekola` |
| Window | Monitoring sector/window, e.g. `East`, `West`, `North` |
| Displacement max/min/average | Daily displacement statistics |
| Velocity max/min/average | Daily velocity statistics |
| Observations | Free-text observation, often `NF` |

### Product implications

The new **Monitoring** module should support an input/import structure organized by:

1. monitoring date,
2. pit,
3. wall/window,
4. displacement summary metrics,
5. velocity summary metrics,
6. observation/comment.

This is different from the current point-based raw radar import and should be supported as a structured monitoring record workflow.

## PDF reference: `Radar_Monitoring_January_June_Analysis_Report.pdf`

### Observed report structure

| Page/section | Key content |
|---|---|
| Cover | Title page with `RADAR MONITORING ANALYSIS REPORT`, monitoring period, locations |
| Executive Summary | Headline KPIs at left, narrative summary at right, observation distribution chart |
| Comprehensive Monitoring Metrics Summary | Overall statistics, displacement summary, velocity summary, comparison commentary |
| Window Analysis | Comparative chart by window plus narrative risk commentary by zone/window |

### Visual/reporting patterns to reproduce

| Pattern | Description |
|---|---|
| KPI cards | Large summary values for max displacement, max velocity, and stability/risk share |
| Narrative summary | Executive paragraph explaining the monitoring period and notable windows |
| Distribution chart | Count comparison of stable vs concern/failure observations |
| Metrics tables | Total records, period, pit count, window count, max/min/avg statistics |
| Window commentary | Ranked discussion of highest-risk and lower-risk windows |

### Product implications

The new **Radar Report** module should generate a professional structured report with:

1. report header (site, period, selected pit/window scope),
2. executive summary paragraph,
3. KPI summary cards,
4. displacement and velocity statistics,
5. window/pit comparisons,
6. risk classification commentary,
7. inverse-velocity failure-date estimate when applicable,
8. printable/exportable layout.

## Naming reorganization requested by user

| Old section | New target |
|---|---|
| Monitoring | `Wall Risk Classification` |
| Radar Failure Report / current radar workflow | Split into new `Monitoring` + new `Radar Report` |

## Functional direction

The user clarified that the radar workflow should focus on **displacement** and **velocity** rather than acceleration.
