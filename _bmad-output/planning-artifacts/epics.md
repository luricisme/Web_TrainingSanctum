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

FR-5: Class, Folder & Flashcard CRUD — fixed hierarchy Class → Folder → Flashcard → Card. A user can create/rename/delete Classes, Folders (always in exactly one Class) and Flashcards (named sets, name only, always in exactly one Folder, name unique per Folder case-insensitively), and move a Flashcard to any Folder, in any Class. Every Card is in exactly one Flashcard. Every Class has one built-in "Unsorted" Folder that cannot be renamed or deleted. Deleting a Folder: move its Flashcards to the Class's Unsorted (default) or delete them with their Cards. Deleting a Flashcard: confirmation names it and its Card count; its Cards and Scheduling Records are removed. Deleting a Class: move all its Folders to another Class (default; Unsorted Flashcards merge into the target's Unsorted, name clashes get " (2)") or delete everything after typing the Class name. All deletes are atomic. No sub-folders, no sub-classes. Each Class has one of five colours (new Classes take the next in order; changeable; Folders and Flashcards show it; part of export and restore). *(Sprint Change 2026-11-14b.)*

FR-6: Paste import — inside a Flashcard's Add cards → Import → Paste, a user pastes line-delimited term/definition pairs (delimiter chosen per import) and presses Preview; the lines open in the import review editor (the Manual-mode row editor, rows labelled with source line numbers, no column mapping), where malformed rows show an inline reason and duplicates of the Flashcard's existing Terms (case-insensitive, trimmed) are flagged as "will be skipped". The user edits or removes rows, then Save commits: valid rows are created, still-invalid rows and still-duplicate rows are reported, never silently dropped or duplicated. Under 5 seconds of system time (Preview + Save, excluding editing time). Results: Created / Duplicates skipped / Errors.

FR-7: CSV/Excel import — upload a CSV/Excel file, map its columns to the five Card fields, then review the mapped rows in the same import review editor before Save. Same inline errors, duplicate flagging, row removal, re-check at Save, 5-second system-time budget and three-group results as FR-6.

FR-8: SM-2 scheduling per direction — the system computes the next `interval`, `repetitions`, and `ease_factor` for a Scheduling Record using the classical SM-2 algorithm, independently per Recall Direction. New Scheduling Record defaults: `ease_factor = 2.5`, `repetitions = 0`. Learning-phase intervals: Step 1 = 1 day, Step 2 = 6 days, then EF-driven. "Again" (quality 1) resets `repetitions` to 0, restarts learning steps, and does not change `ease_factor`. `ease_factor` floors at 1.3. At equal `repetitions`, Hard/Good/Easy produce an identical next interval, diverging only in resulting `ease_factor`. Grade-to-quality mapping: Again=1, Hard=3, Good=4, Easy=5. Grading one direction does not alter the other direction's Scheduling Record. Must match the worked fixtures in the PRD addendum exactly.

FR-9: Due-queue review — the system presents due Scheduling Records of learned Cards (per-direction) one at a time: prompt, then flip, then Grade capture. Records of Unlearned Cards never appear in Review. A Card due in both directions appears as two separate, independently-gradable queue entries. Default scope is all Classes; a session can also be scoped to one Class or one Folder ("Review this class/folder"); a Flashcard's graded entry point is Learn (FR-17). Entries ordered oldest-due-first. Fully keyboard-operable (Space or click flips either way; 1–4 or J/K/L/; grades once the answer has been shown). Grading and advancing renders with sub-100ms perceived transition latency under rapid input.

FR-10: Removed (Sprint Change 2026-11-13) — superseded by FR-17; new Cards are introduced only through Learn, so there is no daily cap.

FR-11: Focus mode — during an active Review Session, navigation, sidebar, realm badge, and other non-essential chrome are hidden; only the card and recall controls are visible. Exiting review restores normal navigation.

FR-12: Cultivation progression — the system keeps a total XP per user and derives a Cultivation Realm and Stage from it on a fixed 90-level ladder in four Bộ (Ngưng Khí · Tầng 1 … Đạp Thiên Cảnh; PRD addendum), shown outside active review. XP changes only by claiming a Daily Quest or by settling a past day; it never goes below 0, and a penalty can demote by stages or realms. Realm names are in Vietnamese. Quest days share the `User.timezone` local-day basis with `next_review_date`. (Replaces Streak, Sprint Change 2026-11-14.)

FR-13: Data export/backup — a user can export their full Class/Folder/Flashcard/Card structure + Card + Scheduling Record + cultivation history (XP, quest days, XP events) to a portable JSON format on demand, sufficient to reconstruct state.

FR-14: Restore from backup — a user can import a previously-exported FR-13 JSON file to fully reconstruct their data (both Scheduling Records per Card, cultivation history). Restoring into an account with existing data requires explicit confirmation (default: replace, never silent merge/overwrite). After a restore every day up to yesterday counts as settled (no gap penalty).

FR-15: Progress & stats view — a user can view a stats screen (outside active review) showing realm and stage, total XP, XP progress and XP history, today's Daily Quests, total Cards (learned / unlearned), and a simple visualization of the SM-2 retention curve (distribution of Scheduling Records by current interval, or review-outcome history) per Recall Direction. Reflects latest graded state without requiring a page reload tied to a specific session.

FR-16: Flashcard card viewer — the Flashcard page shows a card viewer above its Cards list: every Card one at a time in list order, Term side first; Space or click/tap flips either way; ← / → (buttons and arrow keys) move between Cards with a mono "X / N" counter, no wrap-around, shuffle or autoplay; keys ignored in fields and open panels/modals; viewing never changes scheduling; hidden on an empty Flashcard.

FR-17: Learn session — a "Learn" button below the viewer starts a graded session for that Flashcard (same session screen, keys, grade write path and focus mode as Review): its unlearned records first (studied directions, graded independently), then its learned, due records in studied directions. A record is learned once graded; it then joins Review on its due date (per direction, FR-18). Learn grades count toward the Learn Flashcards quest (FR-19). An entry graded Again is re-shown at the end of the session until graded Hard/Good/Easy; only its first grade is persisted. Completion shows a calm line and a way back. The button label shows what is waiting ("Learn · 12 new · 3 due").

