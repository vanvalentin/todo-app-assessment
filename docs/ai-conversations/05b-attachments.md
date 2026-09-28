# 05b — Attachments

**Goal:** private file attachments on tasks.

---

**Me:** Plan for phase 5b. The modals: _[screenshot]_

**Agent — plan (condensed):**

- Private MinIO (S3) storage. Object keys are generated and **never derived from filenames**.
- Server-side content-type detection, checksums, and 10 MiB per file / 50 MiB per task limits.
- Board-scoped authorization. Attachments on other boards return `404`.
- A **cleanup outbox** table and an idempotent BullMQ job that deletes objects after the metadata row is removed.
- Modal UI: staged uploads before the task exists, progress, retry, and an "Attached specs & files" section with a usage cap.

**Me:** Execute the plan.

---

**Me:** Getting a 500 on `GET /tasks/:id/attachments`. _[API log]_

**Agent:** The new attachment migration hadn't been applied to the local database. Run `prisma migrate deploy`.

**Me:** Shouldn't the migration run when I do `pnpm dev`?

**Agent:** Added `prisma migrate deploy` to the API `predev` hook.

**Me:** But is that good practice in dev?

**Agent (condensed):** Generally no. It makes start-up depend on the database, hides schema changes, and `migrate deploy` belongs to deployment jobs. Reverted it. Migrations stay an explicit step, and Compose runs them in its one-shot `migrate` service.

**Me:** Commit.
