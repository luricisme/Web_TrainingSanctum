# Sprint Change Proposal — Flashcard Card Viewer & Learn Session

- **Date:** 2026-11-13
- **Project:** Web_TrainingSanctum
- **Requested by:** Luric (product owner)
- **Workflow:** bmad-correct-course (incremental mode; all 9 edit proposals approved individually)
- **Source:** [change-request-2026-11-13-flashcard-viewer-and-learn.md](change-request-2026-11-13-flashcard-viewer-and-learn.md)
- **Status:** Approved 2026-11-13 by Luric. Edits applied to the PRD, Architecture Spine, EXPERIENCE.md, DESIGN.md, the Quizlet reconcile note, epics.md, sprint-status.yaml and deferred-work.md.

---

## 1. Issue Summary

**What triggered it.** This came up while Story 4.3 (Due-Queue Review Session) was being built. The product owner wants each Flashcard page to work like Quizlet's set page:
- a card viewer that flips, moves with ← and →, and shows "1 / N", with no grading;
- a **Learn** button below it that starts a graded Again/Hard/Good/Easy session;
- the grades from Learn deciding when a Card later appears in the Review tab.

**Problem statement.**
- Today every new Card is due in Review the moment it is created (AD-9: `next_review_date = start of today`). The Review tab is therefore also the only place new Cards are introduced, and FR-10 caps how many are introduced per day.
- The Flashcard page has no way to study its Cards. It shows a list and, since 4.3, a "Review this flashcard" link to the same due queue.
- The product owner wants learning and reviewing as two deliberate steps:
  - **Learn** (per Flashcard) introduces new Cards.
  - **Review** (daily) brings back only Cards that have already been learned.

**Issue type.** A new requirement from the stakeholder. It partly reverses a UX decision ("exactly one review mode, no mode switcher" in `reconcile-quizlet-flashcard-view.md`).

**Evidence.**
- The product owner's Quizlet set-page screenshot (Flashcards / Learn modes, card viewer with ← "1 / 26" →).
- Decision (b) in the change request: Review shows learned Cards only.
- Code state:
  - `createCardWithSchedulingRecords` makes Cards due immediately.
  - `GET /api/review/queue` (Story 4.3) includes never-graded records.
  - "Never graded" exists only as the `interval === 0` convention, already flagged in `deferred-work.md` by Story 4.1.

## 2. Impact Analysis

### Epic impact
- **Epic 4 (in progress)** cannot finish as planned.
  - 4.4 (daily cap) is removed.
  - 4.3 (built, not merged) needs its queue filtered to learned Cards and its flashcard scope moved into Learn. This is handled by the new story 4.6.
  - 4.5 changes its empty state and also covers Learn.
  - Three new stories: 4.6, 4.7 and 4.8.
  - The FRs it covers become FR-8, FR-9, FR-11, FR-16 and FR-17.
- **Epic 5 (backlog):**
  - 5.1: Learn grades count toward the streak (a clarification).
  - 5.2 and 5.3: export and restore carry `firstGradedAt`.
  - 5.4: Cards are shown as learned / unlearned.
- No epic becomes obsolete and no new epic is needed.
- **Sequence:** merge 4.3, then 4.6 → 4.7 → 4.8 → 4.5, then Epic 5.

### Story impact

| Story | Status | Change |
|---|---|---|
| 4.3 Due-Queue Review Session | built, on branch, not merged | AC text: no flashcard scope; free flip. The code change lands in 4.6 and 4.8. |
| 4.4 Daily New-Card Batch Cap | backlog | **Removed** (retired with FR-10) |
| 4.5 Focus Mode | backlog | Also covers Learn. Empty state lists Flashcards with Unlearned Cards. Built last in Epic 4. |
| 4.6 Learned Marker & Learned-Only Review Queue | **new** | Migration, grade route, AD-14 predicate, queue filter |
| 4.7 Flashcard Card Viewer | **new** | FR-16 |
| 4.8 Learn Session | **new** | FR-17 |
| 5.1 / 5.2 / 5.3 / 5.4 | backlog | One acceptance criterion added to each |

