import { z } from "zod";
import * as db from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { storagePut } from "../storage";
import { computeStability } from "../geotech/stability";
import { computeCompliance } from "../geotech/compliance";
import { computeGSI, computeQ, computeRMR } from "../geotech/classification";
import {
  analyzeBlastPhotos,
  generateBlastReport,
  generateInspectionReport,
} from "../geotech/ai";
import {
  computeBlastabilityIndex,
  evaluateWallControl,
} from "../geotech/blastability";
import { TRPCError } from "@trpc/server";

function assertOwner(row: { userId: number } | undefined, userId: number) {
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Record not found" });
  if (row.userId !== userId)
    throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
}

export const stabilityRouter = router({
  compute: protectedProcedure
    .input(
      z.object({
        title: z.string().min(1).max(255),
        zone: z.string().max(255).optional(),
        cohesion: z.number().min(0).max(1000),
        frictionAngle: z.number().min(0).max(60),
        unitWeight: z.number().min(10).max(35),
        slopeHeight: z.number().min(1).max(1000),
        slopeAngle: z.number().min(10).max(85),
        waterCondition: z.enum(["dry", "partial", "saturated"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const result = computeStability(input);
      const id = await db.insertStabilityCalc({
        userId: ctx.user.id,
        title: input.title,
        zone: input.zone,
        cohesion: input.cohesion,
        frictionAngle: input.frictionAngle,
        unitWeight: input.unitWeight,
        slopeHeight: input.slopeHeight,
        slopeAngle: input.slopeAngle,
        waterCondition: input.waterCondition,
        fsFellenius: result.fsFellenius,
        fsBishop: result.fsBishop,
        interpretation: result.interpretation,
        details: {
          criticalCircle: result.criticalCircle,
          ru: result.ru,
          slices: result.slices,
          status: result.status,
        },
      });
      return { id, ...result };
    }),
  list: protectedProcedure.query(({ ctx }) => db.listStabilityCalcs(ctx.user.id)),
  get: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ ctx, input }) => {
    const row = await db.getStabilityCalc(input.id);
    assertOwner(row, ctx.user.id);
    return row;
  }),
});

export const classificationRouter = router({
  computeRMR: protectedProcedure
    .input(
      z.object({
        title: z.string().min(1).max(255),
        zone: z.string().max(255).optional(),
        ucs: z.number().min(0).max(500),
        rqd: z.number().min(0).max(100),
        spacing: z.number().min(0).max(10),
        conditionRating: z.number().min(0).max(30),
        groundwaterRating: z.number().min(0).max(15),
        orientationAdjustment: z.number().min(-60).max(0),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { title, zone, ...params } = input;
      const result = computeRMR(params);
      const id = await db.insertRockClassification({
        userId: ctx.user.id,
        title,
        zone,
        system: "RMR",
        inputs: params,
        score: result.score,
        rockClass: result.rockClass,
        interpretation: result.interpretation,
      });
      return { id, ...result };
    }),
  computeQ: protectedProcedure
    .input(
      z.object({
        title: z.string().min(1).max(255),
        zone: z.string().max(255).optional(),
        rqd: z.number().min(0).max(100),
        jn: z.number().min(0.5).max(20),
        jr: z.number().min(0.5).max(4),
        ja: z.number().min(0.75).max(20),
        jw: z.number().min(0.05).max(1),
        srf: z.number().min(0.5).max(400),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { title, zone, ...params } = input;
      const result = computeQ(params);
      const id = await db.insertRockClassification({
        userId: ctx.user.id,
        title,
        zone,
        system: "Q",
        inputs: params,
        score: result.score,
        rockClass: result.rockClass,
        interpretation: result.interpretation,
      });
      return { id, ...result };
    }),
  computeGSI: protectedProcedure
    .input(
      z.object({
        title: z.string().min(1).max(255),
        zone: z.string().max(255).optional(),
        structureRating: z.number().min(0).max(100),
        surfaceRating: z.number().min(0).max(100),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { title, zone, ...params } = input;
      const result = computeGSI(params);
      const id = await db.insertRockClassification({
        userId: ctx.user.id,
        title,
        zone,
        system: "GSI",
        inputs: params,
        score: result.score,
        rockClass: result.rockClass,
        interpretation: result.interpretation,
      });
      return { id, ...result };
    }),
  list: protectedProcedure.query(({ ctx }) => db.listRockClassifications(ctx.user.id)),
  get: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ ctx, input }) => {
    const row = await db.getRockClassification(input.id);
    assertOwner(row, ctx.user.id);
    return row;
  }),
});

export const inspectionRouter = router({
  create: protectedProcedure
    .input(
      z.object({
        title: z.string().min(1).max(255),
        inspectionDate: z.string().min(1).max(32),
        inspector: z.string().max(255).optional(),
        zones: z.string().min(1),
        weather: z.string().min(1).max(255),
        observations: z.string().min(1),
        anomalies: z.string().optional(),
        actions: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Generate the structured report with the LLM
      const generatedReport = await generateInspectionReport(input);
      const id = await db.insertInspectionReport({
        userId: ctx.user.id,
        ...input,
        generatedReport,
        status: "generated",
      });
      return { id, generatedReport };
    }),
  list: protectedProcedure.query(({ ctx }) => db.listInspectionReports(ctx.user.id)),
  get: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ ctx, input }) => {
    const row = await db.getInspectionReport(input.id);
    assertOwner(row, ctx.user.id);
    return row;
  }),
});

