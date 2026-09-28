# Architecture

Detailed diagrams of the Ksat application. The overview and setup are in the [README](../README.md); the reasoning behind these choices is in the decision log.

- [System context](#system-context)
- [Request pipeline](#request-pipeline)
- [Code organization](#code-organization)
- [Database](#database)
- [Authentication and users](#authentication-and-users)
- [Board membership and invitations](#board-membership-and-invitations)
- [Task lifecycle](#task-lifecycle)
- [Updating a task](#updating-a-task)
- [Recurring tasks](#recurring-tasks)
- [Attachments](#attachments)
- [Frontend data flow](#frontend-data-flow)

## System context

Arrows point from the component that initiates each call.

```mermaid
flowchart LR
  B["Browser<br/>React SPA"]

  subgraph Compose["Docker Compose"]
    W["web<br/>Nginx :8080"]
    A["api<br/>Express + Better Auth<br/>:3000"]

    subgraph Data["Data and services"]
      direction TB
      M["Mailpit<br/>SMTP inbox"]
      O[("MinIO<br/>attachments")]
      R[("Redis<br/>session cache, rate limits,<br/>board cache, job queue")]
      P[("PostgreSQL<br/>source of truth")]
    end

    K["worker<br/>BullMQ"]
    MG["migrate<br/>one-shot job"]
  end

  B -->|"static files +<br/>/api/v1 (cookie)"| W
  W -->|proxy /api| A
  A -->|invitation email| M
  A -->|store/read files| O
  A -->|sessions, limits, cache| R
  A -->|Prisma queries| P
  O ~~~ K
  R ~~~ K
  P ~~~ K
  K -->|delete objects| O
  K -->|enqueue + take jobs| R
  K -->|poll cleanup outbox| P
  P ~~~ MG
  MG -->|migrations + seed| P
```

- Nginx serves the SPA and proxies `/api`, so the browser, cookies and API share one origin (no CORS).
- The worker never receives work directly from the API: it polls the `ObjectCleanup` outbox in PostgreSQL and uses a Redis queue for retries, so a Redis outage cannot lose a cleanup.
- `migrate` applies committed Prisma migrations (and demo data locally) before `api` and `worker` start.
- PostgreSQL is authoritative. If Redis is unavailable, cache reads fall back to PostgreSQL and rate limits fall back to per-process memory.

## Request pipeline

```mermaid
flowchart LR
  REQ[HTTP request] --> ID[Request ID + Pino log]
  ID --> ORI{Trusted origin?<br/>mutations only}
  ORI -- no --> E403[403 Problem Details]
  ORI -- yes --> SES{Valid session?}
  SES -- no --> E401[401 Problem Details]
  SES -- yes --> RL{Within rate limit?}
  RL -- no --> E429[429 RATE_LIMITED]
  RL -- yes --> ZOD{Zod contract valid?}
  ZOD -- no --> E400[400 VALIDATION_ERROR]
  ZOD -- yes --> SVC[Service<br/>business rules + authorization]
  SVC --> REPO[Repository<br/>membership-scoped queries]
  REPO --> DB[(PostgreSQL)]
  SVC -- domain error --> PD["4xx Problem Details<br/>stable code"]
  SVC -- success --> RES["2xx JSON response"]
```

- Route handlers only parse input and map results to HTTP; business rules live in services, queries in repositories.
- Every board query includes the caller's membership, so another board's IDs return `404` rather than leaking existence.
- Errors use RFC 9457 Problem Details with a stable `code` and request ID; stack traces are never returned.

## Code organization

```mermaid
flowchart TB
  subgraph contracts["packages/contracts (Zod)"]
    S[Request/response schemas]
  end
  subgraph web["apps/web"]
    F[features: auth, boards,<br/>invitations, tasks]
    Q[lib/api: fetch client +<br/>TanStack Query hooks]
    C[components + Sass tokens]
    F --> Q
    F --> C
  end
  subgraph api["apps/api"]
    RT[routes.ts]
    MOD[modules: service + repository]
    INF[infrastructure: Prisma, Redis,<br/>S3, SMTP, queues]
    OA[openapi.ts]
    RT --> MOD --> INF
  end
  Q --> S
  RT --> S
  OA --> S
  SW[Swagger UI /api/docs] --> OA
```

Arrows point to what each part depends on.

- One schema definition drives server validation, client types, client response validation and the OpenAPI document.
- The web app is organized by feature; shared UI moves to `components` only when reused.

## Database

```mermaid
erDiagram
  USER ||--o{ SESSION : has
  USER ||--o{ ACCOUNT : "signs in with"
  USER ||--o{ BOARD_MEMBERSHIP : "belongs to"
  BOARD ||--o{ BOARD_MEMBERSHIP : has
  USER ||--o{ BOARD : owns
  BOARD ||--o{ BOARD_INVITATION : has
  USER ||--o{ BOARD_INVITATION : invites
  BOARD ||--o{ TASK : contains
  USER ||--o{ TASK : creates
  USER |o--o{ TASK : "assigned to"
  TASK ||--o{ TASK_DEPENDENCY : "depends on"
  TASK ||--o{ TASK_DEPENDENCY : "is required by"
  TASK ||--o{ ATTACHMENT : has
  TASK |o--o| TASK_SCHEDULE : "template of"
  TASK_SCHEDULE ||--o{ SCHEDULE_OCCURRENCE : generates
  SCHEDULE_OCCURRENCE |o--o| TASK : "created task"

  USER {
    uuid id PK
    citext email UK
    string name
    string avatarSeed
  }
  BOARD {
    uuid id PK
    string name
    uuid ownerId FK
    int version
    int nextTaskSequence
  }
  BOARD_MEMBERSHIP {
    uuid boardId FK
    uuid userId FK
    enum role "ADMIN, MANAGER, CONTRIBUTOR"
  }
  BOARD_INVITATION {
    uuid id PK
    citext email
    enum role
    string tokenHash UK
    datetime expiresAt
    datetime acceptedAt
    datetime revokedAt
  }
  TASK {
    uuid id PK
    uuid boardId FK
    int sequence "unique per board"
    string name
    string description "Markdown"
    enum status
    enum priority
    date dueDate
    uuid assigneeId FK
    int version
    datetime deletedAt "soft delete"
  }
  TASK_DEPENDENCY {
    uuid boardId FK
    uuid taskId PK
    uuid dependsOnTaskId PK
  }
  TASK_SCHEDULE {
    uuid id PK
    uuid taskId FK
    string rrule
    string timezone
    datetime nextRunAt
    boolean enabled
  }
  SCHEDULE_OCCURRENCE {
    uuid scheduleId FK
    datetime scheduledAt "unique with scheduleId"
    uuid generatedTaskId FK
  }
  ATTACHMENT {
    uuid id PK
    uuid taskId FK
    string objectKey UK
    string mediaType
    int byteSize
    string checksumSha256
  }
```

Constraints enforced by PostgreSQL, not only by application code:

- **Same-board rules:** composite foreign keys keep both ends of a dependency on the same board, and require an assignee to be a member of the task's board.
- **Integrity checks:** no self-dependency, non-empty names, description length, unique task number per board, one pending invitation per board and email.
- **Idempotency:** `(scheduleId, scheduledAt)` is unique, so an occurrence can only be created once.
- **Search:** a `pg_trgm` GIN index supports case-insensitive name search; composite indexes cover board, status, assignee and due-date queries.
- Session, account and verification tables are managed by Better Auth; `ObjectCleanup` is an outbox for deleting attachment files.

## Authentication and users

```mermaid
sequenceDiagram
  actor U as User
  participant W as Web app
  participant BA as Better Auth (in API)
  participant P as PostgreSQL
  participant R as Redis

  U->>W: Sign up (name, email, password)
  W->>BA: POST /api/v1/auth/sign-up/email
  BA->>BA: Argon2id hash, UUIDv7 id, random avatar seed
  BA->>P: Create user + credential account + session
  BA->>R: Cache session (secondary storage)
  BA-->>W: Set HttpOnly session cookie

  U->>W: Open a board
  W->>BA: Request with cookie
  BA->>R: Look up session (fallback to PostgreSQL)
  BA-->>W: Authenticated user
  Note over W,P: Application services then check board membership and role
```

- Sessions are opaque, server-side and revocable; no tokens are stored in `localStorage`.
- Sign-in failures do not reveal whether an email exists; sign-up and sign-in are rate limited.
- Avatars are generated in the browser from the stored seed, with no third-party request.
- **Authentication** (who you are) is handled by Better Auth; **authorization** (what you can do on a board) is handled by application services.

| Role          | Tasks | View members | Invite/cancel members | Invite admins | Edit board |
| ------------- | ----- | ------------ | --------------------- | ------------- | ---------- |
| `ADMIN`       | Yes   | Yes          | Yes                   | Yes           | Yes        |
| `MANAGER`     | Yes   | Yes          | Yes                   | No            | No         |
| `CONTRIBUTOR` | Yes   | Yes          | No                    | No            | No         |

## Board membership and invitations

```mermaid
sequenceDiagram
  actor A as Admin or manager
  participant API
  participant P as PostgreSQL
  participant M as Mailpit (SMTP)
  actor I as Invitee

  A->>API: POST /boards/:id/invitations (email, role)
  API->>API: Generate random token
  API->>P: Store SHA-256 hash only<br/>(replaces older pending invite)
  API->>M: Send link with plain token (after commit)
  API-->>A: 201 invitation (email delivery status)
  M->>I: Invitation email
  I->>API: GET /invitations/:token
  API-->>I: Preview: board, role, inviter, expiry
  I->>API: POST /invitations/:token/accept (signed in)
  API->>P: Check expiry, revocation and email match,<br/>create membership + mark accepted (one transaction)
  API-->>I: Member of the board
```

- Plain tokens are never stored or returned by the API.
- Concurrent accepts cannot create duplicate memberships; cancellation and acceptance cannot both succeed.
- If email delivery fails, the invitation stays valid and the API reports `emailDelivery: "FAILED"`.

## Task lifecycle

```mermaid
stateDiagram-v2
  state "Visible" as Visible {
    state "Active (board columns)" as Active {
      [*] --> NOT_STARTED: create
      NOT_STARTED --> IN_PROGRESS: dependencies settled
      IN_PROGRESS --> COMPLETED: dependencies settled
    }
    Active --> ARCHIVED: archive
    ARCHIVED --> Active: restore to a chosen column
  }
  state "Soft-deleted" as Deleted
  [*] --> Visible
  Visible --> Deleted: DELETE (deletedAt set)
  Deleted --> Visible: operator restore command
```

- Arrows show the usual flow; a versioned update can move a task between any statuses, subject to the dependency rule.
- **Dependency rule:** a task cannot move into `IN_PROGRESS` or `COMPLETED` while a prerequisite is `NOT_STARTED` or `IN_PROGRESS`.
- `ARCHIVED` tasks are hidden unless the board's show-archived toggle is on; archiving a recurring template pauses its schedule.
- Deleting sets `deletedAt`: the task disappears from the API (`404`) but its data, dependencies and attachments are kept for recovery.

## Updating a task

Every edit, drag-and-drop move and archive goes through the same versioned update, in one transaction:

```mermaid
flowchart TD
  START["PATCH /tasks/:id<br/>full task state + version"] --> VIS{Task visible<br/>to this member?}
  VIS -- no --> NF[404 TASK_NOT_FOUND]
  VIS -- yes --> PPL{Assignee and dependencies<br/>on the same board?}
  PPL -- no --> E422A["422 TASK_ASSIGNEE_NOT_MEMBER<br/>or TASK_DEPENDENCY_NOT_FOUND"]
  PPL -- yes --> NEW{New dependencies added?}
  NEW -- yes --> LOCK[Lock board row] --> CYC{Would create a cycle?}
  CYC -- yes --> E422C[422 TASK_DEPENDENCY_CYCLE]
  CYC -- no --> GATE
  NEW -- no --> GATE{Moving into IN_PROGRESS<br/>or COMPLETED?}
  GATE -- yes --> SET{All prerequisites settled?}
  SET -- no --> E422D[422 TASK_DEPENDENCIES_INCOMPLETE]
  SET -- yes --> WRITE
  GATE -- no --> WRITE["UPDATE ... WHERE version = expected"]
  WRITE --> ROWS{Row updated?}
  ROWS -- no --> E409[409 TASK_VERSION_CONFLICT]
  ROWS -- yes --> EDGES[Apply dependency changes,<br/>schedule changes]
  EDGES --> DONE{Newly COMPLETED<br/>and recurring?}
  DONE -- yes --> OCC[Create next occurrence]
  DONE -- no --> OK[200 updated task, version + 1]
  OCC --> OK
```

- **Optimistic concurrency:** the update only applies if the stored `version` still matches; otherwise the client reloads the latest task.
- **Cycle safety:** locking the board row serializes dependency changes, so two users cannot each add half of a loop (A→B and B→A) at the same time.
- New tasks get their board number the same way: the board row is locked and `nextTaskSequence` incremented in the insert transaction.

## Recurring tasks

```mermaid
sequenceDiagram
  actor U as User
  participant API
  participant P as PostgreSQL

  U->>API: Create task with due date + schedule<br/>(RRULE + IANA timezone)
  API->>API: Validate rule, use due date as current occurrence
  API->>P: Save task + schedule

  U->>API: Move current task to COMPLETED
  API->>P: BEGIN
  API->>P: Update task (versioned)
  API->>API: Calculate next due date after now<br/>(missed intervals skipped)
  API->>P: Create NOT_STARTED task with next due date
  API->>P: Record occurrence (scheduleId, scheduledAt) unique
  API->>P: Hand schedule to the next task<br/>and advance its due date, or disable when exhausted
  API->>P: COMMIT
  API-->>U: Completed task, next occurrence on the board
```

- The schedule is a due-date pattern. Reaching a scheduled date does not create a task; completing the current task creates exactly one next occurrence.
- A recurring task must have a due date, which is the current occurrence's date and the schedule anchor.
- Occurrences are separate tasks: they copy name, description, priority and assignee, but not dependencies or attachments.
- The schedule is handed to the newly generated task in the same transaction. Every current occurrence is therefore marked recurring and can create its successor; deleting an older occurrence, including the original task, does not break the series.
- The unique `(scheduleId, scheduledAt)` record prevents duplicates from retries or concurrent completions.
- Recurrence is evaluated in the chosen timezone, so calendar dates remain stable across daylight-saving changes.
- The **Repeat** menu offers due-date presets and a **Custom…** dialog (interval, weekdays, monthly day or nth weekday, never/on date/after N ends, timezone). Date-derived patterns follow the task when its due date moves. The UI stores RRULEs but never exposes raw RRULE text; the API still validates every rule and rejects unsupported parts.

## Attachments

```mermaid
sequenceDiagram
  actor U as User
  participant API
  participant O as MinIO
  participant P as PostgreSQL
  participant R as Redis queue
  participant K as Worker

  U->>API: Upload file (multipart)
  API->>API: Check size limits,<br/>detect type from content
  API->>O: Put object at generated key<br/>tasks/{taskId}/{uuid}
  API->>P: Save metadata + checksum
  Note over API,O: If saving metadata fails, the object is deleted
  API-->>U: 201 attachment

  U->>API: Remove attachment
  API->>P: Delete metadata + add ObjectCleanup row (one transaction)
  API-->>U: 204
  loop Every 30 seconds
    K->>P: Find unfinished cleanups
    K->>R: Enqueue job (id = cleanup id)
  end
  K->>R: Take next job (retried with backoff)
  K->>O: Delete object
  K->>P: Mark cleanup completed
```

- The bucket is private; files are streamed through the API after a membership check, and object keys are never exposed.
- Allowed types (JPEG, PNG, GIF, WebP, PDF, plain text) are detected from file content, not the browser's declared type. Limits: 10 MiB per file, 50 MiB per task.
- Soft-deleting a task keeps its attachments, so they are restored with it.

## Frontend data flow

```mermaid
flowchart LR
  URL["URL search params<br/>q, filters, sort, archived"] --> BOARD[Task board page]
  BOARD --> QRY["TanStack Query<br/>useInfiniteQuery"]
  QRY -->|debounced, cancellable fetch| API[GET /boards/:id/tasks]
  API --> CACHE[(Query cache)]
  CACHE --> COLS["Virtualized status columns"]
  COLS -->|drag, edit, archive| MUT[Mutation]
  MUT -->|1. update cache immediately| CACHE
  MUT -->|2. PATCH with version| API2[PATCH /tasks/:id]
  API2 -- error --> RB[Restore previous cache + toast]
  API2 -- 409 --> RL[Offer reload latest]
  API2 -- success --> REF[Refetch authoritative data]
```

- **State ownership:** server data in TanStack Query, forms in React Hook Form, shareable view state in the URL, and short-lived UI state in components. No global store.
- Every API response is validated against the shared contracts before it reaches components.
- Columns render only visible cards, so boards with 10,000+ tasks stay responsive while pages load on demand.
