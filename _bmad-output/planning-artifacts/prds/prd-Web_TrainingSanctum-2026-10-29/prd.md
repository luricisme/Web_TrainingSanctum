---
title: Training Sanctum — Flashcards PRD
status: final
created: 2026-10-29
updated: 2026-11-13
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
- I need recall testing that's honest in both directions — recognizing a word and producing it are different skills, and I need to know which one I'm actually weak on. Both directions is the default; studying only one is a deliberate opt-out (FR-18).
- I need review sessions fast and frictionless enough (keyboard-only, instant transitions) that I do them daily without the session itself becoming the reason I skip a day.
- I need to trust the tool with months of study history — a lost streak or corrupted schedule is a dealbreaker for a daily-dependency habit tool.
- As a portfolio piece, I need the finished product to demonstrate correct algorithmic implementation and testing discipline I can speak to in an interview or case study.

### 2.2 Non-Users (v1)

- Other learners — no multi-user, social, sharing, or public-set functionality exists or is planned for v1.
- Learners wanting gamified/social study modes (Quizlet-style Test mode, Match game) — explicitly not this product's model.

### 2.3 Key User Journeys

*Single-operator product — journeys are lighter-weight JTBD restatements rather than full multi-actor narratives, per the product's scope.*

- **UJ-1. Logging a word in under 5 seconds.** The user, mid-conversation or mid-reading, hits a word worth keeping. They open the app, hit "Add card" (from a Flashcard, or the quick-add shortcut, which remembers the last Flashcard used), type it with the structured fields, and it's saved to the right Flashcard before they lose their train of thought. *(realizes FR-3, FR-5)*

- **UJ-2. The daily review session.** Each day, the user opens the app to a single focused review screen — no nav, no sidebar, no streak badge competing for attention. They flip through due cards of learned Cards in both directions (studied directions, FR-18), grading recall with one keystroke per card (Space to flip, 1–4/J/K/L/; to grade), until the due queue is empty — though grading even one card today is enough to keep the streak alive; the queue doesn't have to fully clear. New Cards never appear here until they are learned in a Flashcard's Learn session (UJ-4). *(realizes FR-9, FR-11)*

- **UJ-3. Bulk import after a study binge.** The user has accumulated 30 new words in a notes app over a week. They open the target Flashcard, choose "Add cards → Import", and paste the list or upload a CSV; the system parses term/definition pairs (and optional extra fields) into the same row editor as manual entry, flagging malformed lines and duplicates. They fix two typos, press Save, and the cards land in that Flashcard in one pass, instead of 30 manual entries. *(realizes FR-6, FR-7)*

- **UJ-4. Learning a Flashcard.** The user opens a Flashcard and flips through its Cards in the viewer (← → to move, Space or click to flip) to get familiar with them, with no grading and no effect on scheduling. When ready, they press "Learn": each Unlearned Card is shown in both directions (studied directions, FR-18) and graded Again/Hard/Good/Easy. From then on those Cards come back on their own in the daily Review (UJ-2). *(realizes FR-16, FR-17)*

## 3. Glossary

