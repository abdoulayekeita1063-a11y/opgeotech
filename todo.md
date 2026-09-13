# GeoTech AI — Project TODO

## Language Change (user request)
- [x] Entire application in ENGLISH (UI labels, module names, interpretations, AI reports) — supersedes earlier French requirement
- [x] Rewrite existing engine interpretations (stability, classification, compliance) in English

## Design & Theme
- [x] Thème International Typographic Style (fond blanc, accents rouges carrés, typo sans-serif noire, grille stricte, lignes fines noires)
- [x] Polices Google Fonts (Archivo + IBM Plex Mono)

## Base de données & Backend
- [x] Schéma DB : calculs de stabilité, classifications, rapports d'inspection, évaluations post-blast, vérifications design compliance (localisation par champ "zone" sur chaque enregistrement, pas de table projets séparée — simplicité assumée)
- [x] Moteur de calcul stabilité : méthode de Fellenius (ordinaire des tranches)
- [x] Moteur de calcul stabilité : méthode de Bishop simplifiée (itérative)
- [x] Calcul RMR (5 paramètres + ajustement orientation), avec classes I-V
- [x] Calcul Q-system (RQD/Jn × Jr/Ja × Jw/SRF) avec interprétation
- [x] Calcul GSI (structure × condition de surface) avec interprétation
- [x] Module design compliance : comparaison angles de pente, hauteurs de gradins, largeurs de bermes réels vs design, statut conforme/non conforme
- [x] Upload de photos avant/après blast vers S3
- [x] Routeurs tRPC pour tous les modules (protectedProcedure)

## IA
- [x] Analyse multimodale des photos avant/après blast : fragmentation, over-break/under-break, score de qualité quantifié (0-100)
- [x] Génération LLM de rapports d'inspection journaliers structurés et professionnels
- [x] Génération LLM de rapports post-blast structurés

## Frontend (all in English)
- [x] Dashboard central avec navigation vers les 5 modules + statistiques
- [x] Authentification (login/logout, routes protégées)
- [x] Page Slope Stability : formulaire (cohésion, angle de frottement, densité, géométrie) + résultats FS Bishop & Fellenius + interprétation + schéma SVG
- [x] Page Rock Classification : onglets RMR / Q-system / GSI, formulaires interactifs, calcul auto, interprétation
- [x] Page Daily Inspections : formulaire terrain (observations, anomalies, météo, zones) + génération rapport IA
- [x] Page Post-Blast Assessment : upload photos avant/après, analyse IA, score qualité, rapport
- [x] Page Design Compliance : formulaire paramètres design vs réels, verdict de conformité
- [x] Page Archive : liste centralisée de tous les enregistrements, consultation détail
- [x] Export PDF pour tous les types de rapports archivés

## Tests & Qualité
- [x] Tests vitest : calculs Fellenius/Bishop (cas de référence + benchmark numérique)
- [x] Tests vitest : RMR, Q-system, GSI
- [x] Tests vitest : design compliance
- [x] Vérification visuelle par captures d'écran (7 pages)
- [x] Smoke tests IA : génération rapport inspection + analyse photos blast (LLM réel)
- [x] Checkpoint final (version e62103ad)

## PWA — Installable Software (user request)
- [x] Web app manifest (name, icons, standalone display, theme colors)
- [x] App icons (192/512 px, maskable) in Swiss style
- [x] Service worker (cache app shell, offline fallback for static assets)
- [x] Service worker registration in the client
- [x] Verify installability and re-test pages (manifest/sw/icons all 200, 16 tests pass)
- [x] Checkpoint PWA (version 6623373b, auto-published)