FR-18: Study directions setting — per account: Both (default), Term → Definition only, or Definition → Term only. Applies to Learn, Review, the Learn practice run and the card viewer; turning a direction off changes no Scheduling Record. "Learned" is per direction (AD-14). (Sprint Change 2026-11-13b)

FR-19: Daily Quests — each local day the user has two quests sized by their Bộ at the start of the day: Learn Flashcards (fully learn 1 / 2 / 3 / 4 Flashcards in Nhất / Nhị / Tam / Tứ Bộ) and Clear Review (grade at least one learned record and leave the due queue empty). XP per quest 10 / 20 / 40 / 40. A quest's checkbox unlocks only when its condition is met; the user ticks it to claim the XP, once. A quest with no work that day is skipped (no reward, no penalty). At day end each quest neither claimed nor skipped costs 2 × its XP, including done-but-unticked quests and days the app wasn't opened; settled lazily, in order, on the next visit. No penalty before cultivation started or for a restore gap. No rule reads grade values (SM-C1). (Sprint Change 2026-11-14)

FR-20: Quick search — Ctrl+K or "/" (outside a text field, a session or a modal) opens a palette to jump to Review, Classes, Cultivation or Settings and to search Class, Folder and Flashcard names and Card terms; Enter opens, Esc closes. *(Sprint Change 2026-11-14b.)*

### NonFunctional Requirements

NFR-1: Data durability — Card, Scheduling Record, and cultivation data must survive normal operation with no silent data loss; FR-13/FR-14 are the product-level mitigation on top of infrastructure-level durability (Neon PITR).

NFR-2: Performance (review loop) — reveal/grade/advance transitions in Review Session must feel instantaneous under rapid repeated input: sub-100ms perceived latency (enforced via optimistic updates, architecture AD-7).

NFR-3: Performance (general load) — opening the app and loading the due queue outside the review loop must feel fast: 200ms budget from navigation start to due-queue paint (excluding cold serverless start), per architecture AD-13.

NFR-4: Testability — domain logic (SM-2 engine, import parsing, duplicate detection) is unit-testable in isolation from API/UI layers; the architecture must support unit (Vitest), API/integration (Playwright request fixture), and E2E (Playwright browser fixture) suites running in CI (GitHub Actions) on every push.

NFR-5: Accessibility of input — full Unicode/special-character input must work reliably across all Card fields, not just common Latin-1 accented characters (Postgres TEXT/UTF-8, no normalization/stripping).

NFR-6: Live deployment — the product ships to a live, publicly accessible deployment (Vercel), independent of Phase 2 architecture-documentation/case-study work.

NFR-7: Responsive navigation — every Main nav destination, including Settings and Log out, is reachable at every viewport width; below 640px a dock replaces the top bar. *(Sprint Change 2026-11-14b.)*

### Additional Requirements

- No canned starter template is specified by the architecture; Epic 1 / Story 1 scaffolds the monorepo from scratch per the Structural Seed (`apps/web`, `packages/domain`, `packages/db`, `tests/`).
- Domain isolation (AD-1): `packages/domain` has zero imports from `next`, `react`, `@prisma/client`, or any HTTP/db library; only `apps/web/app/api/**` may import it.
- Single data-access path (AD-2): Postgres reachable only through the Prisma client exported by `packages/db`; schema changes only via Prisma migrations there.
- API boundary shape (AD-3): every client–server interaction is a Next.js Route Handler under `app/api/**/route.ts`; Server Actions are not used for data mutations/queries.
- Grade-submission single write path (AD-4): only `POST /api/review/grade` and `POST /api/restore` may write `interval`/`repetitions`/`ease_factor`/`next_review_date`; grade route computes via the pure `applyGrade` domain function inside one Prisma transaction.
- Import logic lives in domain (AD-5): `parseImportBlock` and `detectDuplicates` are pure functions in `packages/domain`, called identically by paste and CSV/Excel import routes.
- Request validation boundary (AD-6): every Route Handler validates body/query with a Zod schema before calling domain/db code; validation failures return the standard error envelope.
- Optimistic client data flow (AD-7): the review screen uses TanStack Query with optimistic updates — local cache updates and advances immediately, background grade POST, rollback + error surfaced only on failure.
- Local day-boundary source of truth (AD-8): `User.timezone` (IANA string, captured at signup, not user-editable in v1) is the single source of local-day truth for due-queue filtering, quest-day attribution and cultivation settlement, via a shared `toLocalCalendarDay` domain helper.
- Single shared card-creation path (AD-9): manual creation, paste import, and CSV import all call one `createCardWithSchedulingRecords` domain function; no Route Handler constructs a `SchedulingRecord` by hand.
- Response envelope & shared export/restore schema (AD-10): every successful response is `{ data: T }` (or `{ data: T[], meta?: {...} }`); FR-13 export and FR-14 restore share one Zod schema (`backupExportSchema`) in `packages/domain`.
- Backup cadence & destructive-operation atomicity (AD-11): Neon PITR covers infrastructure durability; FR-13 export is user-initiated/on-demand only (no scheduled export job in v1); folder-delete, flashcard-delete and class-delete cascades (FR-5) and restore (FR-14) are each wrapped in one Prisma transaction (all-or-nothing).
- Cultivation ledger & lazy settlement (AD-15): ladder, quest table, condition evaluators and `settleDays` are pure functions in `packages/domain/cultivation.ts`; only the claim route and settlement write XP (`XpEvent`, cached in `User.cultivationXp`, floored at 0); `CultivationDay` snapshots each day's quests; settlement runs inside one transaction at the start of `GET /api/cultivation` and the claim route, idempotent via unique `(userId, localDay)` and `User.cultivationSettledThrough`; no cron job. The grade route is unchanged.
- Testing architecture (AD-12): Vitest for `packages/domain` unit tests (no network/DB/browser dependency); Playwright for API/integration (seeded test DB) and E2E suites; GitHub Actions runs all three on every push.
- Performance budgets (AD-13): sub-100ms grade→next-card transition; 200ms app-open→due-queue-paint; sub-5s paste/CSV import end-to-end.
- Auth convention: Better Auth session cookie required on every Route Handler except `/api/auth/**`; unauthenticated requests return 401 with the standard error envelope; 30-day sliding session window.
- Config validation: environment variables (`DATABASE_URL`, `BETTER_AUTH_SECRET`, etc.) validated against a Zod schema at process start; fail fast on missing/malformed vars.
- Error envelope convention: `{ error: { code, message, fields?, details? } }` — `fields` for single-record field errors (FR-3), `details` for batch/line-numbered errors (FR-6/FR-7, and multi-row saves in Manual mode, FR-3); never both, never a bare string.
- Observability: every write path that can silently lose data if it fails partway (import commit, grade write, export, restore, folder-delete, flashcard-delete and class-delete cascades) logs a structured single-line summary (operation, record counts, outcome).
- Stack pinning: Next.js 16.x (App Router, Turbopack, Node 20+), TypeScript 5.x, Prisma 7.8.x, Postgres via Neon (free tier), Better Auth + `@better-auth/prisma-adapter`, TanStack Query v5, Zod 3.x/4.x, Tailwind CSS v4 (tokens mapped to DESIGN.md), Vitest, Playwright, Vercel hosting, GitHub Actions CI.
- Deployment topology: Vercel production + per-branch preview deployments each paired with a Neon branch seeded from minimal fixtures (not a prod copy); CI spins up a disposable Postgres per run; local dev uses `.env.local` + `prisma migrate dev` as the only schema-change path.

