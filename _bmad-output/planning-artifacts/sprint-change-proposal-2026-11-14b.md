# Sprint Change Proposal — Pastel Frame UI Refresh and Navigation (new Epic 6)

- **Date:** 2026-11-14
- **Project:** Web_TrainingSanctum
- **Requested by:** Luric (product owner)
- **Workflow:** bmad-correct-course (batch mode)
- **Status:** Applied 2026-11-14. Luric asked me to decide ("fix it your way") rather than review each edit, so this proposal was approved by delegation and has **not been reviewed line by line**. Edits are applied to the PRD, Architecture Spine, epics.md and sprint-status.yaml. Every edit is in git and can be reverted.

---

## 1. Issue Summary

**What triggered it.** The product owner asked for a big UI update toward a reference language-learning app (four screenshots supplied 2026-11-14). It was built and committed on `ui/big-ui-update` (`e8fe617`, `92167eb`), specified in `spec-restyle-pastel-frame.md`, and written into DESIGN.md and EXPERIENCE.md (UX workflow, same day). The sprint plan was never told.

**Issue type.** A new requirement from the stakeholder, delivered before it was planned, plus three decided-but-unbuilt surfaces.

**Problem statement.** After the UX spines changed, four planning artifacts disagree with them and with the shipped UI, and four pieces of work have no story:

1. **PRD §7** still says "dark-mode default… inspired by Linear, Raycast". The product now ships light by default with pastel tint tiles.
2. **epics.md** still describes the old design in UX-DR1, 3, 4, 5, 6, 10, 13 and 16, in Stories 1.5 and 5.5, and in the Epic 5 notes (sidebar, dark default, "Focus Indigo", 4px XP bar, Again in error colour).
3. **No navigation exists below 640px.** The sidebar was hidden there and nothing replaced it, so Settings and Log out are unreachable on a phone. This predates the refresh (it was deferred in spec-1-5) but is now a decided fix.
4. **Class colour, quick search and a contrast defect have no story.** Class colour needs a new field on Class, which touches the schema, the API and the backup format.

**Evidence.**
- Contrast measured from `globals.css` (DESIGN.md Colors): input border on the panel is 1.30:1 (light) and 1.59:1 (dark) against the 3:1 non-text rule that UX-DR13 and the Accessibility Floor require. All text pairs pass AA.
- `sprint-status.yaml` has no entry for any of this.
- Shipped screenshots in `test-results/screenshots/` show the new shell; 138 of 138 e2e tests pass.

**Decisions already made by the product owner (2026-11-14).**
1. Full rewrite of DESIGN.md and EXPERIENCE.md for Pastel Frame (done).
2. Each Class has a colour; its Folders and Flashcards inherit it.
3. Mobile navigation is a floating dock.
4. Quick search (Ctrl+K) is wanted. Not built.
5. Grade pills stay rose, butter, mint, sky, accepting that the order can read as a severity scale (FR-8).
6. Realm avatar per realm (built, `92167eb`).

**Decisions made in this proposal (please confirm or change):**
- **A1. Epic 6 holds all of it,** with two stories recorded after the fact (6.1 shell, 6.2 avatar) so the history is in one place.
- **A2. Build order puts Class colour before backup.** Stories 5.2 and 5.3 write the backup schema; if the colour field arrives later, that schema is written twice. So 6.4 goes before 5.2.
- **A3. The dock goes first.** It is small and removes a real usability hole, so 6.3 and 6.6 go ahead of Epic 5's remaining stories.
- **A4. Quick search is last** (after backup) and is optional for MVP.

## 2. Impact Analysis

### Epic impact
- **New Epic 6, "Pastel Frame & Navigation."** FRs covered: FR-20 (new), plus FR-5 extended. No existing epic becomes obsolete, and none can no longer be completed.
- **Epic 5:** build order changes; 5.2 and 5.3 gain a Class colour AC; 5.5's contrast AC now cites the Pastel Frame ratios.
- **Epics 1 and 2:** Stories 1.5 and 2.1 get an amendment note each (done and in review, no rework).

### Story impact
- **New:** 6.1 (shell, built), 6.2 (realm avatar, built), 6.3 (mobile dock), 6.4 (Class colour), 6.5 (quick search), 6.6 (input contrast).
- **Amended:** 1.5, 2.1, 5.2, 5.3, 5.5.
- **Build order:** 6.3 → 6.6 → 5.6 → 5.7 → 5.4 → 6.4 → 5.2 → 5.3 → 6.5 → 5.5. (5.1 is already built.)

