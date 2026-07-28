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
- [ ] Checkpoint PWA