### Artifact conflicts
- **PRD:**
  - Glossary; UJ-2; new UJ-4.
  - FR-9 changes, FR-10 is removed, and FR-16 and FR-17 are new.
  - FR-12, FR-13 and FR-15 get clarifications.
  - §5 Non-Goals and §8.1 change.
- **Architecture Spine:**
  - AD-4, AD-7, AD-9 and AD-10 change, and AD-14 is new.
  - Structural Seed, data model and capability map change.
- **UX:**
  - EXPERIENCE.md: information architecture, component patterns, state patterns, interaction primitives, key flows.
  - DESIGN.md: a `components.card-viewer` token and rules; review card, grade buttons, Add cards panel and empty state change.
  - `reconcile-quizlet-flashcard-view.md`.
  - `history/focus-indigo/mockups/key-screens.html` is **not** updated; DESIGN.md wins on any conflict.

### Technical impact
- **One Prisma migration:** `SchedulingRecord.firstGradedAt DateTime?`, backfilled from `updatedAt` where `interval > 0`.
- **API:**
  - `GET /api/review/queue` filters to learned Cards and drops `?flashcardId=`.
  - New `GET /api/review/learn?flashcardId=`.
  - `POST /api/review/grade` sets `firstGradedAt` once.
- **Client:**
  - The Story 4.3 session component is reused by Learn.
  - A new viewer component goes on Flashcard detail.
- **Existing users:** Cards never graded so far become "unlearned" and leave Review until they are learned. This was accepted (change request, decision 3).
- **Resolved:** the `deferred-work.md` entry from spec-4-1 about the "never graded" predicate.

## 3. Recommended Approach

**Selected:** a hybrid of **Direct Adjustment** and a small **MVP rescope**.

| Option | Viable | Effort | Risk | Notes |
|---|---|---|---|---|
| 1. Direct adjustment (modify and add stories in Epic 4) | Yes | Medium | Medium | The risk is the migration and backfill, which `applyGrade`'s "never returns interval 0" guarantee (tested in 4.1) keeps well-defined. |
| 2. Roll back 4.3 | No | n/a | n/a | Learn reuses 4.3's session screen, keyboard, swipe, optimistic grade and 409 handling, so rolling back would throw away the base of 4.8. |
| 3. MVP review | Partly | Low | Low | FR-10 out; FR-16 and FR-17 in. MVP size is about the same, and the goals (daily habit, SM-2 correctness) are unchanged. |

**Rationale.**
- The change adds one clear user model: learn, then review.
- It removes a mechanism that model makes redundant (the daily cap).
- It replaces a fragile convention with an explicit marker (AD-14).
- About 3 new stories replace 1 removed story, so the timeline grows by roughly two stories.
- The architecture stays on its single write path (AD-4).

## 4. Detailed Change Proposals (all approved)

### 4.1 PRD — §3 Glossary (Proposal 1)

**Replace "New Card" with:**

> **Unlearned Card** — A Card with at least one Scheduling Record that has never received a Grade (`firstGradedAt` is null). Unlearned Cards are introduced only through Learn (FR-17), never through the Review tab. A Card counts as **learned** once both of its Scheduling Records have been graded at least once. A Card that failed back to `repetitions = 0` via an "Again" Grade (FR-8) stays learned.

**Review Session.** "...grades one or more due Scheduling Records" becomes "...grades one or more due Scheduling Records of learned Cards".

**Add Learn Session:**

> A graded sitting scoped to one Flashcard that introduces its Unlearned Cards, then continues with that Flashcard's due records (FR-17). Its Grades use the same SM-2 write path and count toward the streak.

**Due Queue.** "...Scheduling Records (not Cards) whose..." becomes "...Scheduling Records (not Cards) of learned Cards whose...".

### 4.2 PRD — UJ-2 and FR-9 (Proposal 2)

**UJ-2:**
- "due cards" becomes "due cards of learned Cards".
- "Space to reveal" becomes "Space to flip".
- "(capped at a digestible daily batch)" is removed.
- Add: "New Cards never appear here until they are learned in a Flashcard's Learn session (UJ-4)."
- The "realizes" list becomes FR-9, FR-11.

