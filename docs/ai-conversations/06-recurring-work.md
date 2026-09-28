# 06 — Recurring work

**Goal:** recurring tasks on a schedule, correct across timezones.

---

**Me:** Plan for phase 6. I don't have a UI design, so you can improvise while matching our current style.

**Agent — plan (condensed):**

- The recurring task is the **template**. Generated occurrences start as `NOT_STARTED`, due on the occurrence's local calendar date, and copy name, description, priority and assignee, but **not** dependencies or attachments.
- Schedules are RFC 5545 RRULEs with an **IANA timezone**, so daylight-saving changes don't shift the wall-clock time.
- An idempotent worker: each occurrence has a unique key in the database, so a retried job can't create duplicates.
- A guided editor (daily/weekly/monthly/yearly) plus an advanced RRULE mode, pause/resume, and a preview of upcoming occurrences.

**Me:** Execute the plan.

---

**Me:** Can you check whether the phase 6 note matches the implementation? You can work on the follow-ups as well.

**Agent (condensed):** The audit found two runtime issues that unit tests had missed, and fixed them:

- BullMQ v5 rejects queue names containing `:`, so the worker could not start.
- The `rrule` package needed a different import under Node ESM.

Both are now covered by a real Redis + PostgreSQL worker smoke test and a seeded Playwright pause/resume journey. The note was updated to match what was verified.

**Me:** Commit.

**Agent:** `feat(recurring): deliver timezone-aware recurring tasks`.