### UX Design Requirements

UX-DR1: Implement the dual-theme design token set (light default / dark toggle, "Pastel Frame") exactly as specified in DESIGN.md — colors including the frame and five tint pairs, typography scale (Plus Jakarta Sans), spacing scale, corner radii, elevation levels, motion durations/easings — as CSS variables mapped for Tailwind v4. *(Sprint Change 2026-11-14b.)*

UX-DR2: Build the Review card component: large soft-rounded (`rounded.lg`) surface, center-aligned, fixed bounds that never resize between prompt and revealed states, Quizlet-style 3D Y-axis flip (520ms, ease-out) on click/tap/Space, flipping either way; shared by Review, Learn and the Card viewer; no icon row in v1 (Sprint Change 2026-11-13).

UX-DR3: Build the Grade buttons component (Review and Learn): Again / Hard / Good / Easy, visible after the first flip and staying while the card is flipped back, until the entry is graded, each labeled with its keyboard shortcut; four equal-size pastel pills (rose, butter, mint, sky), text in `text`, never the accent. The colour order can read as a severity scale; the owner accepted that. *(Sprint Change 2026-11-14b.)*

UX-DR4: Build the app bar (replaces the sidebar): a dark frame top bar with the brand at the left, four flat icon+label nav items centred (Review, Classes, Cultivation, Settings — Cultivation replaced Stats, Sprint Change 2026-11-14), the current item a raised pill, labels shown from 1024px and icon-only below, and the Realm badge at the right; hidden during review focus mode and below 640px, where the dock (UX-DR20) replaces it. There is no Import item — import lives inside a Flashcard's "Add cards" (UX-DR9). *(Sprint Change 2026-11-14b.)*

UX-DR5: Build the Class / Folder / Flashcard tile component: tiles in a 1, 2 or 3 column grid under section headers preceded by the small accent-colored dot section-bullet, tinted with the Class's colour (UX-DR22), darker border on hover and focus, trailing "..." overflow menu for rename/delete (Class tiles: Colour as well; Flashcard tiles: Rename, Move to…, Delete). *(Sprint Change 2026-11-14b.)*

UX-DR6: Build the Progress counter (mono-font "X / Y") and the Realm badge at the right end of the app bar — the realm avatar (UX-DR23) inside a 44px XP ring, realm · stage and mono "40 / 100 XP" — both visible outside active review only (per FR-11/FR-12). The 4px XP bar remains on the Empty due-queue state and the Cultivation page. *(Sprint Change 2026-11-14b.)*

UX-DR7: Build the Modal component for: folder-delete confirmation (two explicit buttons — "Move flashcards to Unsorted" primary / "Delete flashcards too" secondary-danger, no checkbox); flashcard-delete confirmation (names the Flashcard and its Card count); move-flashcard modal (Folder picker across Classes); class-delete confirmation ("Move folders to…" with a target-Class picker as primary, "Delete class and everything in it" secondary-danger that only enables after typing the Class name; when no other Class exists only the delete option is shown); and restore-from-backup confirmation (consequence statement + Confirm/Cancel, no type-to-confirm).

UX-DR8: Build the Empty due-queue state: centered, prominent realm · stage with XP bar and "Today's quests 1 / 2" linking to Cultivation, calm line, then up to 3 Flashcards with Unlearned Cards ("Weather idioms · 12 new", linking to their page) or, when none exist, a primary "+ Add card" button (opens Manual mode in the last-used Flashcard, with a Flashcard picker to change it) — never a bare "nothing to do" message.

UX-DR17: Build the Card viewer on Flashcard detail (Sprint Change 2026-11-13, FR-16): one review card over all of the Flashcard's Cards, Term side first; outline circular ← / → buttons around a mono "X / N" counter (neutral, never the accent; disabled arrow at 0.4 opacity); the primary "Learn" button directly below, labelled with what is waiting ("Learn · 12 new · 3 due", FR-17); "Add cards" secondary while the viewer is shown.

UX-DR18: Build the Study directions control on Settings (Sprint Change 2026-11-13b, FR-18): the reused `components.mode-switcher` pill with three options, saved on change with a quiet "Saved" status and inline error rollback; stacks vertically below 640px; a radio group operable with arrow keys.

UX-DR19: Build the Cultivation page (Sprint Change 2026-11-14, FR-12/FR-15/FR-19), replacing Stats in the main nav: realm card with XP bar; Daily quest list (two Quest rows with locked, done-not-ticked, skipped and claimed states; tick claims at once with inline rollback on failure); quiet missed-quests notice (warning left border) and breakthrough notice, no modal or confetti; then the FR-15 stats.

UX-DR9: Build the "Add cards" panel opened from inside a Flashcard, with two modes in a pill switcher: **Manual** (Quizlet-style editor — numbered term/definition rows, optional fields expandable per row, "+ Add row", Tab moves to the next field and Enter on the last field adds a row, one Save creates all valid rows) and **Import** (Paste / Upload-file sub-tabs; Paste → delimiter + "Preview", Upload → column mapping). Import always ends in the **import review editor**: the same row editor as Manual, prefilled with the parsed rows, each labelled with its source line number, with inline errors on malformed rows, a "Already in {Flashcard} — will be skipped" flag on duplicates (cleared when the Term is edited), and a remove (×) button per row; a summary strip above the rows reads "30 rows · 2 need fixing · 1 duplicate". Save commits, then a results view shows exactly 3 groups (Created / Duplicates skipped / Errors, each error with line number + reason). The target Flashcard is fixed to the Flashcard the panel was opened from and shown in the panel header. There is no standalone Import page or nav item.

