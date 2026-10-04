/**
 * Routers for the OPGeotech expansion modules:
 * Drillhole planning (DXF import), Structural Mapping and Kinematic Analysis.
 */
import { nanoid } from "nanoid";
import { z } from "zod";
import * as db from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { storagePut } from "../storage";
import { parseDxf } from "../geotech/dxf";
import { runKinematicAnalysis } from "../geotech/kinematics";
import { analyzeRadarTrend, DEFAULT_RADAR_THRESHOLDS } from "../geotech/radar";
import { scoreWallRisk, serializeWallRisk } from "../geotech/wallRisk";
import { invokeLLM } from "../_core/llm";

// ── AI Slope Analysis module ──────────────────────────────────────────

const slopePointSchema = {
  type: "object",
  properties: {
    x: { type: "number", description: "Normalized image x coordinate from 0 to 1" },
    y: { type: "number", description: "Normalized image y coordinate from 0 to 1, top to bottom" },
  },
  required: ["x", "y"],
  additionalProperties: false,
} as const;

export const aiSlopeRouter = router({
  analyzePhoto: protectedProcedure
    .input(z.object({ imageDataUrl: z.string().regex(/^data:image\/(jpeg|jpg|png|webp);base64,/i).max(14_000_000), edgeDensity: z.number().min(0).max(1).optional() }))
    .mutation(async ({ input }) => {
      const response = await invokeLLM({
        messages: [
          {
            role: "system",
            content: "You are a geotechnical computer-vision assistant. Analyze an open-pit slope photograph conservatively. Detect visible crest, toe, slope face, berms and boundaries. Return normalized image coordinates, not a guessed angle. Choose one representative straight face segment between a crest point and toe point. Use perspective cues when visible, but clearly mark uncertainty. This is a preliminary photo estimate, never a survey-grade measurement.",
          },
          {
            role: "user",
            content: [
              { type: "text", text: `Analyze this open-pit slope image. Identify the most representative visible slope face and its crest/toe endpoints. Coordinates must be normalized between 0 and 1. A deterministic browser edge-map pre-check returned ${(input.edgeDensity ?? 0).toFixed(3)}; use it as supporting evidence only, not as a substitute for visual segmentation.` },
              { type: "image_url", image_url: { url: input.imageDataUrl, detail: "high" } },
            ],
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "slope_photo_geometry",
            strict: true,
            schema: {
              type: "object",
              properties: {
                crest: slopePointSchema,
                toe: slopePointSchema,
                face: { type: "array", items: slopePointSchema, minItems: 2, maxItems: 24 },
                berms: { type: "array", items: { type: "array", items: slopePointSchema, minItems: 2, maxItems: 12 }, maxItems: 12 },
                visibleBoundaries: { type: "array", items: slopePointSchema, maxItems: 48 },
                representativeSegment: { type: "string" },
                perspectiveCorrectionApplied: { type: "boolean" },
                confidence: { type: "number", minimum: 0, maximum: 100 },
                limitations: { type: "array", items: { type: "string" }, maxItems: 8 },
              },
              required: ["crest", "toe", "face", "berms", "visibleBoundaries", "representativeSegment", "perspectiveCorrectionApplied", "confidence", "limitations"],
              additionalProperties: false,
            },
          },
        },
        max_tokens: 1800,
      });

      const content = response.choices[0]?.message.content;
      const json = typeof content === "string" ? content : content?.map(part => part.type === "text" ? part.text : "").join("") ?? "";
      const parsed = JSON.parse(json) as {
        crest: { x: number; y: number };
        toe: { x: number; y: number };
        face: Array<{ x: number; y: number }>;
        berms: Array<Array<{ x: number; y: number }>>;
        visibleBoundaries: Array<{ x: number; y: number }>;
        representativeSegment: string;
        perspectiveCorrectionApplied: boolean;
        confidence: number;
        limitations: string[];
      };
      const points = [parsed.crest, parsed.toe, ...parsed.face, ...parsed.visibleBoundaries].filter(point => Number.isFinite(point.x) && Number.isFinite(point.y) && point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1);
      if (points.length < 2) throw new Error("The visible slope geometry could not be identified reliably.");
      const dx = Math.abs(parsed.toe.x - parsed.crest.x);
      const dy = Math.abs(parsed.toe.y - parsed.crest.y);
      const angle = Math.atan2(dy, Math.max(dx, 0.0001)) * 180 / Math.PI;
      return {
        estimatedFaceAngle: Number(angle.toFixed(1)),
        confidence: Math.round(Math.max(0, Math.min(100, parsed.confidence))),
        geometry: parsed,
        method: ["edge-map pre-check", "AI segmentation", "crest/toe detection", "pixel geometry", parsed.perspectiveCorrectionApplied ? "perspective correction" : "perspective review"],
        disclaimer: "Photo-based estimate only. Verify with survey, drone photogrammetry, LiDAR or field measurements before geotechnical design or decisions.",
      };
    }),
});

