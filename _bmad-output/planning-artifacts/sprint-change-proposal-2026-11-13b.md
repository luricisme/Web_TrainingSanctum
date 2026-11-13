# Sprint Change Proposal — Study Directions Setting & Per-Direction Learned Model

- **Date:** 2026-11-13 (second change of the day, labelled "2026-11-13b")
- **Project:** Web_TrainingSanctum
- **Requested by:** Luric (product owner)
- **Workflow:** bmad-correct-course (incremental mode; all 6 edit proposals approved individually)
- **Status:** Approved 2026-11-13 by Luric. Edits applied to the PRD, Architecture Spine, EXPERIENCE.md, DESIGN.md, epics.md and sprint-status.yaml.

---

## 1. Issue Summary

**What triggered it.** After Story 4.8 (Learn Session) and 4.8b ("Study all cards again"), the product owner noticed that Learn asks every Card twice: Term → Definition, then Definition → Term. They asked for a setting to choose which way cards are asked.

**Problem statement.** Today every Card is always studied in both Recall Directions:
- FR-8 schedules each direction independently.
- FR-9 queues both.
- FR-17 introduces both.
- AD-14 counts a Card as learned only when both directions are graded.

There is no way to study one direction only. Because "learned" is per Card, a half-graded Card's graded direction waits for the other before it reaches Review. Story 4.8's review flagged this ("in neither queue"). It was accepted at the time as per-spec.

**Issue type.** A new requirement from the stakeholder.

**Decisions (product owner, 2026-11-13).**
1. **Scope:** one account-wide setting, on Settings. It applies to Learn, Review, the Learn practice run and the card viewer.
2. **Options:** Both (default), Term → Definition only, Definition → Term only.
3. **Learned model:** "learned" is **per direction**. A graded direction joins Review on its due date whether or not the other direction is graded. Switching settings never pulls a Card out of Review. A newly studied direction's ungraded records go to Learn.
4. **Card viewer:** follows the setting. It shows Definition first only when just Definition → Term is studied.
5. **Default stays Both.** This keeps the PRD's JTBD "recall testing that's honest in both directions". Studying one direction is a deliberate opt-out.

## 2. Impact Analysis

### Epic impact
- **Epic 4:** still completable. Add **Story 4.9** (Study Directions Setting & Per-Direction Learned Model) before 4.5. Done stories 4.6 and 4.8 are extended, not reworked.
- **Epic 5:**
  - 5.2 and 5.3 export and restore `user.studyDirections`.
  - 5.4 counts learned and unlearned over the studied directions.
  - 5.1 (streak) is unaffected.
- **No new epic, and no epic made obsolete.**

### Story impact
- **New:** 4.9.
- **Amended (record only):** 4.8.
- **Acceptance criteria amended:** 4.5 (build order), 5.2, 5.3, 5.4.

### Artifact conflicts
- **PRD:** Glossary (Recall Direction, Learned/unlearned direction, Unlearned Card, Due Queue), JTBD §2.1, FR-9, FR-13, FR-15, FR-16, FR-17, plus a new **FR-18**.
- **Architecture Spine:** AD-14 rewritten as a per-direction predicate taking studied directions. ERD gains `User.studyDirections`. AD-10 export schema, Structural Seed (`api/settings`), Capability map.
- **EXPERIENCE.md:** IA rows for Settings and Learn, a new Study directions component pattern, Flow 4.
- **DESIGN.md:** Study directions control, reusing `components.mode-switcher`.
- **epics.md:** FR-18, UX-DR18, coverage map, Epic 4 goal, Story 4.9, and amendments to 4.5, 4.8, 5.2, 5.3 and 5.4.
- **sprint-status.yaml:** adds `4-9-study-directions-setting: backlog`.

### Technical impact
- **Prisma migration:** an additive column `User.studyDirections` (enum, default `BOTH`). No data is rewritten.
- **`packages/domain/learned.ts`:** the builders become per-direction and take studied directions, and `studiedDirections()` is added.
- **Routes:**
  - Rewired to the new builders: `GET /api/review/queue`, `GET /api/review/learn` (via `apps/web/lib/learn-queue.ts`) and the counts on `GET /api/flashcards/[id]`.
  - New: `GET/PATCH /api/settings`.
- **Unchanged:** the grade route (AD-4) and card creation (AD-9). Every Card keeps both records.
- **Client:** the card viewer and the Learn practice run read the studied directions for the prompt side and the entries.
- **Deployment:** the new migration must be applied to the Neon database with `npm run db:migrate:deploy`. Story 4.6's migration was missed there once.

## 3. Recommended Approach

**Direct Adjustment.** Add Story 4.9 and update the planning documents.
- **Rollback:** not needed. 4.6–4.8b stay valid.
- **MVP scope:** unchanged.

