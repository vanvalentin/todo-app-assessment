import { z } from "zod";

export const problemCodeSchema = z
  .string()
  .min(1)
  .regex(/^[A-Za-z][A-Za-z0-9_.-]*$/);

export const problemDetailsSchema = z
  .object({
    type: z.string().min(1),
    title: z.string().min(1),
    status: z.number().int().min(400).max(599),
    detail: z.string().min(1).optional(),
    instance: z.string().min(1).optional(),
    code: problemCodeSchema,
    requestId: z.string().min(1),
  })
  .strict();

export const problemContentType = "application/problem+json" as const;

export type ProblemCode = z.infer<typeof problemCodeSchema>;
export type ProblemDetails = z.infer<typeof problemDetailsSchema>;
