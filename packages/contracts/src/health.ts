import { z } from "zod";

const isoTimestampSchema = z.string().datetime({ offset: true });

export const healthStatusSchema = z.enum(["ok", "degraded", "error", "down"]);

export const healthCheckSchema = z
  .object({
    status: healthStatusSchema,
    latencyMs: z.number().int().nonnegative().optional(),
    message: z.string().min(1).optional(),
  })
  .strict();

export const dependencyStatusSchema = z.enum(["up", "down", "timeout"]);

export const dependencyCheckSchema = z
  .object({
    status: dependencyStatusSchema,
  })
  .strict();

export const healthResponseSchema = z
  .object({
    status: healthStatusSchema,
    service: z.string().min(1).optional(),
    version: z.string().min(1).optional(),
    timestamp: isoTimestampSchema,
    requestId: z.string().min(1).optional(),
    checks: z.record(healthCheckSchema).optional(),
    dependencies: z.record(dependencyCheckSchema).optional(),
  })
  .strict();

export const livenessResponseSchema = healthResponseSchema
  .omit({ checks: true })
  .extend({ status: z.literal("ok") });

export const readinessResponseSchema = healthResponseSchema
  .extend({
    checks: z.record(healthCheckSchema).optional(),
    dependencies: z.record(dependencyCheckSchema).optional(),
  })
  .refine(({ checks, dependencies }) => checks !== undefined || dependencies !== undefined, {
    message: "Readiness responses must include dependency checks.",
    path: ["checks"],
  });

export type HealthStatus = z.infer<typeof healthStatusSchema>;
export type HealthCheck = z.infer<typeof healthCheckSchema>;
export type DependencyStatus = z.infer<typeof dependencyStatusSchema>;
export type DependencyCheck = z.infer<typeof dependencyCheckSchema>;
export type HealthResponse = z.infer<typeof healthResponseSchema>;
export type LivenessResponse = z.infer<typeof livenessResponseSchema>;
export type ReadinessResponse = z.infer<typeof readinessResponseSchema>;