- **Effort:** Medium. A migration, the predicates, three routes, a Settings control and two client consumers.
- **Risk:** Low to medium. The predicate change touches every queue. Mitigation: unit tests for all three settings, plus regression of the existing queue, Learn and Review suites.
- **Timeline:** about one story added before 4.5.

## 4. Detailed Change Proposals (all approved)

### 4.1 PRD — §3 Glossary (Proposal 1)
- **Recall Direction:** add "The user's **study directions** setting (FR-18) decides which directions are studied: both (default), or only one. A direction that is turned off keeps its Scheduling Record unchanged and appears nowhere until it is turned back on."
- **New entry, "Learned / unlearned direction":**
  - A Scheduling Record is learned once it has its first Grade (`firstGradedAt` set), and unlearned until then.
  - Unlearned records of studied directions are introduced only through Learn. Learned ones enter Review on their due date.
  - A record that "Again" sends back to `repetitions = 0` stays learned.
- **Unlearned Card (redefined):** a Card with at least one unlearned record in a studied direction. A Card is learned when every studied direction is learned. Used for counts and Stats.
- **Due Queue:** "learned Scheduling Records (not Cards) in studied directions whose `next_review_date` has arrived, pulled per-direction."

### 4.2 PRD — FRs (Proposal 2)
- **New FR-18, Study directions setting.** Per account: Both (default), Term → Definition only, or Definition → Term only. It applies to Learn, Review, the practice run and the viewer. Consequences:
  - New and existing accounts start on Both.
  - The other direction never shows when it is not studied, and the Learn counts cover studied directions only.
  - Turning a direction off changes no record. Turning it on sends its unlearned records to Learn and its learned, due records to Review.
  - The viewer and the practice run show Definition first only when just Definition → Term is studied.
  - A change takes effect at the next queue load; a running session keeps its snapshot.
- **FR-9:**
  - "both studied directions due" → two entries.
  - Unlearned records, and records of unstudied directions, never appear in Review.
