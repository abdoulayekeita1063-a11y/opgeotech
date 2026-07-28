import { double, int, json, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

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
 * Évaluations post-blast avec analyse photo IA
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
