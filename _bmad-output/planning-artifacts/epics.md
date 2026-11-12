---
status: final
stepsCompleted: [step-01-validate-prerequisites, step-02-design-epics, step-03-create-stories]
inputDocuments:
  - _bmad-output/planning-artifacts/prds/prd-Web_TrainingSanctum-2026-10-29/prd.md
  - _bmad-output/planning-artifacts/architecture/architecture-Web_TrainingSanctum-2026-11-01/ARCHITECTURE-SPINE.md
  - _bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/DESIGN.md
  - _bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/EXPERIENCE.md
---

# Training Sanctum — Flashcards - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for Training Sanctum — Flashcards, decomposing the requirements from the PRD, UX Design (DESIGN.md + EXPERIENCE.md), and Architecture Spine into implementable stories.

## Requirements Inventory

### Functional Requirements

FR-1: User authentication — a user can create an account and log in/out with email and password. Unauthenticated requests to any card/flashcard/folder/review endpoint are rejected; all persisted data is scoped to `user_id`.

FR-2: Session persistence — a logged-in user stays authenticated across browser sessions until explicit logout or expiry (30-day sliding window per architecture). Concurrent sessions from multiple devices are permitted, last-write-wins on Scheduling Record updates.

FR-3: Create and edit cards — a user can create/edit a Card with fields: Term, Definition, Example Sentence, Context/Collocation, Part of Speech. Term and Definition are required; others optional. Full Unicode (IPA, accented characters, non-Latin scripts) must be accepted and rendered correctly. Cards are always created inside a Folder via "Add cards", which offers two modes: Manual (Quizlet-style multi-row editor) and Import (FR-6/FR-7).

FR-4: Delete a card — a user can delete a Card, which removes both its Scheduling Records and review history from the due queue immediately.

FR-5: Class, Folder & Flashcard CRUD — fixed hierarchy Class → Folder → Flashcard → Card. A user can create/rename/delete Classes, Folders (always in exactly one Class) and Flashcards (named sets, name only, always in exactly one Folder, name unique per Folder case-insensitively), and move a Flashcard to any Folder, in any Class. Every Card is in exactly one Flashcard. Every Class has one built-in "Unsorted" Folder that cannot be renamed or deleted. Deleting a Folder: move its Flashcards to the Class's Unsorted (default) or delete them with their Cards. Deleting a Flashcard: confirmation names it and its Card count; its Cards and Scheduling Records are removed. Deleting a Class: move all its Folders to another Class (default; Unsorted Flashcards merge into the target's Unsorted, name clashes get " (2)") or delete everything after typing the Class name. All deletes are atomic. No sub-folders, no sub-classes.

FR-6: Paste import — inside a Flashcard's Add cards → Import → Paste, a user pastes line-delimited term/definition pairs (delimiter chosen per import) and presses Preview; the lines open in the import review editor (the Manual-mode row editor, rows labelled with source line numbers, no column mapping), where malformed rows show an inline reason and duplicates of the Flashcard's existing Terms (case-insensitive, trimmed) are flagged as "will be skipped". The user edits or removes rows, then Save commits: valid rows are created, still-invalid rows and still-duplicate rows are reported, never silently dropped or duplicated. Under 5 seconds of system time (Preview + Save, excluding editing time). Results: Created / Duplicates skipped / Errors.

FR-7: CSV/Excel import — upload a CSV/Excel file, map its columns to the five Card fields, then review the mapped rows in the same import review editor before Save. Same inline errors, duplicate flagging, row removal, re-check at Save, 5-second system-time budget and three-group results as FR-6.

FR-8: SM-2 scheduling per direction — the system computes the next `interval`, `repetitions`, and `ease_factor` for a Scheduling Record using the classical SM-2 algorithm, independently per Recall Direction. New Scheduling Record defaults: `ease_factor = 2.5`, `repetitions = 0`. Learning-phase intervals: Step 1 = 1 day, Step 2 = 6 days, then EF-driven. "Again" (quality 1) resets `repetitions` to 0, restarts learning steps, and does not change `ease_factor`. `ease_factor` floors at 1.3. At equal `repetitions`, Hard/Good/Easy produce an identical next interval, diverging only in resulting `ease_factor`. Grade-to-quality mapping: Again=1, Hard=3, Good=4, Easy=5. Grading one direction does not alter the other direction's Scheduling Record. Must match the worked fixtures in the PRD addendum exactly.

FR-9: Due-queue review — the system presents due Scheduling Records (per-direction) one at a time: prompt, then reveal, then Grade capture. A Card due in both directions appears as two separate, independently-gradable queue entries. Default scope is all Classes; a session can also be scoped to one Class, one Folder or one Flashcard ("Review this class/folder/flashcard"). Entries ordered oldest-due-first. Fully keyboard-operable (Space reveals; 1–4 or J/K/L/; grades). Grading and advancing renders with sub-100ms perceived transition latency under rapid input.

FR-10: Daily batch cap — the due queue for a session is capped at a configurable daily limit (default 20) applying only to new-card introduction; already-due cards are never withheld. The cap counts Cards (not Scheduling Records). A Card reset to `repetitions = 0` via "Again" is not a New Card and is uncapped.

FR-11: Focus mode — during an active Review Session, navigation, sidebar, streak badge, and other non-essential chrome are hidden; only the card and recall controls are visible. Exiting review restores normal navigation.

FR-12: Streak tracking — the system tracks consecutive calendar days with at least one graded Scheduling Record and displays the current streak outside active review. Grading zero cards on a calendar day breaks the streak at the local-timezone day boundary (no streak-freeze mechanic). `next_review_date` and streak-day attribution share the same local-timezone basis.

FR-13: Data export/backup — a user can export their full Class/Folder/Flashcard/Card structure + Card + Scheduling Record + streak history to a portable JSON format on demand, sufficient to reconstruct state.

