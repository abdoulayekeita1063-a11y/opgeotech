import { z } from "zod";
import type { BermAnalysisInput } from "./types";

const text = (length: number) => z.string().trim().max(length);
const optionalNumber = z.number().finite().nonnegative().nullable();
const point = z.object({
  x: z.number().finite().min(-1e10).max(1e10),
  y: z.number().finite().min(-1e10).max(1e10),
  z: z.number().finite().min(-1e8).max(1e8).nullable(),
});
const entity = z.object({
  id: text(255).min(1),
  sourceType: text(64).min(1),
  kind: z.enum(["polyline", "face", "point", "line"]),
  layer: text(255).min(1),
  points: z.array(point).max(10_000),
  closed: z.boolean(),
  valid: z.boolean(),
  hasElevation: z.boolean(),
  issues: z.array(text(2_000)).max(100),
});
const document = z
  .object({
    filename: text(255)
      .min(1)
      .regex(/\.dxf$/i, "The survey source must be a DXF file"),
    layers: z.array(text(255)).max(10_000),
    entities: z.array(entity).max(10_000),
    originalEntityCount: z.number().int().nonnegative().max(1_000_000),
    insunits: z.number().int().nullable(),
    unitName: text(128).nullable(),
    unitScale: z.number().finite().positive().nullable(),
    diagnostics: z.array(text(2_000)).max(1_000),
  })
  .superRefine((value, ctx) => {
    const vertices = value.entities.reduce(
      (sum, current) => sum + current.points.length,
      0
    );
    if (vertices > 40_000)
      ctx.addIssue({
        code: "custom",
        message:
          "Select or export a smaller berm DXF: maximum 40,000 vertices per file",
      });
    const ids = new Set(value.entities.map(current => current.id));
    if (ids.size !== value.entities.length)
      ctx.addIssue({
        code: "custom",
        message: "DXF entity identifiers must be unique",
      });
  });
const source = z.object({
  document: document.nullable(),
  layers: z.array(text(255)).max(10_000),
  entityIds: z.array(text(255)).max(10_000),
  unitsToMetres: z.number().finite().positive().max(1_000).nullable(),
  crs: text(255),
  verticalDatum: text(255),
});
export const bermAnalysisInputSchema = z.object({
  metadata: z.object({
    bermId: text(128).min(1, "Berm ID is required before saving"),
    pit: text(128).min(1, "Pit is required before saving"),
    bench: text(128).min(1, "Bench is required before saving"),
    surveyDateMs: z.number().finite().nonnegative().nullable(),
    reviewer: text(255),
    comments: text(10_000),
  }),
  planned: source,
  asBuilt: source,
  criteria: z.object({
    minWidth: optionalNumber,
    areaDeviationPct: optionalNumber,
    horizontalDeviation: optionalNumber,
    elevationDeviation: optionalNumber,
    warningRatio: z.number().finite().min(0.01).max(1),
    siteApproved: z.boolean(),
    requireElevation: z.boolean(),
    surveyComplete: z.boolean(),
    crsConfirmed: z.boolean(),
  }),
  widthBearing: z.number().finite().min(0).max(360).nullable(),
  sampleSpacing: z.number().finite().min(0.01).max(1_000),
}) satisfies z.ZodType<BermAnalysisInput>;
