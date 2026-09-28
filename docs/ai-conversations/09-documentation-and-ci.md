# 09 — Documentation and CI

**Goal:** make the repository easy for a reviewer to run and understand, and keep CI green.

---

**Me:** Considering the assessment instructions, the current README is way too long and goes into too much detail on each phase. I want to completely revamp it to match what's asked in the assessment, and describe only the project's final (current) state.

**Agent:** Rewrote `README.md` from 739 to about 170 lines, organised around the brief's deliverables (running locally, architecture, features mapped to requirements, API, testing), with no phase history.

**Me:** Put "Running locally" as the first section and Architecture second (and put the detailed repo layout back). In API, add a link to the local Swagger page. Add an AI section.

---

**Me:** Do you think the architecture diagram can be more detailed? I'd love to add more diagrams for the different parts (database, task lifecycle, auth/users, recurring tasks...), maybe in other file(s)?

**Agent:** Added a more detailed overview diagram in the README, and 11 diagrams in [`docs/architecture.md`](../architecture.md): request pipeline, data model, auth, invitations, task lifecycle, dependencies, recurrence, attachments and cleanup, and so on.

**Me:** I see worker → Redis. Is that correct? Who calls the worker?

**Agent (condensed):** Nothing calls the worker; it has no HTTP endpoint. Compose starts it, and its own timer polls PostgreSQL for unfinished cleanups every 30 s, then enqueues them in Redis. The **API never talks to the queue**: it only writes an outbox row in the same transaction as the delete. Every Redis connection is opened by the worker, so under the diagram's rule (arrows point from the caller) worker → Redis is correct.

**Me:** So wouldn't it be more like Worker ↔ Redis?

**Agent (condensed):** That depends on what the arrows mean. `↔` would describe the data flow (jobs written, then read back). The important thing is to use **one convention per diagram**. Walked through an example of a user removing an attachment, drawn both ways.

---

**Me:** For the local seed, should we give the user credentials, or can they find them in the seed script?

**Agent:** Put them in the README. Reviewers shouldn't have to read `seed.ts` to log in. They are clearly fake, local-only accounts.

---

**Me:** The CI on GitHub keeps failing at the Playwright journeys.

**Agent (condensed):**

- The job failed **before Playwright started**: the pinned MinIO image could no longer be pulled (registry `unauthorized`, old binary URLs `410 Gone`).
- Also found that CI never seeded the demo account used by the recurrence journey.
- Fix: build the pinned MinIO release from its upstream commit and cache the binary, verify the bucket with a real upload/read/delete, and seed the fixtures.
- All 11 Playwright tests passed locally, and the CI run went green (quality gates, integration tests, Playwright).