FR-14: Restore from backup — a user can import a previously-exported FR-13 JSON file to fully reconstruct their data (both Scheduling Records per Card, streak history). Restoring into an account with existing data requires explicit confirmation (default: replace, never silent merge/overwrite).

FR-15: Progress & stats view — a user can view a stats screen (outside active review) showing current/longest streak, total Cards, and a simple visualization of the SM-2 retention curve (distribution of Scheduling Records by current interval, or review-outcome history) per Recall Direction. Reflects latest graded state without requiring a page reload tied to a specific session.

### NonFunctional Requirements

NFR-1: Data durability — Card, Scheduling Record, and streak data must survive normal operation with no silent data loss; FR-13/FR-14 are the product-level mitigation on top of infrastructure-level durability (Neon PITR).

NFR-2: Performance (review loop) — reveal/grade/advance transitions in Review Session must feel instantaneous under rapid repeated input: sub-100ms perceived latency (enforced via optimistic updates, architecture AD-7).

NFR-3: Performance (general load) — opening the app and loading the due queue outside the review loop must feel fast: 200ms budget from navigation start to due-queue paint (excluding cold serverless start), per architecture AD-13.

NFR-4: Testability — domain logic (SM-2 engine, import parsing, duplicate detection) is unit-testable in isolation from API/UI layers; the architecture must support unit (Vitest), API/integration (Playwright request fixture), and E2E (Playwright browser fixture) suites running in CI (GitHub Actions) on every push.

NFR-5: Accessibility of input — full Unicode/special-character input must work reliably across all Card fields, not just common Latin-1 accented characters (Postgres TEXT/UTF-8, no normalization/stripping).

NFR-6: Live deployment — the product ships to a live, publicly accessible deployment (Vercel), independent of Phase 2 architecture-documentation/case-study work.

### Additional Requirements

- No canned starter template is specified by the architecture; Epic 1 / Story 1 scaffolds the monorepo from scratch per the Structural Seed (`apps/web`, `packages/domain`, `packages/db`, `tests/`).
- Domain isolation (AD-1): `packages/domain` has zero imports from `next`, `react`, `@prisma/client`, or any HTTP/db library; only `apps/web/app/api/**` may import it.
- Single data-access path (AD-2): Postgres reachable only through the Prisma client exported by `packages/db`; schema changes only via Prisma migrations there.
- API boundary shape (AD-3): every client–server interaction is a Next.js Route Handler under `app/api/**/route.ts`; Server Actions are not used for data mutations/queries.
- Grade-submission single write path (AD-4): only `POST /api/review/grade` and `POST /api/restore` may write `interval`/`repetitions`/`ease_factor`/`next_review_date`; grade route computes via the pure `applyGrade` domain function inside one Prisma transaction.
- Import logic lives in domain (AD-5): `parseImportBlock` and `detectDuplicates` are pure functions in `packages/domain`, called identically by paste and CSV/Excel import routes.
- Request validation boundary (AD-6): every Route Handler validates body/query with a Zod schema before calling domain/db code; validation failures return the standard error envelope.
- Optimistic client data flow (AD-7): the review screen uses TanStack Query with optimistic updates — local cache updates and advances immediately, background grade POST, rollback + error surfaced only on failure.
- Local day-boundary source of truth (AD-8): `User.timezone` (IANA string, captured at signup, not user-editable in v1) is the single source of local-day truth for both due-queue filtering and streak-day attribution, via a shared `toLocalCalendarDay` domain helper.
- Single shared card-creation path (AD-9): manual creation, paste import, and CSV import all call one `createCardWithSchedulingRecords` domain function; no Route Handler constructs a `SchedulingRecord` by hand.
- Response envelope & shared export/restore schema (AD-10): every successful response is `{ data: T }` (or `{ data: T[], meta?: {...} }`); FR-13 export and FR-14 restore share one Zod schema (`backupExportSchema`) in `packages/domain`.
- Backup cadence & destructive-operation atomicity (AD-11): Neon PITR covers infrastructure durability; FR-13 export is user-initiated/on-demand only (no scheduled export job in v1); folder-delete, flashcard-delete and class-delete cascades (FR-5) and restore (FR-14) are each wrapped in one Prisma transaction (all-or-nothing).
- Testing architecture (AD-12): Vitest for `packages/domain` unit tests (no network/DB/browser dependency); Playwright for API/integration (seeded test DB) and E2E suites; GitHub Actions runs all three on every push.
- Performance budgets (AD-13): sub-100ms grade→next-card transition; 200ms app-open→due-queue-paint; sub-5s paste/CSV import end-to-end.
- Auth convention: Better Auth session cookie required on every Route Handler except `/api/auth/**`; unauthenticated requests return 401 with the standard error envelope; 30-day sliding session window.
- Config validation: environment variables (`DATABASE_URL`, `BETTER_AUTH_SECRET`, etc.) validated against a Zod schema at process start; fail fast on missing/malformed vars.
- Error envelope convention: `{ error: { code, message, fields?, details? } }` — `fields` for single-record field errors (FR-3), `details` for batch/line-numbered errors (FR-6/FR-7, and multi-row saves in Manual mode, FR-3); never both, never a bare string.
- Observability: every write path that can silently lose data if it fails partway (import commit, grade write, export, restore, folder-delete, flashcard-delete and class-delete cascades) logs a structured single-line summary (operation, record counts, outcome).
- Stack pinning: Next.js 16.x (App Router, Turbopack, Node 20+), TypeScript 5.x, Prisma 7.8.x, Postgres via Neon (free tier), Better Auth + `@better-auth/prisma-adapter`, TanStack Query v5, Zod 3.x/4.x, Tailwind CSS v4 (tokens mapped to DESIGN.md), Vitest, Playwright, Vercel hosting, GitHub Actions CI.
- Deployment topology: Vercel production + per-branch preview deployments each paired with a Neon branch seeded from minimal fixtures (not a prod copy); CI spins up a disposable Postgres per run; local dev uses `.env.local` + `prisma migrate dev` as the only schema-change path.

