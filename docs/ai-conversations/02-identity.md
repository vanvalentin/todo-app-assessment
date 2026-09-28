# 02 — Identity

**Goal:** sign-up, sign-in, sessions and sign-out with Better Auth, matching the Figma auth screen.

---

**Me:** Your goal is to implement phase 2 of the project. Use the docs and the existing structure. Make a detailed plan, then execute it by launching sub-agents to work in parallel (if appropriate). After the work, validate that it works as intended and launch an independent review.

**Agent — plan (condensed):**

1. **Persistence:** Better Auth `User`/`Account`/`Session`/`Verification` via a committed migration; case-insensitive email; Argon2id; server-generated avatar seed.
2. **API:** mounted at `/api/v1/auth`; opaque cookie sessions; Redis secondary storage with PostgreSQL fallback; trusted origins, cookie security and rate limits from env.
3. **Failure behaviour:** bad input, duplicate sign-up, wrong credentials and Redis outages must not leak account existence or internals.
4. **UI:** responsive auth screen from Figma; validation, pending states, session restore, logout, keyboard support.
5. **Ops/tests:** env examples, docs, migration check, full quality gates, desktop and narrow-width checks.

Backend and frontend were built by two sub-agents in separate Git worktrees, then integrated.

**Agent — result (condensed):**

- `pnpm audit` flagged the Better Auth version a sub-agent had pinned. Upgraded to **1.7.5**, with a follow-up migration for the schema change.
- Unknown user and wrong password return **identical 401 bodies**; the avatar seed is generated server-side and client-supplied seeds are rejected.
- Avatars are generated from a bundled library, so there are no runtime third-party requests.
- `docker compose up --build` gives all services healthy; smoke test: sign-up → Argon2id hash in the DB → cookie session → sign-out.

---

**Me:** Could you run a new verification?

**Agent (condensed):** An independent reviewer found no blocking issues and two items, both fixed:

| Finding                                                     | Fix                                                                                       |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Password max length differed between UI (128) and API (256) | Aligned the shared schema to 256                                                          |
| `role="tab"` without tab panels or arrow keys               | Changed to a `radiogroup` with roving tabindex, arrow/Home/End keys and a regression test |

**Me:** How I run and delegate agent work should be up to whoever works on this project. Either git-ignore the rules you've set or put them somewhere outside the project so they don't get committed.

**Agent:** Removed the personal delegation preference from the repository `AGENTS.md` and moved it to my user-level agent config.

---

## Understanding the library

**Me:** What is the "secondary storage write" into Redis when calling sign-up?

**Agent (condensed):** Sign-up signs the user in, and Better Auth mirrors the new **session** into Redis (session key plus a per-user session list, with TTLs) so later session lookups can skip PostgreSQL. Our code only provides the storage adapter.

**Me:** When and how is the "verification" table used?

**Agent (condensed):** Not at the moment. It's Better Auth's store for short-lived one-time tokens (email verification, password reset, OAuth state). None of the phase 2 flows write to it, but Better Auth expects the table to exist.
