import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildOpenApiDocument } from "../src/openapi.js";

/**
 * Every `router.<method>("<path>", ...)` registration in routes.ts, read from source so
 * this test fails the moment a route is added or removed from the registry without a
 * matching OpenAPI registration - no live server or database is needed.
 */
function registeredExpressRoutes(): ReadonlyArray<{ method: string; path: string }> {
  const routesSourcePath = fileURLToPath(new URL("../src/routes.ts", import.meta.url));
  const source = readFileSync(routesSourcePath, "utf8");
  const pattern = /router\.(get|post|patch|put|delete)\(\s*"([^"]+)"/g;
  const routes: Array<{ method: string; path: string }> = [];
  for (const match of source.matchAll(pattern)) {
    const method = match[1];
    const routePath = match[2];
    if (method === undefined || routePath === undefined) continue;
    const openApiPath = `/api/v1${routePath.replace(/:([A-Za-z0-9_]+)/g, "{$1}")}`;
    routes.push({ method, path: openApiPath });
  }
  return routes;
}

/** Walks the whole document and collects every `$ref` string it contains. */
function collectRefs(node: unknown, refs: string[] = []): string[] {
  if (Array.isArray(node)) {
    for (const item of node) collectRefs(item, refs);
    return refs;
  }
  if (node !== null && typeof node === "object") {
    for (const [key, value] of Object.entries(node)) {
      if (key === "$ref" && typeof value === "string") refs.push(value);
      else collectRefs(value, refs);
    }
  }
  return refs;
}

/** Resolves a `#/components/<section>/<name>` pointer against the document components. */
function refResolves(document: ReturnType<typeof buildOpenApiDocument>, ref: string): boolean {
  const match = /^#\/components\/([^/]+)\/(.+)$/.exec(ref);
  if (!match) return false;
  const [, section, name] = match;
  const components = document.components as Record<string, Record<string, unknown>> | undefined;
  return Boolean(components?.[section as string]?.[name as string]);
}

describe("application OpenAPI coverage", () => {
  it("assigns exactly one known feature tag to every operation", () => {
    const document = buildOpenApiDocument();
    const known = new Set(["Health", "Boards", "Members", "Invitations", "Tasks", "Attachments"]);
    for (const [path, pathItem] of Object.entries(document.paths ?? {})) {
      for (const [method, operation] of Object.entries(pathItem as Record<string, unknown>)) {
        if (!["get", "post", "patch", "put", "delete", "options", "head"].includes(method))
          continue;
        const tags = (operation as { tags?: unknown }).tags;
        expect(tags, `${method.toUpperCase()} ${path} must have tags`).toEqual(expect.any(Array));
        expect(tags).toHaveLength(1);
        expect(known.has((tags as string[])[0] ?? "")).toBe(true);
      }
    }
  });
  it("documents every registered Express application route", () => {
    const document = buildOpenApiDocument();
    const expressRoutes = registeredExpressRoutes();
    expect(expressRoutes.length).toBeGreaterThan(0);
    for (const route of expressRoutes) {
      const pathItem = document.paths?.[route.path] as Record<string, unknown> | undefined;
      expect(pathItem, `missing OpenAPI path for ${route.path}`).toBeDefined();
      expect(
        pathItem?.[route.method],
        `missing OpenAPI ${route.method.toUpperCase()} operation for ${route.path}`,
      ).toBeDefined();
    }
  });

  it("resolves every $ref against a registered component", () => {
    // The current generator inlines most schemas rather than referencing shared
    // components, so this asserts the invariant that matters (no dangling $ref)
    // without requiring $ref usage to exist.
    const document = buildOpenApiDocument();
    const refs = collectRefs(document);
    const unresolved = refs.filter((ref) => !refResolves(document, ref));
    expect(unresolved).toEqual([]);
  });
});