### UX Design Requirements

UX-DR1: Implement the dual-theme design token set (dark default / light toggle) exactly as specified in DESIGN.md — colors, typography scale, spacing scale, corner radii, elevation levels, motion durations/easings — as CSS variables mapped for Tailwind v4.

UX-DR2: Build the Review card component: large soft-rounded (`rounded.lg`) surface, center-aligned, fixed bounds that never resize between prompt and revealed states, Quizlet-style 3D Y-axis flip (520ms, ease-out) on click/tap/Space, inert top-right icon row (pin/audio/star).

UX-DR3: Build the Grade buttons component: Again / Hard / Good / Easy, visible only after flip, each labeled with its keyboard shortcut; Again styled with the `error` color (never the accent); Hard/Good/Easy equal weight to each other (never implying Hard shortens the next interval, per classical SM-2).

UX-DR4: Build the Sidebar nav component: fixed 240px width, four flat icon+label items (Review, Classes, Stats, Settings), active-item styling (`elevated` background + accent text), hidden entirely during review focus mode and on mobile (<640px). There is no Import item — import lives inside a Folder's "Add cards" (UX-DR9).

UX-DR5: Build the List/folder/flashcard row component: rows grouped under section headers preceded by the small accent-colored square section-bullet marker, hover state (`row-hover`), trailing "..." overflow menu for rename/delete (Flashcard rows: Rename, Move to…, Delete).

UX-DR6: Build the Progress counter (mono-font "X / Y") and streak indicator (flame icon + day count), both visible outside active review only (per FR-11/FR-12).

UX-DR7: Build the Modal component for: folder-delete confirmation (two explicit buttons — "Move flashcards to Unsorted" primary / "Delete flashcards too" secondary-danger, no checkbox); flashcard-delete confirmation (names the Flashcard and its Card count); move-flashcard modal (Folder picker across Classes); class-delete confirmation ("Move folders to…" with a target-Class picker as primary, "Delete class and everything in it" secondary-danger that only enables after typing the Class name; when no other Class exists only the delete option is shown); and restore-from-backup confirmation (consequence statement + Confirm/Cancel, no type-to-confirm).

UX-DR8: Build the Empty due-queue state: centered, prominent streak count, calm congratulatory line, primary "+ Add card" button (opens Manual mode in the last-used Flashcard, with a Flashcard picker to change it) — never a bare "nothing to do" message.

UX-DR9: Build the "Add cards" panel opened from inside a Flashcard, with two modes in a pill switcher: **Manual** (Quizlet-style editor — numbered term/definition rows, optional fields expandable per row, "+ Add row", Tab moves to the next field and Enter on the last field adds a row, one Save creates all valid rows) and **Import** (Paste / Upload-file sub-tabs; Paste → delimiter + "Preview", Upload → column mapping). Import always ends in the **import review editor**: the same row editor as Manual, prefilled with the parsed rows, each labelled with its source line number, with inline errors on malformed rows, a "Already in {Flashcard} — will be skipped" flag on duplicates (cleared when the Term is edited), and a remove (×) button per row; a summary strip above the rows reads "30 rows · 2 need fixing · 1 duplicate". Save commits, then a results view shows exactly 3 groups (Created / Duplicates skipped / Errors, each error with line number + reason). The target Flashcard is fixed to the Flashcard the panel was opened from and shown in the panel header. There is no standalone Import page or nav item.

UX-DR10: Implement responsive breakpoints (mobile <640px, tablet 640–1024px, desktop >1024px): sidebar hidden and grade-button row wraps below 640px; review session stays single-column/centered (card capped at 640px) at all sizes.

UX-DR11: Implement full keyboard interaction for the review loop: Space reveals, 1–4 or J/K/L/; grade, no mouse dependency anywhere in the loop, with sub-100ms perceived transition latency.

UX-DR12: Implement mobile touch interactions for review: tap-to-flip plus 4-directional swipe mapped to the four grades, additive to (not replacing) the grade buttons' own tap targets.

UX-DR13: Verify WCAG AA contrast in both themes before ship against the measured ratios recorded in DESIGN.md ("Focus Indigo" palette); any token added later must be checked against `card` and `bg` in both themes.

UX-DR14: Implement a visible focus-ring/`:focus-visible` state on every interactive element sufficient for full keyboard navigation of the entire app (not just the review loop), with tab order following reading order on every surface.

UX-DR15: Apply the microcopy voice/tone rules from EXPERIENCE.md across all surfaces (direct, imperative, no cheerleading/emoji/mascot voice) — e.g. import results, empty states, restore warnings.

UX-DR16: Implement the dark/light theme toggle (dark is default) reachable from Settings, applying the full token set from UX-DR1 consistently across every surface.

### FR Coverage Map