// ── Drillhole module ─────────────────────────────────────────────────

export const drillholeRouter = router({
  importDxf: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(255),
        base64: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const buffer = Buffer.from(input.base64, "base64");
      if (buffer.length > 25 * 1024 * 1024) {
        throw new Error("DXF file exceeds the 25 MB limit");
      }
      const content = buffer.toString("utf-8");
      const geometry = parseDxf(content);

      const key = `dxf/${ctx.user.id}/${nanoid(10)}-${input.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const { key: fileKey, url } = await storagePut(key, buffer, "application/dxf");

      const id = await db.insertDxfPlan({
        userId: ctx.user.id,
        name: input.name,
        fileKey,
        fileUrl: url,
        geometryJson: JSON.stringify(geometry),
        entityCount: geometry.entityCount,
      });
      return { id, name: input.name, entityCount: geometry.entityCount, layers: geometry.layers, bounds: geometry.bounds, layerBounds: geometry.layerBounds, geometry };
    }),

  listPlans: protectedProcedure.query(({ ctx }) => db.listDxfPlans(ctx.user.id)),

  getPlan: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ ctx, input }) => {
    const plan = await db.getDxfPlan(input.id);
    if (!plan || plan.userId !== ctx.user.id) throw new Error("Plan not found");
    return plan;
  }),

  deletePlan: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await db.deleteDxfPlan(input.id, ctx.user.id);
      return { success: true } as const;
    }),

  createHole: protectedProcedure
    .input(
      z.object({
        planId: z.number().nullish(),
        holeId: z.string().min(1).max(64),
        collarX: z.number(),
        collarY: z.number(),
        collarZ: z.number().default(0),
        azimuth: z.number().min(0).max(360).default(0),
        dip: z.number().min(-90).max(0).default(-90),
        depth: z.number().positive(),
        purpose: z.string().max(128).optional(),
        notes: z.string().max(2000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const id = await db.insertDrillhole({
        userId: ctx.user.id,
        planId: input.planId ?? null,
        holeId: input.holeId,
        collarX: input.collarX,
        collarY: input.collarY,
        collarZ: input.collarZ,
        azimuth: input.azimuth,
        dip: input.dip,
        depth: input.depth,
        purpose: input.purpose ?? null,
        notes: input.notes ?? null,
      });
      return { id };
    }),

  listHoles: protectedProcedure.query(({ ctx }) => db.listDrillholes(ctx.user.id)),

  deleteHole: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await db.deleteDrillhole(input.id, ctx.user.id);
      return { success: true } as const;
  }),
});

const loggingMetadata = z.record(z.string(), z.string().max(500));
const loggingRow = z.record(z.string(), z.string().max(500));

export const loggingRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const logs = await db.listDrillholeLogs(ctx.user.id);
    return logs.map(log => ({
      ...log,
      metadata: log.metadataJson ? JSON.parse(log.metadataJson) : {},
      rows: log.rowsJson ? JSON.parse(log.rowsJson) : [],
    }));
  }),
  save: protectedProcedure
    .input(z.object({
      holeId: z.string().min(1).max(64),
      metadata: loggingMetadata,
      rows: z.array(loggingRow).max(500),
      comments: z.string().max(5000).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const id = await db.replaceDrillholeLog({
        userId: ctx.user.id,
        holeId: input.holeId,
        metadataJson: JSON.stringify(input.metadata),
        rowsJson: JSON.stringify(input.rows),
        comments: input.comments ?? null,
      });
      return { id };
    }),
  delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    await db.deleteDrillholeLog(input.id, ctx.user.id);
    return { success: true } as const;
  }),
});

// ── Structural Mapping module ────────────────────────────────────────

const structureShape = {
  structureId: z.string().max(64).optional(),
  zone: z.string().max(128).optional(),
  structureType: z.string().max(64).default("joint"),
  dip: z.number().min(0).max(90),
  dipDirection: z.number().min(0).max(360),
  easting: z.number().finite().nullish(),
  northing: z.number().finite().nullish(),
  elevation: z.number().finite().nullish(),
  persistence: z.number().min(0).max(10000).nullish(),
  alteration: z.string().max(128).optional(),
  infill: z.string().max(128).optional(),
  roughness: z.string().max(128).optional(),
  jrc: z.number().min(0).max(20).nullish(),
  notes: z.string().max(2000).optional(),
};

export const mappingRouter = router({
  create: protectedProcedure.input(z.object(structureShape)).mutation(async ({ ctx, input }) => {
    const id = await db.insertStructure({
      userId: ctx.user.id,
      structureId: input.structureId ?? null,
      zone: input.zone ?? null,
      structureType: input.structureType,
      dip: input.dip,
      dipDirection: input.dipDirection,
      easting: input.easting ?? null,
      northing: input.northing ?? null,
      elevation: input.elevation ?? null,
      persistence: input.persistence ?? null,
      alteration: input.alteration ?? null,
      infill: input.infill ?? null,
      roughness: input.roughness ?? null,
      jrc: input.jrc ?? null,
      notes: input.notes ?? null,
    });
    return { id };
  }),

  importCsv: protectedProcedure
    .input(z.object({ rows: z.array(z.object(structureShape)).min(1).max(2000) }))
    .mutation(async ({ ctx, input }) => {
      const count = await db.insertStructuresBulk(
        input.rows.map(r => ({
          userId: ctx.user.id,
          structureId: r.structureId ?? null,
          zone: r.zone ?? null,
          structureType: r.structureType ?? "joint",
          dip: r.dip,
          dipDirection: r.dipDirection,
          easting: r.easting ?? null,
          northing: r.northing ?? null,
          elevation: r.elevation ?? null,
          persistence: r.persistence ?? null,
          alteration: r.alteration ?? null,
          infill: r.infill ?? null,
          roughness: r.roughness ?? null,
          jrc: r.jrc ?? null,
          notes: r.notes ?? null,
        }))
      );
      return { count };
    }),

  list: protectedProcedure.query(({ ctx }) => db.listStructures(ctx.user.id)),

  delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    await db.deleteStructure(input.id, ctx.user.id);
    return { success: true } as const;
  }),
});

// ── Kinematic Analysis module ────────────────────────────────────────

export const kinematicsRouter = router({
  run: protectedProcedure
    .input(
      z.object({
        title: z.string().min(1).max(255),
        zone: z.string().max(128).optional(),
        slopeDipDirection: z.number().min(0).max(360),
        slopeDip: z.number().min(1).max(90),
        slopeHeight: z.number().positive().max(1000),
        unitWeight: z.number().positive().max(50),
        basicFrictionAngle: z.number().min(5).max(60),
        jcs: z.number().positive().max(500),
        lateralLimit: z.number().min(5).max(45).default(20),
        structureIds: z.array(z.number()).min(1).max(100),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const all = await db.listStructures(ctx.user.id);
      const selected = all.filter(s => input.structureIds.includes(s.id));
      if (!selected.length) throw new Error("No valid structures selected");

      const result = runKinematicAnalysis({
        slopeDip: input.slopeDip,
        slopeDipDirection: input.slopeDipDirection,
        slopeHeight: input.slopeHeight,
        unitWeight: input.unitWeight,
        basicFrictionAngle: input.basicFrictionAngle,
        jcs: input.jcs,
        lateralLimit: input.lateralLimit,
        structures: selected.map(s => ({
          id: s.structureId || `#${s.id}`,
          dip: s.dip,
          dipDirection: s.dipDirection,
          easting: s.easting,
          northing: s.northing,
          elevation: s.elevation,
          persistence: s.persistence,
          jrc: s.jrc,
          structureType: s.structureType,
        })),
      });

      const id = await db.insertKinematicAnalysis({
        userId: ctx.user.id,
        title: input.title,
        zone: input.zone ?? null,
        slopeDipDirection: input.slopeDipDirection,
        slopeDip: input.slopeDip,
        slopeHeight: input.slopeHeight,
        unitWeight: input.unitWeight,
        basicFrictionAngle: input.basicFrictionAngle,
        jcs: input.jcs,
        lateralLimit: input.lateralLimit,
        inputJson: JSON.stringify({ structureIds: input.structureIds }),
        resultJson: JSON.stringify(result),
      });
      return { id, result };
    }),

  list: protectedProcedure.query(({ ctx }) => db.listKinematicAnalyses(ctx.user.id)),

  get: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ ctx, input }) => {
    const rec = await db.getKinematicAnalysis(input.id);
    if (!rec || rec.userId !== ctx.user.id) throw new Error("Analysis not found");
    return rec;
  }),
});


