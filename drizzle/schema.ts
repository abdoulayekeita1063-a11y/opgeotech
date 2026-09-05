import { double, int, json, longtext, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Calculs de stabilité de pentes (Bishop & Fellenius)
 */
export const stabilityCalcs = mysqlTable("stability_calcs", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  zone: varchar("zone", { length: 255 }),
  // Paramètres géotechniques
  cohesion: double("cohesion").notNull(), // kPa
  frictionAngle: double("frictionAngle").notNull(), // degrés
  unitWeight: double("unitWeight").notNull(), // kN/m3
  slopeHeight: double("slopeHeight").notNull(), // m
  slopeAngle: double("slopeAngle").notNull(), // degrés
  waterCondition: mysqlEnum("waterCondition", ["dry", "partial", "saturated"]).default("dry").notNull(),
  // Résultats
  fsFellenius: double("fsFellenius").notNull(),
  fsBishop: double("fsBishop").notNull(),
  interpretation: text("interpretation"),
  details: json("details"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

/**
 * Classifications de massif rocheux (RMR, Q, GSI)
 */
export const rockClassifications = mysqlTable("rock_classifications", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  zone: varchar("zone", { length: 255 }),
  system: mysqlEnum("system", ["RMR", "Q", "GSI"]).notNull(),
  inputs: json("inputs").notNull(), // paramètres saisis
  score: double("score").notNull(), // valeur calculée
  rockClass: varchar("rockClass", { length: 64 }), // ex: "Classe II — Bon rocher"
  interpretation: text("interpretation"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

/**
 * Rapports d'inspection journaliers
 */
export const inspectionReports = mysqlTable("inspection_reports", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  inspectionDate: varchar("inspectionDate", { length: 32 }).notNull(),
  inspector: varchar("inspector", { length: 255 }),
  zones: text("zones").notNull(), // zones inspectées
  weather: varchar("weather", { length: 255 }).notNull(),
  observations: text("observations").notNull(),
  anomalies: text("anomalies"),
  actions: text("actions"), // actions recommandées saisies
  generatedReport: text("generatedReport"), // rapport structuré généré par IA (markdown)
  status: mysqlEnum("status", ["draft", "generated"]).default("draft").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

/**
 * Blast assessments avec analyse photo IA
 */
export const blastAssessments = mysqlTable("blast_assessments", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  blastDate: varchar("blastDate", { length: 32 }).notNull(),
  zone: varchar("zone", { length: 255 }).notNull(),
  beforePhotoUrl: text("beforePhotoUrl"),
  beforePhotoKey: text("beforePhotoKey"),
  afterPhotoUrl: text("afterPhotoUrl"),
  afterPhotoKey: text("afterPhotoKey"),
  notes: text("notes"),
  // Résultats de l'analyse IA
  qualityScore: double("qualityScore"), // 0-100
  fragmentationRating: varchar("fragmentationRating", { length: 64 }),
  overbreakDetected: varchar("overbreakDetected", { length: 64 }),
  analysisJson: json("analysisJson"), // détail structuré de l'analyse
  generatedReport: text("generatedReport"), // rapport structuré IA (markdown)
  status: mysqlEnum("status", ["draft", "analyzed"]).default("draft").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

/**
 * Vérifications de design compliance
 */
export const complianceChecks = mysqlTable("compliance_checks", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  zone: varchar("zone", { length: 255 }),
  // Design vs réel
  designBenchHeight: double("designBenchHeight").notNull(), // m
  actualBenchHeight: double("actualBenchHeight").notNull(),
  designBermWidth: double("designBermWidth").notNull(), // m
  actualBermWidth: double("actualBermWidth").notNull(),
  designBatterAngle: double("designBatterAngle").notNull(), // degrés
  actualBatterAngle: double("actualBatterAngle").notNull(),
  toleranceHeight: double("toleranceHeight").default(0.5).notNull(),
  toleranceBerm: double("toleranceBerm").default(1).notNull(),
  toleranceAngle: double("toleranceAngle").default(2).notNull(),
  // Résultats
  compliant: int("compliant").notNull(), // 0/1
  compliancePct: double("compliancePct").notNull(), // % de conformité
  details: json("details"),
  interpretation: text("interpretation"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type StabilityCalc = typeof stabilityCalcs.$inferSelect;
export type RockClassification = typeof rockClassifications.$inferSelect;
export type InspectionReport = typeof inspectionReports.$inferSelect;
export type BlastAssessment = typeof blastAssessments.$inferSelect;
export type ComplianceCheck = typeof complianceChecks.$inferSelect;

// ── OPGeotech expansion ────────────────────────────────────────────────

/** Imported DXF site plans used as base maps for drillhole planning. */
export const dxfPlans = mysqlTable("dxf_plans", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  fileKey: text("fileKey").notNull(),
  fileUrl: text("fileUrl").notNull(),
  /** Parsed geometry (polylines/lines/points/texts) as JSON for fast client rendering. */
  geometryJson: longtext("geometryJson"),
  entityCount: int("entityCount").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

/** Planned geotechnical drillholes. */
export const drillholes = mysqlTable("drillholes", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  planId: int("planId"),
  holeId: varchar("holeId", { length: 64 }).notNull(),
  collarX: double("collarX").notNull(),
  collarY: double("collarY").notNull(),
  collarZ: double("collarZ").default(0).notNull(),
  azimuth: double("azimuth").default(0).notNull(), // degrees from north
  dip: double("dip").default(-90).notNull(), // negative down
  depth: double("depth").notNull(), // m
  purpose: varchar("purpose", { length: 128 }),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

/** Structural mapping measurements (discontinuities). */
export const structures = mysqlTable("structures", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  structureId: varchar("structureId", { length: 64 }),
  zone: varchar("zone", { length: 128 }),
  structureType: varchar("structureType", { length: 64 }).default("joint").notNull(),
  dip: double("dip").notNull(), // 0-90 degrees
  dipDirection: double("dipDirection").notNull(), // 0-360 degrees
  alteration: varchar("alteration", { length: 128 }),
  infill: varchar("infill", { length: 128 }),
  roughness: varchar("roughness", { length: 128 }),
  jrc: double("jrc"), // joint roughness coefficient 0-20
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

/** Kinematic analysis runs with Barton-Bandis strength and block FS results. */
export const kinematicAnalyses = mysqlTable("kinematic_analyses", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  zone: varchar("zone", { length: 128 }),
  slopeDipDirection: double("slopeDipDirection").notNull(),
  slopeDip: double("slopeDip").notNull(),
  slopeHeight: double("slopeHeight").notNull(), // m
  unitWeight: double("unitWeight").notNull(), // kN/m3
  basicFrictionAngle: double("basicFrictionAngle").notNull(), // phi_b degrees
  jcs: double("jcs").notNull(), // joint wall compressive strength, MPa
  lateralLimit: double("lateralLimit").default(20).notNull(), // degrees
  inputJson: longtext("inputJson"),
  resultJson: longtext("resultJson"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type DxfPlan = typeof dxfPlans.$inferSelect;
export type Drillhole = typeof drillholes.$inferSelect;
export type Structure = typeof structures.$inferSelect;
export type KinematicAnalysis = typeof kinematicAnalyses.$inferSelect;


/** Standalone monitoring register for exposed open-pit walls and slopes. */
export const monitoringRecords = mysqlTable("monitoring_records", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  wallName: varchar("wallName", { length: 255 }).notNull(),
  zone: varchar("zone", { length: 128 }),
  status: mysqlEnum("status", ["Active", "Monitored", "Remediated", "Closed"]).default("Active").notNull(),
  riskLevel: mysqlEnum("riskLevel", ["Low", "Medium", "High", "Critical"]).default("Low").notNull(),
  rmr: double("rmr"),
  gsi: double("gsi"),
  qSystem: double("qSystem"),
  wallAssessmentScore: double("wallAssessmentScore"),
  blastAssessmentScore: double("blastAssessmentScore"),
  ucs: double("ucs"),
  cohesion: double("cohesion"),
  frictionAngle: double("frictionAngle"),
  density: double("density"),
  dominantStructures: text("dominantStructures"),
  currentFs: double("currentFs"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type MonitoringRecord = typeof monitoringRecords.$inferSelect;
export type InsertMonitoringRecord = typeof monitoringRecords.$inferInsert;


/** Radar time-series measurements attached to a standalone Monitoring wall record. */
export const monitoringRadarReadings = mysqlTable("monitoring_radar_readings", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  monitoringRecordId: int("monitoringRecordId").notNull(),
  radarPointId: varchar("radarPointId", { length: 128 }).notNull(),
  /** UTC Unix timestamp in milliseconds. */
  measuredAt: double("measuredAt").notNull(),
  displacementMm: double("displacementMm").notNull(),
  velocityMmPerDay: double("velocityMmPerDay"),
  accelerationMmPerDay2: double("accelerationMmPerDay2"),
  source: varchar("source", { length: 128 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type MonitoringRadarReading = typeof monitoringRadarReadings.$inferSelect;
export type InsertMonitoringRadarReading = typeof monitoringRadarReadings.$inferInsert;


/** Projects used to organize Monitoring workbooks and reports independently of wall risk records. */
export const monitoringProjects = mysqlTable("monitoring_projects", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  site: varchar("site", { length: 255 }),
  description: text("description"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type MonitoringProject = typeof monitoringProjects.$inferSelect;
export type InsertMonitoringProject = typeof monitoringProjects.$inferInsert;


/** Daily/window radar summary rows imported from Excel-style monitoring workbooks. */
export const radarMonitoringRows = mysqlTable("radar_monitoring_rows", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  monitoringRecordId: int("monitoringRecordId"),
  projectId: int("projectId"),
  measuredAt: double("measuredAt").notNull(),
  pit: varchar("pit", { length: 128 }).notNull(),
  window: varchar("window", { length: 128 }).notNull(),
  displacementMaxMm: double("displacementMaxMm"),
  displacementMinMm: double("displacementMinMm"),
  displacementAverageMm: double("displacementAverageMm"),
  velocityMaxMmPerDay: double("velocityMaxMmPerDay"),
  velocityMinMmPerDay: double("velocityMinMmPerDay"),
  velocityAverageMmPerDay: double("velocityAverageMmPerDay"),
  observations: text("observations"),
  source: varchar("source", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type RadarMonitoringRow = typeof radarMonitoringRows.$inferSelect;
export type InsertRadarMonitoringRow = typeof radarMonitoringRows.$inferInsert;

/** Fall-of-ground / slope failure incidents imported or entered through Reporting. */
export const failureRecords = mysqlTable("failure_records", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  /** UTC Unix timestamp in milliseconds. */
  incidentDate: double("incidentDate").notNull(),
  pit: varchar("pit", { length: 128 }).notNull(),
  phase: varchar("phase", { length: 128 }),
  wall: varchar("wall", { length: 128 }),
  bench: varchar("bench", { length: 128 }),
  lithology: varchar("lithology", { length: 255 }),
  failureType: varchar("failureType", { length: 255 }),
  actionTaken: text("actionTaken"),
  comments: text("comments"),
  pictureReference: text("pictureReference"),
  sourceSheet: varchar("sourceSheet", { length: 128 }),
  sourceFile: varchar("sourceFile", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type FailureRecord = typeof failureRecords.$inferSelect;
export type InsertFailureRecord = typeof failureRecords.$inferInsert;