FR-1: Epic 1 - User account creation and login/logout
FR-2: Epic 1 - Session persistence across browser sessions (30-day sliding window)
FR-3: Epic 2 - Create and edit a Card (5 fields, Unicode-safe)
FR-4: Epic 2 - Delete a Card (cascades both Scheduling Records)
FR-5: Epic 2 - Class, Folder & Flashcard CRUD (Class → Folder → Flashcard → Card, per-Class Unsorted), flashcard moves, folder-delete, flashcard-delete and class-delete choices
FR-6: Epic 3 - Paste import (Import mode of a Flashcard's Add cards) → import review editor → Save, with per-line error/duplicate reporting
FR-7: Epic 3 - CSV/Excel import with column mapping → import review editor → Save, with per-row error/duplicate reporting
FR-8: Epic 4 - Classical SM-2 scheduling engine, per Recall Direction
FR-9: Epic 4 - Due-queue review session (keyboard-first, ordered, dual-direction entries)
FR-10: Epic 4 - Daily new-card batch cap
FR-11: Epic 4 - Focus mode (chrome hidden during review)
FR-12: Epic 5 - Streak tracking (consecutive graded calendar days)
FR-13: Epic 5 - Data export/backup to JSON
FR-14: Epic 5 - Restore from backup JSON
FR-15: Epic 5 - Progress & stats view (streaks, totals, retention curve)

## Epic List

### Epic 1: Foundation, Auth & Live Deployment
A user can create an account, log in and out, and reach a live, publicly deployed instance of Training Sanctum with its four-item app shell in place. This epic also lays the engineering foundation everything after it depends on: the domain/API/db layering from the Structural Seed, CI running all three test suites, and the deployed Vercel+Neon environment.
**FRs covered:** FR-1, FR-2
**Implementation notes:** Monorepo scaffold (`apps/web`, `packages/domain`, `packages/db`, `tests/`) per the Architecture Structural Seed — no starter template exists, this is built from scratch; Better Auth + Prisma + `User.timezone` capture at signup (AD-8 prerequisite); Zod env-var validation at process start; Vitest/Playwright wiring and GitHub Actions CI (AD-12, NFR-4); Vercel production + preview deployments with Neon branching (NFR-6, AD-11 infra durability); dark/light design-token scaffolding (UX-DR1, UX-DR16) and the Sidebar nav shell (UX-DR4, minus review-specific hide logic which lands in Epic 4); standard response envelope and error envelope conventions (AD-10, Consistency Conventions) established here for all later Route Handlers to follow.

### Epic 2: Class, Folder, Flashcard & Card Management
A user can organize study material as Class → Folder → Flashcard → Card: create, rename, and delete Classes, Folders (each Class with its built-in "Unsorted" Folder) and Flashcards (named sets), add Cards inside a Flashcard through the Manual mode of "Add cards", edit and delete Cards, and move Flashcards between Folders — with safe, explicit choices of what happens to contents when a Folder, Flashcard or Class is deleted.
**FRs covered:** FR-3, FR-4, FR-5
**Implementation notes:** Establishes the shared `createCardWithSchedulingRecords` domain function (AD-9) that Epic 3's import also calls; field-level validation via Zod (AD-6) and the `fields` error-envelope shape; folder-delete, flashcard-delete and class-delete cascades each wrapped in one Prisma transaction (AD-11); Class created together with its Unsorted Folder in one transaction; Story 2.7 (Flashcard level and schema change) is a prerequisite and Stories 2.3-2.6 are rework of already-built code; List/folder/flashcard row component (UX-DR5), folder-delete, flashcard-delete and class-delete modals (UX-DR7), and the "Add cards" panel shell with its Manual mode (UX-DR9, Import mode lands in Epic 3); Unicode-safe text fields (NFR-5).

### Epic 3: Bulk Import
A user can paste line-delimited term/definition pairs or upload a CSV/Excel file, review and fix the parsed rows in the same editor as manual entry, and save them as Cards in one pass, with duplicates and malformed rows clearly flagged and reported without losing the valid rows in the same batch.
**FRs covered:** FR-6, FR-7
**Implementation notes:** `parseImportBlock` and `detectDuplicates` as shared pure domain functions used identically by both import paths (AD-5); read-only `POST /api/import/parse` feeding the import review editor, committed through Epic 2's `POST /api/cards/batch` (shared with Manual mode, duplicates re-checked at commit) and `createCardWithSchedulingRecords` (AD-9) rather than constructing Cards independently; column-mapping step for files only; Import mode of the Flashcard's "Add cards" panel with Paste/Upload sub-tabs, the import review editor and the 3-group results view (UX-DR9), always targeting the Flashcard it was opened from; `details` (line-numbered) error-envelope shape; sub-5-second import system-time budget (AD-13).

### Epic 4: Spaced Repetition Review Engine
A user can run a daily, keyboard-first review session: due cards are presented one at a time per direction, graded with a single keystroke, and correctly rescheduled per the classical SM-2 algorithm — with the new-card batch cap and distraction-free focus mode in place.
**FRs covered:** FR-8, FR-9, FR-10, FR-11
**Implementation notes:** `packages/domain/sm2.ts` as a pure, framework-free engine unit-tested against the PRD addendum's worked fixtures (NFR-4, SM-3); the grade write path is the single `POST /api/review/grade` route calling `applyGrade` inside one Prisma transaction (AD-4); TanStack Query optimistic updates for sub-100ms perceived transitions (AD-7, NFR-2); `toLocalCalendarDay` domain helper introduced here for due-queue filtering (AD-8) and reused by Epic 5's streak attribution; 200ms app-open-to-due-queue budget (AD-13, NFR-3); Review card flip, Grade buttons, review-mode sidebar hiding, full keyboard interaction, mobile tap/swipe, and the Empty due-queue state (UX-DR2, UX-DR3, UX-DR4, UX-DR6 progress counter, UX-DR8, UX-DR11, UX-DR12).

### Epic 5: Progress, Streaks & Data Safety
A user can see their current/longest streak and basic stats (including the SM-2 retention curve) at a glance outside of review, and can trust the product with months of history — exporting it on demand and restoring it, with destructive operations always confirmed and atomic.
**FRs covered:** FR-12, FR-13, FR-14, FR-15
**Implementation notes:** Streak-day attribution reuses Epic 4's `toLocalCalendarDay` helper so due-dates and streak days share one clock (AD-8); FR-13/FR-14 share one `backupExportSchema` (AD-10) and restore runs inside one Prisma transaction (AD-11); restore-confirmation modal (UX-DR7) and streak/progress-counter display outside review (UX-DR6); Stats view surfaces the retention curve per Recall Direction (SM-4). As the final epic, this is also the natural point for a closing pass on cross-cutting UX items that touch every surface built so far: WCAG AA contrast verification in both themes (UX-DR13, with particular attention to the flagged light-mode combination), full keyboard focus-visible states app-wide (UX-DR14), and a microcopy/voice consistency check (UX-DR15).

## Epic 1: Foundation, Auth & Live Deployment

A user can create an account, log in/out, and reach a live, publicly deployed instance of Training Sanctum with its four-item app shell in place. This epic also lays the engineering foundation everything after it depends on.

### Story 1.1: Live, Deployed Application Skeleton

As the builder,
I want the monorepo scaffolded and deployed to a live public URL with CI running,
So that every subsequent feature ships into a working, continuously-verified pipeline instead of local-only code.

**Acceptance Criteria:**

**Given** a fresh repo
**When** the Structural Seed is scaffolded (`apps/web`, `packages/domain`, `packages/db`, `tests/`)
**Then** the Next.js app runs locally and Prisma connects to a Neon dev branch

**Given** required env vars are missing or malformed
**When** the app starts
**Then** it fails fast with a clear error (Zod env validation) rather than failing deep inside a request

**Given** code is pushed to a branch or opened as a PR
**When** GitHub Actions runs
**Then** the Vitest (domain) and Playwright (api/e2e scaffold) suites execute as part of CI

**Given** the app is deployed
**When** a user visits the production Vercel URL
**Then** a minimal live page loads successfully (NFR-6, PRD SM-5)
**And** a PR triggers a Vercel preview deployment paired with its own Neon branch, reachable at its own URL

### Story 1.2: User Registration

As a user,
I want to create an account with email and password,
So that my data is scoped to me from the start.

**Acceptance Criteria:**

**Given** no account exists for an email
**When** I submit a valid email + password
**Then** a `User` record is created (password hashed), `user_id` scoping is established, and `User.timezone` is captured from the browser at signup

**Given** the email is already registered
**When** I submit it again
**Then** I get a field-level error (standard error envelope), not a silent overwrite

**Given** an invalid email format or a missing password
**When** I submit
**Then** I get a field-level validation error per the Zod request-validation boundary
**And** a successful registration logs me in immediately (session established), no separate login step required

### Story 1.3: User Login & Logout

As a user,
I want to log in and out with my credentials,
So that I control access to my account.

**Acceptance Criteria:**

**Given** a registered account
**When** I submit valid credentials
**Then** a session is established and I land in the app

**Given** invalid credentials
**When** I attempt login
**Then** I get a generic error (no user enumeration) via the standard error envelope

**Given** a logged-in session
**When** I log out
**Then** the session cookie is invalidated and subsequent requests return `401`
**And** an unauthenticated request to any card/flashcard/folder/review/stats endpoint is rejected with `401` and the standard error envelope

### Story 1.4: Session Persistence

As a user,
I want to stay logged in across browser sessions,
So that I don't have to re-authenticate every time I study.

**Acceptance Criteria:**

**Given** a logged-in user
**When** they close and reopen the browser within the session lifetime
**Then** they remain authenticated without re-login

**Given** continued activity
**When** requests are made
**Then** the 30-day sliding session window is refreshed

**Given** the session has been inactive for 30+ days
**When** the user returns
**Then** they must log in again
**And** the same account logged in from two different browsers/devices keeps both sessions valid independently (no forced single-session logout)

### Story 1.5: Authenticated App Shell & Theme Toggle

As a user,
I want a consistent app shell with a working theme toggle once I'm logged in,
So that the product already feels like itself before individual features exist.

**Acceptance Criteria:**

**Given** a logged-in user
**When** they land in the app
**Then** they see the four-item sidebar nav (Review, Classes, Stats, Settings) styled per `DESIGN.md` tokens, each linking to a placeholder page

**Given** the theme toggle
**When** switched
**Then** the UI swaps between dark (default) and light theme using the full token set, and the preference persists across reloads

**Given** an unauthenticated visitor
**When** they try to reach any shell route directly
**Then** they're redirected to login
**And** on mobile (<640px) the sidebar is hidden per the responsive breakpoint rule

## Epic 2: Class, Folder, Flashcard & Card Management

A user can organize study material as Class → Folder → Flashcard → Card: create, rename, and delete Classes, Folders (each Class with its built-in "Unsorted" Folder) and Flashcards (named sets), add Cards inside a Flashcard through the Manual mode of "Add cards", edit and delete Cards, and move Flashcards between Folders — with safe, explicit choices of what happens to contents when a Folder, Flashcard or Class is deleted.

### Story 2.1: Class CRUD

As a user,
I want to create, rename, and delete Classes,
So that I can separate my study material by course or goal.

**Acceptance Criteria:**

**Given** I have no Classes yet
**When** I open Classes
**Then** I see an empty state with a primary "Create class" button

**Given** I create a Class with a name
**When** I save
**Then** it appears in my Class list immediately, already containing one "Unsorted" Folder, both created in one transaction

**Given** an existing Class
**When** I rename it
**Then** the new name is reflected everywhere it's referenced

**Given** a Class that has Folders and another Class exists
**When** I delete it
**Then** I'm prompted to choose "Move folders to…" (default, with a target-Class picker) or "Delete class and everything in it"
**And** on move, its Unsorted Flashcards merge into the target Class's Unsorted Folder (a Flashcard name already used there gets a " (2)" suffix), its other Folders move with their Flashcards and Cards, and a Folder name already used in the target gets a " (2)" suffix

**Given** "Delete class and everything in it" is chosen
**When** I confirm
**Then** the delete button only enables after I type the Class name, and the Class, its Folders, Flashcards, Cards and their Scheduling Records are removed
**And** both options complete atomically — no partial moves or partial deletes
**And** when no other Class exists, only the delete option is offered

### Story 2.2: Folder CRUD inside a Class

> **Rework (Sprint Change 2026-11-10):** this story was already built; its delete cascade and counts change after Story 2.7 (Folders now contain Flashcards, not Cards).

As a user,
I want to create, rename, and delete Folders inside a Class,
So that I can organize a Class's cards by topic or source.

**Acceptance Criteria:**

**Given** I open a Class
**When** I look at its Folders
**Then** I see its "Unsorted" Folder plus any Folders I created, each with its Flashcard count and Card count

**Given** I create a Folder with a name inside a Class
**When** I save
**Then** it appears in that Class's Folder list immediately

**Given** a custom Folder
**When** I rename it
**Then** the new name is reflected everywhere it's referenced

**Given** the Unsorted Folder
**When** I open its "..." menu
**Then** rename and delete are not available

**Given** a custom Folder containing Flashcards
**When** I delete it
**Then** I'm prompted to choose "Move flashcards to Unsorted" (default, the same Class's Unsorted) or "Delete flashcards too" (which also deletes their Cards), and the chosen action completes atomically with no orphaned or silently-deleted Flashcards or Cards
**And** Folders cannot be created inside other Folders