export const blastRouter = router({
  uploadPhoto: protectedProcedure
    .input(
      z.object({
        fileName: z.string().min(1),
        mimeType: z.string().min(1),
        base64: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!input.mimeType.startsWith("image/")) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Only image files are allowed" });
      }
      const buffer = Buffer.from(input.base64, "base64");
      if (buffer.length > 15 * 1024 * 1024) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Image exceeds 15 MB limit" });
      }
      const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
      const key = `blast-photos/${ctx.user.id}/${Date.now()}-${safeName}`;
      const { key: fileKey, url } = await storagePut(key, buffer, input.mimeType);
      return { key: fileKey, url };
    }),
  analyze: protectedProcedure
    .input(
      z.object({
        title: z.string().min(1).max(255),
        blastDate: z.string().min(1).max(32),
        zone: z.string().min(1).max(255),
        beforePhotoUrl: z.string().min(1),
        beforePhotoKey: z.string().min(1),
        afterPhotoUrl: z.string().min(1),
        afterPhotoKey: z.string().min(1),
        notes: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Resolve relative storage URLs to absolute for the LLM
      const origin = `${ctx.req.protocol}://${ctx.req.headers.host}`;
      const abs = (u: string) => (u.startsWith("http") ? u : `${origin}${u}`);

      const analysis = await analyzeBlastPhotos({
        beforePhotoUrl: abs(input.beforePhotoUrl),
        afterPhotoUrl: abs(input.afterPhotoUrl),
        zone: input.zone,
        blastDate: input.blastDate,
        notes: input.notes,
      });
      const generatedReport = await generateBlastReport({
        title: input.title,
        zone: input.zone,
        blastDate: input.blastDate,
        notes: input.notes,
        analysis,
      });
      const id = await db.insertBlastAssessment({
        userId: ctx.user.id,
        title: input.title,
        blastDate: input.blastDate,
        zone: input.zone,
        beforePhotoUrl: input.beforePhotoUrl,
        beforePhotoKey: input.beforePhotoKey,
        afterPhotoUrl: input.afterPhotoUrl,
        afterPhotoKey: input.afterPhotoKey,
        notes: input.notes,
        qualityScore: analysis.qualityScore,
        fragmentationRating: analysis.fragmentationRating,
        overbreakDetected: analysis.overbreakDetected,
        analysisJson: analysis,
        generatedReport,
        status: "analyzed",
      });
      return { id, analysis, generatedReport };
    }),
  list: protectedProcedure.query(({ ctx }) => db.listBlastAssessments(ctx.user.id)),
  get: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ ctx, input }) => {
    const row = await db.getBlastAssessment(input.id);
    assertOwner(row, ctx.user.id);
    return row;
  }),
  blastabilityIndex: protectedProcedure
    .input(
      z.object({
        rmd: z.number().min(10).max(50),
        jps: z.number().min(10).max(50),
        jpo: z.number().min(10).max(40),
        specificGravity: z.number().min(1.5).max(5.0),
        hardness: z.number().min(1).max(350),
      }),
    )
    .mutation(({ input }) => computeBlastabilityIndex(input)),
  wallControl: protectedProcedure
    .input(
      z.object({
        preSplit: z.boolean(),
        preSplitSpacing: z.number().min(0).max(5).default(0),
        preSplitDiameter: z.number().min(0).max(200).default(89),
        trimBlast: z.boolean(),
        trimBurden: z.number().min(0).max(10).default(2.5),
        bufferRows: z.number().min(0).max(10).default(2),
        standoffDistance: z.number().min(0).max(30).default(5),
        measuredBackbreak: z.number().min(0).max(20).default(0),
        measuredCrestLoss: z.number().min(0).max(10).default(0),
        designBermWidth: z.number().min(0).max(30).default(8),
        actualBermWidth: z.number().min(0).max(30).default(7),
      }),
    )
    .mutation(({ input }) => evaluateWallControl(input)),
});

export const complianceRouter = router({
  compute: protectedProcedure
    .input(
      z.object({
        title: z.string().min(1).max(255),
        zone: z.string().max(255).optional(),
        designBenchHeight: z.number().min(1).max(100),
        actualBenchHeight: z.number().min(0).max(150),
        designBermWidth: z.number().min(0).max(100),
        actualBermWidth: z.number().min(0).max(150),
        designBatterAngle: z.number().min(10).max(90),
        actualBatterAngle: z.number().min(0).max(90),
        toleranceHeight: z.number().min(0).max(10).default(0.5),
        toleranceBerm: z.number().min(0).max(10).default(1),
        toleranceAngle: z.number().min(0).max(15).default(2),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { title, zone, ...params } = input;
      const result = computeCompliance(params);
      const id = await db.insertComplianceCheck({
        userId: ctx.user.id,
        title,
        zone,
        ...params,
        compliant: result.compliant ? 1 : 0,
        compliancePct: result.compliancePct,
        details: result.items,
        interpretation: result.interpretation,
      });
      return { id, ...result };
    }),
  list: protectedProcedure.query(({ ctx }) => db.listComplianceChecks(ctx.user.id)),
  get: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ ctx, input }) => {
    const row = await db.getComplianceCheck(input.id);
    assertOwner(row, ctx.user.id);
    return row;
  }),
});
