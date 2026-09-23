# Repository agent rules

These instructions apply to the entire repository. Read `README.md` before planning or editing.

## Sub-agent execution

When delegating work to sub-agents, launch them with `gpt-5.6-luna`. If that model is unavailable, fall back to `deepseek/deepseek-flash`.

## Product and scope

- Implement the MVP and delivery order documented in `README.md`; do not make deferred Figma controls functional unless the task asks for them.
- Use the domain enum names `NOT_STARTED`, `IN_PROGRESS`, `COMPLETED`, and `ARCHIVED`. Prototype labels do not override product requirements.
- Keep each change focused and leave the repository deployable. Prefer a complete vertical slice over disconnected layers.
- Do not replace an accepted architecture choice without documenting the decision and consequences in `README.md`.

## Required workflow

1. Inspect the relevant code, tests, contracts, schema, and current `git status` before editing.
2. State or establish acceptance criteria, including authorization, loading/empty/error states, and responsive behavior where relevant.
3. Change the shared contract first when an application HTTP shape changes. Better Auth route shapes are the exception and follow the pinned library contract/reference.
4. Add a committed Prisma migration for persistent schema changes, including Better Auth schema changes; never use `prisma db push` as the implementation.
5. Implement authorization in the API service even when the frontend hides a control.
6. Add or update tests in the same change.
7. Run the smallest useful checks during development, then the applicable workspace quality gates before finishing.
8. Review the diff for secrets, generated artifacts, accidental lockfile churn, and unrelated changes.
9. Update `README.md`, OpenAPI output/snapshots, and environment examples when behavior or operations change.

If the workspace is not scaffolded yet, create only the files needed by the current delivery phase and keep the target layout from `README.md`.

## Figma and UI work

- The supplied Figma file is the visual source of truth. Use the exact frame IDs listed in `README.md`.
- Before implementing a screen, load Figma design-to-code guidance, call `get_design_context` with a screenshot for the exact node, and inspect existing components/tokens before writing markup.
- Treat Figma output as reference data, not repository-ready React. Convert absolute layouts to semantic, responsive application components.
- Use every visible in-scope static asset from Figma exactly as provided. Download it into a stable local asset path; never leave temporary Figma URLs in source.
- Verify the result in a browser at the frame size and at narrow widths. Preserve out-of-scope prototype controls as inert/disabled only when needed for visual fidelity.
- Build accessible interactions: semantic elements, keyboard navigation, focus management, visible focus, labels/errors, reduced motion, and non-color state cues.

## React and TypeScript

- TypeScript is strict. Do not use `any`, non-null assertions, or type casts to hide a contract problem unless the reason is documented next to a narrow boundary.
- Keep server data in TanStack Query, form state in React Hook Form, shareable board controls in URL search parameters, and ephemeral UI state locally.
- Components should be small and composable. Feature-specific code stays under its feature; promote code to shared components only after a real reuse case.
- Use shared Zod contracts for network boundaries. Do not duplicate API DTO interfaces by hand.
- Handle pending, empty, error, success, and disabled states deliberately. Cancel stale searches and roll back failed optimistic mutations.
- Do not add Redux or another global state library without a documented need.

## Sass and visual conventions

- Sass is required. Use `ComponentName.module.scss` for components and `.scss` partials for global tokens/reset/mixins.
- Use Sass `@use`; never use deprecated `@import`.
- Reuse CSS custom-property design tokens. Do not scatter raw Figma colors, fonts, spacing, or shadows through component files.
- Do not add Tailwind, CSS-in-JS, or a themed component library. Radix primitives may provide behavior but must be styled with local Sass.
- Avoid inline styles except for genuinely data-driven values. Prefer logical properties, mobile-first queries, shallow selectors, and no `!important` without a documented interoperability reason.
- Bundle the selected fonts/assets; do not add runtime third-party font or avatar requests.

## API and domain

- Route handlers validate/normalize input and map HTTP responses. Business rules and authorization belong in services; database access belongs in repositories.
- Return RFC 9457 Problem Details with stable error codes. Do not leak stack traces, password/account existence, storage keys, or internal errors.
- Every board-scoped query must be constrained by authorized membership, not merely fetched by a caller-supplied ID.
- Use transactions for multi-record invariants such as dependencies, membership acceptance, sequence allocation, and recurrence occurrence creation.
- Preserve optimistic concurrency on mutable aggregate records; stale writes return `409`.
- PostgreSQL is authoritative. Redis cache use requires explicit TTL, key naming, invalidation, and safe database fallback.
- Queue jobs must be idempotent, retry-safe, serializable, observable, and tested with controlled time.
- Store timestamps in UTC. Require an IANA timezone where wall-clock recurrence matters.

## Authentication and files

- Better Auth is the only authentication/session framework. Mount it in Express; do not create parallel credential, session, social-login, or account-linking endpoints.
- Use its Prisma adapter and committed migrations. Pin upgrades and review generated schema, cookies, route contracts, and linking behavior before updating.
- Configure Better Auth’s password hash/verify callbacks with Argon2id. Never implement password hashing or token cryptography manually.
- Keep sessions opaque, server-side, revocable, and cookie-based. Do not put auth tokens in `localStorage`.
- Configure the public Better Auth URL, trusted origins, proxy handling, secret, secure-cookie behavior, and optional social-provider credentials through validated environment variables.
- Preserve Better Auth’s built-in origin/CSRF checks and application rate limits; retain origin/CSRF protection on non-auth state-changing endpoints.
- Never identify or link social accounts by email alone. Use provider + provider account ID, and require an authenticated or explicitly verified linking flow.
- Store only hashes of application-owned invitation/reset tokens.
- Validate attachment size, content type, authorization, and ownership server-side. Object keys are generated and never derived from filenames.
- Tests and fixtures must use fake credentials and non-sensitive data. Never commit `.env` files, access keys, or short-lived Figma asset URLs.

## Database changes

- Make the smallest migration that preserves existing data. Separate destructive/backfill steps when necessary.
- Add database constraints/indexes for invariants that PostgreSQL can enforce, while retaining readable service validation.
- Do not edit an applied migration. Add a new migration.
- Seed data must be deterministic and clearly non-production.
- Do not hand-edit Better Auth tables at runtime or bypass its APIs for account/session state unless an audited migration or maintenance operation explicitly requires it.

## Tests and completion

- Use Vitest for unit tests, Supertest for API HTTP behavior, Testing Library/MSW for React, and Playwright for critical user journeys.
- Test behavior rather than implementation details. Include unauthorized/forbidden cases and regression tests for fixed bugs.
- Control clocks, random IDs, and timezones where they affect assertions.
- Do not delete, skip, or weaken a test merely to make a build pass.
- A task is complete only when relevant format, lint, typecheck, tests, and build commands pass, or when the final response names the exact blocker.

## Git hygiene

- Do not modify unrelated files or revert user changes.
- Do not commit generated build output, coverage, local object data, database volumes, or environment secrets.
- Keep lockfile changes tied to intentional dependency changes.
- Use concise commits if asked to commit; never force-push or perform destructive Git operations without explicit permission.