### Story 2.3: Add Cards — Manual Mode

> **Rework (Sprint Change 2026-11-10):** already built against Folders; re-pointed to Flashcards after Story 2.7. `POST /api/cards/batch` takes `flashcardId`.

As a user,
I want to add cards inside a Flashcard by typing them Quizlet-style,
So that I can capture new words quickly without leaving the Flashcard I'm working in.

**Acceptance Criteria:**

**Given** I'm inside a Flashcard
**When** I choose "Add cards"
**Then** a panel opens in Manual mode with the target Flashcard shown in its header, and a mode switcher offering Manual and Import

**Given** the Manual editor
**When** I fill Term + Definition in one or more numbered rows and press Save
**Then** one Card is created per filled row in that Flashcard, each with two Scheduling Records at SM-2 defaults (`ease_factor=2.5`, `repetitions=0`, `next_review_date`=start of today), via `createCardWithSchedulingRecords` (AD-9)

**Given** a row with Term or Definition empty
**When** I save
**Then** that row shows a field-level error and is not created, while the valid rows are still created

**Given** the Manual editor
**When** I press Tab
**Then** focus moves to the next field, and Enter in the last field of the last row adds a new row
**And** each row can expand to show Example Sentence, Context/Collocation and Part of Speech, which can be left blank

