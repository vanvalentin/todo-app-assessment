# 00 — Architecture and agent rules

**Goal:** decide the architecture before writing code, and give future agents rules to follow.

---

**Me:**

> I want to create a TODO list web application. From backend to frontend. All needs to be deployable from a docker compose locally.
>
> The main features I want to have first:
>
> - Signup/login (with display name selection, and auto generated avatar)
> - Boards page, with list of boards user is part of
> - Task board with status Not Started, In Progress, Completed, Archived (hidden by default)
>   - filter, sort and search fields
> - Task creation/edition with fields: name, description (ability to attach files and images), due date, schedule (for recurring tasks), status, priority, assignee, reporter, dependencies (from other tasks), standard CRUD operations
> - Board settings UI, for member invitation for example
>
> The design should follow the Figma here: `<figma-url>`. Any feature in the design that I haven't mentioned yet doesn't need to be functional as of now.
>
> The tech I want to use and the ones I am open to discuss:
>
> - Frontend: React + Vite (other packages: open to suggestions)
> - Backend: PostgreSQL, Node.js with Express, unit tests, Redis for cache, API documentation, user auth (open to suggestions)
> - DevOps: Docker, GitHub Actions
>
> Your first goal is to prepare the ground for the development of this: make architectural decisions first and document them in a README. Also build rules and/or skills for future agent work.

**Me:** I prefer Sass for CSS.

**Agent:** Created `README.md` (scope, architecture, data model, security, API conventions, Compose topology, testing strategy, delivery roadmap), `AGENTS.md` (repository rules) and a project skill describing the delivery workflow. Stack: React/Vite, Sass Modules, Express REST, Prisma/PostgreSQL, Redis (sessions, cache, BullMQ), MinIO, Mailpit, Vitest and Playwright.

---

**Me:** "Microservices are unnecessary for this scope." Explain the reasoning behind this.

**Agent (condensed):**

- Features are tightly coupled (tasks ↔ boards ↔ members ↔ attachments) and need **single-database transactions**.
- Microservices would add deployments, service-to-service auth, distributed tracing and eventual consistency with no current benefit.
- A **modular monolith** keeps module boundaries (`auth`, `boards`, `tasks`, `attachments`) so a module can be extracted later.
- The worker is a separate process because background jobs scale differently, but it shares the codebase and database.
- Reasons to split later: independent teams, very different scaling needs, isolation/compliance requirements.

---

**Me:** Explain your choice of Argon2id for auth, and what other choices you considered, given we plan to allow social login in the future.

**Agent (condensed):**

- **Argon2id:** memory-hard, OWASP-recommended, self-describing hashes that allow re-hashing when parameters change.
- **Alternatives:** bcrypt (72-byte input limit, weaker against GPUs), scrypt (good fallback, built into Node), PBKDF2 (FIPS-friendly but not memory-hard).
- **Social login doesn't replace it:** OAuth users have no password. The model should separate `User` from its authentication methods so one user can have a password and several providers.
- Suggested **Better Auth** as a library-based option over hosted services (Auth0, Clerk) or heavy self-hosted ones (Keycloak).

**Me:** Does Better Auth fit into our Docker Compose architecture?

**Agent (condensed):** Yes. It's a library that runs inside the existing `api` container, so no new service is needed. PostgreSQL stores its tables via the Prisma adapter, Redis can be its secondary storage, and it accepts a custom Argon2id hash/verify function. OAuth callbacks must use the public URL, and trusted origins and cookie settings come from environment variables.

**Me:** OK, let's adopt Better Auth.

**Agent:** Updated `README.md`, `AGENTS.md` and the skill: Better Auth is the only auth framework, auth tables go through committed migrations, and accounts are never linked by email alone.

---

**Me:** What is the purpose of `.pi/skills/todo-app-workflow/SKILL.md`?

**Agent (condensed):** A project-specific agent skill that loads on demand. `README.md` holds the architecture, `AGENTS.md` the mandatory rules, and the skill the step-by-step workflow (vertical slices, Figma inspection, auth rules, quality checks).

**Me:** You can commit and push this to master.

**Agent:** Committed `docs: define application architecture and agent workflow`.