## OPGeotech Expansion (user request)
- [x] Rename app to OPGeotech everywhere (UI, title, manifest, icons, sidebar, login page)
- [x] Drillhole module: DXF file import and 2D plan visualization
- [x] Drillhole module: geotechnical hole planning (ID, collar X/Y/Z, azimuth, dip, depth) overlaid on DXF plan, saved to DB
- [x] Structural Mapping module: manual entry of structures (dip, dip direction, type, alteration, infill, roughness/JRC)
- [x] Structural Mapping module: CSV import of structural data
- [x] Structural Mapping module: stereonet visualization (pole plot)
- [x] Kinematic Analysis module: planar, wedge, toppling failure screening from slope orientation + structures
- [x] Kinematic Analysis module: Barton-Bandis shear strength (JRC, JCS, phi_b) → instantaneous cohesion and friction angle
- [x] Kinematic Analysis module: block weight from slope geometry and factor of safety for planar and wedge blocks
- [x] Update dashboard with new modules, re-test all, checkpoint (version fce6ad82; repo-wide rename verified, 27 tests pass, 4 pages screenshot-verified)

## Desktop App + New Logo (user request)
- [x] Design new open-pit logo (concentric benches) in Swiss red/black style
- [x] Apply new logo everywhere: PWA icons (192/512/maskable), favicon, sidebar, login page, VITE_APP_LOGO
- [x] Build Electron desktop app (Windows installer .exe) that loads the published site
- [x] Host the installer for download and add a Download page/link in the app
- [x] Test everything, checkpoint (auto-published)

## DXF Real Coordinates + Blast Assessment Expansion (user request)
- [x] DXF import preserves real-world coordinates (no normalization to 0,0) in Drillhole Planning
- [x] Rename "Post-Blast Assessment" → "Blast Assessment" everywhere (sidebar, routes, DB, dashboard, archive)
- [x] Blast Assessment: blast design evaluation — wall control methods compliance (pre-split, trim, buffer, standoff)
- [x] Blast Assessment: Blastability Index (Lilly 1986) calculation from rock mass parameters + structure orientation
- [x] Blast Assessment: Powder Factor recommendation based on BI and wall proximity for good fragmentation + minimal wall damage
- [x] Blast Assessment: Wall damage assessment (overbreak, backbreak, crest loss evaluation)
- [x] Update UI: new Blast Assessment tabs/sections for design eval, BI, PF suggestion, wall damage
- [x] Test and checkpoint (32 tests pass, screenshots verified)

## Separate Monitoring Module (user request)
- [x] Create a standalone Monitoring section, separate from Database, for exposed wall/talus surveillance
- [x] Add monitoring records, status indicators and history for each wall/talus
- [x] Test and checkpoint the standalone Monitoring module

## Radar Monitoring and Failure-Risk Analysis (user request)
- [x] Add radar measurement import and storage for wall monitoring
- [x] Calculate displacement trend, velocity and acceleration from radar time series
- [x] Provide a transparent alert classification and failure-risk indication with engineering disclaimer
- [x] Add radar charts, measurement table and selected-wall analysis to the standalone Monitoring page
- [x] Test radar calculations/import and save a checkpoint

## Monitoring Verification Follow-up
- [x] Add a radar measurement table with timestamp, displacement, velocity, acceleration and source
- [x] Exercise radar CSV import end-to-end and verify readings populate the table and analysis (CSV parser + authenticated tRPC contract test)
- [x] Save a new checkpoint after Monitoring and radar verification

## Radar Velocity-Based Failure Prediction (user request)
- [x] Open the updated OPGeotech Monitoring module and verify the authentication gate; authenticated browser actions require the user's session
- [x] Add a transparent velocity/acceleration trend prediction model with configurable thresholds
- [x] Display prediction status, trend metrics, confidence/limitations and recommended action in English
- [x] Test the radar import and prediction flow and save a new checkpoint (38 tests pass; browser import requires authenticated user session)

## Monitoring Visibility Fix
- [x] Add Monitoring to the Dashboard module cards and verify the direct /monitoring route is discoverable