**Given** I enter special characters (IPA symbols, accented characters, non-Latin scripts) in any field
**When** I save
**Then** they're accepted and rendered correctly

**Given** the Empty due-queue state's "+ Add card"
**When** I use it
**Then** Manual mode opens for the last-used Flashcard, with a Flashcard picker to change the target

### Story 2.4: Edit a Card

> **Rework (Sprint Change 2026-11-10):** already built on the Folder page; moves to the Flashcard page (Edit action on a Card row inside a Flashcard).

As a user,
I want to edit an existing Card's fields,
So that I can fix or refine an entry without recreating it.

**Acceptance Criteria:**

**Given** an existing Card
**When** I change any field and save
**Then** the changes are reflected immediately

**Given** I clear Term or Definition
**When** I submit
**Then** I get a field-level validation error and the previous values are retained
**And** editing a Card never alters its Scheduling Records

### Story 2.5: Delete a Card

> **Rework (Sprint Change 2026-11-10):** already built on the Folder page; moves to the Flashcard page (Delete action on a Card row inside a Flashcard).

As a user,
I want to delete a Card,
So that stale or duplicate entries don't clutter my study set.

**Acceptance Criteria:**

**Given** an existing Card
**When** I delete it
**Then** both its Scheduling Records are removed and it disappears from any due queue immediately

### Story 2.6: Move & Browse Flashcards

> **Rework (Sprint Change 2026-11-10):** the committed "Move Card between Folders" code is replaced by Move Flashcard; the Card row has Edit and Delete only (no Move).

As a user,
I want to browse Classes, Folders and Flashcards and move Flashcards between Folders,
So that I can find and reorganize related vocabulary.

**Acceptance Criteria:**

**Given** an existing Flashcard
**When** I choose "Move to…" and pick another Folder (in the same or another Class)
**Then** it leaves the old Folder's list and appears in the new one with all its Cards (always exactly one Folder); a name clash in the target Folder gets a number added (" (2)", " (3)"), as in the delete cascades

**Given** a Folder
**When** I open it
**Then** I see its Flashcards as rows, with a breadcrumb "Classes / {Class} / {Folder}"

**Given** a Flashcard
**When** I open it
**Then** I see its Cards as rows, with a breadcrumb "Classes / {Class} / {Folder} / {Flashcard}"

**Given** the Classes view
**When** I look
**Then** I see every Class with its Folder, Flashcard and Card counts
**And** the hierarchy stays fixed at Class → Folder → Flashcard → Card — there is no way to nest a Folder in a Folder or a Class in a Class

### Story 2.7: Flashcard CRUD inside a Folder

> **Prerequisite for the reworked Stories 2.3-2.6; implement first.** Added by Sprint Change 2026-11-10 (hierarchy becomes Class → Folder → Flashcard → Card). Includes the schema change (new `Flashcard` model, `Card.folderId` → `Card.flashcardId`) and a reset of existing test data (no data migration; the reset against the Neon database needs explicit confirmation before it runs).

As a user,
I want to create, rename, and delete Flashcards (named sets of Cards) inside a Folder,
So that I can group related Cards into sets within a topic.

**Acceptance Criteria:**

**Given** the data model
**When** this story is complete
**Then** a `Flashcard` level exists between Folder and Card: every Card is in exactly one Flashcard, every Flashcard in exactly one Folder, and a Flashcard has only a name

**Given** I open a Folder
**When** I look at it
**Then** I see its Flashcards as rows, each with its Card count, under a breadcrumb "Classes / {Class} / {Folder}"

**Given** I create a Flashcard with a name inside a Folder
**When** I save
**Then** it appears in that Folder's list immediately

