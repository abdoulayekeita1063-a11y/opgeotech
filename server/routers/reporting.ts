import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import * as db from "../db";

const optionalText = (max: number) => z.string().trim().max(max).optional();

const failureRecordInput = z.object({
  incidentDate: z.number().finite().nonnegative(),
  pit: z.string().trim().min(1).max(128),
  phase: optionalText(128),
  wall: optionalText(128),
  bench: optionalText(128),
  lithology: optionalText(255),
  failureType: optionalText(255),
  actionTaken: optionalText(10_000),
  comments: optionalText(10_000),
  pictureReference: optionalText(2_000),
  sourceSheet: optionalText(128),
});

export const reportingRouter = router({
  failures: router({
    list: protectedProcedure.query(({ ctx }) => db.listFailureRecords(ctx.user.id)),
    create: protectedProcedure.input(failureRecordInput).mutation(async ({ ctx, input }) => {
      const id = await db.insertFailureRecord({ userId: ctx.user.id, ...input });
      return { id };
    }),
    importWorkbook: protectedProcedure
      .input(z.object({
        sourceFile: z.string().trim().min(1).max(255),
        replaceExisting: z.boolean().default(false),
        rows: z.array(failureRecordInput).min(1).max(5_000),
      }))
      .mutation(async ({ ctx, input }) => {
        if (input.replaceExisting) await db.clearFailureRecords(ctx.user.id);
        const imported = await db.insertFailureRecords(input.rows.map(row => ({
          userId: ctx.user.id,
          sourceFile: input.sourceFile,
          ...row,
        })));
        return { imported };
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        await db.deleteFailureRecord(input.id, ctx.user.id);
        return { success: true as const };
      }),
    clear: protectedProcedure.mutation(async ({ ctx }) => {
      await db.clearFailureRecords(ctx.user.id);
      return { success: true as const };
    }),
  }),
});