// ── Standalone Monitoring module ───────────────────────────────────────

const monitoringStatuses = ["Active", "Monitored", "Remediated", "Closed"] as const;
const monitoringRiskLevels = ["Low", "Moderate", "High", "Critical"] as const;

const wallRiskInspectionShape = {
  pitPhase: z.string().max(128).optional(),
  area: z.string().max(128).optional(),
  operation: z.string().max(128).optional(),
  inspectorName: z.string().max(255).optional(),
  startBench: z.string().max(64).optional(),
  endBench: z.string().max(64).optional(),
  inspectionDate: z.string().max(32).optional(),
  bermWidth: z.number().min(0).max(500).optional(),
  slopeHeight: z.number().min(0).max(1000).optional(),
  slopeAngle: z.number().min(0).max(90).optional(),
  monthToDateRainfall: z.number().min(0).max(5000).optional(),
  faceMoistureCondition: z.string().max(128).optional(),
  ponding: z.string().max(128).optional(),
  drainage: z.string().max(128).optional(),
  rockMassRating: z.number().min(0).max(100).optional(),
  jointSets: z.number().min(0).max(50).optional(),
  jointContinuity: z.string().max(128).optional(),
  rockType: z.string().max(128).optional(),
  structuralType: z.string().max(128).optional(),
  infilling: z.string().max(128).optional(),
  rockMassCharacterization: z.string().max(2000).optional(),
  mappingDensity: z.string().max(128).optional(),
  irsData: z.string().max(128).optional(),
  geotechDrillingProgram: z.string().max(128).optional(),
  geotechnicalAnalysis: z.string().max(2000).optional(),
  potentialFailureMechanism: z.string().max(128).optional(),
  factorOfSafety: z.number().min(0).max(20).optional(),
  failureHistory: z.string().max(128).optional(),
  probabilityOfFailure: z.number().min(0).max(100).optional(),
  orientation: z.string().max(128).optional(),
  faceCleaningMethod: z.string().max(128).optional(),
  bermCondition: z.string().max(128).optional(),
  rockFaceDescription: z.string().max(128).optional(),
  looseMaterials: z.string().max(128).optional(),
  limitBlastingMethod: z.string().max(128).optional(),
  wallDamage: z.string().max(128).optional(),
  presplitBarrelsVisible: z.string().max(128).optional(),
  crestBackbreak: z.string().max(128).optional(),
  hardToe: z.string().max(128).optional(),
  structuralPlanesVisible: z.string().max(128).optional(),
  monitoringMethod: z.string().max(128).optional(),
  monitoringFrequency: z.string().max(128).optional(),
  cumulativeDisplacement: z.number().min(0).max(100000).optional(),
  analysis: z.string().max(128).optional(),
  velocity: z.number().min(0).max(100000).optional(),
};

