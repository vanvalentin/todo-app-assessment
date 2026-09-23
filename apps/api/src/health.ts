import {
  livenessResponseSchema,
  readinessResponseSchema,
  type LivenessResponse,
  type ReadinessResponse,
} from "@ksat/contracts";
export type DependencyName = "postgres" | "redis" | "s3";
export type DependencyState = "ok" | "degraded" | "down";

export type DependencyCheck = (signal: AbortSignal) => Promise<void>;
export type HealthChecks = Readonly<Record<DependencyName, DependencyCheck>>;

export interface DependencyResult {
  status: DependencyState;
  latencyMs: number;
}

export interface ReadinessResult {
  ready: boolean;
  checks: Record<DependencyName, DependencyResult>;
}

const dependencyNames: readonly DependencyName[] = ["postgres", "redis", "s3"];

export async function runReadinessChecks(
  checks: HealthChecks,
  timeoutMs: number,
): Promise<ReadinessResult> {
  const results = await Promise.all(
    dependencyNames.map(async (name): Promise<[DependencyName, DependencyResult]> => {
      const controller = new AbortController();
      const startedAt = performance.now();
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const check = checks[name];
        const timeout = new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(new Error("health check timed out"));
          }, timeoutMs);
        });
        await Promise.race([check(controller.signal), timeout]);
        return [name, { status: "ok", latencyMs: Math.round(performance.now() - startedAt) }];
      } catch (error) {
        const message = error instanceof Error ? error.message : "health check failed";
        return [
          name,
          {
            status: message === "health check timed out" ? "degraded" : "down",
            latencyMs: Math.round(performance.now() - startedAt),
          },
        ];
      } finally {
        if (timer !== undefined) clearTimeout(timer);
      }
    }),
  );

  // Object.fromEntries cannot retain the finite dependency-name union through inference.
  const checksByName = Object.fromEntries(results) as Record<DependencyName, DependencyResult>;
  return {
    ready: dependencyNames.every((name) => checksByName[name].status === "ok"),
    checks: checksByName,
  };
}

export function liveHealthResponse(now = new Date()): LivenessResponse {
  return livenessResponseSchema.parse({
    status: "ok",
    service: "api",
    timestamp: now.toISOString(),
  });
}

export function readyHealthResponse(result: ReadinessResult, now = new Date()): ReadinessResponse {
  return readinessResponseSchema.parse({
    status: result.ready ? "ok" : "down",
    service: "api",
    timestamp: now.toISOString(),
    checks: result.checks,
  });
}

export function unavailableHealthChecks(
  reason = "dependency check is not configured",
): HealthChecks {
  const check = async (): Promise<void> => {
    throw new Error(reason);
  };
  return { postgres: check, redis: check, s3: check };
}
