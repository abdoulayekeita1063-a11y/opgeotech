import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import {
  blastRouter,
  classificationRouter,
  complianceRouter,
  inspectionRouter,
  stabilityRouter,
} from "./routers/geotech";
import { aiSlopeRouter, drillholeRouter, kinematicsRouter, loggingRouter, mappingRouter, monitoringRouter, piezometerRouter } from "./routers/opgeotech";
import { reportingRouter } from "./routers/reporting";

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  stability: stabilityRouter,
  classification: classificationRouter,
  inspection: inspectionRouter,
  blast: blastRouter,
  compliance: complianceRouter,
  drillhole: drillholeRouter,
  logging: loggingRouter,
  mapping: mappingRouter,
  kinematics: kinematicsRouter,
  monitoring: monitoringRouter,
  piezometer: piezometerRouter,
  aiSlope: aiSlopeRouter,
  reporting: reportingRouter,
});

export type AppRouter = typeof appRouter;
