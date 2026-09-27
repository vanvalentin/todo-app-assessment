import { Prisma, PrismaClient } from "@prisma/client";
import { loadEnvironment } from "./config/env.js";

const taskId = process.argv[2];
if (!taskId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(taskId)) {
  console.error("Usage: task:restore <task-uuid>");
  process.exitCode = 2;
} else {
  const environment = loadEnvironment();
  const prisma = new PrismaClient({ datasources: { db: { url: environment.DATABASE_URL } } });
  try {
    const statement = Prisma.sql`
      UPDATE "task"
      SET "deletedAt" = NULL, "version" = "version" + 1
      WHERE "id" = ${taskId} AND "deletedAt" IS NOT NULL
    `;
    const restored = await prisma.$executeRaw(statement);
    if (restored !== 1) {
      console.error("No deleted task was found for that id.");
      process.exitCode = 1;
    } else {
      console.log(
        `Restored task ${taskId}. Related dependencies, attachments, and recurrence metadata were retained.`,
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}
