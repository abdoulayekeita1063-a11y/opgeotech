/** PostgreSQL/Supabase schema generated from the active MySQL schema. Do not edit manually. */
import {
  doublePrecision,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = pgTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  avatarUrl: text("avatarUrl"),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: text("role").$type<"user" | "admin">().default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Calculs de stabilité de pentes (Bishop & Fellenius)
 */
export const stabilityCalcs = pgTable("stability_calcs", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  userId: integer("userId").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  zone: varchar("zone", { length: 255 }),
  // Paramètres géotechniques
  cohesion: doublePrecision("cohesion").notNull(), // kPa
  frictionAngle: doublePrecision("frictionAngle").notNull(), // degrés
  unitWeight: doublePrecision("unitWeight").notNull(), // kN/m3
  slopeHeight: doublePrecision("slopeHeight").notNull(), // m
  slopeAngle: doublePrecision("slopeAngle").notNull(), // degrés
  waterCondition: text("waterCondition")
    .$type<"dry" | "partial" | "saturated">()
    .default("dry")
    .notNull(),
  // Résultats
  fsFellenius: doublePrecision("fsFellenius").notNull(),
  fsBishop: doublePrecision("fsBishop").notNull(),
  interpretation: text("interpretation"),
  details: jsonb("details"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

/**
 * Classifications de massif rocheux (RMR, Q, GSI, SMR)
 */
export const rockClassifications = pgTable("rock_classifications", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  userId: integer("userId").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  zone: varchar("zone", { length: 255 }),
  system: text("system").$type<"RMR" | "Q" | "GSI" | "SMR">().notNull(),
  inputs: jsonb("inputs").notNull(), // paramètres saisis
  score: doublePrecision("score").notNull(), // valeur calculée
  rockClass: varchar("rockClass", { length: 64 }), // ex: "Classe II — Bon rocher"
  interpretation: text("interpretation"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

/**
 * Rapports d'inspection journaliers
 */
export const inspectionReports = pgTable("inspection_reports", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  userId: integer("userId").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  inspectionDate: varchar("inspectionDate", { length: 32 }).notNull(),
  inspector: varchar("inspector", { length: 255 }),
  zones: text("zones").notNull(), // zones inspectées
  weather: varchar("weather", { length: 255 }).notNull(),
  observations: text("observations").notNull(),
  anomalies: text("anomalies"),
  actions: text("actions"), // actions recommandées saisies
  generatedReport: text("generatedReport"), // rapport structuré généré par IA (markdown)
  status: text("status")
    .$type<"draft" | "generated">()
    .default("draft")
    .notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

/**
 * Blast assessments avec analyse photo IA
 */
export const blastAssessments = pgTable("blast_assessments", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  userId: integer("userId").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  blastDate: varchar("blastDate", { length: 32 }).notNull(),
  zone: varchar("zone", { length: 255 }).notNull(),
  beforePhotoUrl: text("beforePhotoUrl"),
  beforePhotoKey: text("beforePhotoKey"),
  afterPhotoUrl: text("afterPhotoUrl"),
  afterPhotoKey: text("afterPhotoKey"),
  notes: text("notes"),
  // Résultats de l'analyse IA
  qualityScore: doublePrecision("qualityScore"), // 0-100
  fragmentationRating: varchar("fragmentationRating", { length: 64 }),
  overbreakDetected: varchar("overbreakDetected", { length: 64 }),
  analysisJson: jsonb("analysisJson"), // détail structuré de l'analyse
  generatedReport: text("generatedReport"), // rapport structuré IA (markdown)
  status: text("status")
    .$type<"draft" | "analyzed">()
    .default("draft")
    .notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

/**
 * Vérifications de design compliance
 */
export const complianceChecks = pgTable("compliance_checks", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  userId: integer("userId").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  zone: varchar("zone", { length: 255 }),
  // Design vs réel
  designBenchHeight: doublePrecision("designBenchHeight").notNull(), // m
  actualBenchHeight: doublePrecision("actualBenchHeight").notNull(),
  designBermWidth: doublePrecision("designBermWidth").notNull(), // m
  actualBermWidth: doublePrecision("actualBermWidth").notNull(),
  designBatterAngle: doublePrecision("designBatterAngle").notNull(), // degrés
  actualBatterAngle: doublePrecision("actualBatterAngle").notNull(),
  toleranceHeight: doublePrecision("toleranceHeight").default(0.5).notNull(),
  toleranceBerm: doublePrecision("toleranceBerm").default(1).notNull(),
  toleranceAngle: doublePrecision("toleranceAngle").default(2).notNull(),
  // Résultats
  compliant: integer("compliant").notNull(), // 0/1
  compliancePct: doublePrecision("compliancePct").notNull(), // % de conformité
  details: jsonb("details"),
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
export const dxfPlans = pgTable("dxf_plans", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  userId: integer("userId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  fileKey: text("fileKey").notNull(),
  fileUrl: text("fileUrl").notNull(),
  /** Parsed geometry (polylines/lines/points/texts) as JSON for fast client rendering. */
  geometryJson: text("geometryJson"),
  entityCount: integer("entityCount").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

/** Planned geotechnical drillholes. */
export const drillholes = pgTable("drillholes", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  userId: integer("userId").notNull(),
  planId: integer("planId"),
  holeId: varchar("holeId", { length: 64 }).notNull(),
  collarX: doublePrecision("collarX").notNull(),
  collarY: doublePrecision("collarY").notNull(),
  collarZ: doublePrecision("collarZ").default(0).notNull(),
  azimuth: doublePrecision("azimuth").default(0).notNull(), // degrees from north
  dip: doublePrecision("dip").default(-90).notNull(), // negative down
  depth: doublePrecision("depth").notNull(), // m
  purpose: varchar("purpose", { length: 128 }),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

/** Workbook-style geological and discontinuity logging data per drillhole. */
export const drillholeLogs = pgTable("drillhole_logs", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  userId: integer("userId").notNull(),
  holeId: varchar("holeId", { length: 64 }).notNull(),
  metadataJson: text("metadataJson"),
  rowsJson: text("rowsJson"),
  comments: text("comments"),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

/** Structural mapping measurements (discontinuities). */
export const structures = pgTable("structures", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  userId: integer("userId").notNull(),
  structureId: varchar("structureId", { length: 64 }),
  zone: varchar("zone", { length: 128 }),
  structureType: varchar("structureType", { length: 64 })
    .default("joint")
    .notNull(),
  dip: doublePrecision("dip").notNull(), // 0-90 degrees
  dipDirection: doublePrecision("dipDirection").notNull(), // 0-360 degrees
  easting: doublePrecision("easting"), // projected X coordinate
  northing: doublePrecision("northing"), // projected Y coordinate
  elevation: doublePrecision("elevation"), // RL / Z coordinate, metres
  persistence: doublePrecision("persistence"), // discontinuity persistence length (m)
  alteration: varchar("alteration", { length: 128 }),
  infill: varchar("infill", { length: 128 }),
  roughness: varchar("roughness", { length: 128 }),
  jrc: doublePrecision("jrc"), // joint roughness coefficient 0-20
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

/** Piezometer readings used to derive and export the piezometric line. */
export const piezometers = pgTable("piezometers", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  userId: integer("userId").notNull(),
  name: varchar("name", { length: 128 }).notNull(),
  easting: doublePrecision("easting").notNull(),
  northing: doublePrecision("northing").notNull(),
  elevation: doublePrecision("elevation").notNull(),
  depth: doublePrecision("depth").notNull(),
  waterLevel: doublePrecision("waterLevel").notNull(),
  piezometricElevation: doublePrecision("piezometricElevation").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

/** Kinematic analysis runs with Barton-Bandis strength and block FS results. */
export const kinematicAnalyses = pgTable("kinematic_analyses", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  userId: integer("userId").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  zone: varchar("zone", { length: 128 }),
  slopeDipDirection: doublePrecision("slopeDipDirection").notNull(),
  slopeDip: doublePrecision("slopeDip").notNull(),
  slopeHeight: doublePrecision("slopeHeight").notNull(), // m
  unitWeight: doublePrecision("unitWeight").notNull(), // kN/m3
  basicFrictionAngle: doublePrecision("basicFrictionAngle").notNull(), // phi_b degrees
  jcs: doublePrecision("jcs").notNull(), // joint wall compressive strength, MPa
  lateralLimit: doublePrecision("lateralLimit").default(20).notNull(), // degrees
  inputJson: text("inputJson"),
  resultJson: text("resultJson"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type DxfPlan = typeof dxfPlans.$inferSelect;
export type Drillhole = typeof drillholes.$inferSelect;
export type DrillholeLog = typeof drillholeLogs.$inferSelect;
export type Structure = typeof structures.$inferSelect;
export type Piezometer = typeof piezometers.$inferSelect;
export type KinematicAnalysis = typeof kinematicAnalyses.$inferSelect;

/** Standalone monitoring register for exposed open-pit walls and slopes. */
export const monitoringRecords = pgTable("monitoring_records", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  userId: integer("userId").notNull(),
  wallName: varchar("wallName", { length: 255 }).notNull(),
  zone: varchar("zone", { length: 128 }),
  pitPhase: varchar("pitPhase", { length: 128 }),
  area: varchar("area", { length: 128 }),
  operation: varchar("operation", { length: 128 }),
  inspectorName: varchar("inspectorName", { length: 255 }),
  startBench: varchar("startBench", { length: 64 }),
  endBench: varchar("endBench", { length: 64 }),
  inspectionDate: varchar("inspectionDate", { length: 32 }),
  status: text("status")
    .$type<"Active" | "Monitored" | "Remediated" | "Closed">()
    .default("Active")
    .notNull(),
  riskLevel: text("riskLevel")
    .$type<"Low" | "Moderate" | "High" | "Critical">()
    .default("Low")
    .notNull(),
  riskScore: doublePrecision("riskScore"),
  riskClass: varchar("riskClass", { length: 64 }),
  riskColour: varchar("riskColour", { length: 32 }),
  actionPriority: text("actionPriority"),
  categoryScoresJson: text("categoryScoresJson"),
  recommendations: text("recommendations"),
  inspectionDataJson: text("inspectionDataJson"),
  rmr: doublePrecision("rmr"),
  gsi: doublePrecision("gsi"),
  qSystem: doublePrecision("qSystem"),
  wallAssessmentScore: doublePrecision("wallAssessmentScore"),
  blastAssessmentScore: doublePrecision("blastAssessmentScore"),
  ucs: doublePrecision("ucs"),
  cohesion: doublePrecision("cohesion"),
  frictionAngle: doublePrecision("frictionAngle"),
  density: doublePrecision("density"),
  dominantStructures: text("dominantStructures"),
  currentFs: doublePrecision("currentFs"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type MonitoringRecord = typeof monitoringRecords.$inferSelect;
export type InsertMonitoringRecord = typeof monitoringRecords.$inferInsert;

/** Radar time-series measurements attached to a standalone Monitoring wall record. */
export const monitoringRadarReadings = pgTable("monitoring_radar_readings", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  userId: integer("userId").notNull(),
  monitoringRecordId: integer("monitoringRecordId").notNull(),
  radarPointId: varchar("radarPointId", { length: 128 }).notNull(),
  /** UTC Unix timestamp in milliseconds. */
  measuredAt: doublePrecision("measuredAt").notNull(),
  displacementMm: doublePrecision("displacementMm").notNull(),
  velocityMmPerDay: doublePrecision("velocityMmPerDay"),
  accelerationMmPerDay2: doublePrecision("accelerationMmPerDay2"),
  source: varchar("source", { length: 128 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type MonitoringRadarReading =
  typeof monitoringRadarReadings.$inferSelect;
export type InsertMonitoringRadarReading =
  typeof monitoringRadarReadings.$inferInsert;

/** Projects used to organize Monitoring workbooks and reports independently of wall risk records. */
export const monitoringProjects = pgTable("monitoring_projects", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  userId: integer("userId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  site: varchar("site", { length: 255 }),
  description: text("description"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type MonitoringProject = typeof monitoringProjects.$inferSelect;
export type InsertMonitoringProject = typeof monitoringProjects.$inferInsert;

/** Daily/window radar summary rows imported from Excel-style monitoring workbooks. */
export const radarMonitoringRows = pgTable("radar_monitoring_rows", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  userId: integer("userId").notNull(),
  monitoringRecordId: integer("monitoringRecordId"),
  projectId: integer("projectId"),
  measuredAt: doublePrecision("measuredAt").notNull(),
  pit: varchar("pit", { length: 128 }).notNull(),
  window: varchar("window", { length: 128 }).notNull(),
  displacementMaxMm: doublePrecision("displacementMaxMm"),
  displacementMinMm: doublePrecision("displacementMinMm"),
  displacementAverageMm: doublePrecision("displacementAverageMm"),
  velocityMaxMmPerDay: doublePrecision("velocityMaxMmPerDay"),
  velocityMinMmPerDay: doublePrecision("velocityMinMmPerDay"),
  velocityAverageMmPerDay: doublePrecision("velocityAverageMmPerDay"),
  observations: text("observations"),
  source: varchar("source", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type RadarMonitoringRow = typeof radarMonitoringRows.$inferSelect;
export type InsertRadarMonitoringRow = typeof radarMonitoringRows.$inferInsert;

/** Fall-of-ground / slope failure incidents imported or entered through Reporting. */
export const failureRecords = pgTable("failure_records", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  userId: integer("userId").notNull(),
  /** UTC Unix timestamp in milliseconds. */
  incidentDate: doublePrecision("incidentDate").notNull(),
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

/** Berm Monitoring: parsed survey geometry and reproducible compliance snapshots.
 * Raw DXF bytes are never stored in the database.
 */
export const bermComparisons = pgTable("berm_comparisons", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  userId: integer("userId").notNull(),
  bermId: varchar("bermId", { length: 128 }).notNull(),
  pit: varchar("pit", { length: 128 }).notNull(),
  bench: varchar("bench", { length: 128 }).notNull(),
  status: varchar("status", { length: 32 })
    .$type<import("../shared/berm/types").BermStatus>()
    .notNull(),
  surveyDateMs: doublePrecision("surveyDateMs"),
  input: jsonb("input")
    .$type<import("../shared/berm/types").BermAnalysisInput>()
    .notNull(),
  result: jsonb("result")
    .$type<import("../shared/berm/types").BermAnalysisResult>()
    .notNull(),
  createdAtMs: doublePrecision("createdAtMs").notNull(),
});

/** Shared collaboration primitives. Payloads remain generic so existing modules can adopt them incrementally. */
export const collaborationTeams = pgTable("collaboration_teams", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  createdBy: integer("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const collaborationTeamMembers = pgTable("collaboration_team_members", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  teamId: integer("teamId").notNull(),
  userId: integer("userId").notNull(),
  role: text("role")
    .$type<"admin" | "manager" | "engineer" | "reviewer" | "viewer">()
    .default("engineer")
    .notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const collaborationProjects = pgTable("collaboration_projects", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  teamId: integer("teamId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  createdBy: integer("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const collaborationWorkItems = pgTable("collaboration_work_items", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  teamId: integer("teamId").notNull(),
  projectId: integer("projectId").notNull(),
  module: varchar("module", { length: 64 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  status: text("status")
    .$type<
      | "draft"
      | "in_progress"
      | "completed"
      | "waiting_review"
      | "returned"
      | "reviewed"
      | "approved"
      | "archived"
    >()
    .default("draft")
    .notNull(),
  assignedTo: integer("assignedTo"),
  payload: jsonb("payload").notNull(),
  versionNumber: integer("versionNumber").default(1).notNull(),
  createdBy: integer("createdBy").notNull(),
  updatedBy: integer("updatedBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export const collaborationVersions = pgTable("collaboration_versions", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  workItemId: integer("workItemId").notNull(),
  versionNumber: integer("versionNumber").notNull(),
  userId: integer("userId").notNull(),
  payload: jsonb("payload").notNull(),
  changeSummary: text("changeSummary"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const collaborationAuditEvents = pgTable("collaboration_audit_events", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  teamId: integer("teamId").notNull(),
  projectId: integer("projectId"),
  workItemId: integer("workItemId"),
  userId: integer("userId").notNull(),
  action: varchar("action", { length: 64 }).notNull(),
  beforePayload: jsonb("beforePayload"),
  afterPayload: jsonb("afterPayload"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const collaborationSyncOperations = pgTable(
  "collaboration_sync_operations",
  {
    id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
    operationId: varchar("operationId", { length: 128 }).notNull().unique(),
    userId: integer("userId").notNull(),
    teamId: integer("teamId").notNull(),
    workItemId: integer("workItemId"),
    operationType: text("operationType").$type<"create" | "update">().notNull(),
    baseVersion: integer("baseVersion"),
    payload: jsonb("payload").notNull(),
    status: text("status")
      .$type<"pending" | "applied" | "conflict" | "rejected">()
      .default("pending")
      .notNull(),
    errorMessage: text("errorMessage"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    appliedAt: timestamp("appliedAt"),
  }
);

export const collaborationComments = pgTable("collaboration_comments", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  teamId: integer("teamId").notNull(),
  workItemId: integer("workItemId").notNull(),
  userId: integer("userId").notNull(),
  body: text("body").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const collaborationNotifications = pgTable(
  "collaboration_notifications",
  {
    id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
    teamId: integer("teamId").notNull(),
    userId: integer("userId").notNull(),
    workItemId: integer("workItemId"),
    type: varchar("type", { length: 64 }).notNull(),
    message: varchar("message", { length: 500 }).notNull(),
    readAt: timestamp("readAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  }
);

export const collaborationInvitations = pgTable("collaboration_invitations", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  teamId: integer("teamId").notNull(),
  invitedUserId: integer("invitedUserId").notNull(),
  invitedBy: integer("invitedBy").notNull(),
  role: text("role")
    .$type<"manager" | "engineer" | "reviewer" | "viewer">()
    .default("engineer")
    .notNull(),
  status: text("status")
    .$type<"pending" | "accepted" | "declined" | "cancelled">()
    .default("pending")
    .notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  respondedAt: timestamp("respondedAt"),
});