export const monitoringRouter = router({
  create: protectedProcedure
    .input(
      z.object({
        wallName: z.string().min(1).max(255),
        zone: z.string().max(128).optional(),
        status: z.enum(monitoringStatuses).default("Active"),
        ...wallRiskInspectionShape,
        rmr: z.number().min(0).max(100).optional(),
        gsi: z.number().min(0).max(100).optional(),
        qSystem: z.number().min(0).max(1000).optional(),
        wallAssessmentScore: z.number().min(0).max(100).optional(),
        blastAssessmentScore: z.number().min(0).max(100).optional(),
        ucs: z.number().min(0).max(1000).optional(),
        cohesion: z.number().min(0).max(1000).optional(),
        frictionAngle: z.number().min(0).max(90).optional(),
        density: z.number().min(0).max(10).optional(),
        dominantStructures: z.string().max(4000).optional(),
        currentFs: z.number().min(0).max(20).optional(),
        notes: z.string().max(6000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const wallRisk = scoreWallRisk(input);
      const persistedRisk = serializeWallRisk(wallRisk);
      const id = await db.insertMonitoringRecord({
        userId: ctx.user.id,
        wallName: input.wallName,
        zone: input.zone ?? null,
        pitPhase: input.pitPhase ?? null,
        area: input.area ?? null,
        operation: input.operation ?? null,
        inspectorName: input.inspectorName ?? null,
        startBench: input.startBench ?? null,
        endBench: input.endBench ?? null,
        inspectionDate: input.inspectionDate ?? null,
        status: input.status,
        riskLevel: persistedRisk.riskLevel,
        riskScore: persistedRisk.riskScore,
        riskClass: persistedRisk.riskClass,
        riskColour: persistedRisk.riskColour,
        actionPriority: persistedRisk.actionPriority,
        categoryScoresJson: persistedRisk.categoryScoresJson,
        recommendations: persistedRisk.recommendations,
        inspectionDataJson: JSON.stringify(input),
        rmr: input.rmr ?? null,
        gsi: input.gsi ?? null,
        qSystem: input.qSystem ?? null,
        wallAssessmentScore: input.wallAssessmentScore ?? null,
        blastAssessmentScore: input.blastAssessmentScore ?? null,
        ucs: input.ucs ?? null,
        cohesion: input.cohesion ?? null,
        frictionAngle: input.frictionAngle ?? null,
        density: input.density ?? null,
        dominantStructures: input.dominantStructures ?? null,
        currentFs: input.currentFs ?? null,
        notes: input.notes ?? null,
      });
      return { id, risk: wallRisk };
    }),

  list: protectedProcedure.query(({ ctx }) => db.listMonitoringRecords(ctx.user.id)),

  get: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ ctx, input }) => {
    const record = await db.getMonitoringRecord(input.id);
    if (!record || record.userId !== ctx.user.id) throw new Error("Monitoring record not found");
    return record;
  }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await db.deleteMonitoringRecord(input.id, ctx.user.id);
      return { success: true } as const;
    }),

  createProject: protectedProcedure
    .input(z.object({
      name: z.string().min(1).max(255),
      site: z.string().max(255).optional(),
      description: z.string().max(4000).optional(),
    }))
    .mutation(async ({ ctx, input }) => ({
      id: await db.createMonitoringProject({
        userId: ctx.user.id,
        name: input.name,
        site: input.site ?? null,
        description: input.description ?? null,
      }),
    })),

  projects: protectedProcedure.query(({ ctx }) => db.listMonitoringProjects(ctx.user.id)),

  deleteProject: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const project = await db.getMonitoringProject(input.id);
      if (!project || project.userId !== ctx.user.id) throw new Error("Monitoring project not found");
      await db.deleteMonitoringProject(input.id, ctx.user.id);
      return { success: true } as const;
    }),

  importProjectRadarSummary: protectedProcedure
    .input(z.object({
      projectId: z.number(),
      source: z.string().max(255).optional(),
      rows: z.array(z.object({
        measuredAt: z.number().positive(),
        pit: z.string().min(1).max(128),
        window: z.string().min(1).max(128),
        displacementMaxMm: z.number().nullable().optional(),
        displacementMinMm: z.number().nullable().optional(),
        displacementAverageMm: z.number().nullable().optional(),
        velocityMaxMmPerDay: z.number().nullable().optional(),
        velocityMinMmPerDay: z.number().nullable().optional(),
        velocityAverageMmPerDay: z.number().nullable().optional(),
        observations: z.string().max(2000).nullable().optional(),
      })).min(1).max(10000),
    }))
    .mutation(async ({ ctx, input }) => {
      const project = await db.getMonitoringProject(input.projectId);
      if (!project || project.userId !== ctx.user.id) throw new Error("Monitoring project not found");
      const count = await db.insertRadarMonitoringRows(input.rows.map(row => ({
        userId: ctx.user.id,
        projectId: input.projectId,
        monitoringRecordId: null,
        measuredAt: row.measuredAt,
        pit: row.pit,
        window: row.window,
        displacementMaxMm: row.displacementMaxMm ?? null,
        displacementMinMm: row.displacementMinMm ?? null,
        displacementAverageMm: row.displacementAverageMm ?? null,
        velocityMaxMmPerDay: row.velocityMaxMmPerDay ?? null,
        velocityMinMmPerDay: row.velocityMinMmPerDay ?? null,
        velocityAverageMmPerDay: row.velocityAverageMmPerDay ?? null,
        observations: row.observations ?? null,
        source: input.source ?? null,
      })));
      return { count };
    }),

  projectSummaryRows: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .query(async ({ ctx, input }) => {
      const project = await db.getMonitoringProject(input.projectId);
      if (!project || project.userId !== ctx.user.id) throw new Error("Monitoring project not found");
      return db.listProjectRadarMonitoringRows(ctx.user.id, input.projectId);
    }),

  analyzeProjectRadarSummary: protectedProcedure
    .input(z.object({
      projectId: z.number(),
      window: z.string().optional(),
      moderateVelocityMmPerDay: z.number().positive().default(DEFAULT_RADAR_THRESHOLDS.moderateVelocityMmPerDay),
      highVelocityMmPerDay: z.number().positive().default(DEFAULT_RADAR_THRESHOLDS.highVelocityMmPerDay),
      criticalVelocityMmPerDay: z.number().positive().default(DEFAULT_RADAR_THRESHOLDS.criticalVelocityMmPerDay),
    }))
    .query(async ({ ctx, input }) => {
      const project = await db.getMonitoringProject(input.projectId);
      if (!project || project.userId !== ctx.user.id) throw new Error("Monitoring project not found");
      const stored = await db.listProjectRadarMonitoringRows(ctx.user.id, input.projectId);
      const selected = input.window ? stored.filter(row => row.window === input.window) : stored;
      if (!selected.length) throw new Error("No Excel radar monitoring rows found");
      return analyzeRadarTrend(selected.map(row => ({
        radarPointId: `${row.pit} / ${row.window}`,
        measuredAt: row.measuredAt,
        displacementMm: row.displacementAverageMm ?? row.displacementMaxMm ?? 0,
        velocityMmPerDay: row.velocityAverageMmPerDay ?? row.velocityMaxMmPerDay,
      })), {
        moderateVelocityMmPerDay: input.moderateVelocityMmPerDay,
        highVelocityMmPerDay: input.highVelocityMmPerDay,
        criticalVelocityMmPerDay: input.criticalVelocityMmPerDay,
      });
    }),

  importRadar: protectedProcedure
    .input(z.object({
      monitoringRecordId: z.number(),
      source: z.string().max(128).optional(),
      readings: z.array(z.object({
        radarPointId: z.string().min(1).max(128),
        measuredAt: z.number().positive(),
        displacementMm: z.number(),
        velocityMmPerDay: z.number().nullable().optional(),
      })).min(1).max(10000),
    }))
    .mutation(async ({ ctx, input }) => {
      const record = await db.getMonitoringRecord(input.monitoringRecordId);
      if (!record || record.userId !== ctx.user.id) throw new Error("Monitoring record not found");
      const count = await db.insertMonitoringRadarReadings(input.readings.map(reading => ({
        userId: ctx.user.id,
        monitoringRecordId: input.monitoringRecordId,
        radarPointId: reading.radarPointId,
        measuredAt: reading.measuredAt,
        displacementMm: reading.displacementMm,
        velocityMmPerDay: reading.velocityMmPerDay ?? null,
        source: input.source ?? null,
      })));
      return { count };
    }),

  radarReadings: protectedProcedure
    .input(z.object({ monitoringRecordId: z.number() }))
    .query(async ({ ctx, input }) => {
      const record = await db.getMonitoringRecord(input.monitoringRecordId);
      if (!record || record.userId !== ctx.user.id) throw new Error("Monitoring record not found");
      return db.listMonitoringRadarReadings(ctx.user.id, input.monitoringRecordId);
    }),

  importRadarSummary: protectedProcedure
    .input(z.object({
      monitoringRecordId: z.number(),
      source: z.string().max(255).optional(),
      rows: z.array(z.object({
        measuredAt: z.number().positive(),
        pit: z.string().min(1).max(128),
        window: z.string().min(1).max(128),
        displacementMaxMm: z.number().nullable().optional(),
        displacementMinMm: z.number().nullable().optional(),
        displacementAverageMm: z.number().nullable().optional(),
        velocityMaxMmPerDay: z.number().nullable().optional(),
        velocityMinMmPerDay: z.number().nullable().optional(),
        velocityAverageMmPerDay: z.number().nullable().optional(),
        observations: z.string().max(2000).nullable().optional(),
      })).min(1).max(10000),
    }))
    .mutation(async ({ ctx, input }) => {
      const record = await db.getMonitoringRecord(input.monitoringRecordId);
      if (!record || record.userId !== ctx.user.id) throw new Error("Monitoring record not found");
      const count = await db.insertRadarMonitoringRows(input.rows.map(row => ({
        userId: ctx.user.id,
        monitoringRecordId: input.monitoringRecordId,
        measuredAt: row.measuredAt,
        pit: row.pit,
        window: row.window,
        displacementMaxMm: row.displacementMaxMm ?? null,
        displacementMinMm: row.displacementMinMm ?? null,
        displacementAverageMm: row.displacementAverageMm ?? null,
        velocityMaxMmPerDay: row.velocityMaxMmPerDay ?? null,
        velocityMinMmPerDay: row.velocityMinMmPerDay ?? null,
        velocityAverageMmPerDay: row.velocityAverageMmPerDay ?? null,
        observations: row.observations ?? null,
        source: input.source ?? null,
      })));
      return { count };
    }),

  summaryRows: protectedProcedure
    .input(z.object({ monitoringRecordId: z.number() }))
    .query(async ({ ctx, input }) => {
      const record = await db.getMonitoringRecord(input.monitoringRecordId);
      if (!record || record.userId !== ctx.user.id) throw new Error("Monitoring record not found");
      return db.listRadarMonitoringRows(ctx.user.id, input.monitoringRecordId);
    }),

  analyzeRadarSummary: protectedProcedure
    .input(z.object({
      monitoringRecordId: z.number(),
      window: z.string().optional(),
      moderateVelocityMmPerDay: z.number().positive().default(DEFAULT_RADAR_THRESHOLDS.moderateVelocityMmPerDay),
      highVelocityMmPerDay: z.number().positive().default(DEFAULT_RADAR_THRESHOLDS.highVelocityMmPerDay),
      criticalVelocityMmPerDay: z.number().positive().default(DEFAULT_RADAR_THRESHOLDS.criticalVelocityMmPerDay),
    }))
    .query(async ({ ctx, input }) => {
      const record = await db.getMonitoringRecord(input.monitoringRecordId);
      if (!record || record.userId !== ctx.user.id) throw new Error("Monitoring record not found");
      const stored = await db.listRadarMonitoringRows(ctx.user.id, input.monitoringRecordId);
      const selected = input.window ? stored.filter(row => row.window === input.window) : stored;
      if (!selected.length) throw new Error("No Excel radar monitoring rows found");
      return analyzeRadarTrend(selected.map(row => ({
        radarPointId: `${row.pit} / ${row.window}`,
        measuredAt: row.measuredAt,
        displacementMm: row.displacementAverageMm ?? row.displacementMaxMm ?? 0,
        velocityMmPerDay: row.velocityAverageMmPerDay ?? row.velocityMaxMmPerDay,
      })), {
        moderateVelocityMmPerDay: input.moderateVelocityMmPerDay,
        highVelocityMmPerDay: input.highVelocityMmPerDay,
        criticalVelocityMmPerDay: input.criticalVelocityMmPerDay,
      });
    }),

  analyzeRadar: protectedProcedure
    .input(z.object({
      monitoringRecordId: z.number(),
      radarPointId: z.string().min(1).max(128).optional(),
      moderateVelocityMmPerDay: z.number().positive().default(DEFAULT_RADAR_THRESHOLDS.moderateVelocityMmPerDay),
      highVelocityMmPerDay: z.number().positive().default(DEFAULT_RADAR_THRESHOLDS.highVelocityMmPerDay),
      criticalVelocityMmPerDay: z.number().positive().default(DEFAULT_RADAR_THRESHOLDS.criticalVelocityMmPerDay),
    }))
    .query(async ({ ctx, input }) => {
      const record = await db.getMonitoringRecord(input.monitoringRecordId);
      if (!record || record.userId !== ctx.user.id) throw new Error("Monitoring record not found");
      const stored = await db.listMonitoringRadarReadings(ctx.user.id, input.monitoringRecordId);
      const selected = input.radarPointId ? stored.filter(reading => reading.radarPointId === input.radarPointId) : stored;
      if (!selected.length) throw new Error("No radar readings found for this wall or point");
      return analyzeRadarTrend(selected.map(reading => ({
        radarPointId: reading.radarPointId,
        measuredAt: reading.measuredAt,
        displacementMm: reading.displacementMm,
        velocityMmPerDay: reading.velocityMmPerDay,
      })), {
        moderateVelocityMmPerDay: input.moderateVelocityMmPerDay,
        highVelocityMmPerDay: input.highVelocityMmPerDay,
        criticalVelocityMmPerDay: input.criticalVelocityMmPerDay,
      });
    }),
});