**Given** a Flashcard name already used in that Folder (compared case-insensitively)
**When** I create or rename a Flashcard to it
**Then** I get a field-level error and nothing changes

**Given** an existing Flashcard
**When** I rename it
**Then** the new name is reflected everywhere it's referenced

**Given** an existing Flashcard
**When** I delete it
**Then** a confirmation names the Flashcard and its Card count, and on confirm the Flashcard, its Cards and their Scheduling Records are removed atomically

**Given** the Classes view and a Class's Folder list
**When** I look at the rows
**Then** Class and Folder rows show their Flashcard counts (and Card counts)

## Epic 3: Bulk Import

A user can paste line-delimited term/definition pairs or upload a CSV/Excel file, review and fix the parsed rows in the same editor as manual entry, and save them as Cards in one pass, with duplicates and malformed rows clearly flagged and reported without losing the valid rows in the same batch.

### Story 3.1: Paste Import with Review Editor

As a user,
I want to paste term/definition pairs, check and fix them in the card editor, then save,
So that bulk capture is fast but I still control exactly what becomes a Card.

**Acceptance Criteria:**

**Given** I'm inside a Flashcard and open "Add cards", switch to Import and choose Paste
**When** I look at the panel
**Then** the target Flashcard is fixed to that Flashcard and shown in the header — there is no separate Import page

**Given** a pasted block and my chosen delimiter
**When** I press Preview
**Then** every line opens as an editable row in the import review editor (the same editor as Manual mode), labelled with its source line number, and nothing is saved yet

**Given** a malformed line (e.g. no delimiter)
**When** the editor opens
**Then** that row shows the reason inline and I can fix it in place

**Given** a line whose Term exactly matches (case-insensitive, trimmed) an existing Card's Term in the target Flashcard
**When** the editor opens
**Then** the row is flagged "Already in {Flashcard} — will be skipped", and editing its Term clears the flag

**Given** the editor with N valid rows and no edits
**When** I press Save
**Then** N Cards are created in that Flashcard (each with two fresh Scheduling Records) and visible in the Flashcard, with Preview + Save taking under 5 seconds of system time

**Given** rows that are still invalid or still duplicate at Save, or rows I removed with ×
**When** I save
**Then** invalid rows are not created and are reported with line number + reason, duplicates (re-checked at Save) are skipped and reported, removed rows are neither created nor reported, and valid rows still save
**And** the results view shows exactly three grouped sections: Created (N), Duplicates skipped (N), Errors (N with line+reason)

### Story 3.2: CSV/Excel Import with Column Mapping and Review Editor

As a user,
I want to upload a CSV or Excel file, map its columns, and review the rows before saving,
So that a week's worth of notes-app vocabulary becomes cards in one pass without surprises.

**Acceptance Criteria:**

**Given** I'm inside a Flashcard, open "Add cards" → Import → Upload file, and upload a CSV/Excel file
**When** the column-mapping step appears
**Then** I can map file columns to the five Card fields regardless of their order, before anything is saved

**Given** I confirm the mapping
**When** the next step opens
**Then** the mapped rows appear in the same import review editor as paste import, labelled with source row numbers, with the same inline errors, duplicate flags and remove (×) buttons

**Given** some rows are still invalid at Save
**When** I save
**Then** those rows are reported with row number + reason while valid rows still save

**Given** a row's Term exactly matches (case-insensitive, trimmed) an existing Card's Term in the target Flashcard at Save
**When** I save
**Then** it is skipped and reported as a duplicate — the same rule and underlying logic as paste import
**And** if every row is malformed and I save without fixing any, Created shows (0), every row appears under Errors with line+reason, and nothing crashes

## Epic 4: Spaced Repetition Review Engine

A user can run a daily, keyboard-first review session: due cards are presented one at a time per direction, graded with a single keystroke, and correctly rescheduled per the classical SM-2 algorithm — with the new-card batch cap and distraction-free focus mode in place.

### Story 4.1: SM-2 Scheduling Engine

As the builder,
I want a pure, unit-tested SM-2 scheduling engine,
So that every grade produces a mathematically correct, portfolio-quality next interval/ease/repetition regardless of which UI or API path calls it.

**Acceptance Criteria:**

**Given** a Scheduling Record at any state
**When** a passing grade (Hard/Good/Easy, quality 3/4/5) is applied
**Then** `repetitions` increments, `ease_factor` updates per the classical SM-2 formula (floored at 1.3), and `interval` follows Step1=1/Step2=6/`round(prev_interval × prev_EF)` at 3rd+ repetition

**Given** any state
**When** grade "Again" (quality 1) is applied
**Then** `repetitions` resets to 0, `interval` resets to 1 day, and `ease_factor` is left completely unchanged

**Given** repeated low grades
**When** applied consecutively
**Then** `ease_factor` never drops below 1.3

**Given** the same `repetitions` count entering a review
**When** Hard, Good, or Easy is applied in separate scenarios
**Then** all three produce an identical next interval, diverging only in resulting `ease_factor`
**And** every worked example in the PRD addendum passes as an exact-match unit test, with no network/DB/browser dependency

### Story 4.2: Grade a Card & Persist Scheduling Update

As a user,
I want my grade on a card to update its schedule correctly and durably,
So that the next time I see it reflects how well I actually knew it.

**Acceptance Criteria:**

**Given** a due Scheduling Record
**When** I submit a Grade via `POST /api/review/grade`
**Then** `applyGrade` computes the new state and it's persisted inside one transaction — the only path allowed to write those fields

**Given** a Card with both directions due
**When** I grade one direction
**Then** the other direction's Scheduling Record is unaffected

**Given** the fixed grade-to-quality mapping
**When** I submit Again/Hard/Good/Easy
**Then** it maps to quality 1/3/4/5 exactly
**And** an unauthenticated or invalid request is rejected per the standard auth/validation conventions

