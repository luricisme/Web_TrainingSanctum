---
title: Training Sanctum — Flashcards PRD
status: final
created: 2026-10-29
updated: 2026-10-29
---

# PRD: Training Sanctum — Flashcards

## 0. Document Purpose

This PRD defines the requirements for v1 of Training Sanctum's flashcards module, for the creator acting as PM, architect, and sole developer. It builds directly on the [product brief](../../briefs/brief-Web_TrainingSanctum-2026-10-29/brief.md) and its [addendum](../../briefs/brief-Web_TrainingSanctum-2026-10-29/addendum.md) — those documents are not re-litigated here, only extended into testable requirements. Features are grouped with Functional Requirements (FRs) nested under them, numbered globally (FR-1 … FR-N) for stable downstream reference. All inferences made during drafting have since been reviewed and confirmed as decisions (see §11). This PRD has its own [addendum](./addendum.md) holding worked SM-2 test fixtures referenced from FR-8 — binding, not optional reading.

## 1. Vision

Training Sanctum's flashcards module is a personal, single-user spaced-repetition tool for acquiring advanced English vocabulary, idioms, and expressions — built by its own user, a QA/Test Automation Engineer, for daily study. It pairs Anki's scheduling rigor with a native multi-field card model (term, definition, example, context, part of speech) and a modern, distraction-free, keyboard-first UI, so that capturing a new word mid-study and reviewing it later both take seconds, not friction.

It matters for two reasons that don't trade off against each other: as a daily tool, it has to survive the test every language app fails — still being open 60 days from now — by removing every piece of friction that causes abandonment. As an engineering artifact, it is the first production-grade, fully-tested application in a longer-term personal platform ("Training Sanctum"), demonstrating correct algorithmic implementation (native SM-2, not approximated), clean domain/API/UI separation, and automated test coverage across all layers.

v1 scope is deliberately narrow: flashcards and spaced repetition only. Future Sanctum modules (Pomodoro timer, task manager) are out of scope and must not leak into this release.

## 2. Target User

### 2.1 Jobs To Be Done

- As the builder, I need a zero-paywall, zero-clutter place to log and drill advanced vocabulary/idioms I encounter day-to-day, so the moment of discovery doesn't get lost.
- I need recall testing that's honest in both directions — recognizing a word and producing it are different skills, and I need to know which one I'm actually weak on.
- I need review sessions fast and frictionless enough (keyboard-only, instant transitions) that I do them daily without the session itself becoming the reason I skip a day.
- I need to trust the tool with months of study history — a lost streak or corrupted schedule is a dealbreaker for a daily-dependency habit tool.
- As a portfolio piece, I need the finished product to demonstrate correct algorithmic implementation and testing discipline I can speak to in an interview or case study.

### 2.2 Non-Users (v1)

- Other learners — no multi-user, social, sharing, or public-set functionality exists or is planned for v1.
- Learners wanting gamified/social study modes (Quizlet-style Test mode, Match game) — explicitly not this product's model.

### 2.3 Key User Journeys

*Single-operator product — journeys are lighter-weight JTBD restatements rather than full multi-actor narratives, per the product's scope.*

- **UJ-1. Logging a word in under 5 seconds.** The user, mid-conversation or mid-reading, hits a word worth keeping. They open the app, paste `term — definition` (or type it with the structured fields), and it's saved to the right folder before they lose their train of thought. *(realizes FR-3, FR-6)*

- **UJ-2. The daily review session.** Each day, the user opens the app to a single focused review screen — no nav, no sidebar, no streak badge competing for attention. They flip through due cards in both directions, grading recall with one keystroke per card (Space to reveal, 1–4/J/K/L/; to grade), until the session queue (capped at a digestible daily batch) is empty — though grading even one card today is enough to keep the streak alive; the queue doesn't have to fully clear. *(realizes FR-9, FR-10, FR-11)*

- **UJ-3. Bulk import after a study binge.** The user has accumulated 30 new words in a notes app over a week. They paste the list or upload a CSV; the system parses term/definition pairs (and optional extra fields) into cards in one pass, instead of 30 manual entries. *(realizes FR-7)*

## 3. Glossary

