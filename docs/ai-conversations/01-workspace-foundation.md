# 01 — Workspace foundation

**Goal:** a runnable monorepo skeleton with quality gates and a healthy Docker Compose stack, with no product features yet.

---

**Me:** You are in charge of setting up the workspace foundation. Plan it based on the repo's existing documentation, and launch sub-agents (in parallel if possible).

**Agent (condensed):**

- **Acceptance criteria:** pinned pnpm workspace; strict TypeScript/ESLint/Prettier; minimal React, Express and worker entry points; validated environment config; RFC 9457 errors; live/ready health endpoints; Compose wiring with a migration step; baseline tests.
- Three planning sub-agents reviewed the scope, then three implementation sub-agents worked in parallel with **strict file ownership** (workspace/contracts, API, web/Compose) so they never edited the same manifest or lockfile.
- During integration the agent removed a stray package-manager artifact left by a sub-agent and fixed cross-package TypeScript issues.
- Verified the delivery path itself: frozen-lockfile container builds, idempotent migrations, `/health/ready` checking PostgreSQL/Redis/MinIO, Nginx proxying, non-root containers. A final sub-agent reviewed the integrated diff.

**Me:** Do we have instructions on how to run the full project locally?

**Agent:** Yes. `README.md` → _Local deployment_ (`cp .env.example .env && docker compose up --build`), with the local URLs listed.

---

**Me:** As this is an assessment for a job, can you add a folder that will contain Markdown files about the implementation of every phase? That folder should be git-ignored. Also add the phase 1 file. The files MUST be short and to the point, with one or more diagrams. Bullet points are highly encouraged.

**Me:** Can you add a guideline for future Markdown files in this folder?

**Agent:** Added the private `phase-notes/` folder, a phase 1 note with four Mermaid diagrams, and a `README.md` with naming, length (~120 lines), diagram and section rules.

---

## Rename

**Me:** I would like to rename the app "Ksat". Any relevant copy, docs, variables etc. need to be renamed.

**Agent:** Renamed the UI copy, package scopes (`@ksat/*`), Compose project, database and bucket defaults, Problem Details URLs, env examples and docs. `pnpm check` passes.

**Me:** What's the best tool I can use to browse this project's DB?

**Agent:** Prisma Studio once models exist, or `docker compose exec postgres psql` for raw inspection.
