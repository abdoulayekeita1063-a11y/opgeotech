import { and, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  blastAssessments,
  complianceChecks,
  drillholes,
  drillholeLogs,
  dxfPlans,
  failureRecords,
  inspectionReports,
  InsertUser,
  kinematicAnalyses,
  monitoringRadarReadings,
  monitoringProjects,
  monitoringRecords,
  radarMonitoringRows,
  rockClassifications,
  stabilityCalcs,
  structures,
  users,
} from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// ---------- Feature queries ----------

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db;
}

// Slope stability
export async function insertStabilityCalc(values: typeof stabilityCalcs.$inferInsert) {
  const db = await requireDb();
  const [res] = await db.insert(stabilityCalcs).values(values);
  return res.insertId;
}
export async function listStabilityCalcs(userId: number) {
  const db = await requireDb();
  return db
    .select()
    .from(stabilityCalcs)
    .where(eq(stabilityCalcs.userId, userId))
    .orderBy(desc(stabilityCalcs.createdAt));
}
export async function getStabilityCalc(id: number) {
  const db = await requireDb();
  const rows = await db.select().from(stabilityCalcs).where(eq(stabilityCalcs.id, id)).limit(1);
  return rows[0];
}

// Rock classification
export async function insertRockClassification(values: typeof rockClassifications.$inferInsert) {
  const db = await requireDb();
  const [res] = await db.insert(rockClassifications).values(values);
  return res.insertId;
}
export async function listRockClassifications(userId: number) {
  const db = await requireDb();
  return db
    .select()
    .from(rockClassifications)
    .where(eq(rockClassifications.userId, userId))
    .orderBy(desc(rockClassifications.createdAt));
}
export async function getRockClassification(id: number) {
  const db = await requireDb();
  const rows = await db
    .select()
    .from(rockClassifications)
    .where(eq(rockClassifications.id, id))
    .limit(1);
  return rows[0];
}

// Inspection reports
export async function insertInspectionReport(values: typeof inspectionReports.$inferInsert) {
  const db = await requireDb();
  const [res] = await db.insert(inspectionReports).values(values);
  return res.insertId;
}
export async function updateInspectionReport(
  id: number,
  values: Partial<typeof inspectionReports.$inferInsert>,
) {
  const db = await requireDb();
  await db.update(inspectionReports).set(values).where(eq(inspectionReports.id, id));
}
export async function listInspectionReports(userId: number) {
  const db = await requireDb();
  return db
    .select()
    .from(inspectionReports)
    .where(eq(inspectionReports.userId, userId))
    .orderBy(desc(inspectionReports.createdAt));
}
export async function getInspectionReport(id: number) {
  const db = await requireDb();
  const rows = await db
    .select()
    .from(inspectionReports)
    .where(eq(inspectionReports.id, id))
    .limit(1);
  return rows[0];
}

// Blast assessments
export async function insertBlastAssessment(values: typeof blastAssessments.$inferInsert) {
  const db = await requireDb();
  const [res] = await db.insert(blastAssessments).values(values);
  return res.insertId;
}
export async function updateBlastAssessment(
  id: number,
  values: Partial<typeof blastAssessments.$inferInsert>,
) {
  const db = await requireDb();
  await db.update(blastAssessments).set(values).where(eq(blastAssessments.id, id));
}
export async function listBlastAssessments(userId: number) {
  const db = await requireDb();
  return db
    .select()
    .from(blastAssessments)
    .where(eq(blastAssessments.userId, userId))
    .orderBy(desc(blastAssessments.createdAt));
}
export async function getBlastAssessment(id: number) {
  const db = await requireDb();
  const rows = await db
    .select()
    .from(blastAssessments)
    .where(eq(blastAssessments.id, id))
    .limit(1);
  return rows[0];
}

// Compliance checks
export async function insertComplianceCheck(values: typeof complianceChecks.$inferInsert) {
  const db = await requireDb();
  const [res] = await db.insert(complianceChecks).values(values);
  return res.insertId;
}
export async function listComplianceChecks(userId: number) {
  const db = await requireDb();
  return db
    .select()
    .from(complianceChecks)
    .where(eq(complianceChecks.userId, userId))
    .orderBy(desc(complianceChecks.createdAt));
}
export async function getComplianceCheck(id: number) {
  const db = await requireDb();
  const rows = await db
    .select()
    .from(complianceChecks)
    .where(eq(complianceChecks.id, id))
    .limit(1);
  return rows[0];
}

// DXF plans
export async function insertDxfPlan(values: typeof dxfPlans.$inferInsert) {
  const db = await requireDb();
  const [res] = await db.insert(dxfPlans).values(values);
  return res.insertId;
}
export async function listDxfPlans(userId: number) {
  const db = await requireDb();
  return db
    .select({
      id: dxfPlans.id,
      userId: dxfPlans.userId,
      name: dxfPlans.name,
      fileUrl: dxfPlans.fileUrl,
      entityCount: dxfPlans.entityCount,
      createdAt: dxfPlans.createdAt,
    })
    .from(dxfPlans)
    .where(eq(dxfPlans.userId, userId))
    .orderBy(desc(dxfPlans.createdAt));
}
export async function getDxfPlan(id: number) {
  const db = await requireDb();
  const rows = await db.select().from(dxfPlans).where(eq(dxfPlans.id, id)).limit(1);
  return rows[0];
}
export async function deleteDxfPlan(id: number, userId: number) {
  const db = await requireDb();
  await db.delete(dxfPlans).where(and(eq(dxfPlans.id, id), eq(dxfPlans.userId, userId)));
}