**FR-9:**
- Lead sentence: "...presents due Scheduling Records of learned Cards ... prompt side first, then flip, then Grade capture."
- New consequence: "A Scheduling Record whose Card is an Unlearned Card never appears in the Review queue, even when its `next_review_date` has arrived."
- Scope consequence: only "Review this class" and "Review this folder" remain. "A Flashcard's graded entry point is Learn (FR-17), not a scoped review."
- Keyboard consequence: "Space or a click/tap flips the card either way; 1–4 or J/K/L/; submit a Grade, available once the answer has been shown."

### 4.3 PRD — FR-10, §5 and §8.1 (Proposal 3)

**FR-10** becomes:

> **FR-10: Daily batch cap — removed (Sprint Change 2026-11-13).** Superseded by Learn (FR-17). New Cards no longer enter the Review queue automatically, so a daily cap has nothing to limit. The FR number is retired, not reused.

**§5:** add the non-goal "A daily new-card cap or settings for it."

**§8.1:**
- "...review session with batch cap and focus mode (FR-9, FR-10, FR-11)" becomes "...review session of learned Cards with focus mode (FR-9, FR-11)".
- Add the line "Flashcard card viewer and Learn session (FR-16, FR-17)".

### 4.4 PRD — UJ-4, FR-16 and FR-17 (Proposal 4)

**UJ-4. Learning a Flashcard.**

> The user opens a Flashcard and flips through its Cards in the viewer (← → to move, Space or click to flip) to get familiar with them, with no grading and no effect on scheduling. When ready, they press "Learn": each Unlearned Card is shown in both directions and graded Again/Hard/Good/Easy. From then on those Cards come back on their own in the daily Review (UJ-2). *(realizes FR-16, FR-17)*

**FR-16: Flashcard card viewer.** The viewer sits above the Cards list and shows Cards one at a time, Term side first.
- It includes every Card in the Flashcard, in the same order as the Cards list, whatever its scheduling state.
- Space or a click/tap flips the card either way.
- ← and → (buttons and arrow keys) move between Cards, and each new Card shows Term side first.
- A mono "X / N" counter shows the position.
- ← is disabled on the first Card and → on the last. There is no wrap-around, shuffle or autoplay.
- Keys are ignored while focus is in a field or a panel or modal is open. Space never scrolls the page.
- Viewing never changes any Scheduling Record.
- An empty Flashcard shows its existing empty state, and the viewer is not rendered.

**FR-17: Learn session.** The "Learn" button sits directly below the viewer. It runs the same session screen, keyboard rules, grade write path and focus mode as Review.
- **Queue order:**
  - Unlearned Cards come first. Each Card appears as two entries, one per direction, graded independently.
  - The Flashcard's due records of learned Cards follow, oldest-due-first.
- **Learned rule:**
  - The first Grade of a record marks it as graded.
  - Once both directions are graded, the Card is learned.
- **Streak:** Learn grades count toward the streak.
- **Completion:** when nothing is left, a calm completion line shows with a way back to the Flashcard, and no confetti.
- **Button label:**
  - It reads like "Learn · 12 new · 3 due".
  - It reads just "Learn" when nothing is waiting, and then opens the completion state.

### 4.5 PRD — FR-12, FR-13 and FR-15 (Proposal 5)

- **FR-12:** add "Grades from a Learn Session (FR-17) count exactly like Review grades."
- **FR-13:** add "The export includes each Scheduling Record's `firstGradedAt`, so a restore (FR-14) preserves which Cards are learned versus unlearned."
- **FR-15:** "total Cards" becomes "total Cards (learned / unlearned)".

### 4.6 Architecture Spine (Proposal 6)

**AD-4.**
- The protected fields become five: `interval`, `repetitions`, `ease_factor`, `next_review_date` and `first_graded_at`.
- The grade route sets `first_graded_at = now` only when it is null.
- Binds FR-8 and FR-17.

**AD-9.** New Cards are created with `first_graded_at = null`.

**New AD-14 — Learned vs. unlearned is one predicate.**
- **Binds:** FR-9, FR-15, FR-16, FR-17.
- **Prevents:** the queues, button counts and stats each deriving "learned" differently.
- **Rule — definition:**
  - Learned Card = both of its records have `first_graded_at IS NOT NULL`.
  - It is exposed as one where-fragment builder in `packages/domain` (`learnedCardWhere` / `unlearnedCardWhere`), used by the queue, Learn and stats routes.
