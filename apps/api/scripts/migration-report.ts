/**
 * Builds the PR comment that tells reviewers which Prisma migrations will run on
 * production when the pull request merges to master.
 *
 * Usage (CI): tsx scripts/migration-report.ts <base-sha> <head-sha> <output.md>
 * Exit code 1 means an already-committed migration was edited, renamed or deleted.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export const reportMarker = "<!-- ksat-migration-report -->";
const migrationsPrefix = "apps/api/prisma/migrations/";

export interface MigrationChange {
  readonly status: "added" | "modified" | "deleted" | "renamed";
  readonly path: string;
}

export interface RiskyStatement {
  readonly label: string;
  readonly line: number;
}

interface AddedMigration {
  readonly name: string;
  readonly risks: readonly RiskyStatement[];
}

export interface MigrationReport {
  readonly added: readonly AddedMigration[];
  readonly editedExisting: readonly MigrationChange[];
  readonly markdown: string;
}

const statusByCode: Readonly<Record<string, MigrationChange["status"]>> = {
  A: "added",
  D: "deleted",
  R: "renamed",
};

/** Parses `git diff --name-status -M` output, keeping only migration files. */
export function parseNameStatus(output: string): MigrationChange[] {
  const changes: MigrationChange[] = [];
  for (const line of output.split(/\r?\n/)) {
    const [code, ...paths] = line.split("\t");
    const target = paths.at(-1);
    if (!code || !target) continue;
    if (!paths.some((file) => file.startsWith(migrationsPrefix))) continue;
    changes.push({ status: statusByCode[code.charAt(0)] ?? "modified", path: target });
  }
  return changes;
}

// Statements that break the code still running during a rolling deploy, or lock large tables.
const riskyPatterns: readonly { readonly label: string; readonly pattern: RegExp }[] = [
  { label: "DROP TABLE", pattern: /\bDROP\s+TABLE\b/i },
  { label: "DROP COLUMN", pattern: /\bDROP\s+COLUMN\b/i },
  { label: "RENAME", pattern: /\bRENAME\b/i },
  {
    label: "ALTER COLUMN ... TYPE",
    pattern: /\bALTER\s+COLUMN\s+"?\w+"?\s+(SET\s+DATA\s+)?TYPE\b/i,
  },
  { label: "SET NOT NULL", pattern: /\bSET\s+NOT\s+NULL\b/i },
  { label: "TRUNCATE", pattern: /\bTRUNCATE\b/i },
  { label: "DROP TYPE / enum value change", pattern: /\bDROP\s+TYPE\b/i },
];

export function findRiskyStatements(sql: string): RiskyStatement[] {
  const risks: RiskyStatement[] = [];
  sql.split(/\r?\n/).forEach((text, index) => {
    const code = text.replace(/--.*$/, "");
    for (const { label, pattern } of riskyPatterns) {
      if (pattern.test(code)) risks.push({ label, line: index + 1 });
    }
  });
  return risks;
}

function migrationName(file: string): string {
  return file.slice(migrationsPrefix.length).split("/")[0] ?? file;
}

export function buildMigrationReport(
  changes: readonly MigrationChange[],
  readSql: (file: string) => string,
): MigrationReport {
  const added = changes
    .filter((change) => change.status === "added" && change.path.endsWith("migration.sql"))
    .map((change) => ({
      name: migrationName(change.path),
      risks: findRiskyStatements(readSql(change.path)),
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
  const editedExisting = changes.filter((change) => change.status !== "added");

  const lines = [reportMarker, "### Database migrations"];
  if (added.length === 0 && editedExisting.length === 0) {
    lines.push("", "This pull request no longer adds migrations.");
  }
  if (added.length > 0) {
    lines.push(
      "",
      `Merging to \`master\` runs **${added.length} migration(s)** on production before the new version rolls out:`,
      "",
    );
    for (const migration of added) {
      lines.push(`- \`${migration.name}\``);
      for (const risk of migration.risks) {
        lines.push(`  - :warning: \`${risk.label}\` (line ${risk.line})`);
      }
    }
    if (added.some((migration) => migration.risks.length > 0)) {
      lines.push(
        "",
        "The previous version keeps serving traffic while the migration runs. Make risky changes in " +
          "backward-compatible steps (expand, deploy, then contract in a later release).",
      );
    }
  }
  if (editedExisting.length > 0) {
    lines.push(
      "",
      ":x: **Committed migrations must not be edited, renamed or deleted.** Add a new migration instead:",
      "",
      ...editedExisting.map((change) => `- ${change.status}: \`${change.path}\``),
    );
  }
  return { added, editedExisting, markdown: `${lines.join("\n")}\n` };
}

function main(argv: readonly string[]): number {
  const [base, head, output] = argv;
  if (!base || !head || !output) {
    process.stderr.write("Usage: migration-report <base-sha> <head-sha> <output.md>\n");
    return 2;
  }
  const repositoryRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], {
    encoding: "utf8",
  }).trim();
  const diff = execFileSync(
    "git",
    ["diff", "--name-status", "-M", `${base}...${head}`, "--", migrationsPrefix],
    { cwd: repositoryRoot, encoding: "utf8" },
  );
  const report = buildMigrationReport(parseNameStatus(diff), (file) =>
    readFileSync(path.join(repositoryRoot, file), "utf8"),
  );
  writeFileSync(output, report.markdown);
  process.stdout.write(report.markdown);
  return report.editedExisting.length > 0 ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
