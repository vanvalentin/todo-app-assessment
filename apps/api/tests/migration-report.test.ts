import { describe, expect, it } from "vitest";
import {
  buildMigrationReport,
  findRiskyStatements,
  parseNameStatus,
  reportMarker,
} from "../scripts/migration-report.js";

const dir = "apps/api/prisma/migrations";

describe("migration PR report", () => {
  it("lists new migrations that will run on production and flags breaking SQL", () => {
    const changes = parseNameStatus(
      [
        `A\t${dir}/20280101000000_task_labels/migration.sql`,
        `A\t${dir}/20280201000000_drop_legacy/migration.sql`,
        "M\tapps/api/src/app.ts",
      ].join("\n"),
    );
    const sql: Record<string, string> = {
      [`${dir}/20280101000000_task_labels/migration.sql`]:
        'CREATE TABLE "Label" ("id" UUID);\n-- DROP TABLE is only mentioned here',
      [`${dir}/20280201000000_drop_legacy/migration.sql`]:
        'ALTER TABLE "Task" DROP COLUMN "legacy";\nALTER TABLE "Task" ALTER COLUMN "name" SET NOT NULL;',
    };

    const report = buildMigrationReport(changes, (file) => sql[file] ?? "");

    expect(report.editedExisting).toEqual([]);
    expect(report.added.map((migration) => migration.name)).toEqual([
      "20280101000000_task_labels",
      "20280201000000_drop_legacy",
    ]);
    expect(report.added[0]?.risks).toEqual([]);
    expect(report.markdown.startsWith(reportMarker)).toBe(true);
    expect(report.markdown).toContain("**2 migration(s)**");
    expect(report.markdown).toContain("`DROP COLUMN` (line 1)");
    expect(report.markdown).toContain("`SET NOT NULL` (line 2)");
  });

  it.each([
    ["M", `${dir}/20270601000000_task_search/migration.sql`, "modified"],
    ["D", `${dir}/20270601000000_task_search/migration.sql`, "deleted"],
    [
      "R100",
      `${dir}/20270601000000_task_search/migration.sql\t${dir}/20270602000000_renamed/migration.sql`,
      "renamed",
    ],
  ])("rejects an edit to a committed migration (%s)", (code, paths, status) => {
    const report = buildMigrationReport(parseNameStatus(`${code}\t${paths}`), () => "");

    expect(report.editedExisting).toHaveLength(1);
    expect(report.editedExisting[0]?.status).toBe(status);
    expect(report.markdown).toContain("must not be edited");
  });

  it("detects column type changes and ignores commented-out statements", () => {
    expect(
      findRiskyStatements(
        'ALTER TABLE "Task" ALTER COLUMN "priority" SET DATA TYPE TEXT;\n-- TRUNCATE "Task";',
      ).map((risk) => risk.label),
    ).toEqual(["ALTER COLUMN ... TYPE"]);
  });
});
