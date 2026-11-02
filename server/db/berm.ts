import { and, count, desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { bermComparisons } from "../../drizzle/schema";
import type {
  BermAnalysisInput,
  BermAnalysisResult,
  BermSavedSummary,
} from "../../shared/berm/types";
import { getDb } from "../db";

async function database() {
  const db = await getDb();
  if (!db)
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message:
        "Database unavailable. Save the comparison locally and retry when connected.",
    });
  return db;
}
const summaryColumns = {
  id: bermComparisons.id,
  bermId: bermComparisons.bermId,
  pit: bermComparisons.pit,
  bench: bermComparisons.bench,
  status: bermComparisons.status,
  surveyDateMs: bermComparisons.surveyDateMs,
  createdAtMs: bermComparisons.createdAtMs,
};
export async function listBermComparisons(
  userId: number
): Promise<BermSavedSummary[]> {
  const db = await database();
  return db
    .select(summaryColumns)
    .from(bermComparisons)
    .where(eq(bermComparisons.userId, userId))
    .orderBy(desc(bermComparisons.createdAtMs));
}
export async function getBermComparison(id: number, userId: number) {
  const db = await database();
  const rows = await db
    .select()
    .from(bermComparisons)
    .where(and(eq(bermComparisons.id, id), eq(bermComparisons.userId, userId)))
    .limit(1);
  return rows[0];
}
export async function insertBermComparison(
  userId: number,
  input: BermAnalysisInput,
  result: BermAnalysisResult
) {
  const db = await database();
  const [response] = await db.insert(bermComparisons).values({
    userId,
    bermId: input.metadata.bermId,
    pit: input.metadata.pit,
    bench: input.metadata.bench,
    status: result.status,
    surveyDateMs: input.metadata.surveyDateMs,
    input,
    result,
    createdAtMs: Date.now(),
  });
  return response.insertId;
}
export async function deleteBermComparison(id: number, userId: number) {
  const db = await database();
  await db
    .delete(bermComparisons)
    .where(and(eq(bermComparisons.id, id), eq(bermComparisons.userId, userId)));
}
export async function summarizeBermComparisons(userId: number) {
  const db = await database();
  const rows = await db
    .select({ status: bermComparisons.status, total: count() })
    .from(bermComparisons)
    .where(eq(bermComparisons.userId, userId))
    .groupBy(bermComparisons.status);
  return {
    total: rows.reduce((sum, row) => sum + row.total, 0),
    nonCompliant: rows.find(row => row.status === "Non-Compliant")?.total ?? 0,
    warning: rows.find(row => row.status === "Warning")?.total ?? 0,
    insufficientData:
      rows.find(row => row.status === "Insufficient Data")?.total ?? 0,
  };
}
