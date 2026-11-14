# Sprint Change Proposal — Drop Quick Search, add pointer-cursor audit to Story 5.5

- **Date:** 2026-11-14
- **Project:** Web_TrainingSanctum
- **Requested by:** Luric (product owner)
- **Workflow:** bmad-correct-course (incremental mode)
- **Status:** Approved by Luric, edit by edit (4 of 4 proposals approved). Applied 2026-11-14.
- **Scope:** Minor — documentation and sprint-status only; no code change.

---

## 1. Issue Summary

Two scope changes from the product owner:

1. **Quick search is not needed.** Story 6.5 (FR-20, UX-DR21) is dropped.
2. **Story 5.5 needs a pointer-cursor audit.** Buttons and clickable areas must show `cursor: pointer`. The codebase already sets `cursor-pointer` in some components (class-form-modal, quest-list, add-cards-panel, card-viewer, import-review, …) but not everywhere, so there is no shared rule.

## 2. Impact Analysis

- **Epic 6:** now 6.1–6.4 and 6.6, all built (status `review`). 6.5 had no code, so nothing to roll back.
- **Epic 5:** Story 5.5 gains one acceptance-criteria block and a wider story statement.
- **PRD:** §4.8 Navigation emptied; FR-20 marked removed; the "droppable" list entry deleted.
- **UX docs:** `quick-search` component and the dock's Search button removed from DESIGN.md and EXPERIENCE.md; a cursor rule added to DESIGN.md Do's and Don'ts.
- **Code:** none now. Story 5.5 will add a global base style and fix exceptions.

## 3. Recommended Approach

Direct Adjustment. Low effort, low risk, no timeline impact: one fewer story in the build order.

New build order for what remains: **5-2 → 5-3 → 5-5**.

## 4. Changes Applied

| Artifact | Change |
|---|---|
| `epics.md` | Story 6.5 → "REMOVED" (number not reused, as for 4.4). FR-20 and UX-DR21 marked removed. FR map, Epic 6 description, Epic 5/6 build-order notes updated. UX-DR20 and Story 6.3 dock list no longer include Search. Epic 6 implementation note no longer mentions quick search. Story 5.5: statement now says "accessibility, pointer feedback and tone"; new AC — pointer on every button and clickable area, `not-allowed`/`default` when disabled, default cursor on non-interactive surfaces, applied once through a global base style, exceptions recorded in the story. |
| `prd.md` | §4.8 description replaced by a removal note; FR-20 reduced to a "REMOVED" stub; "Quick search (FR-20): … droppable" line deleted. |
| `DESIGN.md` | `dock.status` and Dock description drop the Search button; `quick-search` token block and component description deleted; new Do/Don't row for the cursor rule. |
| `EXPERIENCE.md` | Quick search rows removed from both tables; dock row drops Search; the "surfaces marked *not built*" sentence deleted (nothing is left unbuilt). |
| `sprint-status.yaml` | `6-5-quick-search` removed; 5-5 annotated with the pointer-cursor audit; new build-order comment; `last_updated` bumped. `epic-6` kept `in-progress` until its stories are merged. |

## 5. Implementation Handoff

- **Scope:** Minor → Developer agent (`bmad-build`).
- **Next stories:** 5-2 Data Export/Backup, 5-3 Restore, then 5-5 (now including the pointer-cursor audit).
- **Success criteria for 5-5's new AC:** one global base style covers `button`, `[role="button"]`, `a[href]` and `summary`; disabled controls show `not-allowed`; any clickable tile or custom element that still needs a per-component fix is listed in the story.

## 6. Open item (not part of this change)

Whether Data Export/Backup (5-2, 5-3) should be admin-only. The app is single-user by design (PRD §2.3) and has no role field, so the stories stand as written. If the app will get more users, run a separate correct-course to add roles.