UX-DR10: Implement responsive breakpoints (mobile <640px, tablet 640–1024px, desktop >1024px): the app bar becomes the dock (UX-DR20) and the frame rim goes away below 640px; tiles use 1, 2, 3 columns; the grade-button row wraps below 640px; review session stays single-column/centered (card capped at 640px) at all sizes. *(Sprint Change 2026-11-14b.)*

UX-DR11: Implement full keyboard interaction for the Review and Learn loop: Space flips either way, 1–4 or J/K/L/; grade once the answer has been shown; in the Card viewer, Space flips and ← / → move between Cards; no mouse dependency anywhere in the loop, with sub-100ms perceived transition latency.

UX-DR12: Implement mobile touch interactions for review: tap-to-flip plus 4-directional swipe mapped to the four grades, additive to (not replacing) the grade buttons' own tap targets.

UX-DR13: Verify WCAG AA contrast in both themes before ship against the measured ratios recorded in DESIGN.md ("Pastel Frame", measured 2026-11-14: all text pairs pass; input borders, tile edges and the XP ring track are under the 3:1 non-text ratio, tracked by Story 6.6); any token added later must be checked against `card`, `bg` and the tints in both themes. *(Sprint Change 2026-11-14b.)*

UX-DR14: Implement a visible focus-ring/`:focus-visible` state on every interactive element sufficient for full keyboard navigation of the entire app (not just the review loop), with tab order following reading order on every surface.

UX-DR15: Apply the microcopy voice/tone rules from EXPERIENCE.md across all surfaces (direct, imperative, no cheerleading/emoji/mascot voice) — e.g. import results, empty states, restore warnings.

UX-DR16: Implement the light/dark theme toggle (light is default) reachable from Settings, applying the full token set from UX-DR1 consistently across every surface. *(Sprint Change 2026-11-14b.)*

UX-DR20: Build the mobile dock (Sprint Change 2026-11-14b, NFR-7): below 640px a floating pill at the bottom on the frame colour with Review, Classes, Cultivation, Settings and Search as round icon buttons, the current destination raised, clear of the device's bottom safe area, hidden in focus mode; the Realm badge is not shown on mobile.

UX-DR21: Build quick search (Sprint Change 2026-11-14b, FR-20): a centred palette over a scrim, opened with Ctrl+K or "/" and from the dock's Search button; **Go to** and **Suggested** groups before typing, results for names and Card terms after; arrow keys move, Enter opens, Esc closes and returns focus; key hints in the footer.

UX-DR22: Build Class colour (Sprint Change 2026-11-14b, FR-5): five swatches in the Class create and rename modals and a Colour item in the Class "..." menu; the tint carries to the Class's Folder and Flashcard tiles; colour is never the only cue.

UX-DR23: Build the realm avatar (Sprint Change 2026-11-14b, FR-12): one cultivator illustration per realm (19), more striking at higher realms, decorative only, shown inside the Realm badge ring; the realm and stage are always also written out.

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
FR-10: Removed (Sprint Change 2026-11-13)
FR-11: Epic 4 - Focus mode (chrome hidden during review)
FR-12: Epic 5 - Cultivation progression (realm ladder, XP ledger)
FR-13: Epic 5 - Data export/backup to JSON
FR-14: Epic 5 - Restore from backup JSON
FR-15: Epic 5 - Cultivation & stats page (realm, XP history, totals, retention curve)
FR-16: Epic 4 - Flashcard card viewer (flip, ← →, non-graded)
FR-17: Epic 4 - Learn session (graded introduction of Unlearned Cards per Flashcard)
FR-18: Epic 4 - Study directions setting (per-direction learned model)
FR-19: Epic 5 - Daily Quests (claim, skip, double penalty, settlement)
FR-20: Epic 6 - Quick search (palette, Ctrl+K)

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
A user can run a daily, keyboard-first review session: due cards are presented one at a time per direction, graded with a single keystroke, and correctly rescheduled per the classical SM-2 algorithm — with distraction-free focus mode in place. New Cards are introduced deliberately through a Flashcard's card viewer and Learn session; Review only brings back Cards already learned. The user chooses which Recall Directions they study (both by default); "learned" is tracked per direction, so a graded direction joins Review without waiting for the other.
**FRs covered:** FR-8, FR-9, FR-11, FR-16, FR-17
**Implementation notes:** `packages/domain/sm2.ts` as a pure, framework-free engine unit-tested against the PRD addendum's worked fixtures (NFR-4, SM-3); the grade write path is the single `POST /api/review/grade` route calling `applyGrade` inside one Prisma transaction (AD-4); TanStack Query optimistic updates for sub-100ms perceived transitions (AD-7, NFR-2); `toLocalCalendarDay` domain helper introduced here for due-queue filtering (AD-8) and reused by Epic 5's quest-day attribution and settlement; 200ms app-open-to-due-queue budget (AD-13, NFR-3); Review card flip, Grade buttons, review-mode sidebar hiding, full keyboard interaction, mobile tap/swipe, and the Empty due-queue state (UX-DR2, UX-DR3, UX-DR4, UX-DR6 progress counter, UX-DR8, UX-DR11, UX-DR12); Card viewer and Learn entry on Flashcard detail (UX-DR17); `first_graded_at` marker and the shared learned/unlearned predicate (AD-14).

