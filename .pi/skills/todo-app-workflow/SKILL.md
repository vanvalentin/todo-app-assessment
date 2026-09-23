---
name: todo-app-workflow
description: Implements and reviews vertical slices in this Ksat repository, including React/Vite UI, Sass Modules, Express/Better Auth APIs, Prisma/PostgreSQL data, Redis jobs/cache, Docker Compose, Figma fidelity, authorization, and tests. Use whenever planning, coding, debugging, reviewing, or documenting application work in this repository.
compatibility: Requires the repository README and AGENTS.md; UI tasks require access to the Figma MCP.
---

# Ksat application workflow

Use this workflow for repository changes. `README.md` owns architecture and scope; `AGENTS.md` owns mandatory conventions. If this skill and those files conflict, follow `AGENTS.md` and the latest explicit user request.

## 1. Orient

1. Read `README.md` and `AGENTS.md`.
2. Inspect `git status`, relevant workspace manifests, neighboring implementation, tests, shared contracts, and Prisma schema/migrations.
3. Identify the delivery-plan phase and whether the request is an MVP requirement or a deferred prototype control.
4. Write concrete acceptance criteria. Include authorization and failure states, not only the happy path.

Do not scaffold an unrelated layer “for later”. Prefer the smallest end-to-end slice that leaves Compose and existing slices healthy.

## 2. Plan the vertical slice

Trace the feature through only the applicable layers:

```text
schema/migration -> shared Zod contract -> service/repository -> HTTP/OpenAPI
                 -> React query/form/UI -> Sass -> tests -> Compose/docs
```

Before coding, settle:

- actor and required board role;
- source of truth and invariants;
- request/response/error shapes;
- transaction and concurrency boundary;
- cache keys/invalidation or why no cache is appropriate;
- queue idempotency if work is asynchronous;
- pending, empty, validation, conflict, forbidden, and retry UI states;
- expected tests at unit, integration, and browser levels.

## 3. Add or change data safely

- Update Prisma schema and create a committed migration, including changes required by Better Auth.
- Treat Better Auth user/account/session/verification records as framework-owned; use its APIs rather than ad hoc writes.
- Use PostgreSQL constraints/indexes where possible.
- Plan data backfills before making an existing column required.
- Keep user-facing dates UTC in storage and explicit about timezone at recurrence boundaries.
- Use a transaction for dependency graphs, invites/memberships, board sequence numbers, and recurrence occurrences.
- Use deterministic factories/fixtures; do not make unit tests depend on wall-clock time or network services.

## 4. Contract and API

- Define Zod request, query, response, and Problem Details schemas for application endpoints in `packages/contracts`.
- Better Auth owns `/api/v1/auth/*` route contracts. Keep its version pinned, expose/link its generated route reference, and do not duplicate those routes with hand-written Zod handlers.
- Generate/update application OpenAPI from shared schemas.
- Parse input at the route boundary, invoke a service, and map the result. Do not place business rules in Express handlers.
- Authorize board resources in the service/repository query itself to prevent IDOR.
- Return stable problem codes with correct statuses (`400/422`, `401`, `403`, `404`, `409`, `429`).
- Add Supertest coverage for success, invalid input, unauthenticated, forbidden, not found, and conflict behavior as applicable.

## 5. React and Sass

- Use the Better Auth React client for credential/session and future social-login flows; do not place tokens in browser storage or create a parallel auth client.
- Use TanStack Query for application API state, React Hook Form for forms, and URL parameters for linkable search/filter/sort state.
- Consume inferred shared contract types; do not hand-copy DTOs.
- Use existing UI components and design tokens before adding variants.
- Put component styles in `ComponentName.module.scss`; use `@use`, CSS custom properties, shallow nesting, and mobile-first queries.
- Do not introduce Tailwind or CSS-in-JS.
- Include semantic labels, focus behavior, keyboard access, reduced-motion support, and non-color indicators.
- Implement explicit loading, empty, error, retry, stale/conflict, and success states.

## 6. Figma procedure for visual work

1. Load the Figma design-to-code guidance.
2. Find the exact frame ID in `README.md`.
3. Call Figma `get_design_context` with `resource:figma-design-to-code` and a screenshot enabled.
4. If context is sparse, request visible child nodes; inspect existing local assets/components before editing.
5. Download required static assets into a stable repository path. Never commit temporary Figma URLs.
6. Translate the reference to semantic responsive layout rather than pasting generated absolute positioning.
7. Render and compare at the frame dimensions, then verify narrow and intermediate widths.
8. Check every visible in-scope asset, typography, spacing, border, state, and interaction. Note out-of-scope prototype behavior rather than silently implementing it.

Product requirements override prototype vocabulary and behavior where they conflict.

## 7. Better Auth, background work, Redis, and attachments

For identity work, configure Better Auth in Express with its Prisma adapter, Argon2id hash/verify callbacks, opaque cookies, public base URL, trusted origins, proxy handling, and Redis secondary-storage adapter where supported by the pinned version. Add social providers only through validated optional environment variables. Key identities by provider + provider account ID and never auto-link solely on matching email. Application services remain responsible for board/task authorization.

For Redis caches, define a namespaced key, bounded TTL, invalidation triggers, and database fallback. Never cache a result before authorization.

For BullMQ jobs, define a stable job identity, idempotency record/key, retry/backoff policy, logging context, and terminal-failure behavior. Test duplicate delivery and controlled time.

For attachments, enforce board/task authorization, configured size caps, safe media handling, generated object keys, checksum/metadata persistence, and cleanup compensation. Tests must not require public object access.

## 8. Verify

Run focused tests while iterating, followed by all applicable repository gates:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

When infrastructure changed, also run the relevant Compose build/start, migration, health check, and smoke path. When UI changed, verify in a real browser against the Figma screenshot and include accessibility checks.

Review `git diff` for unrelated edits, secrets, generated output, temporary assets, migration mistakes, and contract/OpenAPI drift.

## 9. Finish

Update `README.md`, `.env.example`, operational notes, and API documentation when the change affects architecture, configuration, ports, commands, or behavior.

Report concisely:

- what changed and the main files;
- migrations/configuration or rollout steps;
- checks run and their result;
- any exact blocker or intentionally deferred follow-up.
