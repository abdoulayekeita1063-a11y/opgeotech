# OPGeotech project storage

Supabase Storage bucket: `opgeotech-project-files` (private).

Each shared project uses a stable prefix:

```text
projects/<sanitized-project-name>-<project-id>/
├── 01_Project/
├── 02_Drillholes/DXF/
├── 02_Drillholes/CSV/
├── 02_Drillholes/Excel/
├── 03_Structural_Mapping/
├── 04_Rock_Mass_Classification/
├── 05_Kinematic_Analysis/
├── 06_Slope_Stability/
├── 07_Blast_Assessment/
├── 08_Wall_Assessment/
├── 09_Berm_Monitoring/
├── 10_Piezometers/
├── 11_Radar_Monitoring/
├── 12_Reports/
└── 13_Exports/
```

The server initializes the bucket and folder markers. New projects initialize their folders automatically; existing projects can use **Team Workspace → Project Data Room → Initialize folders**. Files are uploaded through protected tRPC procedures after team membership checks. Viewers can list/download files but cannot upload or initialize folders.

Required server secrets:

- `SUPABASE_URL`
- `SUPABASE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server-only; never expose as `VITE_*`)

The service role secret is used only by the server for private Storage operations. Downloads use short-lived signed URLs. Raw file bytes are not stored in MySQL/PostgreSQL.
