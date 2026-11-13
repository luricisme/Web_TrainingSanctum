---
name: 'Training Sanctum — Flashcards'
type: architecture-spine
purpose: build-substrate
altitude: initiative
paradigm: 'layered monolith with an isolated pure-domain core'
scope: 'Training Sanctum Flashcards v1 — full-stack architecture for prd-Web_TrainingSanctum-2026-10-29'
status: final
created: '2026-11-01'
updated: '2026-11-13'
binds: [FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8, FR-9, FR-11, FR-12, FR-13, FR-14, FR-15, FR-16, FR-17]
sources:
  - ../../prds/prd-Web_TrainingSanctum-2026-10-29/prd.md
  - ../../ux-designs/ux-Web_TrainingSanctum-2026-10-29/DESIGN.md
  - ../../ux-designs/ux-Web_TrainingSanctum-2026-10-29/EXPERIENCE.md
companions: []
---

# Architecture Spine — Training Sanctum — Flashcards

## Design Paradigm

**Layered monolith with an isolated pure-domain core** (hexagonal-lite): one Next.js deployable, but the algorithmic heart (SM-2 scheduling, import parsing, duplicate detection) lives in a framework-free TypeScript package with zero knowledge of HTTP, React, or the database — unit-testable with nothing mocked, callable only through the API layer.

| Layer | Namespace | Role |
| --- | --- | --- |
| UI | `apps/web/app/**` (pages, components) | Renders state, calls the API over HTTP via TanStack Query. Never imports domain or db packages directly. |
| API (adapter) | `apps/web/app/api/**/route.ts` | Sole boundary. Validates input (Zod), calls domain for decisions, calls db for persistence, owns transactions. |
| Domain (core) | `packages/domain` | Pure functions: SM-2 engine, import parsing, duplicate detection. No HTTP/React/Prisma imports. |
| Persistence | `packages/db` | Prisma schema, generated client, migrations. No business logic. |

```mermaid
graph TD
  UI["UI (apps/web/app/**)"] -->|"fetch / TanStack Query (HTTP)"| API["API (app/api/**/route.ts)"]
  API --> Domain["Domain (packages/domain)"]
  API --> DB["Persistence (packages/db · Prisma)"]
```

Dependency direction is one-way, top to bottom. Domain and Persistence have no outgoing edges to API or UI, and no edge to each other — the API layer is the only thing that knows both exist.

## Invariants & Rules

### AD-1 — Domain isolation