- **Card** — The shared content unit: `term`, `definition`, `example_sentence`, `context` (collocation/usage), `part_of_speech`. One Card produces two Scheduling Records.
- **Recall Direction** — Which way a Card is being tested: *Term → Definition* (recognition/passive) or *Definition → Term* (production/active). Each direction is scheduled independently.
- **Scheduling Record** — The SM-2 state for one Card in one Recall Direction: `interval`, `repetitions`, `ease_factor` (EF), `next_review_date`. A Card always has exactly two.
- **Ease Factor (EF)** — SM-2's per-item difficulty multiplier. Starts at 2.5, floor of 1.3.
- **Grade** — The recall-quality rating the user gives after revealing a card: Again / Hard / Good / Easy, mapped to SM-2 quality values 1 / 3 / 4 / 5 respectively.
- **New Card** — A Card for which neither Scheduling Record has ever received a Grade. The daily batch cap (FR-10) counts Cards, not Scheduling Records, against this definition. A Card that failed back to `repetitions = 0` via an "Again" Grade (FR-8) is **not** a New Card — it has been graded before and is treated as already-due, uncapped.
- **Folder** — A user-defined grouping of Cards (the brief's "collections/sets"), flat/single-level only — folders do not nest in v1.
- **Review Session** — A single sitting in which the user grades one or more due Scheduling Records; a session need not clear the entire due queue to count toward the streak (see FR-12).
- **Due Queue** — The set of Scheduling Records (not Cards) whose `next_review_date` has arrived, pulled per-direction.
- **Streak** — Count of consecutive calendar days on which at least one Scheduling Record was graded (local-timezone day boundary, same basis as `next_review_date` — see FR-12).

## 4. Features

### 4.1 Account & Session

**Description:** Single-user authentication that isolates session/account state cleanly, so the data model supports multi-tenancy later without building multi-user features now. v1 ships simple email+password auth — no OAuth/social login, no invite flow, no multi-account UI — since the product has exactly one real user.

#### FR-1: User authentication

A user can create an account and log in/out with email and password.

**Consequences (testable):**
- Unauthenticated requests to any card/folder/review endpoint are rejected.
- All persisted data (Cards, Folders, Scheduling Records, streak history) is scoped to a `user_id`, even though only one account exists in practice.

#### FR-2: Session persistence

A logged-in user stays authenticated across browser sessions until explicit logout or expiry.

**Consequences (testable):**
- Closing and reopening the browser does not require re-login within the session lifetime.
- Exact session lifetime/expiry duration is deferred to the architecture phase (see §10 Open Questions), not fixed in this PRD.
- Concurrent sessions from more than one browser/device under the same account are permitted but not actively reconciled: last-write-wins on a Scheduling Record update is acceptable behavior for v1; no locking or conflict UI is required.

---

### 4.2 Card Management

**Description:** Structured card creation/editing with the five fixed fields, no template setup required — the core gap the brief identifies versus Anki. Realizes UJ-1.

#### FR-3: Create and edit cards

A user can create and edit a Card with fields: Term, Definition, Example Sentence, Context/Collocation, Part of Speech. Term and Definition are required; the other three are optional.

**Consequences (testable):**
- Saving a Card with only Term + Definition succeeds.
- Saving a Card with Term or Definition empty is rejected with a field-level error.
- Special characters (IPA symbols, accented characters, non-Latin scripts) are accepted and rendered correctly in all five fields. "Special character support" means full Unicode input/display, not a dedicated IPA/phonetic symbol picker UI.

#### FR-4: Delete a card

A user can delete a Card, which removes both its Scheduling Records.

**Consequences (testable):**
- Deleting a Card removes it and both directions' review history from the due queue immediately.

---

### 4.3 Organization

**Description:** Folder-based grouping so cards can be organized by topic/source without the overhead of per-card template configuration.

#### FR-5: Folder CRUD

A user can create, rename, and delete Folders, and assign Cards to exactly one Folder (including a default "Unsorted" Folder).

**Consequences (testable):**
- Deleting a Folder prompts for how to handle its Cards (move to Unsorted, or delete with it) — never silently orphans or silently deletes Cards. Default choice is "move to Unsorted"; deleting the Cards with the Folder is available as an explicit alternative, not the default.
- Folders are a flat, single-level structure — a Folder cannot contain other Folders. Nesting is explicitly out of scope for v1 (see §5 Non-Goals).

---

### 4.4 Import

**Description:** Fast bulk entry via paste or file import, so vocabulary captured elsewhere doesn't require manual re-entry. Realizes UJ-3.

#### FR-6: Paste import

A user can paste line-delimited term/definition pairs (configurable delimiter, chosen per-import via a control shown at paste time, e.g. tab or `—`) into a text box and have them parsed into Cards in one action.

**Consequences (testable):**
- A pasted block of N valid lines creates N Cards (each with two fresh Scheduling Records) in under 5 seconds end-to-end. "End-to-end" is timed from the user clicking "Import" to the new Cards being persisted and visible in the UI (due queue/folder view updated) — not from the start of pasting.
- Malformed lines are reported individually (line number + reason) without discarding the valid lines in the same batch.
- A pasted line whose Term exactly matches (case-insensitive, whitespace-trimmed) an existing Card's Term in the target Folder is treated as a duplicate: it is skipped and reported alongside any malformed-line errors, rather than silently creating a second Card.

#### FR-7: CSV/Excel import

A user can upload a CSV or Excel file mapping columns to the five Card fields.

**Consequences (testable):**
- A column-mapping step is shown before import commits, so field order doesn't need to match exactly.
- Import of a file with some invalid rows reports which rows failed and still commits the valid ones.
- The same duplicate-detection rule as FR-6 applies: a row whose Term exactly matches (case-insensitive, whitespace-trimmed) an existing Card's Term in the target Folder is skipped and reported, not silently duplicated.

**Out of Scope:** Round-trip export back to CSV is not required for FR-7 itself — see FR-13 (backup/export) for that concern.

---

### 4.5 Spaced Repetition Engine

**Description:** The native SM-2 scheduling core — the product's algorithmic and portfolio centerpiece. Each Card's two Scheduling Records are updated independently per the addendum's data model. `[NOTE FOR PM: this feature carries the heaviest test-coverage expectation in the whole product per the brief's portfolio goals — flag for architecture/QA planning accordingly.]`

#### FR-8: SM-2 scheduling per direction

The system computes the next `interval`, `repetitions`, and `ease_factor` for a Scheduling Record from its current state and the Grade submitted, using the **classical SM-2 algorithm** (SuperMemo's 1987 formula — not an Anki-style variant), independently for each of a Card's two Recall Directions.

**Algorithm specification (binding, not illustrative):**

For a passing Grade (quality `q` ∈ {3, 4, 5} — Hard/Good/Easy):
- `repetitions += 1`
- New `ease_factor`: `EF' = EF + (0.1 − (5−q) × (0.08 + (5−q) × 0.02))`, floored at 1.3.
- New `interval`, based on `repetitions` *before* this increment:
  - 1st repetition: `interval = 1` day
  - 2nd repetition: `interval = 6` days
  - 3rd+ repetition: `interval = round(previous_interval × EF)` — using the **previous** EF (before this update), per classical SM-2.