- **Card** — The shared content unit: `term`, `definition`, `example_sentence`, `context` (collocation/usage), `part_of_speech`. One Card produces two Scheduling Records.
- **Recall Direction** — Which way a Card is being tested: *Term → Definition* (recognition/passive) or *Definition → Term* (production/active). Each direction is scheduled independently. The user's **study directions** setting (FR-18) decides which directions are studied: both (default), or only one. A direction that is turned off keeps its Scheduling Record unchanged and appears nowhere until it is turned back on.
- **Scheduling Record** — The SM-2 state for one Card in one Recall Direction: `interval`, `repetitions`, `ease_factor` (EF), `next_review_date`. A Card always has exactly two.
- **Ease Factor (EF)** — SM-2's per-item difficulty multiplier. Starts at 2.5, floor of 1.3.
- **Grade** — The recall-quality rating the user gives after revealing a card: Again / Hard / Good / Easy, mapped to SM-2 quality values 1 / 3 / 4 / 5 respectively.
- **Learned / unlearned direction** — A Scheduling Record is **learned** once it has received its first Grade (`firstGradedAt` set) and **unlearned** until then. Unlearned records of studied directions are introduced only through Learn (FR-17), never through Review; a learned record of a studied direction enters Review on its due date. A record that failed back to `repetitions = 0` via "Again" (FR-8) stays learned. *(Sprint Change 2026-11-13b: per-direction, replacing the per-Card rule.)*
- **Unlearned Card** — A Card with at least one unlearned record in a studied direction. A Card is **learned** when every studied direction is learned. Used for counts ("12 new") and Stats (FR-15). *(Replaces "New Card", Sprint Change 2026-11-13.)*
- **Class** — The top-level, user-defined container (e.g. "IELTS", "Business English"). A Class holds Folders; it never holds Flashcards or Cards directly. Every Class has exactly one built-in "Unsorted" Folder.
- **Folder** — A user-defined grouping of Flashcards inside exactly one Class. Folders do not nest: the hierarchy is fixed at four levels, Class → Folder → Flashcard → Card.
- **Flashcard** — A named set of Cards (the brief's "collections/sets") inside exactly one Folder. A Flashcard has only a name, unique within its Folder (case-insensitive). It can be created, renamed, deleted, and moved to any Folder.
- **Unsorted Folder** — The built-in Folder every Class gets on creation. It cannot be renamed or deleted, and it receives Flashcards when another Folder in the same Class is deleted with "move flashcards".
- **Review Session** — A single sitting in which the user grades one or more due Scheduling Records of learned Cards; a session need not clear the entire due queue to count toward the streak (see FR-12).
- **Learn Session** — A graded sitting scoped to one Flashcard that introduces its Unlearned Cards, then continues with that Flashcard's due records (FR-17). Its Grades use the same SM-2 write path and count toward the streak.
- **Due Queue** — The set of learned Scheduling Records (not Cards) in studied directions whose `next_review_date` has arrived, pulled per-direction.
- **Streak** — Count of consecutive calendar days on which at least one Scheduling Record was graded (local-timezone day boundary, same basis as `next_review_date` — see FR-12).

## 4. Features

### 4.1 Account & Session

**Description:** Single-user authentication that isolates session/account state cleanly, so the data model supports multi-tenancy later without building multi-user features now. v1 ships simple email+password auth — no OAuth/social login, no invite flow, no multi-account UI — since the product has exactly one real user.

#### FR-1: User authentication

A user can create an account and log in/out with email and password.

**Consequences (testable):**
- Unauthenticated requests to any class/folder/flashcard/card/review endpoint are rejected.
- All persisted data (Classes, Folders, Flashcards, Cards, Scheduling Records, streak history) is scoped to a `user_id`, even though only one account exists in practice.

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

Cards are created from inside a Flashcard. "Add cards" in a Flashcard offers two modes: **Manual** (a Quizlet-style editor of term/definition rows, one Card per row, with the optional fields expandable per row) and **Import** (FR-6/FR-7). Both modes create Cards in that Flashcard.

**Consequences (testable):**
- Every Card belongs to exactly one Flashcard at all times; there is no way to create a Card without a target Flashcard.
- Manual mode can save several Cards in one action; each row is validated independently and invalid rows are reported per row.
- Saving a Card with only Term + Definition succeeds.
- Saving a Card with Term or Definition empty is rejected with a field-level error.
- Special characters (IPA symbols, accented characters, non-Latin scripts) are accepted and rendered correctly in all five fields. "Special character support" means full Unicode input/display, not a dedicated IPA/phonetic symbol picker UI.

#### FR-4: Delete a card

A user can delete a Card, which removes both its Scheduling Records.

**Consequences (testable):**
- Deleting a Card removes it and both directions' review history from the due queue immediately.

---

### 4.3 Organization

**Description:** A fixed four-level hierarchy — Class → Folder → Flashcard → Card — so cards can be organized by course/goal, then by topic/source, then into named sets, without the overhead of per-card template configuration.

#### FR-5: Class, Folder & Flashcard CRUD

A user can create, rename, and delete Classes; create, rename, and delete Folders inside a Class; create, rename, and delete Flashcards inside a Folder; and move a Flashcard to any other Folder (in the same or a different Class). Every Card is in exactly one Flashcard, every Flashcard is in exactly one Folder, and every Folder is in exactly one Class. A Flashcard's name is unique within its Folder (case-insensitive).

**Consequences (testable):**
- Creating a Class also creates its "Unsorted" Folder. The Unsorted Folder cannot be renamed or deleted.
- Deleting a Folder prompts for how to handle its Flashcards: move them to the same Class's Unsorted Folder (default), or delete them, with their Cards, along with the Folder. Flashcards and Cards are never silently orphaned or silently deleted.
- Deleting a Flashcard requires a confirmation that names the Flashcard and its Card count; deleting removes its Cards and their Scheduling Records.
- Deleting a Class prompts for how to handle its Folders: move all of them to another existing Class (default when another Class exists), or delete the Class with all its Folders and their Flashcards and Cards. On move, the deleted Class's Unsorted Flashcards merge into the target Class's Unsorted Folder (a Flashcard name that clashes inside that Folder gets a " (2)" suffix); its other Folders keep their names (a name clash in the target Class gets a " (2)" suffix). Deleting everything requires typing the Class name to confirm.
- Folder delete, Flashcard delete and Class delete each complete atomically — no partial moves or partial deletes.
- The hierarchy is fixed: a Folder cannot contain Folders or Cards directly, a Flashcard cannot contain Flashcards, and a Class cannot contain Classes, Flashcards or Cards directly (see §5 Non-Goals).

---

### 4.4 Import

**Description:** Fast bulk entry via paste or file import, so vocabulary captured elsewhere doesn't require manual re-entry. Import is the second mode of a Flashcard's "Add cards" action (see FR-3), not a separate top-level screen: the target Flashcard is always the Flashcard it was opened from. Import never writes straight to the database: parsed rows first open in the same row editor Manual mode uses (the **import review editor**), where the user can fix, edit or remove rows before pressing Save. Only Save persists Cards. Realizes UJ-3.

#### FR-6: Paste import

A user can paste line-delimited term/definition pairs (configurable delimiter, chosen per-import via a control shown at paste time, e.g. tab or `—`) into a text box. "Preview" parses them straight into the import review editor (no column-mapping step for paste); Save creates the Cards.

**Consequences (testable):**
- Preview shows every parsed line as an editable row, labelled with its source line number; nothing is persisted until Save.
- A pasted block of N valid lines, saved without edits, creates N Cards (each with two fresh Scheduling Records) in under 5 seconds of system time. The budget is the Preview step (click → editor shown) plus the Save step (click → Cards persisted and visible in the Flashcard); the time the user spends editing rows is excluded.
- Malformed lines appear in the editor as rows with an inline reason (e.g. "No delimiter found") so the user can fix them; a row still invalid at Save is not created and is reported (line number + reason), without discarding the valid rows in the same batch.
- A line whose Term exactly matches (case-insensitive, whitespace-trimmed) an existing Card's Term in the target Flashcard is flagged in the editor as a duplicate that will be skipped. Editing its Term clears the flag. Duplicate detection runs again at Save; a row still duplicate then is skipped and reported, never silently creating a second Card.
- The user can remove any row from the editor before Save; removed rows are neither created nor reported.
- After Save, a results view shows exactly three groups: Created (N), Duplicates skipped (N), Errors (N, with line number + reason).

#### FR-7: CSV/Excel import

A user can upload a CSV or Excel file, map its columns to the five Card fields, and review the mapped rows in the import review editor before saving.

**Consequences (testable):**
- A column-mapping step is shown first, so field order doesn't need to match exactly; mapped rows then open in the import review editor, labelled with their source row number.
- Invalid rows show their reason inline and can be fixed; rows still invalid at Save are reported and the valid ones still commit.
- The same duplicate rule, flagging, re-check at Save, row removal, 5-second system-time budget and three-group results view as FR-6 apply.

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

The system presents due Scheduling Records of learned Cards (pulled per-direction, not per-card) one at a time: prompt side first, then flip, then Grade capture.

**Consequences (testable):**
- A Card with both studied directions due in the same session appears as two separate queue entries, gradable independently and in any order.
- An unlearned Scheduling Record (Glossary) never appears in the Review queue, even when its `next_review_date` has arrived; neither does any record of a direction the user does not study (FR-18).
- The default session pulls due entries from all Classes. A user can also start a session scoped to one Class ("Review this class") or one Folder ("Review this folder"); a scoped session pulls only that scope's due entries and otherwise follows every rule in FR-9 and FR-11. A Flashcard's graded entry point is Learn (FR-17), not a scoped review. Grades from any session count toward the same streak (FR-12).
- Within the due queue, entries are ordered oldest-due-first (by `next_review_date` ascending); this is the only ordering guarantee required for v1 — no randomization or direction-interleaving rule is required.
- Flip and grade actions are fully keyboard-operable: Space or a click/tap flips the card either way; 1–4 or J/K/L/; submit a Grade, available once the answer has been shown. No action in the review loop requires the mouse.
- Grading a card and advancing to the next renders with no perceptible lag under rapid sequential key presses. "Instantaneous" is the standard for architecture: sub-100ms perceived transition latency.

#### FR-10: Daily batch cap — removed (Sprint Change 2026-11-13)

Superseded by Learn (FR-17). New Cards no longer enter the Review queue automatically — the user introduces them deliberately, one Flashcard at a time — so a daily cap has nothing to limit. The FR number is retired, not reused.

#### FR-11: Focus mode

During an active Review Session, navigation, sidebar, streak badge, and other non-essential chrome are hidden; only the card and recall controls are visible.

**Consequences (testable):**
- Entering review hides all chrome identified above; exiting review (queue cleared or user exits) restores normal navigation.

### 4.6b Flashcard Study

**Description:** Studying one Flashcard before its Cards enter daily review. Realizes UJ-4. Added by Sprint Change 2026-11-13.

#### FR-16: Flashcard card viewer

The Flashcard page shows a card viewer above its Cards list, presenting the Flashcard's Cards one at a time, Term side first — or Definition side first when the user studies only Definition → Term (FR-18).

**Consequences (testable):**
- The viewer includes every Card in the Flashcard, whatever its scheduling state, in the same order as the Cards list.
- Space or a click/tap flips the card either way. ← and → (buttons and arrow keys) move to the previous or next Card, which shows Term side first. A mono "X / N" counter shows the position. ← is disabled on the first Card and → on the last; there is no wrap-around, shuffle or autoplay.
- Keys are ignored while focus is in a text field or a panel or modal is open. Space never scrolls the page.
- Viewing never changes any Scheduling Record; only a Grade does (FR-8).
- An empty Flashcard shows its existing empty state, and the viewer is not rendered.

#### FR-17: Learn session

A "Learn" button directly below the viewer starts a Learn Session for that Flashcard, using the same session screen, keyboard rules, grade write path and focus mode as Review (FR-9, FR-11).

**Consequences (testable):**
- The session first presents the Flashcard's unlearned records in studied directions (FR-18) — Cards in creation order, each Card's studied directions together, Term → Definition first — then continues with the Flashcard's learned, due records in studied directions, oldest-due-first.
- The first Grade of a Scheduling Record marks it as learned; from its next due date it appears in Review, whether or not the Card's other direction has been graded.
- After the session ends, "Study all cards again" runs every Card in studied directions as unsaved practice: same keys and Again repeats, no Grade is persisted. *(Recorded from Story 4.8b.)*
- Learn grades count toward the streak (FR-12) exactly like Review grades.
- Within a Learn session, an entry graded Again goes back to the end of the session queue and is shown again until it is graded Hard, Good or Easy. Only the first Grade of the entry in that session is persisted (it sets the SM-2 schedule, e.g. Again → due tomorrow); the in-session repeats are practice and are never sent to the grade route. *(Decision 2026-11-13, Quizlet-style "repeat until correct"; classical SM-2 scheduling is unchanged.)*
- When nothing is left, the session shows a calm completion line and a way back to the Flashcard. Never confetti or cheer copy (§7).
- The button label shows what is waiting, e.g. "Learn · 12 new · 3 due"; with nothing waiting it reads "Learn" and opens the completion state.

#### FR-18: Study directions setting

A user chooses, in Settings, which Recall Directions they study: **Both** (default), **Term → Definition only**, or **Definition → Term only**. The setting is per account and applies to Learn, Review, the Learn practice run and the card viewer. *(Added by Sprint Change 2026-11-13b.)*

**Consequences (testable):**
- New accounts default to Both; existing accounts are migrated to Both, so nothing changes until the user picks otherwise.
- With one direction studied, Learn and Review never show the other direction's records, and the Learn counts ("N new · M due") count only studied directions.
- Turning a direction off never changes its Scheduling Records; turning it back on makes its unlearned records appear in Learn and its learned, due records appear in Review (possibly many at once).
- The card viewer (FR-16) and the Learn practice run show the prompt side of the studied direction first: Definition first when only Definition → Term is studied, otherwise Term first.
- Changing the setting takes effect on the next queue load; a session already running keeps its snapshot.

---

### 4.7 Progress & Streaks

**Description:** Visible progress tracking that reinforces the daily habit the product depends on, without becoming a vanity metric that distorts study behavior (see counter-metric in §7).

#### FR-12: Streak tracking

The system tracks consecutive calendar days with at least one graded Scheduling Record (grading a single card is sufficient — the due queue does not need to fully clear) and displays the current streak outside of active review (not during, per FR-11).

**Consequences (testable):**
- Grading zero cards on a calendar day breaks the streak at local-timezone day boundary. No streak-freeze/vacation-pause mechanic ships in v1 — a strict daily requirement is intentional.
- Grading at least one Scheduling Record on a calendar day, regardless of how much of the due queue remains, counts that day toward the streak. This is the single, textually consistent definition of streak completion used across this PRD (Glossary, UJ-2, this FR).
- `next_review_date` (FR-8/FR-9) and the streak's calendar-day boundary (this FR) use the same timezone basis — user-local time — as the single source of truth. A review graded just before local midnight and one graded just after are evaluated against the same clock for both due-date computation and streak-day attribution.
- Grades from a Learn Session (FR-17) count exactly like Review grades; any graded Scheduling Record on a local calendar day keeps the streak.

#### FR-13: Data export/backup

A user can export their full Card + Scheduling Record + streak history to a portable format (e.g. JSON) on demand.

**Consequences (testable):**
- Export completes and produces a file containing every Class, every Folder, every Flashcard (with its Folder), every Card (with its Flashcard), both Scheduling Records per Card, and streak history, sufficient to reconstruct state.
- The export includes each Scheduling Record's `firstGradedAt`, so a restore (FR-14) preserves which Cards are learned versus unlearned.
- The export includes the user's study-directions setting (FR-18).

**Feature-specific NFRs:**
- Data durability for Cards, Scheduling Records, and streak history is treated as a hard non-functional requirement, not best-effort — this is addressed system-wide in §6 Cross-Cutting NFRs, since a daily-dependency tool losing history is a stated dealbreaker risk in the brief.

#### FR-14: Restore from backup

A user can import a previously-exported FR-13 JSON file to fully reconstruct their data, including both Scheduling Records per Card (interval, repetitions, ease_factor, next_review_date) and streak history — not just the five Card content fields.

**Consequences (testable):**
- Restoring a valid FR-13 export recreates the same Class → Folder → Flashcard structure and every Card in its original Flashcard, with both of its Scheduling Records in exactly the state captured at export time (same interval/repetitions/ease_factor/next_review_date), and restores streak history.
- Restoring into an account that already has data requires explicit confirmation before proceeding (default: restore replaces existing data; the system does not silently merge or silently overwrite without confirmation).
- This closes the loop the brief's durability dealbreaker requires: an export with no restore path is not a backup, so FR-13 and FR-14 ship together in Phase 1 MVP.

#### FR-15: Progress & stats view

A user can view a basic stats screen, outside of active review (per FR-11), showing: current and longest streak, total Cards (learned / unlearned, per the studied directions — FR-18), and a simple visualization of the SM-2 retention curve (e.g. distribution of Scheduling Records by current `interval` length, or review-outcome history over time) per Recall Direction.

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
- A daily new-card cap or settings for it (removed with FR-10; new Cards are introduced only through Learn, FR-17).
- Hierarchy deeper than Class → Folder → Flashcard → Card (see Glossary and FR-5) — no sub-folders, no sub-flashcards, no sub-classes.

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
- Class → Folder → Flashcard organization (FR-5)
- Paste + CSV import as a mode of a Flashcard's "Add cards" (FR-6, FR-7)
- Dual-direction SM-2 engine (FR-8)
- Keyboard-driven review session of learned Cards with focus mode (FR-9, FR-11)
- Flashcard card viewer and Learn session (FR-16, FR-17), with the study-directions setting (FR-18)
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
