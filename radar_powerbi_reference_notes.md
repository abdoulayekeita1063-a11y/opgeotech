# Radar Monitoring Report Reference Notes

Source reviewed: `/home/ubuntu/upload/pasted_file_Z6H6jX_Radar_Monitoring_January_June_Analysis_Report.pdf`

## Overall visual structure

- The document uses a **cover page / presentation style** rather than a plain technical memo.
- Branding is strong: logo at top-left, bold title, large white space, black section bands, and accent colors in **red** and **gold**.
- The report reads like a **dashboard narrative** with a sequence of slides:
  1. Title / scope page
  2. Executive summary with large KPI figures and one chart
  3. Comprehensive metrics summary table
  4. Window analysis and comparative visuals
  5. Additional interpretation pages likely continue the same pattern

## Content hierarchy to reproduce in OPGeotech

### 1. Intro / scope block

- Large report title: "Radar Monitoring Analysis Report"
- Explicit monitoring period
- Explicit site / pit coverage

### 2. Executive summary page

- Left vertical KPI panel with large numbers:
  - Max displacement (mm)
  - Max velocity (mm/day)
  - Stability / NF percentage
- Right narrative block summarizing:
  - Overall site stability
  - Number of records
  - Number of pit locations
  - Main risk hotspot
- Embedded chart: observation distribution (NF vs fall of ground / event classes)

### 3. Comprehensive monitoring metrics summary

- Three-column summary:
  - Overall statistics
  - Displacement statistics
  - Velocity statistics
- Includes:
  - Total records
  - Monitoring period
  - Pit locations
  - Monitoring windows
  - Data completeness / stability rating
  - Max / min / average / standard deviation
  - Peak location
- Narrative comparison beneath the table for pit-specific interpretation

### 4. Window analysis

- Comparative chart across windows (radar/spider chart in the sample)
- Short commentary card for each window such as:
  - highest risk
  - moderate activity
  - stable
- Interpretation focuses on:
  - displacement magnitude
  - velocity level
  - consistency / fluctuation
  - monitoring priority

## Functional implications for the new Monitoring Report

- The in-app report should feel like a **Power BI-style dashboard**, not only a table.
- Core visual blocks should include:
  - KPI cards
  - trend charts over time
  - pit comparison chart
  - window comparison chart
  - observation distribution chart
  - summary matrix/table
  - narrative insight cards
- The existing inverse velocity output should be embedded as a dedicated analytical block, but the report should still begin with **business-style KPIs and executive summary**.
- Print / PDF export should preserve a presentation-like layout with strong sections and clear hierarchy.

## Data fields observed as central

- Date / monitoring period
- Pit
- Window
- Displacement metrics
- Velocity metrics
- Observations / stability labels
- Derived risk class
- Peak location / hotspot identification

## Design guidance for implementation

- Keep OPGeotech's Swiss/engineering design system, but borrow the PDF's **presentation hierarchy**:
  - bold headline
  - compact KPI strip
  - strong contrast summary block
  - analytical charts followed by concise written interpretation
- Use red as the alert / emphasis color.
- Prefer interactive dashboard cards and charts over long prose.

## Additional findings from pages 6–7

The reference includes a **Monthly Trend Analysis** page with grouped monthly bars for maximum displacement and average displacement. A right-side narrative summarizes each month and interprets seasonal behaviour. The OPGeotech dashboard should therefore aggregate imported rows by month and expose a monthly displacement/velocity trend chart with an automatically generated interpretation of the peak month, lowest-activity month and latest change.

The final page is an **Incident Analysis** view. It combines an observation-distribution pie chart, a short incident summary, identified risk factors and mitigation recommendations. The in-app report should reproduce this logic using the imported observation labels, the highest-velocity periods, the most exposed pit/window and the current configured velocity thresholds. Recommendations must remain operational prompts to review under the site Trigger Action Response Plan, not autonomous safety decisions.
