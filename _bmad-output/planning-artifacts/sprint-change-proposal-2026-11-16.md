# Sprint Change Proposal — Planner module: Tasks, Pomodoro, Calendar, Music (new Epics 8–11)

- **Date:** 2026-11-16 (proposal drafted 2026-11-16/17)
- **Project:** Web_TrainingSanctum
- **Requested by:** Luric (product owner)
- **Workflow:** bmad-correct-course (incremental mode), fed by bmad-forge-idea session `_bmad-output/forge/planner-module-todo-pomodoro-calendar/` (outcome HARDENED, 11 locks)
- **Status:** Approved by Luric, proposal by proposal (6 of 6). Applied 2026-11-17.
- **Scope:** **Major.** It reverses a PRD non-goal (§1, §5 "Pomodoro timer, task manager … must not be scaffolded"), adds four epics and four migrations, introduces the product's first outbound HTTP dependency (Jamendo), and changes the main navigation.

---

## 1. Issue Summary

The PRD scopes v1 to flashcards and forbids scaffolding the two modules the brief names as the next step (brief.md:78: "a Pomodoro timer with background music, and a structured to-do/task manager"). Module 1 is at `review` on every story except 5.5. The owner now wants module 2 — **Planner** — built in this codebase, and pressure-tested its design in a forge session on 2026-11-16. Every design branch that would otherwise surface as a mid-story question (what a task is, whether the estimate binds, what happens on overrun, what the calendar is for, where the timer's truth lives, whether XP applies, where music comes from) is already decided and recorded in `forged-idea.md`.

Nothing in flight collides with the change. This proposal makes the planning artifacts say what the forge decided, so `bmad-build` can take Epics 8–11 story by story.

## 2. Decisions carried in from the forge (binding)

1. **Task is free-form.** Title, category, day, optional start time, estimate. Never linked to a Card, Flashcard, Folder or Class.
2. **The plan is binding; the estimate is a budget.** 90 min → 25/25/25/15 with breaks between; the last block is the remainder. At the end the timer stops and asks "Done?".
3. **Overrun is bounded.** "+1 session" at most twice per task, over its life. Then "edit the estimate". The estimate is never changed by the app.
4. **Restart plans from the remainder** `max(estimate − logged, 0)`.
5. **Calendar is a time grid.** Start time optional (unscheduled tray). Block = whole plan incl. breaks (90 → 105 min). A late start moves the block to the real start; the plan is not kept.
6. **Collisions are drawn, never resolved.**
7. **Rollover is manual.** Overdue badge + "Move all to today". Estimate and logged minutes survive.
8. **Timer truth is the server.** One running session per user, enforced in the DB.
9. **XP is passive.** Focus session and task-done events; no quest, no penalty.
10. **Music is Jamendo only**, behind a `MusicSource` adapter; per-category track, per-task override, fade per session, attribution shown.
11. **Build order 8 → 9 → 10 → 11.**

Decided during this change: **N1** — one **Planner** nav item with Tasks / Calendar / Pomodoro as an in-page segment switcher (nav stays at five items, six for an admin). **Planner XP values**: focus session 1 / 2 / 4 / 4 and task done 5 / 10 / 20 / 20 XP by Bộ (one tenth and one half of that Bộ's quest XP).

## 3. Impact Analysis

### Epics
- **New:** Epic 8 Planner — Tasks & Categories (4 stories), Epic 9 Planner — Pomodoro (4), Epic 10 Planner — Calendar (3), Epic 11 Planner — Music (3). **14 new stories.**
- **Epic 5:** Stories 5.2/5.3 (export/restore, at `review`) are not reopened; Story **9.4** extends `backupExportSchema` with a `planner` section so restore loses nothing. Story **5.5** audits the Planner surfaces and moves to the very end.
- **Epic 7:** 7.6's delete cascade already covers the new tables (`onDelete: Cascade`); 7.3's read-only view shows the payload and gains the planner section through 9.4.

### Artifacts
- **PRD:** §1, §2.1, §2.3 (UJ-5), §3, new §4.10 with FR-22 … FR-26, FR-12 and FR-13 amended, §5, §6, §7, §8.1.
- **Architecture:** AD-17 (plan, server-truth timer, bounded overrun, passive XP), AD-18 (music adapter); AD-8 and AD-10 amended; conventions (Observability, Config, new External-calls row); structural seed; ERD; capability map; Deferred.
- **UX:** EXPERIENCE.md — three Planner surfaces, five-item nav, voice rows, nine component patterns, seven state rows, keys, Flow 5. DESIGN.md — five component token groups, typography note, tint-use rule, Do/Don't rows, one contrast item.
- **Tracking:** sprint-status.yaml gains Epics 8–11 and the build order; 5.5 annotated.
- **Secondary:** `.env.example` (`JAMENDO_CLIENT_ID`), `deferred-work.md` (two entries), PRD addendum (Planner XP table).

### Technical
- Four additive Prisma migrations, one per epic, each deployed to Neon with its code (every page returns 500 otherwise).
- `XpEvent.questKind` becomes nullable; `XpEventReason` gains `FOCUS_SESSION`, `TASK_DONE`. The AD-15 ledger invariant (deltas in order, floored at 0, equals `User.cultivationXp`) is unchanged; XP write paths grow from two to four.
- Partial unique index `(userId) WHERE endedAt IS NULL` on `PomodoroSession`.
- First outbound HTTP call (Jamendo) — isolated in one adapter; its failure degrades music only.
- No cron, no scheduled job, no file storage.

## 4. Recommended Approach

**Direct Adjustment:** add Epics 8–11 after Epic 7, amend 5.5, leave everything built untouched. Rollback is not applicable; the flashcards MVP (§8.1) is unchanged and Planner is a **Phase 1b** addition, not a cut.

- **Effort:** High — 14 new stories (vs. 1 remaining).
- **Risk:** Medium. The two risks that matter are the Jamendo dependency (verified first thing in Story 11.1, with a stop rule) and the nav change (contained by N1).
- **Build order:** **8.1 → 8.2 → 8.3 → 8.4 → 9.1 → 9.2 → 9.3 → 9.4 → 10.1 → 10.2 → 10.3 → 11.1 → 11.2 → 11.3 → 5.5.**

## 5. Detailed Change Proposals (all approved)

### 5.1 PRD — `prds/prd-Web_TrainingSanctum-2026-10-29/prd.md`

| § | Change |
|---|---|
| frontmatter | `updated: 2026-11-16` |
| §1 Vision, last paragraph | **Old:** "v1 scope is deliberately narrow … must not leak into this release." **New:** Flashcards were module 1 (FR-1 … FR-21). Module 2, **Planner** — tasks with estimates, a Pomodoro that turns an estimate into a binding plan, a calendar, background music — added by Sprint Change 2026-11-16 as Phase 1b (§4.10, §8.1). Shares account, XP ledger and Pastel Frame; a task never points at a Card. |
| §2.1 JTBD | + "I need a place to write down what I'll study or do today, say how long it should take, and have the app hold me to that number." |
| §2.3 | + **UJ-5 Planning and running a study evening** (Sunday calendar → Tuesday 19:40 start → block slides → 25/25/25/15 → "Done?" → +1 session → done → XP). Realizes FR-22 … FR-26. |
| §3 Glossary | + Task, Task Category, Estimate, Pomodoro Plan, Focus Session / Break, Overrun Session, Unscheduled Task, Overdue Task. |
| **new §4.10 Planner** | FR-22 Task categories and tasks · FR-23 Pomodoro plan and timer · FR-24 Overrun and completion · FR-25 Calendar · FR-26 Background music — full text in the PRD. |
| FR-12, first consequence | XP also changes when a Focus Session completes or a Task is marked done; passive, no quest, no penalty; 1/2/4/4 and 5/10/20/20 XP by Bộ. |
| FR-13 | + export includes Planner data (categories, tasks, sessions, settings); FR-14 restores it. |
| §5 Non-Goals | **Remove** the "future Sanctum modules" bullet. **Add:** task linked to flashcard content or estimate from due cards; Planner quest/penalty; auto-rollover, chain-push or block-on-conflict; recurring tasks, reminders, time tracking outside a Pomodoro, sub-tasks; music from YouTube/Spotify/uploads/bundled files, a second adapter. |
| §6 NFRs | + **Timer truth** (server `startedAt` is the only clock) and **External dependency isolation** (Jamendo failure degrades music only). |
| §7 | + The Planner keeps the same quiet: mono timer, inline "Done?" card, the only sound is the music the user chose. |
| §8.1 | + Phase 1b: Planner (FR-22 … FR-26) after FR-21. |

### 5.2 Architecture — `architecture/…/ARCHITECTURE-SPINE.md`

| Section | Change |
|---|---|
| frontmatter | `binds` + FR-22 … FR-26; `updated: 2026-11-16` |
| **AD-17** Pomodoro plan, server-truth timer, bounded overrun | `packages/domain/pomodoro.ts`: `planPomodoro`, `remainingMinutes`, `overrunSessionsUsed`, `planLengthMinutes`, `plannerXp` — pure. `POST /api/planner/sessions` writes `startedAt = now`; client renders `now − startedAt`, never sends elapsed; expired sessions closed server-side at planned end; partial unique index → one running session (`409` otherwise); overrun cap (2 per task life) enforced in domain + route (`409`); XP write paths = claim, settlement, **session end**, **task done** (once, `Task.xpAwardedAt`), each one `XpEvent` with `reason FOCUS_SESSION | TASK_DONE`, `questKind null`, same-transaction `cultivationXp` update; task day via `toLocalCalendarDay` of start time, a plan crossing midnight does not move it; "move overdue" is one transaction; only `app/api/planner/**` writes Planner tables. |
| **AD-18** Music source adapter | `apps/web/lib/music/` `MusicSource { search, streamUrl }`, one impl `jamendo.ts`, behind `GET /api/planner/music/search` and `/music/[trackId]`; `JAMENDO_CLIENT_ID` in Config; `<audio>` playback (never iframe); tracks stored as `{ source, trackId }` JSON; failure → error envelope, timer proceeds; the only module allowed outbound HTTP. |
| AD-8 | + (d) attributing a Task and its sessions to a local day. |
| AD-10 | + `planner` section `{ settings, categories[], tasks[], sessions[] }` restored verbatim; Planner XpEvents already in `cultivation.xpEvents`. |
| Conventions | Observability + session end, task done, move-overdue, category-delete cascade. Config + `JAMENDO_CLIENT_ID`. **New row External calls.** |
| Structural seed | `app/(routes)/planner/`, `app/api/planner/{categories,tasks,tasks/move-overdue,tasks/[id]/done,sessions,sessions/[id]/end,settings,music/search,music/[trackId]}`, `lib/music/jamendo.ts`, `packages/domain/pomodoro.ts`. |
| ERD | + `TaskCategory`, `Task`, `PomodoroSession`; `User.pomodoroSettings` JSON; `XpEvent.questKind` nullable + two reasons; migration per epic. |
| Capability map | + FR-22, FR-23/24, FR-25, FR-26 rows. |
| Deferred | + second music source; Planner quests; Jamendo terms/catalogue check. |

### 5.3 Epics — `epics.md`

- Requirements Inventory: FR-22 … FR-26, NFR-8 Timer truth, NFR-9 External dependency isolation, UX-DR25 … UX-DR30; coverage map rows.
- Epic List: Epics 8–11 (descriptions, FRs covered, implementation notes).
- Stories (full AC in `epics.md`):
  - **8.1** Planner Shell and Navigation · **8.2** Task Categories (migration incl. `XpEvent` change) · **8.3** Tasks per Day (TASK_DONE XP) · **8.4** Overdue Tasks and Move to Today
  - **9.1** Pomodoro Plan Engine and Settings (migration: `PomodoroSession`, `pomodoroSettings`) · **9.2** Server-Truth Sessions (FOCUS_SESSION XP, 409s) · **9.3** Pomodoro Screen · **9.4** Planner in Export and Restore
  - **10.1** Week Grid and Unscheduled Tray · **10.2** Drag to Reschedule · **10.3** Live Blocks
  - **11.1** Jamendo Adapter (verify terms + listen first; stop rule) · **11.2** Track per Category and Task (migration: `musicTrack`) · **11.3** Player in the Pomodoro Screen
- Story 5.5: ACs extended to the Planner surfaces.
- Build-order note appended to the Epic 5 preamble.

### 5.4 UX — `EXPERIENCE.md`, `DESIGN.md`

- **EXPERIENCE.md:** Foundation sentence; three Planner surfaces in the IA table; five-item nav (N1), Pomodoro does not enter focus mode; four voice rows; component patterns — Segment switcher, Task row, Overdue strip, Category modal, Plan strip, Done card, Calendar block, Unscheduled tray, Music player; seven state rows; Pomodoro and Calendar keys; Flow 5 (= UJ-5) with its failure case; responsive rows.
- **DESIGN.md:** `components.plan-strip`, `countdown`, `calendar-block`, `calendar-grid`, `music-player`; mono at display size for the countdown; tints also for Task Categories; four Do/Don't rows; conflict-border contrast to be measured in Story 10.1.

### 5.5 Tracking — `sprint-status.yaml`

`epic-8` … `epic-11` and their 14 stories as `backlog`, with migration and verification comments; `5-5` annotated and moved to the end of the build order; `last_updated` bumped.

### 5.6 Secondary artifacts

- `.env.example`: `JAMENDO_CLIENT_ID=` with a comment (Config schema changes only in Story 11.1).
- `deferred-work.md`: verify Jamendo terms/catalogue before 11.1; revisit the sleep/offline "counts as completed" rule in 9.2 if real use shows inflated minutes.
- PRD `addendum.md`: Planner XP table beside the Daily quest table.

## 6. Implementation Handoff

- **Scope:** Major. **PM** owns the PRD reversal (done in this change). **Architect** verifies AD-17's partial unique index and expired-session close in Story 9.2, and AD-18's adapter shape in 11.1. **Developer agent** (`bmad-build`) takes stories in the build order above, one migration per epic deployed to Neon with the code.
- **Success criteria:**
  - A second `POST /api/planner/sessions` while one runs returns `409`; a reload or second device shows the same countdown.
  - `planPomodoro(90, defaults)` = 25·5·25·5·25·5·15 in a unit test; a third overrun request returns `409`.
  - Applying all `XpEvent` deltas in order still equals `User.cultivationXp` after Planner events; settlement never reads Planner tables.
  - A block's length on the calendar equals `planLengthMinutes`; two overlapping blocks render a conflict and nothing moves.
  - Export → restore round-trips Planner data; user delete leaves no Planner rows.
  - With `JAMENDO_CLIENT_ID` unset in Epics 8–10 the app boots; from 11.1 the Config schema requires it; with Jamendo down the timer still runs.
  - Nav shows five items (six for admin) at every breakpoint; the dock has five buttons.

## 7. Open risks (not decided here)

1. **Jamendo.** Terms page dated 2013; catalogue quality unheard. Story 11.1 verifies first and stops if either fails — Epics 8–10 are unaffected.
2. **Calendar justification.** The time grid is the costliest branch and was chosen without a stated use scene in the forge; UJ-5 now supplies one. If Epic 10 feels heavy when it arrives, a month view is the fallback and nothing in 8–9 depends on the grid.
3. **Planned time is lost on start** (block moves to real start). Accepted for v1; only estimate-vs-actual survives.
4. **Sleep/offline** sessions count as complete at planned length — may inflate logged minutes; revisit in 9.2.
5. **XP farming** via "+1" or fake 5-minute tasks is possible; single-user product, accepted.
6. **Workload:** 15 stories remain instead of 1.
7. **Nav** grows to five items; the dock was designed for four — Story 8.1 updates the nav e2e tests.
8. **Ordering superseded by Sprint Change 2026-11-17:** Epic 12 (Shared Classes) is built before Epic 8; Story 9.4 builds on the per-learner `SchedulingRecord` schema and the export scope Epic 12 leaves.
