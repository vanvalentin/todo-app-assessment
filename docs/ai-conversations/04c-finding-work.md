# 04c — Finding work

**Goal:** search, filter, sort and archive on large boards.

---

**Me:** Plan for phase 4c. _(then)_ Execute the plan.

**Agent (condensed):**

- Search, filters, sort and "show archived" live in **URL search parameters**, so a view can be shared.
- PostgreSQL `pg_trgm` index for name search, and **keyset pagination** instead of offsets.
- Archive/restore with an Archived column that is hidden by default.
- Optimistic updates reconcile every cached filtered list. Stale searches are cancelled.
- Contract, API, integration, component and browser tests.

**Me:** No diagram in the phase notes?

**Agent:** Added a flow diagram: URL → web → API → repository → PostgreSQL, plus the archive mutations and cache reconciliation.

---

## Test strategy discussion

**Me:** Do you think writing all these tests, especially the frontend ones, is worth it, considering they're written by AI anyway? Do they help the AI deliver something better? Would they increase token usage?

**Agent (condensed):**

- **Yes, but only some.** An agent has no memory between sessions, so tests are how it knows whether it's done and whether it broke something.
- Tests that check **behaviour** (authorization, conflicts, optimistic rollback, keyboard interactions) pay off. Static-markup, snapshot and implementation-detail tests only cost tokens and make refactoring harder.
- Suggested removing the noisy tests and writing the policy down.

**Me:** Do that and just remove the noise. Also detail what should and shouldn't be tested in `AGENTS.md`.

**Agent:** Removed 7 of 91 web tests (static markup and duplicates), and added a _What to test_ section to `AGENTS.md`. Commits: `test(web): drop static-markup and duplicate tests`, `docs(agents): define what tests to write`.