### Story 4.3: Due-Queue Review Session (keyboard-first)

As a user,
I want to review my due cards one at a time with keyboard-only controls,
So that daily study stays fast and frictionless.

**Acceptance Criteria:**

**Given** due Scheduling Records exist
**When** I open Review
**Then** due entries from all Classes are presented one at a time, prompt side first, ordered oldest-due-first

**Given** I'm viewing a Class, a Folder or a Flashcard
**When** I choose "Review this class", "Review this folder" or "Review this flashcard"
**Then** the session contains only that scope's due entries and otherwise behaves exactly like the default session, and its grades count toward the same streak

**Given** a Card due in both directions
**When** it appears
**Then** it shows as two separate, independently-gradable queue entries

**Given** a card showing its prompt
**When** I press Space
**Then** it flips to reveal the answer, no mouse needed

**Given** the answer is revealed
**When** I press 1–4 or J/K/L/;
**Then** the Grade is submitted and the next entry appears with no perceptible lag (sub-100ms, via optimistic update)
**And** on mobile, tapping the card flips it, and swiping in any of the four directions submits the corresponding grade, layered on top of the grade buttons' own tap targets

### Story 4.4: Daily New-Card Batch Cap

As a user,
I want new-card introduction capped at a configurable daily limit,
So that I'm not overwhelmed while already-due cards are never held back.

**Acceptance Criteria:**

**Given** the default cap of 20
**When** I review
**Then** at most 20 New Cards (per the Glossary definition, counting Cards not Scheduling Records) are introduced per day

**Given** I adjust the daily limit in settings
**When** I save it
**Then** subsequent sessions respect the new limit

**Given** the cap is reached
**When** more cards are due
**Then** the "new cards" portion ends but already-due older cards remain available, uncapped
**And** a Card reset to `repetitions=0` via an Again grade does not count against this cap

### Story 4.5: Focus Mode

As a user,
I want all non-essential chrome hidden during an active review session,
So that I can concentrate without distraction.

**Acceptance Criteria:**

**Given** I enter a Review Session
**When** it starts
**Then** sidebar, streak badge, and other non-essential chrome are hidden — only the card and recall controls are visible

**Given** I exit review (queue cleared or I navigate away)
**When** I leave
**Then** normal navigation and chrome are restored
**And** when nothing is due, the Empty due-queue state shows streak count, a calm congratulatory line, and a "+ Add card" button instead of the sidebar-less review card

## Epic 5: Progress, Streaks & Data Safety

A user can see their current/longest streak and basic stats (including the SM-2 retention curve) at a glance outside of review, and can trust the product with months of history — exporting it on demand and restoring it, with destructive operations always confirmed and atomic.

### Story 5.1: Streak Tracking

As a user,
I want my consecutive-day study streak tracked and shown outside review,
So that I stay motivated to keep the daily habit.

**Acceptance Criteria:**

**Given** I grade at least one Scheduling Record on a calendar day (local timezone)
**When** the day ends
**Then** that day counts toward my streak regardless of how much of the due queue remains

**Given** I grade zero cards on a calendar day
**When** the local-timezone day boundary passes
**Then** my streak resets to 0

**Given** `next_review_date` and streak-day attribution
**When** computed
**Then** both use the same `User.timezone`-based local-day clock, so a review graded near midnight is attributed consistently
**And** the streak indicator is visible outside active review only

### Story 5.2: Data Export/Backup

As a user,
I want to export my full Card + Scheduling Record + streak history on demand,
So that I never lose months of study data.

**Acceptance Criteria:**

**Given** I trigger export from Settings
**When** it completes
**Then** I receive a JSON file containing every Class, Folder, Flashcard and Card (with its Flashcard), both Scheduling Records per Card, and streak history — sufficient to reconstruct state
**And** export is strictly user-initiated/on-demand, no scheduled export job
**And** the payload conforms to the single shared `backupExportSchema` also used by restore

### Story 5.3: Restore from Backup

As a user,
I want to restore a previously-exported backup,
So that I can recover my data if something goes wrong.

**Acceptance Criteria:**

**Given** a valid export file
**When** I restore it
**Then** the Class → Folder → Flashcard structure is recreated and every Card is recreated in its original Flashcard with both Scheduling Records in exactly their exported state and streak history is restored

**Given** my account already has data
**When** I attempt a restore
**Then** I must explicitly confirm before it proceeds — restore replaces existing data, never a silent merge/overwrite
**And** the restore runs inside one transaction: every row changes or none do, even on a partial failure

### Story 5.4: Progress & Stats View

As a user,
I want to see a stats screen with my streak, card totals, and SM-2 retention curve,
So that I can observe my progress and trust the scheduling is working correctly.

**Acceptance Criteria:**

**Given** I navigate to Stats (outside active review)
**When** it loads
**Then** I see current/longest streak, total Cards, and a visualization of Scheduling Records' distribution by interval (or review-outcome history) per Recall Direction

**Given** I've just graded cards
**When** I view Stats afterward
**Then** it reflects the latest state without a session-tied reload requirement
**And** the view is reachable from normal navigation at any time

### Story 5.5: Cross-Cutting Accessibility & Microcopy Pass

As a user,
I want consistent accessibility and tone across every screen built so far,
So that the app feels like one coherent, trustworthy product.

**Acceptance Criteria:**

**Given** both themes
**When** checked against WCAG AA
**Then** all text/background combinations meet 4.5:1 contrast — matching the measured "Focus Indigo" ratios recorded in DESIGN.md

**Given** any interactive element
**When** focused via keyboard
**Then** a clearly visible focus-ring appears, and tab order follows reading order on every surface

**Given** all user-facing copy
**When** reviewed
**Then** it follows the direct, imperative Voice and Tone table in `EXPERIENCE.md` — no cheerleading, emoji, or mascot voice