For the failing Grade (quality 1 — Again):
- `repetitions = 0`, `interval` resets to the learning-phase Step 1 (1 day).
- `ease_factor` is **not** changed by an Again grade (classical SM-2 only updates EF on a pass); it remains at its last value, still subject to the 1.3 floor.

**Important, explicit implication of this being classical (not Anki-style) SM-2:** Hard, Good, and Easy all produce the **same next interval** in the session they're graded in (steps 1/2, or `previous_interval × previous_EF` at 3+ repetitions) — they differ only in the *resulting* `ease_factor`, which changes the interval calculated at the *next* review, not this one. A UI affordance that implies "Hard" immediately shortens the next interval would misrepresent this algorithm and must not be built. Two fully worked grade-sequence examples are in `addendum.md` — treat them as binding unit-test fixtures, not illustration.

**Consequences (testable):**
- New Scheduling Record defaults: `ease_factor = 2.5`, `repetitions = 0`.
- Learning-phase intervals for a new/reset item: Step 1 = 1 day, Step 2 = 6 days, before graduating to EF-driven intervals at the 3rd repetition.
- Grade "Again" (quality 1) resets `repetitions` to 0 and restarts the learning steps; it does **not** change `ease_factor` at all (not just "doesn't reduce below floor" — classical SM-2 skips the EF update entirely on a fail).
- `ease_factor` never drops below 1.3 regardless of how many low grades are submitted consecutively.
- At the same `repetitions` count entering a review, Hard/Good/Easy produce an identical next `interval`; they diverge only in the `ease_factor` carried into the following review. This must match the worked examples in `addendum.md` exactly in unit tests.
- Grading one direction of a Card (e.g. Term→Definition) does not alter the other direction's Scheduling Record.
- Grade-to-quality mapping is fixed: Again=1, Hard=3, Good=4, Easy=5.