### Epic 5: Cultivation Progress & Data Safety
A user advances through a tu-tiên cultivation ladder (Ngưng Khí → Đạp Thiên Cảnh) by claiming two daily quests — Learn Flashcards (1–4 by Bộ) and Clear Review — that they tick off themselves once the work is done; unclaimed quests cost double XP and can demote them. They see their realm, quests and basic stats (including the SM-2 retention curve) outside review, and can trust the product with months of history — exporting it on demand and restoring it, with destructive operations always confirmed and atomic.
**FRs covered:** FR-12, FR-13, FR-14, FR-15, FR-19
**Implementation notes:** Quest-day attribution and settlement reuse Epic 4's `toLocalCalendarDay` helper so due-dates and quest days share one clock (AD-8); XP ledger, quest snapshots and lazy settlement per AD-15 (`packages/domain/cultivation.ts`, no cron, grade route unchanged); FR-13/FR-14 share one `backupExportSchema` (AD-10) with a `cultivation` section, and restore runs inside one Prisma transaction (AD-11) and marks days through yesterday settled; restore-confirmation modal (UX-DR7), Realm badge (UX-DR6), Empty due-queue realm (UX-DR8) and the Cultivation page (UX-DR19); the Cultivation page surfaces the retention curve per Recall Direction (SM-4). Build order: 5.1 → 5.6 → 5.7 → 5.4 → 5.2 → 5.3 → 5.5 (Sprint Change 2026-11-14). As the final epic, this is also the natural point for a closing pass on cross-cutting UX items that touch every surface built so far: WCAG AA contrast verification in both themes (UX-DR13, with particular attention to the flagged light-mode combination), full keyboard focus-visible states app-wide (UX-DR14), and a microcopy/voice consistency check (UX-DR15).

### Epic 6: Pastel Frame & Navigation
A user gets the refreshed look (dark frame, top bar, pastel tiles, realm avatar), can reach every destination on a phone through a dock, can give each Class its own colour, and can jump anywhere with quick search. Stories 6.1 and 6.2 record work already built.
**FRs covered:** FR-20 (and the Class colour part of FR-5)
**Implementation notes:** Tokens live in `apps/web/app/globals.css` and `DESIGN.md`. Class colour is the only schema change (one additive migration, deployed to Neon with the code) and must land before the backup stories so the backup schema is written once. Quick search is read-only and reuses the existing list endpoints or one new read-only search route.

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
**Then** the UI swaps between light (default) and dark theme using the full token set, and the preference persists across reloads

*Amended by Sprint Change 2026-11-14b: the sidebar is now the top app bar inside a dark frame (UX-DR4), the theme default is light, and the nav's fourth item has been Cultivation since 2026-11-14. Behavior and routes are unchanged.*

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

*Amended by Sprint Change 2026-11-14b: Classes also carry a colour (Story 6.4); the Class list is a grid of tiles (UX-DR5).*

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

A user can run a daily, keyboard-first review session: due cards are presented one at a time per direction, graded with a single keystroke, and correctly rescheduled per the classical SM-2 algorithm — with distraction-free focus mode in place. New Cards are introduced deliberately through a Flashcard's card viewer and Learn session; Review only brings back Cards already learned. The user chooses which Recall Directions they study (both by default); "learned" is tracked per direction, so a graded direction joins Review without waiting for the other.

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

**Given** due Scheduling Records of learned Cards exist (Story 4.6)
**When** I open Review
**Then** due entries from all Classes are presented one at a time, prompt side first, ordered oldest-due-first

**Given** I'm viewing a Class or a Folder
**When** I choose "Review this class" or "Review this folder"
**Then** the session contains only that scope's due entries and otherwise behaves exactly like the default session (amended by Sprint Change 2026-11-14: clearing a scoped session does not by itself complete the Clear Review quest, FR-19)

**Given** a Card due in both directions
**When** it appears
**Then** it shows as two separate, independently-gradable queue entries

**Given** a card showing its prompt
**When** I press Space
**Then** it flips to reveal the answer, no mouse needed
**And** pressing Space or clicking again flips it back; grading stays available

**Given** the answer is revealed
**When** I press 1–4 or J/K/L/;
**Then** the Grade is submitted and the next entry appears with no perceptible lag (sub-100ms, via optimistic update)
**And** on mobile, tapping the card flips it, and swiping in any of the four directions submits the corresponding grade, layered on top of the grade buttons' own tap targets

### Story 4.4: Daily New-Card Batch Cap — REMOVED

Removed by Sprint Change 2026-11-13 (retired with FR-10). New Cards are introduced only through Learn (Story 4.8). The story number is not reused.

### Story 4.5: Focus Mode

As a user,
I want all non-essential chrome hidden during an active review session,
So that I can concentrate without distraction.

**Acceptance Criteria:**

**Given** I enter a Review or Learn session
**When** it starts
**Then** the app bar (formerly the sidebar), realm badge, and other non-essential chrome are hidden — only the card and recall controls are visible

**Given** I exit review (queue cleared or I navigate away)
**When** I leave
**Then** normal navigation and chrome are restored
**And** when nothing is due, the Empty due-queue state shows a calm line (the realm and quest count are added by Story 5.1, Sprint Change 2026-11-14), and either up to 3 Flashcards with Unlearned Cards (each linking to its page) or, when none exist, a "+ Add card" button — instead of the sidebar-less review card

*Build order (Sprint Change 2026-11-13, 2026-11-13b): 4.6 → 4.7 → 4.8 → 4.9 → 4.5.*

### Story 4.6: Learned Marker & Learned-Only Review Queue

As a user,
I want Review to bring back only Cards I have already learned,
So that new Cards don't flood my daily session before I've studied them.

**Acceptance Criteria:**

**Given** the migration runs
**When** it completes
**Then** every SchedulingRecord has `firstGradedAt` (nullable) and every record with `interval > 0` is backfilled with `firstGradedAt = updatedAt`

**Given** a record with `firstGradedAt = null`
**When** it is graded via `POST /api/review/grade`
**Then** `firstGradedAt` is set to now
**And** a later grade never changes it

**Given** a Card created by any path
**When** it is saved
**Then** both of its records have `firstGradedAt = null` (AD-9)

**Given** an Unlearned Card whose records are due
**When** I open Review (default, class or folder scope)
**Then** neither record appears
**And** a learned Card's due records still do

**Given** `GET /api/review/queue?flashcardId=…`
**When** it is called
**Then** it returns 400 (the flashcard scope moved to Learn)
**And** "Review this flashcard" is removed from the Flashcard page
**And** learned/unlearned is computed only through the shared AD-14 predicate, which is unit-tested

### Story 4.7: Flashcard Card Viewer

As a user,
I want to flip through a Flashcard's Cards on its page,
So that I can get familiar with them before I'm graded.

**Acceptance Criteria:**