### Artifact conflicts
- **PRD:** §7 (aesthetic), FR-5 (Class colour), new FR-20 (quick search), a new NFR (every destination reachable at every width), §8.1 scope.
- **Architecture Spine:** the Class entity gets `color`; AD-10's backup schema carries it; the stack table gains the font. No new decision record is needed.
- **UX:** already updated and final. DESIGN.md and EXPERIENCE.md are the source for the new stories.
- **Epics:** see above.

### Technical impact
- **Schema:** one migration adds `Class.color`. Per the project's rule, a new migration must also be deployed to Neon or the dev server returns 500 on every page.
- **Code:** the shell, tokens, avatar and tile lists are done. Remaining: dock, Class colour (modal, tile tint, API, backup), quick search, one token change for input borders.
- **Existing data:** current Classes get colours by creation order, so nothing breaks.

## 3. Recommended Approach

**Direct Adjustment.** Add Epic 6 and amend the artifacts that contradict the shipped UI. No rollback and no MVP reduction.

- **Effort:** 6.3 and 6.6 are small, 6.4 is medium (migration, API, UI, backup), 6.5 is medium.
- **Risk:** low for 6.3 and 6.6. 6.4 is the only schema change; it is additive with a default. 6.5 touches a global key listener, so it must not fire during sessions, modals or text entry.
- **Timeline:** no change to Epic 5's story order other than the interleaving in A2 and A3.
- **Scope classification: Moderate.** It reorders the backlog and amends the PRD, but needs no fundamental replan.

## 4. Detailed Change Proposals

### PRD (`prd-Web_TrainingSanctum-2026-10-29/prd.md`)

**P1. §7 first bullet.**
OLD: "Minimalist, distraction-free visual language — ships dark-mode default with a light-mode toggle, inspired by developer-tool aesthetics (Linear, Raycast) rather than gamified/social layouts (Quizlet)."
NEW: "Calm, distraction-free visual language — a dark app frame with a top bar around a light content panel, pastel tint tiles and pill controls ("Pastel Frame", 2026-11-14), light by default with a dark-mode toggle. Not gamified or social."
Rationale: matches the shipped product and DESIGN.md. Also notes the realm avatar as the one illustration, in the cultivation exception bullet.

**P2. FR-5 consequences, add:** each Class has one of five colours (lavender, sky, mint, butter, rose); a new Class defaults to the next colour in order; the colour can be changed; its Folders and Flashcards show the Class's colour; it is included in export and restore.

**P3. New FR-20: Quick search.** Ctrl+K or "/" outside a text field opens a palette to jump to Review, Classes, Cultivation or Settings, or to search Class, Folder, Flashcard and Card names and Card terms. Disabled during sessions and modals.

**P4. §6, new NFR "Responsive navigation":** every destination in the Main nav, including Settings and Log out, is reachable at every viewport width.

**P5. §8.1:** add FR-20 to Phase 1, marked as last in build order and droppable.

### Architecture Spine

**A-1.** Class entity: add `color`, an enum of five values, default assigned at creation, never null.
**A-2.** AD-10: `backupExportSchema` carries `class.color`; restore validates it; an export without it (older backup) restores with colours assigned by order.
**A-3.** Stack: add "Font — Plus Jakarta Sans via `next/font/google` (latin, vietnamese)".

### Epics (`epics.md`)

**E-1.** Requirements Inventory: add FR-20; amend FR-5.
**E-2.** UX-DR1, 3, 4, 5, 6, 10, 13, 16 reworded to Pastel Frame; new UX-DR20 to 23 (dock, quick search, Class colour, realm avatar).
**E-3.** FR Coverage Map: add FR-20. Epic List: add Epic 6.
**E-4.** Stories 1.5 and 2.1: amendment note. Stories 5.2, 5.3: Class colour in the backup AC. Story 5.5: contrast AC cites Pastel Frame. Epic 5 build-order note updated.
**E-5.** New Epic 6 with Stories 6.1 to 6.6, each with acceptance criteria.

### Sprint status (`sprint-status.yaml`)
**S-1.** Add `epic-6: in-progress`, `6-1` and `6-2` at `review`, `6-3` to `6-6` at `backlog`, and the new build order comment.

## 5. Implementation Handoff

- **Scope:** Moderate. Backlog reorganisation plus a PRD amendment.
- **Product Owner / Luric:** review this proposal (it was approved by delegation, not reviewed), confirm A1 to A4, and review Epic 6's acceptance criteria.
- **Developer agent:** build 6.3 and 6.6 next, via `bmad-build`.
- **Success criteria:** the PRD, epics and UX spines no longer contradict the shipped UI; every shell destination is reachable at 390px; Class colour reaches the backup before Story 5.2 is built; the input border reaches 3:1 in both themes.