- **Binds:** all layering; FR-8, FR-6, FR-7
- **Prevents:** scheduling or import logic re-implemented differently in an API handler vs. a UI component vs. a future script; domain logic that can't be tested without mocking Next.js/Prisma.
- **Rule:** `packages/domain` has zero imports from `next`, `react`, `@prisma/client`, or any HTTP/db library. Every exported domain function is a pure function of its inputs. Only `apps/web/app/api/**` may import `packages/domain` — **except** that a UI component may import a pure, side-effect-free validation schema (e.g. a Zod schema) from `packages/domain` to validate input client-side before a call that has no dedicated Route Handler of its own (e.g. `signUp.email` against Better Auth's catch-all route, story 1.2). This exception covers validation schemas only, never the SM-2 engine, import parsing, duplicate detection, or any other domain logic — those remain reachable only through `app/api/**`.

### AD-2 — Single data-access path

- **Binds:** all persistence
- **Prevents:** a second ORM, a raw-SQL escape hatch in an API handler, or the UI/domain packages querying the database directly — any of which would let schema assumptions drift out of sync with `packages/db`.
- **Rule:** Postgres is reachable only through the Prisma client exported by `packages/db`. No other package instantiates `PrismaClient` or issues raw SQL. Schema changes happen only via Prisma migrations in `packages/db`.

### AD-3 — API boundary shape

- **Binds:** all client–server calls
- **Prevents:** integration tests exercising React Server Component internals instead of a real, versioned HTTP contract; a mixed Server-Actions/Route-Handlers surface with two different calling conventions.
- **Rule:** Every client–server interaction is a Next.js Route Handler under `app/api/**/route.ts`. Server Actions are not used for data mutations or queries.

### AD-4 — Grade-submission transaction (single write path for SM-2 state)

- **Binds:** FR-8, FR-17
- **Prevents:** a Scheduling Record's `interval`/`repetitions`/`ease_factor`/`next_review_date` being written from more than one code path and diverging from the SM-2 spec; enforces the PRD §5 non-goal that no manual scheduling-state edit exists.
- **Rule:** Only two Route Handlers may write these five fields (`interval`, `repetitions`, `ease_factor`, `next_review_date`, `first_graded_at`): `POST /api/review/grade` (loads current state, calls the pure `applyGrade` domain function, persists the result inside one Prisma `$transaction`, and sets `first_graded_at = now` only when it is null) and `POST /api/restore` (FR-14), which writes them verbatim from a validated backup export inside its own transaction, replacing existing rows rather than computing new values. No other Route Handler, script, or admin path writes them, and no path other than these two ever *computes* a new value for them outside `applyGrade`.

### AD-5 — Import logic lives in domain

- **Binds:** FR-6, FR-7
- **Prevents:** paste-import and CSV-import Route Handlers independently reimplementing (and silently diverging on) parsing or duplicate-detection rules.
- **Rule:** `parseImportBlock` and `detectDuplicates` are pure functions in `packages/domain`, called identically by the paste and CSV/Excel import Route Handlers. Import is two steps: `POST /api/import/parse` (paste text + delimiter, or file + column mapping, + `flashcardId`) returns parsed rows with source line numbers, per-row errors and duplicate flags and **writes nothing**; the user edits them in the import review editor; `POST /api/cards/batch` (the same endpoint Manual mode uses, with `source: "import"`) commits them, re-running row validation and `detectDuplicates` against the target Flashcard's current Cards inside the commit transaction, and returns the Created / Duplicates skipped / Errors groups. A Route Handler may adapt input shape (e.g. `xlsx` sheet → row array) but may not re-implement parsing or duplicate rules itself.

### AD-6 — Request validation boundary

- **Binds:** all Route Handlers
- **Prevents:** malformed or edge-case input reaching domain logic or Prisma looking superficially valid.
- **Rule:** Every Route Handler validates its body/query with a Zod schema before calling domain or db code. A validation failure returns the standard error envelope (see Consistency Conventions) and never reaches domain/db.

### AD-7 — Client data flow for the review loop

- **Binds:** FR-9
- **Prevents:** the review UI blocking on a full request/response round trip to advance, which would violate the sub-100ms perceived-transition requirement under real network conditions.
- **Rule:** The review and Learn screens (one shared session component) use TanStack Query with optimistic updates: grading a card updates local cache and advances to the next queue entry immediately, fires `POST /api/review/grade` in the background, and rolls back + surfaces an error only on failure. No other screen requires this pattern.

### AD-8 — Local day-boundary source of truth

- **Binds:** FR-8 (due-date computation), FR-12 and FR-19 (quest-day attribution and settlement)
- **Prevents:** due-queue inclusion and quest-day attribution being computed against two different clocks (e.g. server UTC day vs. client wall-clock day), which would silently desync the features the PRD requires to share one clock basis.
- **Rule:** `User.timezone` (IANA string, captured from the browser at signup, not user-editable in v1) is the single source of local-day truth. The API converts UTC "now" to `User.timezone` before (a) filtering the due queue against `next_review_date`, (b) attributing a first grade (`first_graded_at`) or a review grade to a calendar day for Daily Quest conditions, and (c) choosing which days cultivation settlement covers (AD-15). All of these call the same domain helper (`toLocalCalendarDay`).

### AD-9 — Card creation is a single shared path

- **Binds:** FR-3, FR-6, FR-7
- **Prevents:** manual card creation, paste import, and CSV import each independently deciding a new Card's `SchedulingRecord` defaults (e.g. `next_review_date` = creation instant vs. local midnight), which would be individually spine-compliant yet produce inconsistent initial due-dates depending on which entry path was used.
- **Rule:** All three creation paths call one function, `createCardWithSchedulingRecords` (in `packages/domain`, taking the five Card fields and returning a Card + exactly two fresh `SchedulingRecord`s at defaults `ease_factor = 2.5`, `repetitions = 0`, `next_review_date = start of today` via `toLocalCalendarDay`, AD-8, and `first_graded_at = null` — the Card is Unlearned until graded in Learn, FR-17). No Route Handler constructs a `SchedulingRecord` by hand.

### AD-10 — Response envelope & export/restore schema

- **Binds:** all Route Handlers; FR-13, FR-14
- **Prevents:** each GET endpoint independently choosing a response shape (bare array vs. `{data:[...]}` vs. `{items,total}`), and the export (FR-13) and restore (FR-14) routes drifting apart on field names/nesting since nothing currently forces them to agree.
- **Rule:** Every successful Route Handler response is `{ data: T }` (or `{ data: T[], meta?: {...} }` for paginated/listy endpoints) — defined as a shared generic type in `packages/domain/http.ts`, imported by both the Route Handler and the UI's fetch wrapper. FR-13's export payload shape and FR-14's restore input are the **same single Zod schema** (`backupExportSchema`, in `packages/domain`): the export route serializes to it, the restore route parses and validates against it — one schema, not two independently written shapes that happen to agree today. `backupExportSchema` includes `firstGradedAt` per Scheduling Record (Sprint Change 2026-11-13). It also carries `user.studyDirections`, and restore writes it back (Sprint Change 2026-11-13b). It carries a `cultivation` section — `{ xp, settledThrough, days[], xpEvents[] }` — restored verbatim, except that restore sets `settledThrough` to yesterday so no penalty is charged for the export-to-restore gap (Sprint Change 2026-11-14, AD-15).

### AD-11 — Backup cadence, on-demand export, and destructive-operation atomicity (resolves PRD §10 Q1)

- **Binds:** §6 Data durability NFR, FR-5 (folder-delete, flashcard-delete and class-delete cascades), FR-13, FR-14
- **Prevents:** a folder-delete, flashcard-delete, class-delete (move-folders or delete-all) or a restore left half-applied by a mid-operation failure (e.g. some Flashcards moved to Unsorted/some not; some Scheduling Records restored/some not), which would itself be a silent-data-loss event.
- **Rule:** Two distinct, non-conflicting durability mechanisms: (1) Neon's built-in point-in-time-recovery / backup retention (its platform default for the plan tier in use) covers infrastructure-level durability, requiring no application code; (2) FR-13's export is strictly user-initiated and on-demand — v1 does not add a scheduled/automatic export job (additive later, not a replacement for this AD). Separately: folder-delete (both options), flashcard-delete, class-delete (both of its options, including the Unsorted merge and name-clash renames for Folders and Flashcards) (FR-5) and restore (FR-14) are each wrapped in one Prisma `$transaction` — every row changes or none do; a mid-operation failure leaves prior state fully intact, never partially applied.

### AD-12 — Testing architecture

- **Binds:** PRD §6 testability NFR
- **Prevents:** a second, divergent test-runner setup growing up for API vs. E2E tests; domain tests requiring a running server or database.
- **Rule:** Vitest runs `packages/domain` unit tests with no network/DB/browser dependency. Playwright runs both the API/integration suite (via its `request` fixture against Route Handlers, with a seeded test database) and the E2E suite (via its browser fixture against a running app). GitHub Actions runs all three suites on every push.

### AD-13 — Performance budgets

- **Binds:** FR-9, §6 general-load NFR
- **Prevents:** "fast" being a vague, unmeasurable target that different parts of the app interpret differently.
- **Rule:** In-session grade→next-card transition: sub-100ms perceived latency (enforced by AD-7's optimistic update). App open → due queue rendered: 200ms budget, measured from navigation start to due-queue paint, excluding cold serverless function start. Paste/CSV import (FR-6, FR-7): under 5 seconds of system time — the parse call (Preview click → review editor rendered) plus the commit call (Save click → Cards persisted and visible in the Folder), excluding the user's editing time in between. This bounds import batch size, not just the parse step.

### AD-14 — Learned vs. unlearned is one per-direction predicate (Sprint Change 2026-11-13, 2026-11-13b)

- **Binds:** FR-9, FR-15, FR-16, FR-17, FR-18
- **Prevents:** the Review queue, the Learn queue, the Learn button counts and Stats each deriving "learned" differently (e.g. `interval === 0`, `repetitions === 0`, or "has any grade"), or each applying the study-directions setting differently, which would let a record show up in both queues or in neither.
- **Rule:** A Scheduling Record is **learned** when `first_graded_at IS NOT NULL`. Every queue and count is filtered to the user's **studied directions**, derived once from `User.studyDirections` by a pure domain helper `studiedDirections(setting) → RecallDirection[]`. The predicates live once in `packages/domain` as Prisma-`where`-shaped builders taking those directions (plain objects, no DB import): `learnedRecordWhere(dirs)`, `unlearnedRecordWhere(dirs)`, and the Card-level `unlearnedCardWhere(dirs)` (some unlearned record in a studied direction) / `learnedCardWhere(dirs)` (none), used only for counts and Stats. They are used by `GET /api/review/queue`, `GET /api/review/learn`, the Learn counts on `GET /api/flashcards/[id]` and `GET /api/stats`. Review queue = learned, due records in studied directions. Learn queue = the Flashcard's unlearned records in studied directions (Cards in creation order, each Card's directions together, TERM_TO_DEFINITION first), followed by its learned, due records in studied directions, oldest-due-first. Records of unstudied directions are never read into a queue and never written: turning a direction off or on changes no row. The card viewer and the Learn practice run (both client-side, no grade POST) take the prompt side from the same helper. In-session "repeat until correct" (an Again entry re-shown at the end of a Learn session) is client-side practice only: the session POSTs each entry's first Grade once and never POSTs the repeats, so AD-4's single write path and the grade route's not-due 409 stay intact.

### AD-15 — Cultivation ledger and lazy settlement (Sprint Change 2026-11-14)

- **Binds:** FR-12, FR-19, FR-13/FR-14 (cultivation section), FR-15 (XP history)
- **Prevents:** XP drifting from its history; a quest claimed twice; a missed day penalized twice (two tabs, a claim racing a page load); quest rules duplicated between UI and API; a scheduled job that v1's hosting (Vercel + Neon free tier) doesn't need.
- **Rule:**
  - The ladder (90 levels, PRD addendum), the quest table, the two quest-condition evaluators (`LEARN_FLASHCARDS`, `CLEAR_REVIEW`), `levelForXp(xp)`, `questsForLevel(level)` and `settleDays(...)` are pure functions and constants in `packages/domain/cultivation.ts` (AD-1). Route Handlers fetch the facts (counts, timestamps) and pass them in; the domain decides.
  - Only two paths write XP: (1) `POST /api/cultivation/quests/[kind]/claim`, which re-checks the quest's condition server-side and then writes one `XpEvent(+xp)` and marks the quest claimed in the day's `CultivationDay` row; (2) settlement.
  - Settlement runs at the start of `GET /api/cultivation` and of the claim route, inside one Prisma `$transaction`. It covers every local day from `User.cultivationSettledThrough + 1` to yesterday, in order. For each day it writes one `XpEvent(−2·xp)` per quest that was neither claimed nor skipped (a done-but-unclaimed quest is penalized), then advances `cultivationSettledThrough`. A day's realm (and so its Bộ, targets and XP) is the one in effect after the previous day settled.
  - The quests for a day come from its `CultivationDay` row: a snapshot of the quest kinds, targets, XP, skip flags and claim status, created on the first cultivation read of that day. A day with no row (the app wasn't opened) is rebuilt during settlement; its skip flags come from the data (Flashcards with unlearned records whose `createdAt ≤ day`; learned records with `next_review_date ≤ day`).
  - `User.cultivationXp` caches the `XpEvent` deltas applied in order with a running floor at 0. It is updated in the same transaction as each `XpEvent`. The realm is never stored; it is always `levelForXp(cultivationXp)`.
  - First run: when `cultivationSettledThrough` is null, it is set to yesterday and nothing earlier is settled. Restore sets it to yesterday too (AD-10).
  - Idempotency: unique `(userId, localDay)` on `CultivationDay`, a conditional update on `cultivationSettledThrough` (only advance from the value read), and a claim that only flips an unclaimed quest. A concurrent loser retries or returns the current state.
  - The grade route (AD-4) is not changed: quest conditions read `first_graded_at`, `updated_at` and `next_review_date`, which it already writes.
  - No cron or scheduled job.

## Consistency Conventions

| Concern | Convention |
| --- | --- |
| Naming (entities, files) | Domain vocabulary is binding: `Class`, `Folder`, `Flashcard`, `Card`, `SchedulingRecord`, `User` — Prisma model names match these exactly, no translation layer between schema and PRD glossary. Only exception: if Prisma rejects `Class` as a reserved model name, use `StudyClass` with `@@map("class")` and keep "Class" everywhere in UI and API paths. |
| IDs | All primary keys are Prisma-generated `cuid()` strings. |
| Dates & timezone | All timestamps stored in UTC. Local-day computations go through `User.timezone` per AD-8 — never a raw client `Date` or server-local timezone. |
| Error envelope | Every Route Handler error response is `{ error: { code: string, message: string, fields?: Record<string, string>, details?: { line: number, reason: string }[] } }`, HTTP status matching `code`. `fields` is for single-record field-level errors (FR-3: one bad field per request); `details` is for batch/line-numbered errors (FR-6/FR-7: one entry per failed row). A response uses at most one of the two, never both, and never a bare string or toast-only message. |
| State & mutation | Only Route Handlers mutate persisted state (AD-1, AD-2, AD-4). Client state (TanStack Query cache) is a projection, never a source of truth. |
| Observability | Every write path that can silently lose data if it fails partway (import commit, grade write, export, restore, folder-delete, flashcard-delete and class-delete cascades) logs a structured, single-line summary (operation, record counts including flashcard counts, outcome) on completion or failure — enough to audit "did this actually happen" against the §6 durability NFR. Full APM/tracing is out of scope for v1 (see Deferred). |
| Auth | Better Auth session cookie required on every Route Handler except `/api/auth/**`; unauthenticated requests return `401` with the standard error envelope. Session lifetime is a fixed 30-day sliding window (refreshed on activity) — resolves PRD §10 Open Question 2. |
| Config | Environment variables validated against a Zod schema at process start (`DATABASE_URL`, `BETTER_AUTH_SECRET`, etc.); the app fails fast on a missing/malformed var rather than failing deep inside a request. |
| Text encoding (Unicode) | All five Card text fields are Postgres `TEXT` columns with the database's default UTF-8 encoding; no ASCII/Latin-1 collation, no server-side normalization or stripping of non-Latin scripts, combining diacritics, or IPA symbols. Resolves PRD §6 "Accessibility of input" NFR. |

## Stack

| Name | Version |
| --- | --- |
| Next.js | 16.x (App Router, Turbopack default, Node 20+) |
| TypeScript | 5.x |
| Prisma | 7.8.x |
| Postgres (hosted) | Neon, free tier |
| Better Auth | current stable, `@better-auth/prisma-adapter` (or the version-matched `better-auth/adapters/prisma` subpath — confirm against whichever Better Auth version is pinned at build time) (Vercel-backed successor to Auth.js/NextAuth, which is now maintenance-only) |
| TanStack Query | v5 |
| Zod | latest 3.x/4.x |
| Tailwind CSS | v4, CSS variables mapped to `DESIGN.md` tokens |
| Vitest | latest |
| Playwright | latest |
| Hosting | Vercel |
| CI | GitHub Actions |

## Structural Seed

```text
training-sanctum/
  apps/
    web/
      app/
        (routes)/              # pages: review, classes (→ class → folder → flashcard, incl. Add cards: manual + import on the flashcard page), cultivation (replaces stats), settings
        api/
          auth/[...all]/       # Better Auth handler
          classes/              # Class CRUD + class-delete (move folders / delete all)
          folders/              # Folder CRUD (always under a class); GET returns the folder's Flashcards with card counts
          flashcards/           # Flashcard CRUD (always under a folder); POST flashcards/[id]/move moves a Flashcard to any Folder
          cards/                # Card CRUD; cards/batch (takes `flashcardId`) = the single multi-row create used by Manual mode and import commit
          import/parse/         # paste + CSV/Excel parse for a flashcardId — read-only, returns rows for the review editor
          review/
            queue/              # GET due queue of learned Cards; optional ?classId= or ?folderId= scope (FR-9, AD-14)
            learn/              # GET Learn queue for ?flashcardId= (required): unlearned entries then due entries, plus counts (FR-17, AD-14)
            grade/               # POST grade (AD-4)
          settings/              # GET/PATCH the user's study-directions setting (FR-18, AD-6)
          stats/
          cultivation/           # GET: settle past days, then realm, XP and today's quests (FR-12, FR-19, AD-15)
            quests/[kind]/claim/ # POST: claim one of today's quests (AD-15)
          export/                # FR-13
          restore/               # FR-14
        components/
      lib/                      # TanStack Query client, API fetch wrappers
  packages/
    domain/
      sm2.ts                    # FR-8 engine
      import.ts                 # FR-6/FR-7 parsing + duplicate detection
      cultivation.ts            # FR-12, FR-19: ladder, quests, settlement (AD-15), uses toLocalCalendarDay (AD-8)
      time.ts                   # toLocalCalendarDay helper
    db/
      schema.prisma             # Class, Folder, Flashcard, Card, SchedulingRecord, User, CultivationDay, XpEvent
      client.ts                 # exported Prisma client singleton
  tests/
    domain/                     # Vitest
    api/                        # Playwright request fixture
    e2e/                        # Playwright browser fixture
```

### Core entities (ERD)

```mermaid
erDiagram
  USER ||--o{ CLASS : owns
  CLASS ||--|{ FOLDER : "contains (incl. 1 Unsorted)"
  USER ||--o{ CARD : owns
  FOLDER ||--o{ FLASHCARD : contains
  FLASHCARD ||--o{ CARD : contains
  CARD ||--|| SCHEDULING_RECORD : "term->definition"
  CARD ||--|| SCHEDULING_RECORD : "definition->term"
  USER ||--o{ CULTIVATION_DAY : "quest days"
  USER ||--o{ XP_EVENT : "XP ledger"
```

A `Card` always has exactly two `SchedulingRecord`s (one per Recall Direction, AD enforced by the Card-creation Route Handler, not a DB constraint beyond a unique `(cardId, direction)` index). Every `Class` has exactly one `Folder` with `isUnsorted = true`, created in the same transaction as the Class and enforced by a partial unique index on `(classId) WHERE isUnsorted`. `Folder.classId`, `Flashcard.folderId` and `Card.flashcardId` are required (non-null) — there is no Card without a Flashcard, no Flashcard without a Folder and no Folder without a Class. `Flashcard` carries only a `name`, unique per Folder case-insensitively, and `Card` also carries `userId`. `SchedulingRecord` carries `first_graded_at` (nullable UTC timestamp, AD-14). Its migration adds the column and backfills `first_graded_at = updated_at` where `interval > 0` — the only rows ever graded, since `applyGrade` never returns interval 0. `User` carries `studyDirections` (enum `BOTH | TERM_TO_DEFINITION | DEFINITION_TO_TERM`, non-null, default `BOTH`, FR-18). Its migration adds the column with the default, so every existing account keeps studying both directions. A Card still always has both Scheduling Records whatever the setting (AD-9 unchanged). `User` also carries `cultivationXp` (int, default 0) and `cultivationSettledThrough` (date, nullable) (AD-15). `CultivationDay` is `(userId, localDay date, quests JSON)` with a unique `(userId, localDay)`; `XpEvent` is `(userId, localDay date, questKind, delta int, reason CLAIM | PENALTY, createdAt)`, append-only. Both migrations are additive.

### Deployment & environments

- **Production:** Vercel project (web app) + Neon production branch (Postgres). Env vars set in Vercel project settings.
- **Preview:** Vercel preview deployments per branch/PR, each paired with a Neon branch (serverless branching) seeded from a minimal fixture set — not a copy of production data.
- **CI:** GitHub Actions spins up a disposable Postgres (Neon branch or local container) for the API/integration suite; no shared test database across runs.
- **Local dev:** `.env.local` pointing at a local or personal Neon dev branch; `prisma migrate dev` is the only way schema changes are made locally.

## Capability → Architecture Map

| Capability / Area | Lives in | Governed by |
| --- | --- | --- |
| FR-1, FR-2 Auth & session | `app/api/auth/**`, Better Auth config | Stack (Better Auth), Consistency Conventions (Auth) |
| FR-3, FR-4 Card CRUD | `app/api/cards/**` | AD-2, AD-6, AD-9 |
| FR-5 Class, Folder & Flashcard CRUD (incl. Flashcard move) | `app/api/classes/**`, `app/api/folders/**`, `app/api/flashcards/**` | AD-2, AD-6, AD-11 |
| FR-6, FR-7 Import (mode of a Flashcard's Add cards) | `app/api/import/**`, `packages/domain/import.ts` | AD-5, AD-6, AD-9, AD-13 |
| FR-8 SM-2 engine | `packages/domain/sm2.ts`, `app/api/review/grade` | AD-1, AD-4 |
| FR-9, FR-11 Review session | `app/(routes)/review`, `app/api/review/queue`, `app/api/review/grade` | AD-4, AD-7, AD-13, AD-14 |
| FR-16 Card viewer | `app/(routes)/flashcards/[id]` (reads the existing `GET api/flashcards/[id]`) | AD-2, AD-14 |
| FR-17 Learn session | `app/(routes)/flashcards/[id]/learn`, `app/api/review/learn`, `app/api/review/grade` | AD-4, AD-7, AD-14 |
| FR-18 Study directions | `app/(routes)/settings`, `app/api/settings`, `packages/domain/learned.ts` | AD-2, AD-6, AD-14 |
| FR-12 Cultivation, FR-19 Daily Quests | `packages/domain/cultivation.ts`, `app/api/cultivation/**`, `app/(routes)/cultivation` | AD-1, AD-8, AD-14, AD-15 |
| FR-13, FR-14 Export/restore | `app/api/export`, `app/api/restore` | AD-2, AD-4, AD-6, AD-10, AD-11, AD-15 |
| FR-15 Stats (on the Cultivation page) | `app/api/stats`, `app/(routes)/cultivation` | AD-2, AD-10 |

## Deferred

- **Light-mode contrast verification** (sage background × white cards × charcoal text) — flagged `[ASSUMPTION]` in `DESIGN.md` as unverified; resolve during UI build, not an architectural concern.
- **Grade-distribution / quest-pressure monitoring (PRD SM-C1)** — the only v1 mitigation is that no quest or XP rule reads grade values (AD-15); no grade-distribution check is built.
- **`User.timezone` editability** — v1 captures it once at signup (AD-8) and does not expose a settings UI to change it; revisit if a user ever travels across timezones, since a timezone change would shift quest days and settlement.
- **Multi-user / multi-tenant features** — data model is `User`-scoped (AD inherited from PRD FR-1) but no multi-account UI, invite flow, or per-tenant isolation beyond the foreign key is built; revisit only if the product ever grows beyond its single-operator scope.
- **CSV/Excel parsing library choice** (e.g. `papaparse` vs `exceljs` vs `xlsx`) — implementation-level seed, not architecturally load-bearing; pick at build time behind the `packages/domain/import.ts` boundary (AD-5) without needing a spine update.
- **Rate limiting / abuse protection** — not needed for a single-user product; revisit only if the deployment ever becomes multi-tenant.
- **Full observability/APM** — v1 relies on structured single-line logs for write paths (see Consistency Conventions) plus Vercel/Neon's built-in platform logs; no dedicated tracing/metrics/alerting stack. Revisit if the product gains real concurrent/multi-user load.