**Given** a Flashcard with N Cards
**When** I open it
**Then** a card viewer above the Cards list shows Card 1 Term-side first with "1 / N", Cards in list order

**Given** the viewer
**When** I press Space or click the card
**Then** it flips either way

**Given** the viewer
**When** I press → / ← (or the buttons)
**Then** the next/previous Card shows Term-side first
**And** ← is disabled on Card 1 and → on Card N (no wrap-around)

**Given** focus is in a field or the Add cards panel is open
**When** I press Space or an arrow key
**Then** the viewer ignores it
**And** Space never scrolls the page

**Given** any viewing
**Then** no Scheduling Record changes

**Given** an empty Flashcard
**Then** the viewer is not shown and the existing empty state is

**Given** mobile
**When** I swipe left/right on the viewer
**Then** it moves → / ←
**And** "Learn" is the page's primary button directly below the viewer; "Add cards" is secondary
**And** UI conforms to DESIGN.md `components.card-viewer` in both themes

### Story 4.8: Learn Session

As a user,
I want a Learn session per Flashcard,
So that I grade new Cards deliberately and they then join my daily Review.

**Acceptance Criteria:**

**Given** `GET /api/review/learn?flashcardId=…`
**When** it is called
**Then** it returns the Flashcard's unlearned records (Cards in creation order, each Card's two directions together, Term→Definition first) followed by its due records of learned Cards (oldest-due-first), plus counts `{ newCards, due }`
**And** 401 / 400 / 404 behave like the queue route

**Given** the Flashcard page
**Then** the Learn button reads "Learn · {newCards} new · {due} due" (zero parts omitted; just "Learn" when both are 0)

**Given** I press Learn
**When** the session starts
**Then** the same session screen as Review runs (flip, keys, swipe, optimistic grade, 409 handling) scoped to this Flashcard, with the header naming it

**Given** I grade an entry Again in a Learn session
**When** the rest of the queue has been shown
**Then** that entry appears again at the end of the session, and keeps returning until I grade it Hard, Good or Easy
**And** only its first grade (Again) is sent to `POST /api/review/grade`; the repeats are practice and never POST, so the record stays due tomorrow and no 409 occurs

**Given** I grade both directions of a new Card
**When** I next open Review on its due date
**Then** it appears there

**Given** nothing is left to learn or review in the Flashcard
**Then** a calm line "Nothing left to learn in {Flashcard} right now." with a link back to the Flashcard shows
**And** Learn grades go through the same grade route (their `firstGradedAt` drives the Learn Flashcards quest, FR-19, Sprint Change 2026-11-14)
*Amended by Sprint Change 2026-11-13b: the queue now filters to studied directions and "learned" is per direction (Story 4.9). Story 4.8b added "Study all cards again" (unsaved practice).*

### Story 4.9: Study Directions Setting & Per-Direction Learned Model

As a user,
I want to choose whether I'm asked Term → Definition, Definition → Term, or both,
So that I study the recall skill I actually need.

**Acceptance Criteria:**

**Given** the migration runs
**Then** `User.studyDirections` exists (BOTH | TERM_TO_DEFINITION | DEFINITION_TO_TERM), every account is BOTH, and no Scheduling Record changes

**Given** Settings
**When** I pick one of the three options
**Then** it saves on change via `PATCH /api/settings` (Zod-validated; 401 without a session), a "Saved" status shows, and a failed save rolls the choice back with an inline error

**Given** I study only Term → Definition
**When** I open Review or Learn
**Then** no Definition → Term record appears, and the Learn counts count only Term → Definition

**Given** a Card whose Term → Definition is graded and Definition → Term is not (setting Both)
**When** its Term → Definition comes due
**Then** it appears in Review, and its Definition → Term still waits in Learn

**Given** I switch from one direction to Both
**Then** the newly studied direction's ungraded records appear in Learn, its graded due records in Review, and no Card leaves Review

**Given** I study only Definition → Term
**Then** the card viewer and the Learn practice run show the Definition side first

**Given** the predicates
**Then** `studiedDirections`, `learnedRecordWhere`, `unlearnedRecordWhere`, `learnedCardWhere` and `unlearnedCardWhere` live once in `packages/domain` (AD-14), are unit-tested for all three settings, and the queue, Learn and Flashcard-count routes use only them
**And** UI conforms to DESIGN.md (Study directions control) in both themes

*Build order (Sprint Change 2026-11-13b): 4.8 → 4.9 → 4.5. 4.5's Empty due-queue list of Flashcards with Unlearned Cards uses the 4.9 predicates.*

## Epic 5: Cultivation Progress & Data Safety

A user advances through a tu-tiên cultivation ladder by claiming two daily quests that grow with their Bộ; unclaimed quests cost double XP and can demote them. They see their realm, quests and basic stats (including the SM-2 retention curve) outside of review, and can trust the product with months of history — exporting it on demand and restoring it, with destructive operations always confirmed and atomic.

*Sprint Change 2026-11-14 replaced the streak with the cultivation progression: 5.1 rewritten, 5.6 and 5.7 added, 5.2–5.4 amended. Build order, merged with Epic 6 by Sprint Change 2026-11-14b: 5.1 (done) → 6.3 → 6.6 → 5.6 → 5.7 → 5.4 → 6.4 → 5.2 → 5.3 → 6.5 → 5.5.*

### Story 5.1: Cultivation Realms & XP Ledger

As a user,
I want a cultivation realm that rises with the XP I earn,
So that months of study show up as a rank I care about.

**Acceptance Criteria:**