// Drillholes
export async function insertDrillhole(values: typeof drillholes.$inferInsert) {
  const db = await requireDb();
  const [res] = await db.insert(drillholes).values(values);
  return res.insertId;
}
export async function listDrillholes(userId: number) {
  const db = await requireDb();
  return db
    .select()
    .from(drillholes)
    .where(eq(drillholes.userId, userId))
    .orderBy(desc(drillholes.createdAt));
}
export async function deleteDrillhole(id: number, userId: number) {
  const db = await requireDb();
  await db.delete(drillholes).where(and(eq(drillholes.id, id), eq(drillholes.userId, userId)));
}

// Drillhole logging workbooks
export async function replaceDrillholeLog(values: typeof drillholeLogs.$inferInsert) {
  const db = await requireDb();
  await db.delete(drillholeLogs).where(and(eq(drillholeLogs.userId, values.userId), eq(drillholeLogs.holeId, values.holeId)));
  const [res] = await db.insert(drillholeLogs).values(values);
  return res.insertId;
}
export async function listDrillholeLogs(userId: number) {
  const db = await requireDb();
  return db.select().from(drillholeLogs).where(eq(drillholeLogs.userId, userId)).orderBy(desc(drillholeLogs.updatedAt));
}
export async function deleteDrillholeLog(id: number, userId: number) {
  const db = await requireDb();
  await db.delete(drillholeLogs).where(and(eq(drillholeLogs.id, id), eq(drillholeLogs.userId, userId)));
}

// Structures
export async function insertStructure(values: typeof structures.$inferInsert) {
  const db = await requireDb();
  const [res] = await db.insert(structures).values(values);
  return res.insertId;
}
export async function insertStructuresBulk(values: (typeof structures.$inferInsert)[]) {
  const db = await requireDb();
  if (!values.length) return 0;
  await db.insert(structures).values(values);
  return values.length;
}
export async function replaceStructuresBulk(userId: number, values: (typeof structures.$inferInsert)[]) {
  const db = await requireDb();
  return db.transaction(async tx => {
    await tx.delete(structures).where(eq(structures.userId, userId));
    if (values.length) await tx.insert(structures).values(values);
    return values.length;
  });
}
export async function listStructures(userId: number) {
  const db = await requireDb();
  return db
    .select()
    .from(structures)
    .where(eq(structures.userId, userId))
    .orderBy(desc(structures.createdAt));
}
export async function deleteStructure(id: number, userId: number) {
  const db = await requireDb();
  await db.delete(structures).where(and(eq(structures.id, id), eq(structures.userId, userId)));
}

// Kinematic analyses
export async function insertKinematicAnalysis(values: typeof kinematicAnalyses.$inferInsert) {
  const db = await requireDb();
  const [res] = await db.insert(kinematicAnalyses).values(values);
  return res.insertId;
}
export async function listKinematicAnalyses(userId: number) {
  const db = await requireDb();
  return db
    .select()
    .from(kinematicAnalyses)
    .where(eq(kinematicAnalyses.userId, userId))
    .orderBy(desc(kinematicAnalyses.createdAt));
}
export async function getKinematicAnalysis(id: number) {
  const db = await requireDb();
  const rows = await db
    .select()
    .from(kinematicAnalyses)
    .where(eq(kinematicAnalyses.id, id))
    .limit(1);
  return rows[0];
}


// Standalone Monitoring module
export async function insertMonitoringRecord(values: typeof monitoringRecords.$inferInsert) {
  const db = await requireDb();
  const [res] = await db.insert(monitoringRecords).values(values);
  return res.insertId;
}

export async function listMonitoringRecords(userId: number) {
  const db = await requireDb();
  return db
    .select()
    .from(monitoringRecords)
    .where(eq(monitoringRecords.userId, userId))
    .orderBy(desc(monitoringRecords.createdAt));
}

export async function getMonitoringRecord(id: number) {
  const db = await requireDb();
  const rows = await db.select().from(monitoringRecords).where(eq(monitoringRecords.id, id)).limit(1);
  return rows[0];
}

export async function deleteMonitoringRecord(id: number, userId: number) {
  const db = await requireDb();
  await db.delete(monitoringRecords).where(and(eq(monitoringRecords.id, id), eq(monitoringRecords.userId, userId)));
}


// Radar measurements for the standalone Monitoring module
export async function insertMonitoringRadarReadings(values: (typeof monitoringRadarReadings.$inferInsert)[]) {
  const db = await requireDb();
  if (!values.length) return 0;
  await db.insert(monitoringRadarReadings).values(values);
  return values.length;
}

