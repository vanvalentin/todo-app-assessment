import { spawnSync } from "node:child_process";
import { Console } from "node:console";
import process from "node:process";

const logger = new Console(process.stdout, process.stderr);

const shadowDatabaseUrl = process.env.SHADOW_DATABASE_URL;
if (!shadowDatabaseUrl) {
  logger.error("SHADOW_DATABASE_URL is required for the migration-diff check.");
  process.exit(1);
}

const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const args = [
  "exec",
  "prisma",
  "migrate",
  "diff",
  "--from-migrations",
  "prisma/migrations",
  "--to-schema-datamodel",
  "prisma/schema.prisma",
  "--shadow-database-url",
  shadowDatabaseUrl,
  "--script",
];
// Windows resolves pnpm through a .cmd shim, which Node only spawns with a shell.
// The shell path passes one quoted command instead of an argument array.
const result =
  process.platform === "win32"
    ? spawnSync(`${pnpm} ${args.map((argument) => `"${argument}"`).join(" ")}`, {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        shell: true,
      })
    : spawnSync(pnpm, args, {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        shell: false,
      });

if (result.error) {
  logger.error(result.error.message);
  process.exit(1);
}
if (result.status !== 0) {
  process.stderr.write(result.stderr);
  process.stdout.write(result.stdout);
  process.exit(result.status ?? 1);
}

const unsupportedRawSql = [
  /^DROP INDEX "board_invitation_pending_board_email_key";$/,
  /^ALTER TABLE "board" DROP CONSTRAINT "board_name_not_empty";$/,
  /^ALTER TABLE "task" DROP CONSTRAINT "task_name_not_empty";$/,
  // Composite FKs enforcing "assignee/reporter is a member of this task's own board";
  // Prisma cannot express a composite relation through a required local column
  // (task.boardId), so these exist only in the committed migration (phase 4b).
  /^ALTER TABLE "task" DROP CONSTRAINT "task_assignee_board_membership_fkey";$/,
  /^ALTER TABLE "task" DROP CONSTRAINT "task_reporter_board_membership_fkey";$/,
  // pg_trgm-backed search index (phase 4c); no postgresqlExtensions preview is
  // enabled, so both the extension and the index are raw SQL only.
  /^DROP INDEX "task_name_trgm_idx";$/,
  /^DROP EXTENSION "pg_trgm";$/,
  // Description length and no-self-dependency CHECK constraints (phase 5a).
  /^ALTER TABLE "task" DROP CONSTRAINT "task_description_length";$/,
  /^ALTER TABLE "task_dependency" DROP CONSTRAINT "task_dependency_not_self";$/,
  // Prisma derives relation constraint names from field names; the committed SQL
  // uses concise names, so these are harmless schema-diff renames.
  /^ALTER TABLE "attachment" RENAME CONSTRAINT "attachment_task_fkey" TO "attachment_taskId_fkey";$/,
  /^ALTER TABLE "attachment" RENAME CONSTRAINT "attachment_uploader_fkey" TO "attachment_uploaderId_fkey";$/,
  /^ALTER TABLE "schedule_occurrence" RENAME CONSTRAINT "schedule_occurrence_schedule_fkey" TO "schedule_occurrence_scheduleId_fkey";$/,
  /^ALTER TABLE "schedule_occurrence" RENAME CONSTRAINT "schedule_occurrence_task_fkey" TO "schedule_occurrence_generatedTaskId_fkey";$/,
  /^ALTER TABLE "task_schedule" RENAME CONSTRAINT "task_schedule_task_fkey" TO "task_schedule_taskId_fkey";$/,
];
const unexpected = result.stdout
  .split("\n")
  .map((line) => line.trim())
  .filter((line) => line.length > 0 && !line.startsWith("--"))
  .filter((line) => !unsupportedRawSql.some((pattern) => pattern.test(line)));

if (unexpected.length > 0) {
  logger.error("Prisma migration drift detected:");
  logger.error(unexpected.join("\n"));
  process.exit(1);
}

logger.log("Prisma schema matches committed migrations (raw SQL-only invariants allowlisted).");
