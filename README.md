# Ksat

A collaborative TODO board application designed from the supplied [Figma file](https://www.figma.com/design/JxPLX0m5zrEJORwABJUyAp/Assesment---Sleekflow?node-id=0-1&p=f&t=IpEmKzygdgN2jYxJ-0).

> **Project status:** delivery phase 6 (recurring work) is complete; release hardening remains. Recurring schedules use validated RFC 5545 rules, explicit IANA timezones, PostgreSQL idempotency, and a BullMQ worker.

## Product scope

### MVP

- Sign up and log in with email, password, display name, and a locally generated avatar.
- List the boards the current user belongs to.
- Show a board as a Kanban view with `Not Started`, `In Progress`, and `Completed` columns.
- Keep `Archived` tasks hidden unless explicitly shown.
- Search tasks and filter/sort by assignee, priority, status, and due date.
- Create, read, update, archive, and delete tasks.
- Task fields:
  - name and Markdown description;
  - file/image attachments;
  - due date;
  - optional recurring schedule;
  - status and priority;
  - assignee and reporter;
  - dependencies on other tasks in the same board.
- List board members and invite a member by email with an assigned role.
- Run the complete application locally with Docker Compose.
- Publish an OpenAPI document and interactive API documentation.

### Explicitly deferred

The Figma file also contains controls for favorites, tags, projects, “My Tasks”, archive pages, roster export, audit logs, keyboard shortcuts, and sync indicators. These may be rendered to preserve the composition but do not need behavior in the first release. Board creation is not deferred: any signed-in user can create a board and becomes its `ADMIN`, so a new account never lands on a dead end.

Email invites are functional in local development through Mailpit; delivering public email is an environment/deployment concern. Real-time multi-user updates, comments, notifications, malware scanning, and external identity providers are also deferred.

## Design source of truth

The desktop Figma frames are:

| Screen | Figma node |
| --- | --- |
| Sign up / login | `1:2` |
| All boards | `1:838` |
| Task board | `1:128` |
| New task modal | `1:1045` |
| Edit task modal | `1:479` |
| Board settings / members | `1:1531` |

Implementation should preserve the warm editorial visual language while remaining responsive and accessible:

- Background `#faf8f5`, primary ink `#1a1918`, border `#e8e4de`, and muted text around `#5c5750` / `#87827b`.
- `Newsreader` for editorial headings, `Plus Jakarta Sans` for UI/body text, and `Space Mono` for compact metadata. Fonts will be bundled with `@fontsource` rather than fetched at runtime.
- Airy spacing, hairline borders, subtle status tints, restrained shadows, and 8–16 px radii.
- The Figma file only defines desktop screens. On narrow screens controls stack, board columns remain horizontally scrollable, and task dialogs become full-screen sheets.

The requested domain vocabulary overrides prototype copy. In particular, statuses are exactly `NOT_STARTED`, `IN_PROGRESS`, `COMPLETED`, and `ARCHIVED`, even where a prototype control says “Todo”, “Done”, or “Canceled”.

Before implementing a screen, retrieve that exact node through the Figma MCP, request design context plus a screenshot, and compare the finished browser output against it. Do not copy Figma-generated absolute-positioned code directly into the application.

## Architecture decisions

| Area | Decision | Rationale |
| --- | --- | --- |
| Architecture | TypeScript modular monolith with a separate web client and worker process | Keeps one deployable backend/codebase while allowing background jobs to scale independently. Microservices are unnecessary for this scope. |
| Repository | `pnpm` workspace, pinned through Corepack; no task orchestrator initially | Shared contracts and database code without adding Turborepo complexity before it is needed. |
| Web | React + Vite + React Router | Matches the requested stack and supports a simple SPA deployment. |
| Styling | Sass (`.scss`) with CSS Modules and global CSS custom-property tokens | Meets the Sass preference, prevents global leakage, and supports a bespoke Figma implementation without a utility CSS framework. |
| Server state | TanStack Query | Cache, mutation, retry, and invalidation behavior without duplicating API data in a global store. |
| Forms | React Hook Form + shared Zod schemas | Accessible forms with one validation contract shared with the API. |
| UI primitives | Radix UI primitives + Lucide icons, styled locally | Accessible behavior without imposing a visual system that conflicts with Figma. |
| Drag and drop | `dnd-kit` only when status drag/drop is implemented | Accessible, React-friendly, and avoids a dependency before the interaction is required. |
| API | Express REST under `/api/v1` | Straightforward resource model, easy local operation, and good OpenAPI support. GraphQL is not justified. |
| Contracts/docs | Zod DTOs in a shared package; OpenAPI 3.1 generated from them; Swagger UI at `/api/docs` | Runtime validation, inferred frontend types, and documentation cannot silently drift apart. |
| Database | PostgreSQL + Prisma ORM and committed SQL migrations | Strong fit for memberships, dependencies, and transactions; Prisma offers clear schema/migration ergonomics. Raw SQL migrations remain available for PostgreSQL indexes/extensions. |
| Authentication | Better Auth mounted in Express, using its Prisma adapter, opaque cookie sessions, and custom Argon2id password hashing | Provides credential auth now and a supported path to OAuth/OIDC providers and account linking later, without adding another deployed service or storing JWTs in the browser. |
| Cache/queues | Redis for Better Auth secondary storage, rate limits, BullMQ jobs, and bounded read-through caches | Gives Redis concrete responsibilities while PostgreSQL remains the durable source of truth. |
| Attachments | S3-compatible object storage; MinIO in local Compose | Keeps blobs out of PostgreSQL and makes local behavior match a common production storage contract. |
| Email | Nodemailer over SMTP; Mailpit in local Compose | Invitations can be exercised locally without an external vendor. |
| Recurrence | RFC 5545 RRULE + IANA timezone, expanded by an idempotent BullMQ worker | Avoids inventing a recurrence format and handles daylight-saving behavior explicitly. |
| Tests | Vitest everywhere, Supertest for API HTTP tests, Testing Library + MSW for React, Playwright for critical journeys | One fast unit-test runner plus focused integration and browser coverage. |
| Observability | Pino structured logs, request IDs, `/health/live`, and dependency-aware `/health/ready` | Useful Docker diagnostics without introducing a full telemetry stack. |

### System context

```mermaid
flowchart LR
  B[Browser] -->|static assets| W[web / Nginx]
  B -->|/api/v1| W
  W --> A[Express API + Better Auth]
  A --> P[(PostgreSQL)]
  A --> R[(Redis)]
  A --> O[(MinIO)]
  A --> M[Mailpit SMTP]
  A -->|enqueue| Q[BullMQ]
  Q --> K[Worker]
  K --> P
  K --> R
  K --> O
  K --> M
```

In development, Vite proxies `/api` to Express. In the Docker deployment, Nginx serves the compiled SPA and proxies `/api`, so browser cookies stay same-origin and CORS is not required for the default setup.

## Repository layout

```text
.
├── apps/
│   ├── api/                    # Express API and worker entry points
│   │   ├── prisma/             # schema and committed migrations
│   │   └── src/
│   │       ├── modules/        # users, boards, tasks, invitations, attachments
│   │       ├── auth/           # Better Auth config, adapters, callbacks, policies
│   │       ├── infrastructure/ # db, redis, object storage, mail, queues
│   │       ├── app.ts          # app factory; no network side effects
│   │       ├── server.ts       # HTTP process entry point
│   │       └── worker.ts       # background process entry point
│   └── web/                    # React/Vite SPA
│       └── src/
│           ├── app/            # router, providers, application shell
│           ├── features/       # auth, boards, tasks, board-members
│           ├── components/     # reusable UI components
│           └── styles/         # tokens, reset, mixins, global styles
├── packages/
│   ├── contracts/              # Zod request/response schemas and inferred types
│   └── config/                 # shared TypeScript/lint configuration
├── docker/                     # Dockerfiles and Nginx config
├── compose.yaml
├── pnpm-workspace.yaml
├── AGENTS.md
└── .pi/skills/                 # project workflow skill for future agents
```

The API is a modular monolith. A module owns its HTTP routes, service/application logic, repository access, and tests. Route handlers parse input and map responses; business and authorization rules live in services; repositories contain database queries. Modules may interact through explicit service interfaces, not by importing another module’s internal repository.

## Domain and persistence model

All IDs are UUIDv7 values. Timestamps are stored in UTC and serialized as ISO 8601. Recurrence retains the user-selected IANA timezone.

### Core records

- **User** — Better Auth’s user record, with case-insensitive email, display name, generated-avatar seed, verification state, and timestamps.
- **Account** — Better Auth credential or social-provider identity. Provider identities are unique by provider plus provider account ID; credential passwords use the configured Argon2id hash/verify functions.
- **Session** and **Verification** — Better Auth-managed session and one-time verification records. Redis may act as Better Auth secondary storage/cache, while durable auth records remain in PostgreSQL.
- **Board** — name, description, owner, timestamps, and optimistic concurrency version.
- **BoardMembership** — board, user, role (`ADMIN`, `MANAGER`, `CONTRIBUTOR`), joined timestamp; unique per board/user.
- **BoardInvitation** — board, normalized email, role, token hash, inviter, expiry, accepted/revoked timestamps. Plain invite tokens are never persisted.
- **Task** — board, human-friendly board sequence number, name, Markdown description, status, priority, due date, assignee, reporter, creator, version, timestamps, and optional soft-deletion timestamp.
- **TaskDependency** — directed `task -> dependsOnTask` edge, unique per pair.
- **Attachment** — task, uploader, object key, original filename, media type, byte size, checksum, timestamps.
- **TaskSchedule** — template task, RRULE, timezone, start/end values, next run, enabled flag.
- **ScheduleOccurrence** — schedule, scheduled instant, generated task; unique on schedule + instant for idempotency.

### Invariants

- A task, its assignee, reporter, and every dependency belong to the same board.
- A task cannot depend on itself and dependency cycles are rejected in a transaction.
- A task cannot move into `IN_PROGRESS` or `COMPLETED` while any dependency is still `NOT_STARTED` or `IN_PROGRESS`. `COMPLETED` and `ARCHIVED` dependencies are settled.
- Reporter defaults to the current user. Any active board member, including a contributor, may select any other active member as reporter or assignee; board membership—not role—is the authorization boundary for task work.
- Only active board members can read board data. Contributors manage tasks; managers/admins manage membership and invitations; only admins perform destructive board operations.
- `ARCHIVED` is a task state and is excluded from list queries by default. Deletion is a separate, explicit operation.
- Task updates include a `version`; stale updates return `409 Conflict` rather than silently overwriting another edit.
- Recurrence edits affect future generated occurrences. Existing occurrences remain historical records.
- The worker records each scheduled instant before/while generating its task so retries cannot create duplicates.
- Attachments are deleted asynchronously after their database record/task is removed.

Prisma migrations are the only way to change shared schemas. `prisma db push` is not used outside disposable experiments. PostgreSQL’s `citext` and `pg_trgm` extensions may be enabled by migration for normalized email and task search.

The boards migration also maintains two PostgreSQL-only invariants that Prisma cannot represent: `board_name_not_empty` and the partial unique index `board_invitation_pending_board_email_key`. Phase 4a adds the raw `task_name_not_empty` check; phase 5a adds `task_description_length` and `task_dependency_not_self`. Phase 4b adds composite foreign keys from `task(boardId, assigneeId/reporterId)` to `board_membership(boardId, userId)`, because Prisma cannot model the assignee's column-specific `ON DELETE SET NULL` without also making the task's required `boardId` nullable. Their committed migrations are the source of truth; matching comments in `schema.prisma` prevent the omissions from being mistaken for drift. `pnpm --filter @ksat/api db:migrate:diff` compares the Prisma schema with a shadow database and allows only those documented unsupported statements; CI runs it with `SHADOW_DATABASE_URL`.

## Identity delivery (phase 2)

Better Auth `1.7.5` is pinned with its Prisma adapter and mounted at `ALL /api/v1/auth/*`. The public `BETTER_AUTH_URL` is the origin only; Better Auth's `basePath` supplies `/api/v1/auth`. Its required User, Account, Session, and Verification models are in committed identity migrations, with a PostgreSQL `citext` email and required server-generated `avatarSeed`. All Better Auth IDs use the supported `advanced.database.generateId` hook with UUIDv7.

Email/password signup and login use a minimum of 12 and maximum of 256 characters and explicit Argon2id parameters (19,456 KiB memory, two passes, one lane, 32-byte output). Auth tokens never enter browser storage. `avatarSeed` is a non-input field with a server-side random default, so client attempts to set it are rejected. The web client renders that seed with bundled DiceBear code and makes no avatar or font request to a third party.

PostgreSQL is authoritative. Redis secondary storage uses namespaced `ksat:better-auth:*` keys and Better Auth-provided TTLs; DB-backed sessions and verification records stay enabled. Redis cache failures are treated as misses, never as valid authentication, while rate-limit counters fall back to a bounded, per-API-process memory map during an interruption. The API trusts exactly one forwarded proxy hop only when `TRUST_PROXY=true`; the Compose Nginx proxy overwrites `X-Forwarded-For` with the connected client address. Do not enable `TRUST_PROXY` for a directly exposed API. The API uses HttpOnly SameSite=Lax cookies and takes Secure-cookie behavior from the required production setting `BETTER_AUTH_SECURE_COOKIES`. Better Auth's trusted-origin/CSRF checks remain enabled.

The React client restores the cookie session before rendering, supports signup/login/logout, validates forms with React Hook Form and Zod, and provides pending, validation, connection-error, auth-error, and signed-in states. The auth composition follows Figma frame `1:2`; prototype-only habitat, remember-workstation, and passcode-reset controls remain omitted because they are outside the MVP.

Operational rollout:

1. Copy `.env.example` or `apps/api/.env.example` and set a unique high-entropy `BETTER_AUTH_SECRET` (at least 32 characters) in production.
2. Set the public `BETTER_AUTH_URL`, comma-separated `BETTER_AUTH_TRUSTED_ORIGINS`, and `BETTER_AUTH_SECURE_COOKIES`; do not use an internal Compose hostname and enable Secure cookies for HTTPS deployments.
3. Run `pnpm db:migrate` (or let the Compose `migrate` job run) to apply the committed identity migrations. Do not use `prisma db push`.
4. Exercise Better Auth's pinned route reference through `/api/v1/auth/sign-up/email`, `/api/v1/auth/sign-in/email`, `/api/v1/auth/sign-out`, and `/api/v1/auth/get-session`.

The standard `pnpm test` suite intentionally does not require PostgreSQL, Redis, or MinIO. It covers environment policy, Argon2id behavior, UUIDv7/avatar generation, Redis degradation, representative credential behavior, route mounting, React identity states, health/error behavior, and shutdown. The phase-2 validation also applies the migrations in Compose and smoke-tests signup, cookie-backed session retrieval, Argon2id persistence, generated avatar persistence, and logout against PostgreSQL and Redis.

## Boards and membership delivery (phase 3)

The phase-3 slice is complete end to end: board creation and editing, membership reads, email invitations and cancellation, and the React screens that drive them. Favourites, tags, role changes/removal, invitation resend, roster export, audit logs, copy-link controls, and the task board itself remain deferred; the UI renders those controls as inert or omits them rather than faking behaviour.

### Endpoints and authorization

| Method | Path | Authorization | Success |
| --- | --- | --- | --- |
| GET | `/api/v1/boards` | Signed-in user; only memberships are returned | 200, cursor page |
| GET | `/api/v1/boards/:boardId` | Active board member | 200; non-members receive `404 BOARD_NOT_FOUND` |
| GET | `/api/v1/boards/:boardId/members` | Active board member | 200, cursor page |
| GET | `/api/v1/boards/:boardId/invitations` | Board manager or admin | 200, pending cursor page |
| PATCH | `/api/v1/boards/:boardId` | `ADMIN` member; trusted origin and session required | 200, updated board detail; stale version is `409 BOARD_VERSION_CONFLICT` |
| POST | `/api/v1/boards/:boardId/invitations` | Manager/admin; only admin may invite an admin | 201; token is email-only |
| DELETE | `/api/v1/boards/:boardId/invitations/:invitationId` | Manager/admin; only admin may cancel an admin invite | 204; repeated cancellation is idempotent |
| GET | `/api/v1/invitations/:token` | Public preview; token is hashed before lookup | 200 preview |
| POST | `/api/v1/invitations/:token/accept` | Signed-in user whose email matches invite | 200; idempotent for an existing member |

All application mutations require an `Origin` or `Referer` origin in `BETTER_AUTH_TRUSTED_ORIGINS`. Better Auth continues to own origin/CSRF handling for `/api/v1/auth/*`.

| Role | Read board | Read members | List invitations | Invite/cancel contributor or manager | Invite/cancel admin | Edit board |
| --- | --- | --- | --- | --- | --- | --- |
| `ADMIN` | Yes | Yes | Yes | Yes | Yes | Yes |
| `MANAGER` | Yes | Yes | Yes | Yes | No | No |
| `CONTRIBUTOR` | Yes | Yes | No | No | No | No |

### Invitation flow and safety

A request email is normalized to lowercase. A 32-byte base64url token is sent in the link `${APP_PUBLIC_URL}/invitations/<token>`; only its SHA-256 hash is persisted. Pending invites expire after `INVITATION_TTL_HOURS` (default 168 hours). Re-inviting the same board/email revokes the old pending row and creates the replacement in one serializable transaction. The partial unique PostgreSQL index prevents two pending rows.

Cancellation sets `revokedAt` in a serializable transaction and is idempotent; cancellation and acceptance cannot both win. Managers may cancel contributor/manager invitations, while only admins may cancel admin invitations. Acceptance checks expiry, revocation, and email equality, then creates the membership and conditionally marks the invite accepted in one serializable transaction. Concurrent accepts cannot create duplicate memberships. SMTP delivery occurs after commit; a transport failure returns `emailDelivery: "FAILED"` while leaving the invite valid. The API never returns a plain invitation token.

Stable errors include `UNAUTHENTICATED` (401), `VALIDATION_ERROR`/`INVALID_CURSOR` (400), `ORIGIN_NOT_ALLOWED`/`FORBIDDEN`/`BOARD_ADMIN_REQUIRED`/`INVITATION_EMAIL_MISMATCH` (403), `BOARD_NOT_FOUND`/`INVITATION_NOT_FOUND` (404), `ALREADY_MEMBER`/`INVITATION_CONFLICT`/`INVITATION_NOT_PENDING`/`INVITATION_REVOKE_CONFLICT`/`BOARD_VERSION_CONFLICT` (409), `INVITATION_EXPIRED`/`INVITATION_REVOKED`/`INVITATION_ALREADY_ACCEPTED` (410), and `RATE_LIMITED` (429). Validation problems may include an `errors` array of `{ path, message }` entries.

### Cache, limits, and operations

The first page of each user's board list is cached in Redis as `ksat:cache:v1:boards:user:<userId>:first-page` for 45 seconds. Membership acceptance invalidates every member's key; cache failures are misses and fall back to PostgreSQL. Invitation creation is limited to 10 requests per user per hour and cancellation to 30 requests per user per hour. Invitation lookup is limited to 60 requests per IP per minute, and acceptance to 30 requests per IP per minute. Counters use `ksat:rate-limit:*` keys; during Redis outages the fallback is bounded and best-effort per API process, so limits are multiplied across replicas until Redis recovers.

OpenAPI 3.1 is generated from `packages/contracts` and served at `/api/docs/openapi.json`; local Swagger UI is at `/api/docs`. The document links to Better Auth's route reference rather than duplicating its framework-owned routes.

### Seed and rollout

Compose's `migrate` job applies all committed Prisma migrations and runs the seed only when `SEED_DEMO_DATA=true`. Compose defaults this flag to `false`; the checked-in root `.env.example` explicitly opts local Compose development into demo data. Production also refuses demo seeding unless `ALLOW_PRODUCTION_DEMO_SEED=true` is explicitly and deliberately set. The deterministic, non-production accounts are `ada@example.test`, `grace@example.test`, `linus@example.test`, and `maya@example.test`; the shared password is `ksat-demo-password-2027`. These credentials and `.test` addresses must never be used in production. Local Mailpit is available at `http://localhost:8025` and SMTP uses `mailpit:1025` inside Compose.

New configuration includes `APP_PUBLIC_URL`, `INVITATION_TTL_HOURS`, `SEED_DEMO_DATA`, `ALLOW_PRODUCTION_DEMO_SEED`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, and `MAIL_FROM`. Set the public URL/trusted origins first, run `pnpm db:migrate`, then `pnpm db:seed` (or `docker compose up --build` locally).

### Web client (phase 3)

Routes are owned by `react-router` v7 with a session guard that resolves the Better Auth cookie session before protected content renders:

| Route | Screen | Notes |
| --- | --- | --- |
| `/` | redirect | Forwards to `/boards`. |
| `/login` | `AuthScreen` (Figma `1:2`) | `?mode=sign-in` preselects login; `?redirect=` returns the visitor to the requested same-origin path after sign-in. |
| `/boards` | All boards (Figma `1:838`) | Loading skeleton, empty state that explains invitation-only joining, error with retry, cursor "Load more", per-board role chip, avatar preview, relative update time, Open Board link, and a settings link into membership. |
| `/boards/:boardId` | Board overview | Name, description, your role, member count and preview, admin-only Edit board panel with version conflict recovery, link to Members, and an explicit note that the task board ships in the next phase (no placeholder tasks). |
| `/boards/:boardId/members` | Board members (Figma `1:1531`) | Breadcrumb, cohort summary, roles & hierarchy guide, invite form (`ADMIN`/`MANAGER` only), roster with URL-parameter search and role filters, and pending invitations with a `SENT` state and confirmation-based cancellation for managers/admins. |
| `/invitations/:token` | Invitation acceptance | Public preview of board, role, inviter, invited email, and expiry, with signed-out, email-mismatch, expired, revoked, accepted, not-found, rate-limited, and error states. |
| `*` | Not found | Explicit 404 screen instead of a blank route. |

Server state lives in TanStack Query (`src/lib/api/*`), forms in React Hook Form resolved against the shared Zod contracts, and linkable roster filters in the URL search parameters. A thin `fetch` client sends same-origin cookie requests, validates every response with `packages/contracts`, maps RFC 9457 Problem Details to a typed `ApiError` (including field errors), distinguishes network and contract failures, and forwards `AbortSignal` so stale search and navigation requests are cancelled. `VITE_API_BASE_URL` overrides the same-origin default; Vite proxies `/api` in development and Nginx does in the container image, so no CORS configuration is needed.

Board summaries carry `ownerId` plus a bounded `memberPreview` but no owner name, so "updated by" resolves the owner from that preview (or from the signed-in user when they own the board) and omits the name rather than asserting one it cannot verify. Roster and pending-invitation pages request the maximum bounded page size (100) and offer "Load more" when the API returns a cursor.

Board creation is functional from both `Create New Board` controls: signed-in users provide a name and optional description, become the new board’s `ADMIN`, and are routed to its overview. Remaining deferred prototype controls are rendered inert or omitted, never faked: `SYNCED` and `New Task` in the shell, `Export Roster`, favourites, tags, the row overflow menu, role selects and member removal, invitation resend, `Copy Invite Link`, the audit log, and default board permissions.

Static Figma assets are committed verbatim under `apps/web/src/assets/boards/` and `apps/web/src/assets/members/` (for example `1-838/12237.svg` → `assets/boards/plus-white.svg` → Create New Board/New Task, and `1-1531/a3435.svg` → `assets/members/roster-search.svg` → roster search field). Prototype photography is not shipped: every avatar is rendered locally from the server-generated `avatarSeed` through the shared `Avatar` component using bundled DiceBear code, and `IdentityPanel` from phase 2 was replaced by the shell account menu.

`pnpm dev` builds `@ksat/contracts` first through the workspace `predev`/`pretest`/`pretypecheck`/`prebuild` scripts, mirroring the API package, so the shared schemas always exist before the web client compiles or runs.

## Task board delivery (phase 4a)

Phase 4a is the first Kanban slice: a board screen with three active columns, task creation, editing, movement, and deletion for name, status, and priority, plus optimistic concurrency. Phase 4b subsequently adds assignee, reporter, and due-date metadata to its cards and replaces the interim dialog; dependencies, attachments, descriptions, and recurrence remain later phases.

### Routes

| Route | Screen | Notes |
| --- | --- | --- |
| `/boards/:boardId` | Task board (Figma `1:128`) | Three columns (`NOT_STARTED`, `IN_PROGRESS`, `COMPLETED`), stage pills, board-scoped **New Task**, click-to-edit cards, load-more for additional pages, and a labelled **Settings** button in the board header. |
| `/boards/:boardId/settings` | Board overview (phase 3) | Board metadata, membership summary, and the admin edit panel moved here when the board route became the Kanban board. |
| `/boards/:boardId/members` | Board members (Figma `1:1531`) | Unchanged. |

Phase 4c makes the control strip functional: search, assignee/priority/status/due filters, sorting, and the explicit show-archived toggle are URL-backed and shareable. `ARCHIVED` tasks remain excluded unless `includeArchived=true`; when shown, they occupy a fourth Archived column.

### Endpoints and authorization

| Method | Path | Authorization | Success |
| --- | --- | --- | --- |
| GET | `/api/v1/boards/:boardId/tasks` | Active board member | 200, cursor page of active tasks |
| POST | `/api/v1/boards/:boardId/tasks` | Active board member | 201 created task |
| GET | `/api/v1/tasks/:taskId` | Active board member | 200 task detail |
| PATCH | `/api/v1/tasks/:taskId` | Active board member | 200 updated task, including a status move |
| DELETE | `/api/v1/tasks/:taskId?version=` | Active board member | 204 deleted |

Every board role — including `CONTRIBUTOR` — may manage tasks; only active membership is required, and the repository constrains each query by membership rather than trusting a caller-supplied id. Unknown boards and unknown tasks are indistinguishable `404`s (`BOARD_NOT_FOUND`, `TASK_NOT_FOUND`). Mutations keep the trusted-origin check and per-user Redis rate limits (create 120/hour, update 600/hour, delete 120/hour).

### Concurrency and sequences

A task carries a human-friendly `sequence` that is unique per board. Creation locks the board row and increments `Board.nextTaskSequence` in the same transaction as the insert, so parallel creates cannot duplicate or skip a number. Updates and deletes are predicated on `id + version + membership`; a zero-row write is resolved as either `TASK_VERSION_CONFLICT` (409) or `TASK_NOT_FOUND` (404), and a stale client never overwrites a newer edit. Task-board data is not cached in Redis; PostgreSQL stays authoritative.

### Web behaviour

- Optimistic mutations: moving, editing, and deleting write into the TanStack Query cache immediately, restore the exact snapshot when the request fails, and always reconcile with the server afterwards. A `409` reloads the authoritative task and announces the conflict.
- Two entry points: the board's own **New Task** control and the shell CTA, which is enabled whenever a board screen supplies a handler and stays disabled elsewhere. Focus returns to whichever control opened the dialog.
- Card affordance: the card is one pointer target, so the whole block shows `cursor: pointer` and hovering tints only its border. The title keeps its type and is never underlined, and keyboard focus keeps the visible ring.
- Card interaction: a single click anywhere on a card opens the designed edit modal, which owns name, status, priority, assignee, reporter, due date, and deletion (confirmed in a second dialog). The frame's per-card overflow menu remains deliberately absent.
- Movement and its feedback: pointer dragging uses `@dnd-kit/core` with a distance threshold. The original card stays in its column, dimmed, as the place it left, and a drag overlay follows the pointer.
- Live drop target: the column under the pointer is highlighted while a card is held — an accent wash, an accent border, and an inset ring, so the state is not carried by colour alone — and only that column is highlighted. An empty column's dashed placeholder joins the highlight, so the target reads as one surface.
- No drop animation: the card genuinely relocates to another column, and animating the overlay back to the source looked like a snap-back. The card that landed is highlighted briefly instead.
- No drag auto-scroll: `DndContext` runs with `autoScroll={false}`, so a card can be carried anywhere on screen — including outside the board — without the page or the column row scrolling underneath it. The trade-off is deliberate: on narrow screens the column row has to be scrolled to a column before dropping onto it.
- The keyboard-equivalent path is opening the card and changing its **Column** field, which moves the task the same way.
- Movement, edit, and delete results are reported in a success toast (`Moved “…” to In Progress.`, `Saved “…”.`, `Deleted “…”.`) instead of an inline paragraph. This is intentional feedback rather than placeholder copy: pointer and drag results are visual, so the same text tells keyboard and screen-reader users whether the change succeeded. The toast is portaled to the document body, so it never displaces the board or joins its scroll containers, and it keeps its `role=status`/`role=alert` regions mounted so assistive technology announces every message. Confirmations auto-dismiss after five seconds, pausing while the pointer or focus is inside; rejections stay until they are dismissed, and the dismiss target meets the 24px minimum target size.
- Control strip: search, assignee/priority/status/due filters, sorting, the archive toggle, and the primary CTA share one `--control-height` token so the strip aligns. Filter state is URL-backed; `/` focuses search and stale searches are cancelled.
- Responsive columns: columns use the 389px design width, shrink to a 20rem minimum to share a narrower viewport, and the row scrolls horizontally below that so the page itself never scrolls sideways. Reduced-motion preferences disable the arrival highlight and the column transition.
- Testing Library/MSW coverage covers loading, empty, error/retry, not-found, validation, delete confirmation, optimistic rollback, conflict recovery, click-to-edit focus return, and the toast lifecycle (persistent live regions, auto-dismiss, hover pause, dismissal); the control-height alignment, hover border, and pointer cursor are asserted in the browser journey.

### Browser journeys and CI

`e2e/` holds the Playwright journeys and `playwright.config.ts` targets `E2E_BASE_URL` (default `http://localhost:5173`). The seed-independent journey signs up a brand-new account, creates a board and task with self-assignment and a due date, edits it through the full modal, moves it through the Kanban columns, reloads to prove persistence, and deletes it; it also measures page and column overflow at 1280px and 375px. The seeded recurring-work journey logs in as `ada@example.test`, pauses/resumes the deterministic recurring template, and verifies the recurring card remains intact.

`.github/workflows/ci.yml` runs three jobs with Node `24.12.0`, Corepack-pinned pnpm `11.18.0`, and dependency caching keyed from `pnpm-lock.yaml`:

- **quality** — `pnpm format:check`, `lint`, `typecheck`, `test`, `build`, and `compose:config`;
- **database** — Prisma client generation, `prisma migrate deploy`, the shadow-database migration-diff guard, and the PostgreSQL integration suite;
- **browser** — Chromium installation, migrations, the API and web dev servers, the Playwright journeys, and failure-artifact upload.

### Seed

`pnpm db:seed` (and the Compose `migrate` job when `SEED_DEMO_DATA=true`) creates a deterministic task set across the demo boards, including one recurring template and one `ARCHIVED` row that demonstrates its exclusion from board reads. Each board's `nextTaskSequence` is set just past the seeded sequences so tasks created later never collide with them.

## People and dates delivery (phase 4b)

Phase 4b extends the Kanban slice with an optional assignee, required reporter, and optional due date. Both people must be active members of the task's own board. Reporter defaults to the caller; every board role may choose any member for either field. The designed create (`1:1045`) and edit (`1:479`) modals replace the phase 4a interim dialog.

### Persistence, contract, and authorization

- Migration `20270501000000_task_people_and_dates` adds nullable `assigneeId`, required `reporterId` (backfilled from `createdById`), and nullable PostgreSQL `DATE` `dueDate`, plus board/assignee and board/date indexes.
- Service checks run inside the write transaction. PostgreSQL composite foreign keys independently enforce same-board membership: removing an assignee membership clears `assigneeId`; reporter membership cannot be removed while referenced. A board deletion still cascades through its tasks.
- Create defaults reporter to the caller and accepts an optional assignee/date. PATCH remains a full-state, versioned update, so drag moves preserve people and date. Invalid selections return `422 TASK_ASSIGNEE_NOT_MEMBER` or `422 TASK_REPORTER_NOT_MEMBER`.
- Task responses embed safe assignee/reporter previews and serialize due dates as strict `YYYY-MM-DD` strings.

### Accepted decisions

- **Any member may choose any reporter.** Choice: authorization depends on active membership rather than role. Reason: contributors already manage tasks and reporter assignment is task metadata, not board administration. Consequence: UI and API expose the complete active roster to every board member; both layers still reject users outside the board.
- **Due dates are calendar dates.** Choice: store PostgreSQL `DATE`, not a UTC timestamp. Reason: a due date names a day and must not shift when viewed in another timezone. Consequence: API values are `YYYY-MM-DD`; the web computes `days left`, `Due today`, and `overdue` against the viewer's local calendar day. UTC remains authoritative for actual timestamps.
- **Radix provides behavior only.** `@radix-ui/react-dialog`, `react-select`, and `react-popover` provide focus, layering, and keyboard semantics; Sass Modules and repository tokens own every visual style.
- **Later modal sections are omitted.** Tags, projects, and attachments are not rendered as fake controls. Phase 5a added the description and dependency sections.

### Web behavior

- The create modal supports status, priority, assignee, reporter, due date, validation, and **Create more**, which resets only the title while keeping selected properties.
- The edit modal shows the board/task breadcrumb, saved/dirty state, expand/close controls, created/updated metadata, **Discard changes**, versioned **Save changes**, Ctrl/Cmd+Enter submission, and confirmed deletion.
- A `409` keeps the modal open and offers **Reload latest**; reloading replaces the form and baseline version before another save. A stale member `422` marks the relevant person pill and refreshes member data through the normal query lifecycle.
- Cards show assignee identity and due date. `Overdue` is written as text as well as tinted, so meaning is not carried by color alone.
- Dialogs are full-screen sheets below 40rem, property pills wrap, focus returns to the opener, and reduced-motion preferences disable modal transitions.

### Verification scope

Contract tests reject impossible dates; service/HTTP tests cover defaults and 422 errors; PostgreSQL integration tests cover cross-board rejection, persisted people/date values, optimistic concurrency, and assignee clearing on membership removal. Testing Library/MSW covers create-more, people/date submission, conflict reload, membership errors, discard, deletion, and controlled-clock overdue rendering. Playwright extends the unseeded signup journey through create with assignee/date, edit/persist, and modal deletion.

## Content and dependencies delivery (phase 5a)

Phase 5a adds a Markdown description and same-board task dependencies ("depends on") to the task modal, API, and cards.

### Persistence, contract, and authorization

- Migration `20270701000000_task_description_and_dependencies` adds nullable `task.description` with the raw CHECK `task_description_length` (1–10,000 characters). It also adds `task_dependency(boardId, taskId, dependsOnTaskId)`, keyed by `(taskId, dependsOnTaskId)`, with the raw CHECK `task_dependency_not_self`. Both composite foreign keys reference the new `task(boardId, id)` unique index and share the edge's `boardId`, so PostgreSQL rejects any edge that crosses boards. Deleting either task cascades its edges.
- `Task` responses add `description` (Markdown source or `null`) and `dependsOn`: `{ id, sequence, name, status }` previews ordered by sequence. Create accepts optional `description`/`dependsOnIds`. PATCH stays a full-state update: `dependsOnIds` replaces the whole prerequisite set, so a column move re-sends the current set.
- Input rules: a blank description becomes `null`; any other Markdown is stored verbatim. `dependsOnIds` holds at most 20 unique UUIDs.
- Authorization is unchanged: every active board member may set a description and choose any task on the same board, including an archived one, as a prerequisite.
- Errors (422): `TASK_DEPENDENCY_NOT_FOUND` for an unknown, deleted, or other-board task; `TASK_DEPENDENCY_SELF` when a task names itself; `TASK_DEPENDENCY_CYCLE` when a new prerequisite already depends on the task, directly or transitively; `TASK_DEPENDENCIES_INCOMPLETE` when a create, modal update, or drag would move a dependent task into `IN_PROGRESS` or `COMPLETED` while a prerequisite is still `NOT_STARTED` or `IN_PROGRESS`. A stale version still returns `409` and leaves the dependency set unchanged.

### Cycle check and concurrency

Only a newly added edge can close a cycle. When an update adds edges, the repository locks the board row (`SELECT … FOR UPDATE`). It then walks the existing graph from the new prerequisites with a recursive CTE, inside the same transaction as the versioned update. Two concurrent edits that would each add half of a loop (A→B and B→A) therefore serialize, and the second sees the first edge. The PostgreSQL integration suite covers this race. Edges change only after the version predicate wins. Creation needs no walk because a new task has no dependents. Because the walk precedes the settledness gate, one request that both closes a loop and moves into a gated status reports the loop.

### Web behavior

- The modal's **Description** section opens as an editor with keyboard-accessible Heading, Bold, Italic, List, Link, and Code controls. A single **Preview** toggle swaps between editing and the sanitized renderer; a saved description opens in preview and the toggle returns focus to the editor.
- Markdown is rendered with `react-markdown` and `remark-gfm`, with `skipHtml`. No `rehype-raw` is used, so raw HTML is dropped rather than rendered. The default URL transform strips unsafe protocols, and links open in a new tab with `rel="noopener noreferrer nofollow"`. GFM task lists render as read-only checkboxes.
- **Depends on** lists each prerequisite as a chip with its number, name, status as text, and a labelled remove button. **Add dependency** opens a popover. It holds a debounced search across the board, including archived tasks, and native checkboxes for each result, plus loading, error-with-retry, empty, and 20-item-limit states. The task being edited is never offered.
- Create and edit modals explain that every dependency must be completed before the task can enter **In Progress** or **Completed**, and that archived dependencies no longer block it. A dependency 422 is shown on the **Depends on** field, which is marked `aria-invalid`, and in the submit error; drag failures roll back the card and remain visible in an error toast. The chosen set is kept so the user can correct it and save again. **Create more** clears the description but keeps the other properties.
- Cards show the Figma `1:128` dependency pill: `Depends on: #n Name`, plus `+N more` when there are several. It uses the Figma link icon, committed as `apps/web/src/assets/tasks/dependency-link.svg`.
- Optimistic edits include the description and dependency previews and roll back on failure like other fields.

### Accepted decisions

- **Dependencies gate forward moves.** Choice: a task may move into `IN_PROGRESS` or `COMPLETED` only when every selected prerequisite is settled; `NOT_STARTED` and `ARCHIVED` stay reachable at any time. Reason: work should not start or finish ahead of its prerequisites. Consequence: the API enforces the rule for create, modal, and drag writes with `TASK_DEPENDENCIES_INCOMPLETE`; the web explains the rule, keeps modal state for correction, and rolls failed optimistic moves back.
- **An archived prerequisite stops blocking, but the edge stays.** Choice: `ARCHIVED` counts as settled while the dependency row survives. Reason: the domain maps the prototype's "Canceled" control onto `ARCHIVED`, so cancelled work will never complete; had it kept blocking, every dependent would dead-end until its edge was deleted, losing the record that the prerequisite was never finished. Consequence: dependents of archived work can proceed, and the chip still shows `Archived` in words so the difference from a completed prerequisite stays visible. Deleting the prerequisite is still the only way to drop the edge.
- **The cycle check outranks the status gate.** Choice: one request that both moves into a gated status and closes a loop reports `TASK_DEPENDENCY_CYCLE`. Reason: a loop can never be satisfied, so naming it is more useful than reporting prerequisites the caller cannot complete. Consequence: the cycle walk runs before the settledness check in the same transaction.
- **Markdown library.** Choice: `react-markdown` 10.1.0 + `remark-gfm` 4.0.1, pinned, rather than a hand-written sanitizer. Reason: the library builds React elements and never uses `dangerouslySetInnerHTML`, and disabling HTML is one option. Consequence: about 1,100 lockfile lines of unified/micromark dependencies.
- **Board-row lock for graph writes.** Choice: lock the board row, as sequence allocation already does, rather than use SERIALIZABLE isolation. Reason: the invariant spans many rows and is board-scoped. Consequence: dependency-adding updates on one board serialize; updates that add no edge are unaffected.
- **Figma coverage.** The edit modal `1:479` could not be re-inspected during 5a because the Figma MCP Starter-plan call limit had been reached. The card pill follows the cached `1:128` design context. The modal sections reuse the existing modal/pill tokens and should be compared against `1:479` during release hardening.

### Verification scope

Contract tests cover description normalization and limits and the dependency-id bounds. Service tests cover the self-dependency and 422 mappings. PostgreSQL integration tests cover ordered previews, cross-board and unknown ids, direct and transitive cycles, the concurrent opposite-edge race, stale-version preservation, cascade on delete, the raw CHECK constraints, gated `IN_PROGRESS` and `COMPLETED` moves, an archived prerequisite that settles without losing its edge, an unchanged status staying editable after a prerequisite drifts back, and a cycle winning over the status gate. Testing Library/MSW covers Markdown formatting controls, the Preview toggle, dependency guidance, sanitized rendering, incomplete-prerequisite and cycle-error recovery, and the archived state shown on a prerequisite chip. Playwright verifies a rejected pointer move rolls back with a visible error. The seed adds deterministic descriptions and two same-board edges.

### Attachments delivery (phase 5b)

Attachments are a private child resource of tasks. Active board members may list, upload, open/download, and remove files; unauthenticated callers receive `401`, and inaccessible tasks or attachment IDs are concealed as `404`. The API never returns object keys or MinIO URLs.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/v1/tasks/:taskId/attachments` | Cursor-paged attachment metadata |
| POST | `/api/v1/tasks/:taskId/attachments` | Multipart upload using the `file` field |
| GET | `/api/v1/tasks/:taskId/attachments/:attachmentId/content` | Authorized streamed content |
| DELETE | `/api/v1/tasks/:taskId/attachments/:attachmentId` | Metadata removal and asynchronous object cleanup |

The default limit is 10 MiB per file and 50 MiB per task, configurable through `ATTACHMENT_MAX_FILE_BYTES` and `ATTACHMENT_MAX_TASK_BYTES`. JPEG, PNG, GIF, WebP, PDF, and UTF-8 plain text are detected from content; browser-declared MIME types are not trusted. MinIO remains private and the API sets safe content-disposition and `nosniff` headers.

The task modal follows `phase-notes/phase-5b-modals.png`: create mode stages files behind the compact Attach/upload action; edit mode shows **Attached specs & files**, usage against the 50 MiB cap, compact file tiles, and upload/open/remove controls. Attachments do not inflate board task cards.


## API conventions

- Base path: `/api/v1`.
- JSON uses camelCase; enum values use the uppercase values shown above.
- Request and response bodies are validated by shared Zod contracts.
- Errors use `application/problem+json` following RFC 9457 and include a stable machine-readable `code` and request ID.
- Collection endpoints use cursor pagination. Task-board queries may request a sufficiently high bounded page size for each column; no unbounded query is allowed.
- Search/filter/sort state is represented in query parameters so a board view is linkable.
- Mutations requiring concurrency protection send the current `version` in the body or `If-Match` header.
- OpenAPI JSON: `/api/docs/openapi.json`; interactive documentation: `/api/docs`.

Planned resource surface:

```text
ALL    /api/v1/auth/*                   # Better Auth handler
       # email signup/sign-in, sign-out, session, and future OAuth callbacks

GET    /boards
POST   /boards
GET    /boards/:boardId
PATCH  /boards/:boardId             # admin board name/description edit with version
GET    /boards/:boardId/members
GET    /boards/:boardId/invitations
POST   /boards/:boardId/invitations
DELETE /boards/:boardId/invitations/:invitationId
GET    /invitations/:token
POST   /invitations/:token/accept

GET    /boards/:boardId/tasks
POST   /boards/:boardId/tasks
GET    /tasks/:taskId
PATCH  /tasks/:taskId
DELETE /tasks/:taskId
POST   /tasks/:taskId/attachments
DELETE /tasks/:taskId/attachments/:attachmentId
```

The Better Auth handler is mounted at `/api/v1/auth`. Its route contracts and generated reference are owned by the pinned Better Auth version; the application OpenAPI document covers the remaining endpoints and links to the auth reference. Task creation/update contracts include dependency IDs and optional schedule details. Services perform authorization independently of what the UI hides.

## Authentication and security baseline

- Mount Better Auth `1.7.5` inside the Express API; it is a library, not another Compose service. Review release notes and regenerate/review its schema before upgrades.
- Use the Better Auth Prisma adapter and commit its required tables through the same Prisma migration workflow as application tables.
- Configure Better Auth email/password hashing and verification callbacks with Argon2id using OWASP-aligned parameters. Enforce at least 12 characters and allow password-manager-friendly long values.
- Normalize and compare email addresses case-insensitively without changing display names.
- Use Better Auth’s opaque, revocable session cookies. Cookie defaults are `HttpOnly`, `SameSite=Lax`, `Path=/`, and `Secure` outside local HTTP development; auth tokens never enter `localStorage`. Phase 2 stores sessions in PostgreSQL and uses Redis only as secondary storage/cache.
- Set `BETTER_AUTH_SECRET` from a high-entropy deployment secret and configure the public `BETTER_AUTH_URL`, trusted origins, and Express proxy handling explicitly.
- Use Better Auth’s origin/CSRF protections for auth routes and retain application CSRF/origin protection for other state-changing endpoints. Rate-limit signup/login/invite endpoints through Redis.
- Return the same login failure for unknown users and bad passwords.
- Validate authorization at the service/repository boundary for every board-scoped access to prevent IDOR vulnerabilities.
- Validate attachment size, detected/allowed media type, and filename separately. Generate object keys server-side, never execute uploads, and force unsafe types to download.
- Default limits: 10 MiB per file and 50 MiB total per task, configurable by environment.
- Validate environment variables at process startup and never commit secrets or production-like credentials.
- Sanitize rendered Markdown and disallow raw HTML.

The avatar is generated deterministically from a random seed using a bundled DiceBear style. Only the seed is stored, so signup does not rely on an external avatar service.

Better Auth proves identity; application services still own board/task authorization. Future social login uses Better Auth provider accounts and the authorization-code flow. Provider identity is keyed by provider plus provider account ID, never email alone. Automatic linking based only on matching email is disabled; linking requires an authenticated user or verified proof of control according to an explicit policy. A user may retain both credential and social login methods.

## Frontend architecture

- **Routing:** public auth route; protected boards, board, and board-settings routes; route guards resolve the Better Auth client session before rendering protected content.
- **State:** the Better Auth React client owns identity/session state. TanStack Query owns application server state, URL search parameters own board filters/sort/search, React Hook Form owns forms, and component state owns ephemeral UI. Add a global client store only if a concrete cross-route use case appears.
- **Contracts:** Better Auth’s client consumes its auth routes. A separate thin fetch client consumes application types/schemas from `packages/contracts`, sends cookies, translates Problem Details, and supports request cancellation.
- **Accessibility:** semantic controls, visible focus, labels and errors, focus-trapped/restored dialogs, keyboard-operable menus, reduced-motion support, and non-color status labels. Drag/drop must have a keyboard alternative.
- **Loading/error states:** each route and mutation supplies deliberate loading, empty, error, and retry states; optimistic updates must roll back on failure.

### Sass conventions

- Component styles use `ComponentName.module.scss`; global styles are limited to reset, fonts, root tokens, and application-level defaults.
- Sass modules use `@use`, never deprecated `@import`.
- Design primitives are CSS custom properties declared in `styles/_tokens.scss`, allowing runtime theming and readable browser inspection. Sass variables/mixins may generate consistent scales but must not hide component semantics.
- Use logical properties and mobile-first media queries. Avoid inline style objects except for truly data-driven values such as a calculated avatar color.
- Do not introduce Tailwind, CSS-in-JS, or another component theme without recording a new architecture decision.
- Prefer composition over deep selector nesting; cap nesting at roughly three levels and do not style via generated DOM internals when a primitive exposes a class/part.

## Redis policy

PostgreSQL is authoritative. Redis is used for:

1. Better Auth secondary session storage/cache and auth metadata, according to the pinned version’s supported adapter contract;
2. login/invite rate-limit counters;
3. BullMQ queues and idempotent background work;
4. short-lived board-list/board-summary caches (target TTL 30–60 seconds).

Task-board data is not cached initially because its high mutation rate makes invalidation more complex than the likely gain. Membership and board mutations explicitly invalidate affected user/board cache keys. Cache failures degrade reads to PostgreSQL where safe; they never bypass authorization.

## Local deployment

The Compose project will contain:

| Service | Purpose |
| --- | --- |
| `web` | Nginx serving the Vite build and proxying `/api` |
| `api` | Express HTTP process |
| `worker` | Same backend image, BullMQ worker command |
| `migrate` | One-shot production migration job |
| `postgres` | Persistent relational data |
| `redis` | Better Auth secondary storage, queues, limits, and caches |
| `minio` | S3-compatible attachment storage |
| `mailpit` | Local SMTP inbox and browser UI |

Copy `.env.example` to `.env` when overriding the safe local defaults, then run:

```bash
docker compose up --build
```

### Iterating on code without rebuilding images

The `api` and `web` images bake built artifacts — `node dist/src/server.js` and the Vite bundle served by Nginx — so a source edit only reaches them through `docker compose build api web` (or `docker compose up -d --build`). That rebuild is the deployment check, not the inner loop. For day-to-day work, run the applications from source and keep the stateful services in Compose:

```bash
pnpm dev:infra   # postgres, redis, minio, mailpit; returns once they are healthy
pnpm dev         # API on :3000 (tsx watch) and Vite on :5173 (HMR, /api proxy)
```

Both processes watch the source, so edits appear without any image build. `http://localhost:5173` behaves like `http://localhost:8080` for application requests because Vite proxies `/api` to the API, and the API trusts that origin locally. If the Compose `api`, `web`, and `worker` containers are already running, stop them first (`docker compose stop api web worker`) so only one process owns `:3000`, then start them again with `docker compose up -d` when you want the same code running inside the images.

The one-shot `migrate` service applies committed Prisma migrations before the API and worker start. The committed migrations include the phase-1 baseline and the phase-2 Better Auth identity schema plus its reviewed 1.7.5 verification-timestamp upgrade. The identity schema enables `citext`, creates User/Account/Session/Verification with the pinned Better Auth columns and indexes, and adds the required Ksat `avatarSeed` field. Application models are added only in their owning slices. Docker images install from the committed lockfile and application containers run as non-root users.

Local endpoints:

- Identity application: `http://localhost:8080`
- API liveness: `http://localhost:3000/health/live`
- Application OpenAPI JSON: `http://localhost:8080/api/docs/openapi.json`
- API readiness: `http://localhost:3000/health/ready`
- Mailpit: `http://localhost:8025`
- MinIO console: `http://localhost:9001`

Swagger UI at `http://localhost:8080/api/docs` is added with the application OpenAPI slice; it is not exposed by the foundation placeholder.

Compose health checks and `depends_on: condition: service_healthy` will gate startup. Named volumes persist PostgreSQL, Redis, and MinIO data. The migration job must succeed before API/worker startup. Images run as non-root users and receive configuration through environment variables. Better Auth runs in `api`; local OAuth callbacks use the public URL (for example `http://localhost:8080/api/v1/auth/callback/...`), never an internal Compose hostname. Social providers remain disabled when their client credentials are absent.

## Testing strategy

- **Unit:** domain rules, recurrence calculations, authorization decisions, validators, cache-key/invalidation logic, and React components.
- **API integration:** Express app factory + Supertest against isolated PostgreSQL/Redis/MinIO test dependencies; test Better Auth credential/session flows and both allowed and forbidden application paths. Social-provider tests use mocked provider responses.
- **Contract:** generated application OpenAPI snapshot, Better Auth route-reference availability, and representative request/response schemas.
- **Browser:** Playwright journeys. Phase 4a covers signup → create board → create task → move it plus overflow checks; phase 4b adds assignee/date creation, edit persistence, and modal deletion; phase 5a adds a Markdown description (raw HTML not rendered), a searched dependency shown on the card, a rejected reverse cycle, and the full-screen sheet at 375px; phase 6 adds seeded recurrence pause/resume coverage.
- **Visual:** compare implemented screens at the Figma desktop dimensions and selected responsive widths. Screenshot tests support review but do not replace semantic assertions.

Tests must control time and timezone for due-date/recurrence behavior. Each bug fix adds a regression test at the lowest useful level.

## Workspace commands and quality gates

Use the Corepack-pinned pnpm version from `package.json`. The API development command loads `apps/api/.env` when present and otherwise uses safe localhost development defaults; production mode requires explicit dependency settings.

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm dev                 # local API and Vite development servers
# Copy apps/api/.env.example to apps/api/.env or export DATABASE_URL first:
pnpm db:migrate          # apply committed Prisma migrations before starting the API
SHADOW_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/ksat_shadow pnpm --filter @ksat/api db:migrate:diff
pnpm compose:config      # validate Compose configuration
pnpm test:e2e:install    # download Chromium for the browser journeys
pnpm test:e2e            # run the Playwright journeys against E2E_BASE_URL
```

Every change should pass:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm compose:config
```

`pnpm check` runs that full sequence.

The GitHub Actions workflow adds the same sequence plus the shadow-database migration-diff guard, the PostgreSQL integration suite, and the Playwright journeys. Each later slice extends that suite with its own critical journey. Dependency caching is keyed from `pnpm-lock.yaml`.

Coverage is used to find gaps, not as a substitute for behavior-based tests. Initial targets are 80% for domain/service modules and meaningful coverage for critical UI journeys.

## Delivery plan

1. **Workspace foundation (complete)** — pnpm workspace, TypeScript, lint/format, environment validation, Compose dependencies, health endpoints.
2. **Identity (complete)** — Better Auth/Prisma schema, Argon2id callbacks, signup/sign-in/sign-out/session flows, Redis secondary storage, generated DiceBear avatars, validated provider configuration, and the responsive auth UI.
3. **Boards and membership (complete)** — board creation/list/detail, admin board editing, seeded demo board, member list, invitations, Mailpit flow, authorization, and the responsive web screens with invitation acceptance.
4. **Kanban walking skeleton**
   - **4a — Task board (complete):** task board page (`1:128`); create, edit, and delete tasks with name, status, and priority; move tasks between columns; optimistic concurrency. Also adds CI and the first Playwright journey: sign up → create board → create task → move it.
   - **4b — People and dates (complete):** assignee and reporter limited to board members, calendar due dates, card metadata, and the responsive new/edit task modals (`1:1045`, `1:479`). A card click opens the full modal with deletion, conflict reload, create-more, and Radix-powered keyboard-accessible property pills.
   - **4c — Finding work (complete):** URL-backed name/sequence search; assignee, priority, status, and viewer-local due filters; due-date/priority/newest/oldest/name sorting; archive/restore with an explicit show-archived toggle; keyset pagination and stale-search cancellation.
5. **Task detail**
   - **5a — Content and dependencies (complete):** Markdown editor/rendering and same-board dependencies with transactional cycle checks.
   - **5b — Attachments:** MinIO uploads with server-side size, content-type, authorization, and ownership validation.
6. **Recurring work (complete)** — guided and advanced RRULE editing, timezone-aware queue/worker generation, idempotency, bounded catch-up, recurrence tests, a real BullMQ/PostgreSQL smoke path, and a seeded Playwright journey.
7. **Release hardening** — full accessibility audit, Figma comparison of every screen, OpenAPI review, operational documentation, and a complete end-to-end suite.

After the MVP: role changes, member removal, invitation resend, roster export, favourites, tags, and audit logs.

Every slice is complete only when:

- the contract, API, UI, migration (when needed), and tests land in the same change, so no slice ships an unusable frontend or backend;
- pending, empty, error, forbidden, keyboard, reduced-motion, and narrow-screen states are verified in that slice, not deferred to release hardening;
- its critical user journey is covered by Playwright and CI passes `pnpm check` plus the migration-diff guard;
- a brand-new account can reach and complete the new flow without seed data.

## Decision boundaries

These choices are accepted defaults for implementation, not irreversible constraints. Change one only with a short decision note in this README (choice, reason, consequences), updated agent guidance, and relevant migration/deployment notes. In particular, do not casually replace Sass Modules, Prisma, Better Auth, REST/OpenAPI, or MinIO midway through a feature.

## Agent guidance

Repository-wide rules live in [`AGENTS.md`](AGENTS.md). Pi also discovers the project workflow skill at [`.pi/skills/todo-app-workflow/SKILL.md`](.pi/skills/todo-app-workflow/SKILL.md). Future agents should read both before changing code.
