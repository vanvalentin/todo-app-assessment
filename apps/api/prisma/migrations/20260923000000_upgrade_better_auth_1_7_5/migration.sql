-- Better Auth 1.7.5 requires verification timestamps on every record.
-- Backfill first so an existing phase-2 database can be upgraded safely.
UPDATE "verification"
SET
  "createdAt" = COALESCE("createdAt", CURRENT_TIMESTAMP),
  "updatedAt" = COALESCE("updatedAt", "createdAt", CURRENT_TIMESTAMP)
WHERE "createdAt" IS NULL OR "updatedAt" IS NULL;

ALTER TABLE "verification"
  ALTER COLUMN "createdAt" SET NOT NULL,
  ALTER COLUMN "updatedAt" SET NOT NULL;
