# Failure Records Reporting Reference Notes

## Source files

- Excel: `/home/ubuntu/upload/GeneralreportfailureFekola.xlsx`
- PDF: `/home/ubuntu/upload/FekolaFall_of_Ground_Incidents_Distribution.pdf`

## Excel workbook structure

The workbook contains yearly sheets for **2018, 2019, 2020, 2021, 2023, 2024, 2025, and 2026**.

Each row represents one failure / fall-of-ground incident with the same 10-column structure:

| Column | Meaning |
|---|---|
| Date | Incident date |
| Pit | Mine or pit name |
| Phase | Phase / pushback / area |
| Wall | Wall orientation or location |
| Bench | Bench or RL reference |
| Lithologie | Lithology/material |
| Failure Type | Failure mechanism or incident class |
| Action | Operational response / mitigation |
| Other Comment | Extra context or observation |
| Picture | Image reference or placeholder |

## Excel data characteristics to support

The import logic must tolerate real-world inconsistencies observed in the workbook:

- Some rows have **blank Bench** values.
- Some rows have **blank Failure Type**.
- Some rows have **blank Picture** cells.
- Some values contain spelling variation, e.g. **"Wedgs"**, **"Wedge"**, **"Blast Damage"**, **"Sliding"**, **"Planar"**.
- Some Wall / Phase entries are not simple cardinal directions, e.g. **"North Dump"**, **"North East"**, **"B1"**.
- Some lithology values vary in casing, e.g. **"Saprolite"** and **"saprolite"**.
- Imported records should preserve the raw text while still enabling normalized reporting filters.

## Workbook sample patterns

- Strong concentration of events at **Fekola East Wall**.
- Repeated incidents in **Phase 4, 6, 7, and 8**.
- Common lithologies include **CHP**, **Saprolite**, **Laterite**, **MBX**, **Swell Material**.
- Common incident descriptions include **Wedge / Wedgs**, **Blast Damage**, **Sliding**, and **Planar**.
- Actions often include **inform operation and management**, **clean while mining**, **restrict access**, or **dozer / fill with coarse rock**.

## PDF report structure to reproduce in-app

The supplied PDF is structured like an executive presentation report with a strong dashboard feel.

### Page 1 — Title page

- Title: **Fall of Ground Incidents: Trend Analysis & Risk Assessment**
- Subtitle: **Fekola Mine Operations | 2018–2026**
- Short scope bullets summarizing the incident analysis and wall/phase distribution focus.

### Page 2 — Key findings summary cards

Main KPI-card style layout with boxed metrics such as:

- **Total incidents**
- **Primary risk zone**
- **Most affected phase**
- **Peak activity year**
- **Dominant lithology**

### Page 3 — Phase distribution

- Main headline emphasizing the dominant phases.
- Bar chart: **Incident Distribution by Phase**.

### Page 4 — Wall distribution

- Main headline emphasizing East Wall dominance.
- Donut chart: **Incident Distribution by Wall**.
- Large highlight card for the dominant wall.
- Smaller cards for other walls with counts, share, and short interpretation.

### Page 5 — Timeline and trend

- Main headline describing the peak year and recent stabilization.
- Time-series chart: **Incident Timeline (2018–2026)**.
- Two interpretation cards, one for the peak period and one for the positive/recovery trend.

### Page 6 — Lithology distribution

- Main headline emphasizing the dominant material and secondary risk material.
- Donut chart: **Lithology Distribution**.
- Large explanatory cards for the dominant lithologies, including incident count, percentage share, affected phases/walls, and qualitative risk interpretation.
- The reference presentation highlights **CHP** as the dominant material, followed by **Saprolite** and **Laterite**.

## UI / analysis requirements implied by the references

The new Reporting workflow should support:

1. A top-level **Reporting** module in the sidebar, placed above **Slope Stability**.
2. A nested or tabbed organization that includes:
   - **Daily Inspections**
   - **Failure Records**
3. A **Failure Records** data screen for:
   - Excel import
   - Manual record entry
   - Filtering by date, pit, phase, wall, lithology, and failure type
   - Table review of imported incidents
4. A **Failure Report** / incident analysis screen that mirrors the PDF style with:
   - Summary KPI cards
   - Phase distribution chart
   - Wall distribution donut chart
   - Lithology distribution donut chart and material-risk cards
   - Incident timeline chart
   - Narrative insight boxes
   - Print / Save PDF action

## Implementation notes

- Keep all visible software labels in **English**.
- Remove **Radar Report** from primary navigation, but preserve a safe legacy route or redirect if needed.
- Daily Inspections should remain functionally intact, only moved under the new **Reporting** hub.
- The new failure-record workflow should be independent from Wall Risk Classification and Monitoring Projects.
