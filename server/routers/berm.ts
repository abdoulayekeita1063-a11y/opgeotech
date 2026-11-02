import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { bermAnalysisInputSchema } from "../../shared/berm/validation";
import { computeBermComparison } from "../../shared/berm/comparison";
import * as db from "../db/berm";

const recordId = z.object({ id: z.number().int().positive() });
export const bermRouter = router({
  list: protectedProcedure.query(({ ctx }) =>
    db.listBermComparisons(ctx.user.id)
  ),
  summary: protectedProcedure.query(({ ctx }) =>
    db.summarizeBermComparisons(ctx.user.id)
  ),
  get: protectedProcedure.input(recordId).query(async ({ ctx, input }) => {
    const record = await db.getBermComparison(input.id, ctx.user.id);
    if (!record)
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Berm comparison not found",
      });
    const { userId: _userId, ...result } = record;
    return result;
  }),
  save: protectedProcedure
    .input(z.object({ input: bermAnalysisInputSchema }))
    .mutation(async ({ ctx, input }) => {
      // No client-supplied rating/status is trusted: geometry and criteria are
      // recomputed using the exact same engine as the offline browser analysis.
      const result = computeBermComparison(input.input);
      const id = await db.insertBermComparison(
        ctx.user.id,
        input.input,
        result
      );
      return { id, result };
    }),
  delete: protectedProcedure
    .input(recordId)
    .mutation(async ({ ctx, input }) => {
      const record = await db.getBermComparison(input.id, ctx.user.id);
      if (!record)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Berm comparison not found",
        });
      await db.deleteBermComparison(input.id, ctx.user.id);
      return { success: true as const };
    }),
});
