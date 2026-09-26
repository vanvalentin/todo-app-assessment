import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const nginxConfig = readFileSync(
  resolve(fileURLToPath(new URL(".", import.meta.url)), "../../../docker/nginx.conf"),
  "utf8",
);

describe("proxy and migration operations", () => {
  it("overwrites forwarded client headers at the Nginx boundary", () => {
    expect(nginxConfig).toContain("proxy_set_header X-Forwarded-For $remote_addr;");
    expect(nginxConfig).not.toContain(
      "proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;",
    );
  });
});