export async function listMonitoringRadarReadings(userId: number, monitoringRecordId: number) {
  const db = await requireDb();
  return db
    .select()
    .from(monitoringRadarReadings)
    .where(and(eq(monitoringRadarReadings.userId, userId), eq(monitoringRadarReadings.monitoringRecordId, monitoringRecordId)))
    .orderBy(monitoringRadarReadings.measuredAt);
}

export async function deleteMonitoringRadarReadings(userId: number, monitoringRecordId: number) {
  const db = await requireDb();
  await db.delete(monitoringRadarReadings).where(and(eq(monitoringRadarReadings.userId, userId), eq(monitoringRadarReadings.monitoringRecordId, monitoringRecordId)));
}

// Excel-style daily/window radar summary rows
export async function insertRadarMonitoringRows(values: (typeof radarMonitoringRows.$inferInsert)[]) {
  const db = await requireDb();
  if (!values.length) return 0;
  await db.insert(radarMonitoringRows).values(values);
  return values.length;
}

export async function replaceProjectRadarMonitoringRows(userId: number, projectId: number, values: (typeof radarMonitoringRows.$inferInsert)[]) {
  const db = await requireDb();
  return db.transaction(async tx => {
    await tx.delete(radarMonitoringRows).where(and(eq(radarMonitoringRows.userId, userId), eq(radarMonitoringRows.projectId, projectId)));
    if (values.length) await tx.insert(radarMonitoringRows).values(values);
    return values.length;
  });
}

export async function listRadarMonitoringRows(userId: number, monitoringRecordId: number) {
  const db = await requireDb();
  return db
    .select()
    .from(radarMonitoringRows)
    .where(and(eq(radarMonitoringRows.userId, userId), eq(radarMonitoringRows.monitoringRecordId, monitoringRecordId)))
    .orderBy(radarMonitoringRows.measuredAt);
}

export async function deleteRadarMonitoringRows(userId: number, monitoringRecordId: number) {
  const db = await requireDb();
  await db.delete(radarMonitoringRows).where(and(eq(radarMonitoringRows.userId, userId), eq(radarMonitoringRows.monitoringRecordId, monitoringRecordId)));
}

// Monitoring projects organize imported radar workbooks independently of wall-risk records.
export async function createMonitoringProject(values: typeof monitoringProjects.$inferInsert) {
  const db = await requireDb();
  const result = await db.insert(monitoringProjects).values(values);
  return Number(result[0].insertId);
}

export async function listMonitoringProjects(userId: number) {
  const db = await requireDb();
  return db.select().from(monitoringProjects).where(eq(monitoringProjects.userId, userId)).orderBy(monitoringProjects.createdAt);
}

export async function getMonitoringProject(id: number) {
  const db = await requireDb();
  const rows = await db.select().from(monitoringProjects).where(eq(monitoringProjects.id, id)).limit(1);
  return rows[0];
}

export async function listProjectRadarMonitoringRows(userId: number, projectId: number) {
  const db = await requireDb();
  return db
    .select()
    .from(radarMonitoringRows)
    .where(and(eq(radarMonitoringRows.userId, userId), eq(radarMonitoringRows.projectId, projectId)))
    .orderBy(radarMonitoringRows.measuredAt);
}

export async function deleteMonitoringProject(id: number, userId: number) {
  const db = await requireDb();
  await db.delete(radarMonitoringRows).where(and(eq(radarMonitoringRows.userId, userId), eq(radarMonitoringRows.projectId, id)));
  await db.delete(monitoringProjects).where(and(eq(monitoringProjects.id, id), eq(monitoringProjects.userId, userId)));
}

// Reporting: fall-of-ground / slope failure records
export async function insertFailureRecord(values: typeof failureRecords.$inferInsert) {
  const db = await requireDb();
  const result = await db.insert(failureRecords).values(values);
  return Number(result[0].insertId);
}

export async function insertFailureRecords(values: (typeof failureRecords.$inferInsert)[]) {
  const db = await requireDb();
  if (!values.length) return 0;
  await db.insert(failureRecords).values(values);
  return values.length;
}

export async function listFailureRecords(userId: number) {
  const db = await requireDb();
  return db
    .select()
    .from(failureRecords)
    .where(eq(failureRecords.userId, userId))
    .orderBy(desc(failureRecords.incidentDate));
}

export async function deleteFailureRecord(id: number, userId: number) {
  const db = await requireDb();
  await db.delete(failureRecords).where(and(eq(failureRecords.id, id), eq(failureRecords.userId, userId)));
}

export async function clearFailureRecords(userId: number) {
  const db = await requireDb();
  await db.delete(failureRecords).where(eq(failureRecords.userId, userId));
}

export async function replaceFailureRecords(userId: number, values: (typeof failureRecords.$inferInsert)[]) {
  const db = await requireDb();
  return db.transaction(async transaction => {
    await transaction.delete(failureRecords).where(eq(failureRecords.userId, userId));
    if (values.length) await transaction.insert(failureRecords).values(values);
    return values.length;
  });
}