## Radar Prediction Final Verification
- [x] Add user-facing velocity and acceleration threshold controls to Monitoring
- [x] Re-run authenticated browser import/prediction verification when the user session is available (route and authentication gate verified; interactive import requires the user's authenticated session)
- [x] Save a fresh checkpoint after threshold controls and final verification (version def70239)

## Monitoring and Radar Report Reorganization (user request)
- [x] Remove Q-system and Factor of Safety fields from the Monitoring UI and active form payload
- [x] Create a separate Radar Failure Report section with radar trend, risk level and inverse-velocity failure-date estimate
- [x] Add report export/print action and explicit engineering limitations in English
- [x] Test the new report flow and save a checkpoint (39 automated tests pass; UI routes screenshot-verified)

## Displacement and Velocity Only (user request)
- [x] Remove acceleration from active Monitoring and Radar Failure Report inputs, tables and labels
- [x] Make radar risk classification depend only on velocity thresholds
- [x] Keep Inverse Velocity failure-date prediction based only on displacement-derived or supplied velocity
- [x] Update tests, verify the UI and save a fresh checkpoint

## Radar Workflow Reorganization (user request)
- [x] Rename the existing Monitoring section to Wall Risk Classification across navigation, dashboard and routes
- [x] Create a new Monitoring section based on the supplied RadarReport Excel structure
- [x] Create a separate Radar Report section based on the supplied PDF report structure
- [x] Support Excel radar data entry/import, analysis, risk classification, inverse-velocity estimate and exportable report output
- [x] Test the new workflow and save a checkpoint (workbook import validated against 1,147 populated rows; typecheck and 39 tests pass)

## Interactive Inverse Velocity Chart (user request)
- [x] Add an interactive Inverse Velocity chart to Radar Report using imported Excel radar rows
- [x] Show velocity, inverse velocity, displacement and date tooltips with window filtering
- [x] Overlay the fitted inverse-velocity trend and forecast marker when available
- [x] Test the chart visually and save a checkpoint

## Monitoring Power BI-Style Report (user request)
- [x] Analyze the supplied radar monitoring PDF and reproduce its report hierarchy and visual emphasis
- [x] Add a Report section inside Monitoring with date, pit and window filters
- [x] Add interactive KPI cards and charts for displacement, velocity, observations and risk
- [x] Add pit/window comparisons, trend interpretation and Inverse Velocity forecast summary
- [x] Add print/PDF export and a Power BI-style presentation mode
- [x] Validate the report with the supplied radar workbook, run tests and publish a checkpoint (1,147 populated rows validated; 41 tests pass; version aabd984d)

## Monitoring Project Management (user request)
- [x] Add a dedicated Project data model independent of Wall Risk Classification
- [x] Associate imported radar summaries and Monitoring Reports with a selected project
- [x] Replace Wall / Slope Register with Project in the Monitoring UI
- [x] Add an Add Project dialog with project name, site and description
- [x] Test project creation, project-scoped radar data and report rendering; publish a checkpoint (43 tests pass; UI screenshot-verified; version 0d7b3f34)
- [x] Update standalone Radar Report to use the selected Monitoring Project instead of Wall Risk Classification records

## Independent Monitoring Risk Classification (user request)
- [x] Classify Monitoring risk as Low / Moderate / High / Critical using only project velocity thresholds
- [x] Keep Monitoring risk independent from Wall Risk Classification records and labels
- [x] Show threshold basis and independent risk status in Monitoring Report and standalone Radar Report
- [x] Test risk classification boundaries and publish a checkpoint (Low/Moderate/High/Critical boundaries pass; version 0d7b3f34)

## Monitoring Maximum-Velocity Risk Fix (user report)
- [x] Calculate Current Risk from the maximum absolute velocity in the active filtered dataset
- [x] Apply threshold precedence Critical → High → Moderate → Low without ambiguity
- [x] Add regression coverage for max velocity 6.230 with thresholds 1.000 / 1.001 / 5.601
- [x] Verify the Monitoring Report display and publish a corrective checkpoint (47 tests pass; UI screenshot-verified; version be17bf1e)

## User-Defined Monitoring Thresholds (user request)
- [x] Keep Moderate, High and Critical velocity thresholds freely editable in Monitoring Report
- [x] Validate Moderate < High < Critical and show an immediate English validation message
- [x] Disable risk output when the custom threshold order is invalid
- [x] Apply the same custom-threshold behavior to standalone Radar Report
- [x] Test custom values and publish a checkpoint (47 tests pass; version be17bf1e)

## Monitoring Report Typography Readability (user request)
- [x] Increase filter, label and helper text sizes in the embedded Monitoring Report
- [x] Increase KPI, summary, table and chart text sizes while preserving responsive layout
- [x] Preserve readable print/PDF typography with scoped print rules
- [x] Run typecheck/tests, visually verify and publish a checkpoint (47 tests pass; version 2c6432d1)

## Comprehensive Metrics Table Typography (user request)
- [x] Increase the black header title size in Comprehensive Monitoring Metrics Summary
- [x] Increase section headings, row labels and numeric values in all three summary columns
- [x] Increase row spacing while preserving responsive and print/PDF layout
- [x] Run typecheck/tests, visually verify and publish a checkpoint (47 tests pass; version 124da632)
- [x] Verify the enlarged metrics table in an authenticated, populated Monitoring Report (confirmed from user-provided populated screenshot)
- [x] Verify Print / Save PDF readability for the populated metrics table (populated user screenshot reviewed; scoped print typography and navigation-hiding rules verified)

## Monitoring KPI Label Visibility (user request)
- [x] Increase KPI label size and weight for Max Displacement, Max Velocity, Stability Rating and Current Risk
- [x] Increase label contrast on black and risk-colored KPI cards
- [x] Preserve KPI values, calculations, responsive layout and print output
- [x] Run typecheck/tests, visually verify and publish a checkpoint (47 tests pass; version 7bc269a6)

## Reporting Hub and Failure Records (user request)
- [x] Analyze GeneralreportfailureFekola.xlsx and Fekola Fall of Ground Incidents Distribution.pdf
- [x] Add a top-level Reporting module above Slope Stability
- [x] Move Daily Inspections into Reporting while preserving the existing inspection workflow
- [x] Add Failure Records entry and Excel import matching the supplied workbook
- [x] Add an interactive Fall of Ground report matching the supplied PDF hierarchy and visuals
- [x] Add report print/PDF export and filters for date, location and failure attributes
- [x] Remove Radar Report from navigation/dashboard and preserve an appropriate legacy route
- [x] Test with the supplied files, visually verify and publish a checkpoint (41 workbook rows validated; 49 tests pass; UI screenshot-verified; version 48a434b1)

## Failure Records Import Replacement (user request)
- [x] Make every Failure Records Excel import delete the previous user's failure dataset first
- [x] Remove the optional replacement checkbox and explain that import replaces the register
- [x] Add regression coverage proving consecutive imports do not mix datasets
- [x] Run tests, visually verify and publish a checkpoint (covered by the current release; replacement notice screenshot-verified)

## Kinematics tRPC HTML Response Error (user report)
- [x] Reproduce the /kinematics API query returning HTML instead of JSON
- [x] Identify and fix the retryable 502 SESSION_DNS_FAILED proxy response with a resilient tRPC fetch wrapper
- [x] Add regression coverage for retryable HTML 502 responses and readable failure handling
- [x] Run tests, visually verify and publish a checkpoint (56 tests pass; authenticated protected-procedure contract verified; layout screenshot-verified; covered by the current release)

## Kinematics Feasible-Only Tables (user request)
- [x] Show only Feasible = YES rows in Planar, Wedge and Toppling result tables
- [x] Keep all analyzed cases in percentage denominators and summary counts
- [x] Show an explicit no-feasible-cases row when a filtered table has no results
- [x] Add regression coverage, visually verify and publish a checkpoint (56 tests pass; layout screenshot-verified; covered by the current release)

## Source Code Export (user request)
- [x] Prepare a clean source tree without dependencies, logs, secrets or build artifacts
- [x] Include setup/export documentation and database migrations
- [x] Create and verify a downloadable ZIP archive (198 source files; forbidden entries absent; archive verified)

## SMR in Rock Classification (user request)
- [x] Define the SMR calculation inputs, correction factors and class interpretation
- [x] Add SMR calculation to the Rock Classification backend/schema flow
- [x] Add English SMR fields, result card and classification display in Rock Classification
- [x] Add regression tests, visually verify the page and publish a checkpoint (58 tests pass; migration applied; page screenshot-verified)
