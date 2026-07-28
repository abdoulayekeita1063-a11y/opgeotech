import { desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  blastAssessments,
  complianceChecks,
  inspectionReports,
  InsertUser,
  rockClassifications,
  stabilityCalcs,
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