- **Rule — Review queue:** due records of learned Cards.
- **Rule — Learn queue:**
  - First, the Flashcard's unlearned Cards' ungraded records, in Card creation order, with each Card's two directions together and Term→Definition first.
  - Then that Flashcard's due records of learned Cards, oldest-due-first.

**Structural Seed.**
- `review/queue/` takes only `?classId=` or `?folderId=`.
- `review/learn/` is new: `GET ?flashcardId=` (required), returning entries plus `{ newCards, due }` counts.

**Data model.**
- `SchedulingRecord.first_graded_at`: nullable UTC timestamp.
- Migration: backfill `= updated_at` where `interval > 0`.

**Other ADs.**
- **AD-7:** the Review and Learn screens share one session component with optimistic updates.
- **AD-10:** `backupExportSchema` includes `firstGradedAt`.

**Capability map.**
- FR-9, FR-11 Review: governed by AD-4, AD-7, AD-13, AD-14.
- New row FR-16 Card viewer: Flashcard detail, using the existing `GET api/flashcards/[id]`.
- New row FR-17 Learn: `flashcards/[id]/learn`, `api/review/learn`, `api/review/grade`.

### 4.7 EXPERIENCE.md (Proposal 7)

**Information architecture.**
- **Review:** "...review of learned Cards...; never introduces new Cards".
- **Flashcard detail:** the Card viewer on top, the "Learn" button below it, then the Cards list. "Review this flashcard" is removed.
- **New Learn row:** reached from Flashcard detail → Learn; same session screen and focus mode as Review.

**Component patterns.**
- **Flip-card:** used by Review, Learn and the viewer. It flips either way, and the next Card shows unflipped.
- **Grade buttons:** appear after the first flip and stay until the entry is graded.
- **New Card viewer:** list order; ← "X / N" →; no wrap, grading, shuffle or autoplay; hidden when the Flashcard is empty.
- **New Learn button:** the page's one primary action, labelled with what is waiting. "Add cards" becomes secondary while the viewer shows.
- **Empty due-queue state:**
  - Shows up to 3 Flashcards with Unlearned Cards, for example "Weather idioms · 12 new".
  - Otherwise shows "+ Add card".

**State patterns.**
- **Scoped review:** class and folder only, learned Cards only.
- **New Learn complete state:** "Nothing left to learn in {Flashcard} right now." plus a link back.

**Interaction primitives.**
- **Review and Learn:** Space flips either way, and grade keys work once the answer has been shown.
- **Viewer:** Space flips, and ← / → move between Cards.
- **Guards:** keys are ignored in fields and in panels or modals, and Space never scrolls the page.
- **Mobile viewer:** tap flips, and a horizontal swipe moves ← / →.

**Key flows.**
- Flow 2 notes that only learned Cards appear.
- New Flow 4, Learning a Flashcard: open the Flashcard → flip through its Cards → press "Learn · 12 new" → grade each Card in both directions → completion line → the Cards come back in daily Review.

### 4.8 DESIGN.md and the reconcile note (Proposal 8)

**New `components.card-viewer` token.**

```yaml
card-viewer:
  card: '{components.review-card}'
  nav-button-border: '{colors.border}'
  nav-button-radius: '{rounded.full}'
  nav-button-disabled-opacity: 0.4
```

**New Card viewer rule.**
- It uses the review card's surface and flip, with no icon row.
- Below the card: outline circular ← and → buttons around the mono counter. The arrows are neutral, never the accent.
- Below that: the primary "Learn" button, the only accent on the page.

**Changes to existing rules.**
- **Review card:** used by Review, Learn and the viewer; flips either way; the icon row is dropped in v1.
- **Grade buttons:** stay visible after the first flip.
- **Add cards panel:** its button is primary only on an empty Flashcard, otherwise secondary.
- **Empty due-queue state:** a list of unlearned Flashcards, or "+ Add card".

**`reconcile-quizlet-flashcard-view.md` (amended 2026-11-13).**
- **Moved to "Taken":**
  - Flashcards mode, as the non-graded Card viewer (FR-16).
  - Learn entry, only as a graded SM-2 session (FR-17). Quizlet's adaptive multiple-choice Learn is still not taken.