**Given** the realm ladder
**Then** `packages/domain/cultivation.ts` defines the 90 levels and the XP each stage needs, exactly as the PRD addendum table (Nhất Bộ: Ngưng Khí Tầng 1–15, then Trúc Cơ … Dương Thực with Sơ kỳ / Trung kỳ / Hậu kỳ / Đại viên mãn; Nhị Bộ incl. Thiên Nhân Ngũ Suy's five suy; Tam Bộ incl. Không Kiếp's four Tôn ranks and Đạp Thiên Kiều's nine bridges; Tứ Bộ: Đạp Thiên Cảnh)
**And** `levelForXp(xp)` returns the Bộ, realm, stage, XP into the stage and XP needed, unit-tested at every realm boundary, at 0, and past Đạp Thiên Cảnh (XP keeps adding up, level stays final)

**Given** my total XP
**Then** the app bar shows the Realm badge ("Ngưng Khí · Tầng 3" + "5 / 20 XP"; originally at the sidebar bottom with an XP bar, now the avatar inside an XP ring, Sprint Change 2026-11-14b), hidden during focus mode (FR-11)
**And** the Empty due-queue state shows the realm in heading size where the streak was planned (closes the 4.5 deferred item), and the stale streak comment in `empty-due-queue.tsx` is updated

**Given** the schema
**Then** `User.cultivationXp` (default 0), `User.cultivationSettledThrough` (nullable date), `CultivationDay` and `XpEvent` are added in one additive migration (AD-15), deployed to Neon before the dev server runs
**And** applying the `XpEvent` deltas in order with a running floor at 0 always equals `User.cultivationXp`
**And** realm names render in Vietnamese; the rest of the copy stays in English

### Story 5.2: Data Export/Backup

As a user,
I want to export my full Card + Scheduling Record + cultivation history on demand,
So that I never lose months of study data.

**Acceptance Criteria:**

**Given** I trigger export from Settings
**When** it completes
**Then** I receive a JSON file containing every Class, Folder, Flashcard and Card (with its Flashcard), both Scheduling Records per Card, and the cultivation section (XP, settledThrough, CultivationDay snapshots, XpEvents) — sufficient to reconstruct state
**And** export is strictly user-initiated/on-demand, no scheduled export job
**And** the payload conforms to the single shared `backupExportSchema` also used by restore
**And** the export includes `user.studyDirections`
**And** each Scheduling Record's `firstGradedAt` is exported verbatim
**And** each Class's `color` is exported (Sprint Change 2026-11-14b; built after Story 6.4)

### Story 5.3: Restore from Backup

As a user,
I want to restore a previously-exported backup,
So that I can recover my data if something goes wrong.

**Acceptance Criteria:**

**Given** a valid export file
**When** I restore it
**Then** the Class → Folder → Flashcard structure is recreated and every Card is recreated in its original Flashcard with both Scheduling Records in exactly their exported state and the cultivation section is restored verbatim

**Given** my account already has data
**When** I attempt a restore
**Then** I must explicitly confirm before it proceeds — restore replaces existing data, never a silent merge/overwrite
**And** the restore runs inside one transaction: every row changes or none do, even on a partial failure
**And** each Scheduling Record's `firstGradedAt` is restored verbatim
**And** `user.studyDirections` is restored
**And** each Class's `color` is restored; a backup without it restores with colours assigned by creation order (Sprint Change 2026-11-14b)

**Given** a restore completes
**Then** `cultivationSettledThrough` is set to yesterday, so no penalty is charged for days between the export and the restore

### Story 5.4: Cultivation & Stats Page

As a user,
I want one page with my realm, today's quests, card totals, and SM-2 retention curve,
So that I can observe my progress and trust the scheduling is working correctly.

**Acceptance Criteria:**

**Given** I navigate to Cultivation (outside active review; it replaces Stats in the main nav, UX-DR19)
**When** it loads
**Then** I see my realm and stage with its XP bar, total XP, today's quest list (Story 5.6), an XP-over-time chart from `XpEvent`, total Cards (learned / unlearned, counted over my studied directions), and a visualization of Scheduling Records' distribution by interval (or review-outcome history) per Recall Direction

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
**Then** all text/background combinations meet 4.5:1 contrast — matching the measured "Pastel Frame" ratios recorded in DESIGN.md (text on the five tints included), and the non-text 3:1 gaps listed there are closed or accepted in writing (Sprint Change 2026-11-14b)

**Given** any interactive element
**When** focused via keyboard
**Then** a clearly visible focus-ring appears, and tab order follows reading order on every surface

**Given** all user-facing copy
**When** reviewed
**Then** it follows the direct, imperative Voice and Tone table in `EXPERIENCE.md` — no cheerleading, emoji, or mascot voice

### Story 5.6: Daily Quests

As a user,
I want two daily quests that grow with my Bộ and that I tick off myself,
So that each day has a clear target and finishing it feels earned.

**Acceptance Criteria:**

**Given** I open Cultivation for the first time on a local day
**Then** a `CultivationDay` snapshot is created with Learn Flashcards (target = my Bộ number: 1 Nhất Bộ, 2 Nhị Bộ, 3 Tam Bộ, 4 Tứ Bộ) and Clear Review, their XP (10 Nhất Bộ, 20 Nhị Bộ, 40 Tam/Tứ Bộ) and their skip flags
**And** realm changes later that day don't change today's targets

**Given** a quest's condition is not met
**Then** its checkbox is disabled and shows its progress ("0 / 1 Flashcards", "12 due left") and the reason

**Given** a quest's condition is met
**When** I tick it
**Then** `POST /api/cultivation/quests/[kind]/claim` re-checks the condition server-side, writes `XpEvent(+xp)`, marks it claimed and returns my new XP and realm
**And** a second claim of the same quest that day is rejected with no extra XP

**Given** a quest's condition is met but it is not ticked
**Then** its row says "Done. Tick to claim before the day ends."

**Given** nothing was due at the start of the day, or no Flashcard had unlearned records
**Then** Clear Review, or Learn Flashcards, shows as skipped ("Nothing to do today.") and can't be claimed

**Given** fewer Flashcards with unlearned records than my target
**Then** the Learn target that day is the number available

**Given** Learn Flashcards
**Then** a Flashcard counts once all its unlearned records in my studied directions are learned and the last one was first-graded today (AD-14)

**Given** Clear Review
**Then** it is met once at least one record learned before today was graded today and the due queue (all Classes, studied directions) is empty

**Given** the quest rules
**Then** neither quest reads grade values (SM-C1)
**And** both condition evaluators are pure domain functions, unit-tested including the skip and reduced-target cases

**Given** I reach a new stage by claiming
**Then** a quiet "Breakthrough: {realm · stage}" notice appears, with no modal or animation beyond the XP bar fill
**And** UI conforms to DESIGN.md (Quest row, Realm badge) in both themes

### Story 5.7: Day Settlement & Penalties

As a user,
I want unclaimed quests to cost me,
So that skipping study has real weight.

**Acceptance Criteria:**

**Given** past days after `cultivationSettledThrough`
**When** I next load Cultivation or claim a quest
**Then** each day through yesterday is settled in order in one transaction: −2 × XP per quest that was neither claimed nor skipped (even if its work was done), then `cultivationSettledThrough` moves forward

**Given** a day I never opened the app
**Then** its quests are rebuilt from my Bộ after the previous day settled, with skip flags derived from the data, and are penalized the same way

**Given** penalties larger than my XP into the current stage
**Then** I drop stages, realms or a whole Bộ as `levelForXp` says (the next day's targets and XP shrink with it), and XP never goes below 0

**Given** cultivation runs for the first time on my account
**Then** `cultivationSettledThrough` is set to yesterday and no earlier day is penalized

**Given** settlement runs twice at once (two tabs, or two requests at the same time)
**Then** each day is penalized exactly once

**Given** a settlement that charged XP
**Then** the next Cultivation view shows one quiet notice per settled range ("Nov 12: 2 quests missed, −40 XP. Now Ngưng Khí · Tầng 9.")
**And** `settleDays` is unit-tested for a single missed day, a 30-day absence, demotion across a realm and a Bộ boundary, the 0 floor, a DST day, and skipped quests

## Epic 6: Pastel Frame & Navigation

A user gets the refreshed look (a dark frame with a top bar, pastel tiles and a realm avatar), can reach every destination on a phone, can give each Class its own colour, and can jump anywhere with quick search.

*Added by Sprint Change 2026-11-14b. Stories 6.1 and 6.2 record work already built on `ui/big-ui-update`. Build order: 6.3 → 6.6 → (Epic 5 stories) → 6.4 → (5.2, 5.3) → 6.5 — see Epic 5.*

### Story 6.1: Pastel Frame Shell and Tiles (built)

As a user,
I want the refreshed look across the whole app,
So that it feels like one coherent, friendly product.

**Acceptance Criteria:**

**Given** any shell route at 640px or wider
**Then** I see the dark frame with the top app bar, the inset light panel, and the Realm badge at the bar's right end (UX-DR4, UX-DR6)

**Given** Classes, a Class's Folders, or a Folder's Flashcards
**Then** they are tiles in a 1, 2 or 3 column grid with a "..." menu (UX-DR5)

**Given** Review or Learn in focus mode
**Then** the app bar is absent from first paint, with and without JavaScript

**Given** a first visit with no stored theme
**Then** the theme is light, and a stored dark choice loads dark with no flash (UX-DR16)

**Given** the Review and Learn grade buttons
**Then** they are the four pastel pills (UX-DR3)

*Status: built and committed (`e8fe617`); spec `spec-restyle-pastel-frame.md`; 138 of 138 e2e tests pass.*

### Story 6.2: Realm Avatar (built)

As a user,
I want an avatar that changes with my realm,
So that advancing through the ladder is visible at a glance.

**Acceptance Criteria:**

**Given** my realm
**When** the Realm badge shows
**Then** it shows the avatar for that realm (19 looks) inside the XP ring, with the realm, stage and XP written out beside it (UX-DR23)

**Given** I move to a higher realm
**Then** the avatar gains more detail (aura, core, halo, swords, rays, crown) per DESIGN.md, and a lower realm after a demotion shows the lower look

**Given** reduced motion
**Then** the slow ray turn at Bộ 3 and up stops

*Status: built and committed (`92167eb`).*

### Story 6.3: Mobile Dock

As a user on a phone,
I want a way to navigate,
So that I can reach Settings, Cultivation and Log out below 640px.

**Acceptance Criteria:**

**Given** a viewport under 640px outside focus mode
**Then** a floating dock shows Review, Classes, Cultivation, Settings and Search, with the current destination raised, clear of the device's bottom safe area (UX-DR20)

**Given** a viewport of 640px or wider
**Then** the dock is not shown and the app bar is

**Given** a Review or Learn session
**Then** the dock is hidden, as the app bar is

**Given** the dock
**Then** every item is reachable and operable by keyboard with a visible focus ring, and the page content is not covered by the dock when scrolled to the end
**And** the Search button opens quick search once Story 6.5 exists, and is hidden until then

### Story 6.4: Class Colour

As a user,
I want each Class to have its own colour,
So that I can tell my material apart at a glance.

**Acceptance Criteria:**

**Given** the Class create modal
**Then** I can pick one of five colours; the default is the next colour in order (UX-DR22)

**Given** an existing Class
**When** I choose Colour from its "..." menu or rename it
**Then** I can change its colour, and its Class tile, Folder tiles and Flashcard tiles show the new colour at once

**Given** Classes that existed before this story
**Then** the migration gives each a colour by creation order, and nothing else changes

**Given** the colour
**Then** the Class name and breadcrumb remain the primary cue; colour is never the only one
**And** the export includes `color` and restore reads it (Stories 5.2 and 5.3), validated by `backupExportSchema`
**And** `color` is validated by Zod as one of the five values on create and update (AD-6), and the migration is deployed to Neon with the code

### Story 6.5: Quick Search

As a user with a growing library,
I want to jump anywhere from the keyboard,
So that I do not have to drill through Classes and Folders.

**Acceptance Criteria:**

**Given** focus is not in a text field and no session or modal is open
**When** I press Ctrl+K or "/"
**Then** the palette opens with **Go to** (Review, Classes, Cultivation, Settings) and **Suggested** ("Continue: {last-used Flashcard}") (UX-DR21)

**Given** I type
**Then** results show matching destinations and Class, Folder and Flashcard names and Card terms, scoped to my account, and a Card result opens its Flashcard

**Given** the palette
**Then** arrow keys move the highlight, Enter opens it, Esc closes and returns focus to where it was

**Given** a Review or Learn session, a modal, or a text field with focus
**Then** the shortcut does nothing

**Given** a search request
**Then** it is read-only and returns only the signed-in user's data

### Story 6.6: Input Border Contrast

As a user,
I want input fields to have a visible boundary,
So that I can see where to type.

**Acceptance Criteria:**

**Given** the `border` token on the content panel and on white cards in both themes
**Then** it reaches at least 3:1 against `bg` and `card`, measured and recorded in DESIGN.md

**Given** inputs, selects and the Add cards fields
**Then** they use the new border and keep their focus and error states

**Given** the tile edges, card hairlines and XP ring track
**Then** each is either brought to 3:1 or recorded in DESIGN.md as accepted, with the reason
**And** the existing e2e suite still passes