- **FR-16:** Term side first, or Definition side first when only Definition → Term is studied.
- **FR-17:**
  - The session takes the unlearned records in studied directions first (creation order, each Card's directions together, Term → Definition first), then the learned, due records in studied directions.
  - A record's first Grade makes it learned. It joins Review on its next due date whatever the other direction's state.
  - "Study all cards again" (unsaved practice in studied directions) is recorded from Story 4.8b.
- **FR-13:** the export includes the study-directions setting.
- **FR-15:** learned / unlearned totals are counted over studied directions.
- **§2.1 JTBD bullet 2:** append "Both directions is the default; studying only one is a deliberate opt-out (FR-18)."
- **UJ-2 / UJ-4:** "both directions" gains "(studied directions, FR-18)".

### 4.3 Architecture Spine (Proposal 3)
- **AD-14:**
  - Retitled "Learned vs. unlearned is one per-direction predicate (Sprint Change 2026-11-13, 2026-11-13b)". It now binds FR-18 too.
  - **Rule:**
    - A record is learned when `first_graded_at IS NOT NULL`.
    - Every queue and count is filtered to the studied directions from `studiedDirections(User.studyDirections)`.
    - The builders `learnedRecordWhere(dirs)`, `unlearnedRecordWhere(dirs)`, `learnedCardWhere(dirs)` and `unlearnedCardWhere(dirs)` live once in `packages/domain`. The Card-level builders are used only for counts and Stats.
  - **Review** = learned, due records in studied directions.
  - **Learn** = unlearned records in studied directions (creation order, directions together, Term → Definition first), then learned, due records in studied directions.
  - Unstudied directions are never read into a queue and never written. The viewer and the practice run take the prompt side from the same helper.
  - The "repeat until correct" sentence is unchanged.
- **ERD:** `User.studyDirections` (enum `BOTH | TERM_TO_DEFINITION | DEFINITION_TO_TERM`, non-null, default `BOTH`). The migration adds the column with the default. A Card still always has both records (AD-9 unchanged).
- **AD-10:** the export/restore schema carries `user.studyDirections`, and restore writes it back.
- **Structural Seed:** `api/settings/` (GET/PATCH, FR-18, AD-6).
- **Capability map:** `FR-18 | app/(routes)/settings, app/api/settings, packages/domain/learned.ts | AD-2, AD-6, AD-14`.

### 4.4 EXPERIENCE.md and DESIGN.md (Proposal 4)
- **EXPERIENCE IA — Settings:** "Theme toggle, Study directions (FR-18), export, restore, logout".
- **EXPERIENCE IA — Learn:** "its unlearned directions (in the studied directions, FR-18), then its due Cards … When it ends, 'Study all cards again' runs every Card as unsaved practice (FR-17)."
- **EXPERIENCE Component Patterns — new row, Study directions.** On Settings, below Theme:
  - three options: "Both directions" (default), "Term → Definition", "Definition → Term";
  - saves on change, with a quiet "Saved" status and inline error rollback;
  - helper line: "Which way cards are asked in Learn and Review. Turning a direction off keeps its progress.";
  - a radio group operable with arrow keys.
- **EXPERIENCE Flow 4:**
  - Step 3 notes the default Both.
  - The Failure line becomes: "every direction he graded is learned and comes back in Review on its due date; the Cards with an ungraded direction stay in 'Learn · 5 new'".
- **DESIGN.md — new component bullet, Study directions control:**
  - It reuses `components.mode-switcher`: a pill with three options, `{rounded.full}`.
  - The selected option is the accent fill with `{colors.on-accent}`, the one accent element on Settings.
  - Below 640px the options stack vertically. The helper text is `body-sm` `{colors.foreground-secondary}`.

### 4.5 epics.md (Proposal 5)
- **Inventory:** FR-18 and UX-DR18 lines, plus FR coverage map line `FR-18: Epic 4 - Study directions setting (per-direction learned model)`.
- **Epic 4 goal:** append "The user chooses which Recall Directions they study (both by default); 'learned' is tracked per direction, so a graded direction joins Review without waiting for the other."
- **New Story 4.9: Study Directions Setting & Per-Direction Learned Model.** Acceptance criteria:
  - **Migration:** BOTH for everyone, and no record changes.
  - **Settings:** `PATCH /api/settings` saves on change (Zod, 401), with a "Saved" status and rollback.
  - **One direction only:** the other direction never appears, and the counts follow.
  - **Per-direction Review:** with Both, a graded Term → Definition comes due in Review while its Definition → Term waits in Learn.
  - **Switching to Both:** the new direction goes to Learn and Review, and no Card leaves Review.
  - **Definition → Term only:** the viewer and the practice run show Definition first.
  - **Predicates:** they live once in the domain, are unit-tested for all three settings, and are the only ones the queue, Learn and Flashcard-count routes use.
  - **Design:** UI conforms to DESIGN.md in both themes.
  - **Build order:** 4.8 → 4.9 → 4.5.
- **Story 4.5:** build order becomes 4.6 → 4.7 → 4.8 → 4.9 → 4.5.
- **Story 4.8:** an appended note records 2026-11-13b and 4.8b.
- **Stories 5.2 / 5.3:** export and restore `user.studyDirections`.
- **Story 5.4:** learned / unlearned are counted over studied directions.

### 4.6 sprint-status.yaml (Proposal 6)
- Add `4-9-study-directions-setting: backlog # Sprint Change 2026-11-13b` after `4-8`, and note 4-8b on the `4-8` line.
- Update the build-order comment to 4-6 → 4-7 → 4-8 → 4-9 → 4-5.
- `epic-4-context.md` goes stale automatically, and the next `bmad-build` recompiles it.

## 5. Implementation Handoff

- **Scope:** **Moderate.** Planning documents are updated and one story is added; no replan.
- **Product Owner / Developer (this workflow):** apply the approved edits to the PRD, the Architecture Spine, EXPERIENCE.md, DESIGN.md, epics.md and sprint-status.yaml.
- **Developer agent (`bmad-build`):** implement Story 4.9 in a fresh session, after the 4.8 + 4.8b branch is merged.
- **Success criteria:**
  - All three settings are unit-tested at the predicate level.
  - The API and e2e suites prove: one-direction filtering, per-direction Review entry, no Card leaving Review on a switch, the viewer and practice following the setting, and Settings saving on change.
  - The existing unit, API and e2e suites still pass.
  - The migration is applied to the Neon database.

## 6. Execution Log

- 2026-11-13: proposals 1–6 approved individually by Luric (incremental mode).
- 2026-11-13: proposal approved for implementation (yes). Scope: Moderate.
- 2026-11-13: edits applied:
  - PRD: §2.1, UJ-2, UJ-4, Glossary, FR-9, FR-13, FR-15, FR-16, FR-17, the new FR-18 and §8.1.
  - Architecture Spine: AD-10, AD-14, ERD, Structural Seed and the Capability map.
  - EXPERIENCE.md: IA rows, the Card viewer row, the Study directions row and Flow 4.
  - DESIGN.md: the Study directions control.
  - epics.md: FR-18, UX-DR18, the coverage map, the Epic 4 goal, Story 4.9 and amendments to 4.5, 4.8, 5.2, 5.3 and 5.4.
  - sprint-status.yaml: `4-9-study-directions-setting: backlog` and the build-order comment.
  - One consistency fix: the FR-17 line in the epics.md Requirements Inventory now uses the per-direction wording, to match the PRD FR-17 approved in Proposal 2.
- Handoff: Developer agent (`bmad-build`) implements Story 4.9 in a fresh session, after the 4.8 + 4.8b branch is merged. `epic-4-context.md` will be recompiled automatically.