- **Still "NOT taken":** Test, Match and live games; Study with Friends; sort, shuffle, autoplay and fullscreen; promotional banners.

### 4.9 Epics and stories — `epics.md` (Proposal 9)

**Requirements inventory and Epic 4 header.**
- FR-9 is updated, FR-10 is marked removed, and FR-16 and FR-17 are added.
- Append to Epic 4's goal: "New Cards are introduced deliberately through a Flashcard's card viewer and Learn session; Review only brings back Cards already learned."
- Epic 4 covers FR-8, FR-9, FR-11, FR-16 and FR-17.

**Story 4.3.**
- AC 2 drops "Review this flashcard".
- AC 4 adds: "And pressing Space or clicking again flips it back; grading stays available."

**Story 4.4.** **Removed**, retired with FR-10.

**Story 4.5.**
- AC 1: "When I enter a Review or Learn session".
- AC 3: the empty state shows streak, a calm line, and either up to 3 Flashcards with Unlearned Cards or "+ Add card".

**New Story 4.6: Learned Marker & Learned-Only Review Queue**

*As a user, I want Review to bring back only Cards I have already learned, so that new Cards don't flood my daily session before I've studied them.*

- **Given** the migration runs, **When** it completes, **Then** every SchedulingRecord has `firstGradedAt` (nullable), and every record with `interval > 0` is backfilled with `firstGradedAt = updatedAt`.
- **Given** a record with `firstGradedAt = null`, **When** it is graded via `POST /api/review/grade`, **Then** `firstGradedAt` is set to now.
  - **And** a later grade never changes it.
- **Given** a Card created by any path, **When** it is saved, **Then** both records have `firstGradedAt = null`.
- **Given** an Unlearned Card whose records are due, **When** I open Review (default, class or folder scope), **Then** neither record appears.
  - **And** a learned Card's due records still do.
- **Given** `GET /api/review/queue?flashcardId=…`, **When** it is called, **Then** it returns 400.
  - **And** "Review this flashcard" is removed from the Flashcard page.
- **And** learned/unlearned is computed only through the shared AD-14 predicate, which is unit-tested.

**New Story 4.7: Flashcard Card Viewer**

*As a user, I want to flip through a Flashcard's Cards on its page, so that I can get familiar with them before I'm graded.*

- **Given** a Flashcard with N Cards, **When** I open it, **Then** the viewer above the list shows Card 1 Term-side first with "1 / N", in list order.
- **When** I press Space or click the card, **Then** it flips either way.
- **When** I press → or ← (or the buttons), **Then** the next or previous Card shows Term-side first.
  - **And** ← is disabled on Card 1 and → on Card N (no wrap-around).
- **Given** focus is in a field or the Add cards panel is open, **When** I press Space or an arrow, **Then** the viewer ignores it.
  - **And** Space never scrolls the page.
- **Given** any viewing, **Then** no Scheduling Record changes.
- **Given** an empty Flashcard, **Then** the viewer is hidden and the existing empty state shows.
- **Given** mobile, **When** I swipe left or right on the viewer, **Then** it moves → or ←.
- **And** "Learn" is the primary button directly below the viewer, and "Add cards" is secondary.
- **And** the UI conforms to DESIGN.md `components.card-viewer` in both themes.

**New Story 4.8: Learn Session**

*As a user, I want a Learn session per Flashcard, so that I grade new Cards deliberately and they then join my daily Review.*