---

### 4.6 Review Session

**Description:** The daily-use surface — keyboard-first, distraction-free, fast enough under rapid repeated input that the UI is never the bottleneck. Realizes UJ-2.

#### FR-9: Due-queue review

The system presents due Scheduling Records (pulled per-direction, not per-card) one at a time: prompt side first, then reveal, then Grade capture.

**Consequences (testable):**
- A Card with both directions due in the same session appears as two separate queue entries, gradable independently and in any order.
- Within the due queue, entries are ordered oldest-due-first (by `next_review_date` ascending); this is the only ordering guarantee required for v1 — no randomization or direction-interleaving rule is required.
- Reveal and grade actions are fully keyboard-operable: Space reveals the answer; 1–4 or J/K/L/; submit a Grade. No action in the review loop requires the mouse.
- Grading a card and advancing to the next renders with no perceptible lag under rapid sequential key presses. "Instantaneous" is the standard for architecture: sub-100ms perceived transition latency.

#### FR-10: Daily batch cap

The due queue for a session is capped at a configurable daily limit (default 20 new cards). This cap applies only to new-card introduction — all cards already due for review remain available and are never withheld by the cap.

**Consequences (testable):**
- A user can adjust the daily new-card limit in settings.
- Reaching the cap ends the "new cards" portion of the session without blocking review of already-due older cards.
- The cap counts **Cards** (per the Glossary's "New Card" definition), not Scheduling Records — introducing one New Card counts as 1 against the cap even though it produces two queue entries (one per direction).
- A Card reset to `repetitions = 0` by an "Again" Grade (FR-8) is not a New Card and does not count against this cap; it is already-due and uncapped, same as any other previously-graded Card.

#### FR-11: Focus mode

During an active Review Session, navigation, sidebar, streak badge, and other non-essential chrome are hidden; only the card and recall controls are visible.

**Consequences (testable):**
- Entering review hides all chrome identified above; exiting review (queue cleared or user exits) restores normal navigation.

---

### 4.7 Progress & Streaks

**Description:** Visible progress tracking that reinforces the daily habit the product depends on, without becoming a vanity metric that distorts study behavior (see counter-metric in §7).

#### FR-12: Streak tracking

The system tracks consecutive calendar days with at least one graded Scheduling Record (grading a single card is sufficient — the due queue does not need to fully clear) and displays the current streak outside of active review (not during, per FR-11).

**Consequences (testable):**
- Grading zero cards on a calendar day breaks the streak at local-timezone day boundary. No streak-freeze/vacation-pause mechanic ships in v1 — a strict daily requirement is intentional.
- Grading at least one Scheduling Record on a calendar day, regardless of how much of the due queue remains, counts that day toward the streak. This is the single, textually consistent definition of streak completion used across this PRD (Glossary, UJ-2, this FR).
- `next_review_date` (FR-8/FR-9) and the streak's calendar-day boundary (this FR) use the same timezone basis — user-local time — as the single source of truth. A review graded just before local midnight and one graded just after are evaluated against the same clock for both due-date computation and streak-day attribution.

#### FR-13: Data export/backup

A user can export their full Card + Scheduling Record + streak history to a portable format (e.g. JSON) on demand.

**Consequences (testable):**
- Export completes and produces a file containing every Card, both Scheduling Records per Card, and streak history, sufficient to reconstruct state.

**Feature-specific NFRs:**
- Data durability for Cards, Scheduling Records, and streak history is treated as a hard non-functional requirement, not best-effort — this is addressed system-wide in §6 Cross-Cutting NFRs, since a daily-dependency tool losing history is a stated dealbreaker risk in the brief.

#### FR-14: Restore from backup

A user can import a previously-exported FR-13 JSON file to fully reconstruct their data, including both Scheduling Records per Card (interval, repetitions, ease_factor, next_review_date) and streak history — not just the five Card content fields.

**Consequences (testable):**
- Restoring a valid FR-13 export recreates every Card with both of its Scheduling Records in exactly the state captured at export time (same interval/repetitions/ease_factor/next_review_date), and restores streak history.
- Restoring into an account that already has data requires explicit confirmation before proceeding (default: restore replaces existing data; the system does not silently merge or silently overwrite without confirmation).
- This closes the loop the brief's durability dealbreaker requires: an export with no restore path is not a backup, so FR-13 and FR-14 ship together in Phase 1 MVP.

#### FR-15: Progress & stats view

A user can view a basic stats screen, outside of active review (per FR-11), showing: current and longest streak, total Cards, and a simple visualization of the SM-2 retention curve (e.g. distribution of Scheduling Records by current `interval` length, or review-outcome history over time) per Recall Direction.

**Consequences (testable):**
- The stats view is reachable from normal (non-review) navigation and reflects the latest graded state without requiring a page reload tied to a specific review session.
- The view makes SM-4 (observable, correct SM-2 retention curve) checkable by the user directly in the product, not just inferable from raw data — this is the minimum needed to make that success metric falsifiable by the shipped product itself.

## 5. Non-Goals (Explicit)

- Quizlet-style Test mode or Match game.
- Public set discovery, sharing, or any collaboration/multi-user feature.
- Native mobile app (responsive web only).
- Audio/pronunciation playback or recording.
- Custom card templates/fields beyond the fixed five (the brief's whole point is *not* requiring template setup).
- Any functionality belonging to future Sanctum modules (Pomodoro timer, task manager) — these must not be scaffolded into this codebase "for later."
- Manual editing of a Scheduling Record's `interval`/`ease_factor`/`next_review_date`, or a "reset this card's progress" action — v1 scheduling state only changes through FR-8's grading flow.
- Nested/hierarchical Folders (see Glossary and FR-5) — flat, single-level only.

## 6. Cross-Cutting NFRs

- **Data durability.** Card, Scheduling Record, and streak data must survive normal operation without loss; persistence approach (managed Postgres, backup cadence) is an architecture-phase decision, but "no silent data loss" is a hard requirement here, not optional polish (brief-flagged dealbreaker risk). FR-13 (export) and FR-14 (restore) are the product-level mitigation.
- **Performance (review loop).** Reveal/grade/advance transitions in Review Session must feel instantaneous under rapid repeated input — see FR-9 for the testable interpretation.
- **Performance (general load).** Opening the app and loading the due queue (outside the review loop itself) must feel fast enough not to introduce its own abandonment friction; the architecture phase sets a concrete page-load budget, but this is named here as a requirement distinct from FR-9's sub-100ms in-session standard, not folded into it.
- **Testability.** Domain logic (SM-2 engine) is unit-testable in isolation from API/UI layers; the architecture must support unit, API/integration, and E2E (Playwright) test suites running in CI, per the brief's portfolio goals.
- **Accessibility of input.** Full Unicode/special-character input must work reliably across all Card fields (FR-3) — not just common Latin-1 accented characters.
- **Live deployment.** The product ships to a live, publicly accessible deployment (not local-only), per the brief's portfolio success criteria — this is a release requirement for v1, independent of the Phase 2 architecture-documentation/case-study work in §8.2.

## 7. Aesthetic and Tone

- Minimalist, distraction-free visual language — ships dark-mode default with a light-mode toggle, inspired by developer-tool aesthetics (Linear, Raycast) rather than gamified/social layouts (Quizlet).
- Review Session enforces this most strictly: see FR-11 Focus mode.
- No sound effects, confetti, or gamification flourishes implied by this direction unless explicitly added later.

## 8. MVP Scope

### 8.1 In Scope (Phase 1, ~4–6 weeks per brief)

- Account/session (FR-1, FR-2)
- Card CRUD (FR-3, FR-4)
- Folder organization (FR-5)
- Paste + CSV import (FR-6, FR-7)
- Dual-direction SM-2 engine (FR-8)
- Keyboard-driven review session with batch cap and focus mode (FR-9, FR-10, FR-11)
- Streak tracking (FR-12)
- Data export/backup and restore (FR-13, FR-14) — promoted into Phase 1: data loss is a stated dealbreaker risk for a daily-dependency tool, and export without a restore path isn't actually a backup, so both ship with the MVP rather than waiting for Phase 2 polish.
- Basic progress/stats view (FR-15) — needed so the portfolio success metric SM-4 (retention curve) is observable in the shipped product, not just in raw data.
- Live, publicly accessible deployment (minimal hosting, no architecture docs/case study required at this stage — see §8.2) — required for the brief's portfolio success criteria to be met at all.

### 8.2 Out of Scope for MVP

- UI/UX polish pass, full Playwright E2E suite, CI/CD pipeline, architecture documentation, portfolio case study — explicitly Phase 2 per the brief's delivery approach.
- Everything in §5 Non-Goals.

## 9. Success Metrics

**Pre-ship acceptance metrics** (checked before this PRD is considered delivered)
- **SM-1**: New multi-field card captured via paste/import in under 5 seconds, end-to-end (timer defined in FR-6). Validates FR-6, FR-7.
- **SM-3**: Every scenario in the following checklist has a passing, scenario-specific unit test — not a coverage percentage, since "% of edge cases" isn't a tool-measurable figure: (a) interval-reset on Again, (b) EF floor at 1.3 under repeated low grades, (c) EF unchanged on Again, (d) Hard/Good/Easy identical next-interval at equal `repetitions` (per FR-8's worked examples), (e) dual-direction independence, (f) grade-to-quality mapping. Validates FR-8.
- **SM-5**: Product is deployed to a live, publicly accessible URL. Validates the §6 Live Deployment NFR.

**Post-launch longitudinal metrics** (only measurable after weeks/months of real usage — not sign-off gates for this PRD)
- **SM-2**: Unbroken daily study streak of 60+ days. Validates FR-9–FR-12, FR-15.
- **SM-4**: Observable, correct SM-2 retention curve — mature cards resurface at mathematically correct intervals, viewable via FR-15. Validates FR-8, FR-15.

**Counter-metrics (do not optimize)**
- **SM-C1**: Grade distribution should not skew toward "Easy"/"Good" as a side effect of streak pressure — a streak kept alive by dishonest grading defeats the product's purpose. Counterbalances SM-2. **Acknowledged, unaddressed tension for v1:** no FR introduces a grade-distribution check or similar mitigating mechanism; this is a deliberate choice to ship the core loop first; the information is already visible via FR-15 if the user chooses to look, but nothing surfaces it proactively.
- **SM-C2**: Test coverage percentage alone is not the goal — passing SM-3's checklist, not a coverage-tool percentage, is what counts. Counterbalances SM-3.

## 10. Open Questions

1. Final persistence choice (managed Postgres vs. alternative) and backup cadence — deferred to architecture per the brief.
2. Exact session expiry/lifetime duration (FR-2) — deferred to architecture; no default is fixed in this PRD.
3. General app/due-queue page-load performance budget (§6) — deferred to architecture; distinct from FR-9's in-session transition standard.
4. Live deployment target (§6, SM-5) — hosting platform/provider deferred to architecture; the requirement that it be live and public is fixed, the "where" is not.

## 11. Assumptions Index

None outstanding — all prior `[ASSUMPTION]` tags have been reviewed and confirmed as decisions inline (§4.1 auth scope, §4.2 Unicode-only special-character support, §4.6 sub-100ms transition latency and new-card-only batch cap, §7 dark-mode default with light-mode toggle). This update round (see `.memlog.md`) resolved the adversarial-review and brief-reconciliation findings by confirming: classical (not Anki-style) SM-2 as the binding algorithm (FR-8), restore-from-backup as Phase 1 scope (FR-14), ≥1-graded-card as the streak-completion bar (FR-12), and reinstatement of live deployment (§6, SM-5) and a progress/stats view (FR-15) per the brief's portfolio criteria.