- **Given** `GET /api/review/learn?flashcardId=…`, **When** it is called, **Then** it returns:
  - first, the unlearned records (Cards in creation order, each Card's two directions together, Term→Definition first);
  - then the due records of learned Cards (oldest-due-first);
  - plus `{ newCards, due }`.
  - **And** 401, 400 and 404 behave like the queue route.
- **Given** the Flashcard page, **Then** the Learn button reads "Learn · {newCards} new · {due} due".
  - Zero parts are omitted, and it reads "Learn" when both are 0.
- **When** I press Learn, **Then** the same session screen as Review runs, scoped to this Flashcard, with the header naming it:
  - flip, keys and swipe;
  - optimistic grading;
  - the 409 handling.
- **Given** I grade both directions of a new Card, **When** I next open Review on its due date, **Then** it appears there.
- **Given** nothing is left, **Then** "Nothing left to learn in {Flashcard} right now." shows with a link back.
- **And** Learn grades count toward the streak through the same grade route.

**Epic 5.**
- **5.1:** add the AC "Given I grade a card in a Learn session, Then that day counts toward the streak."
- **5.2 / 5.3:** add the AC "Then each Scheduling Record's `firstGradedAt` is exported / restored verbatim."
- **5.4:** total Cards is shown as "learned / unlearned".

## 5. Implementation Handoff

**Scope classification: Moderate.** The backlog is reorganized (one story removed, three added, sequence changed) and the planning documents are edited. There is no fundamental replan: the goals, stack and architecture paradigm are unchanged.

| Role | Responsibility |
|---|---|
| Product Owner / Developer (this workflow, on approval) | Apply the approved edits in §4 to the PRD, Architecture Spine, EXPERIENCE.md, DESIGN.md, the reconcile note and `epics.md`. Update `sprint-status.yaml` (remove 4-4; add 4-6, 4-7, 4-8 as backlog; record the build order). Mark the spec-4-1 `deferred-work.md` entry about "never graded" as superseded by AD-14. Regenerate `epic-4-context.md`, which is now stale. |
| Developer (`bmad-build`, one fresh session per story) | Merge Story 4.3 as built, then build 4.6 → 4.7 → 4.8 → 4.5. |
| Architect | No separate session needed. AD-14 and the migration are fully specified in §4.6. |

**Success criteria.**
- Review never shows a record of an Unlearned Card, with tests at the API and e2e levels.
- A Card created today does not appear in Review until both directions are graded in Learn.
- After that, it appears on its SM-2 due date.
- The viewer never changes scheduling.
- Every existing Card that was graded before the migration is still learned afterwards (the backfill is verified by a test).
- Export and restore round-trip `firstGradedAt`.
- All suites pass: unit, API and e2e.

## 6. Execution Log

- 2026-11-13: All 9 edit proposals were approved one at a time (incremental mode), and the proposal as a whole was approved.
- Edits applied:
  - `prd.md`: glossary, UJ-2, UJ-4, FR-9, FR-10 retired, FR-16, FR-17, FR-12/13/15, §5, §8.1.
  - `ARCHITECTURE-SPINE.md`: AD-4, AD-7, AD-9, AD-10, new AD-14, Structural Seed, data model, capability map, frontmatter `binds`.
  - `EXPERIENCE.md`: information architecture, components, states, interaction primitives, Flow 2, new Flow 4. The Settings row no longer lists the daily new-card limit, and the "Daily batch cap reached" state was removed.
  - `DESIGN.md`: the `card-viewer` token and rules; review card, grade buttons, Add cards panel and empty state.
  - `reconcile-quizlet-flashcard-view.md`: Taken / NOT taken amended.
  - `epics.md`: FR inventory and coverage map, Epic 4 goal and FRs, Story 4.3 ACs, 4.4 removed, 4.5 ACs, new 4.6, 4.7 and 4.8, Epic 5 ACs.
  - `sprint-status.yaml`: 4-4 removed; 4-6, 4-7 and 4-8 added as backlog; build order recorded.
  - `deferred-work.md`: a resolution entry for the "never graded" predicate.
  - `epic-4-context.md`: regenerated.
- 2026-11-13 (follow-up, Luric chose option a): Learn re-shows an entry graded Again at the end of the session until it is graded Hard/Good/Easy. Only the first grade is persisted, so classical SM-2 is unchanged. Applied to PRD FR-17, epics.md (FR-17 and a Story 4.8 AC), EXPERIENCE.md (Learn row, Flow 4) and Architecture AD-14. The same pass also fixed stale UX-DR2, UX-DR3, UX-DR8 and UX-DR11 in epics.md, and added UX-DR17 (Card viewer).
- Handoff: Developer, via `bmad-build`, one fresh session per story. Merge Story 4.3, then build 4.6 → 4.7 → 4.8 → 4.5.
