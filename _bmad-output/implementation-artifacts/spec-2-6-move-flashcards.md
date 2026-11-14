---
title: 'Move & Browse Flashcards'
type: 'feature'
created: '2026-11-11'
status: 'done'
baseline_commit: '85651c65354e72df0c1f7802493f9a28fce29e0c'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-7-flashcard-crud-inside-a-folder.md'
  - '{project-root}/_bmad-output/planning-artifacts/sprint-change-proposal-2026-11-10.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/DESIGN.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/EXPERIENCE.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/history/focus-indigo/working/design-dna-profile.json'
  - '{project-root}/.claude/skills/design-dna/references/generation-guide.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A Flashcard cannot be reorganized once created; it stays in the Folder it was made in (FR-5). Story 2.7 removed Move Card on purpose, so today content cannot move at all. Browsing (Folder page with Flashcard rows, Flashcard page with Card rows, breadcrumbs, Class and Folder counts) already exists from 2.7 and must keep working.

**Approach:** Add `POST /api/flashcards/[id]/move` that re-parents a Flashcard, with all its Cards, to any of the user's Folders. Add a "Move to…" item to the Flashcard row menu that opens a modal with a Class → Folder picker.

## Boundaries & Constraints

**Always:**
- Handler calls `requireSession`; Flashcard and target Folder are both scoped to the session user. Body `{folderId}` is validated with Zod. Unknown or foreign Flashcard → `404` code `NOT_FOUND`; unknown or foreign Folder → `404` code `FOLDER_NOT_FOUND`. Success `200` `{data: {id, folderId, name}}`.
- Moving changes only `Flashcard.folderId` (and `name` on a clash). Its Cards, Scheduling Records and Card text are untouched. A Flashcard always ends in exactly one Folder.
- Name clash in the target Folder (compared case-insensitively) is resolved with `uniqueFlashcardName`: the moved Flashcard gets " (2)", " (3)"… The read of target names and the update run in one transaction. A racing duplicate that hits the unique index (`P2002`) returns `409` code `NAME_CONFLICT` and changes nothing.
- Moving to the Flashcard's current Folder is a successful no-op.
- Flashcard row menu gets "Move to…" between Rename and Delete. The modal shows the Flashcard name, a Class select (current Class preselected) and a Folder select that omits the current Folder; when the chosen Class has no other Folder the Folder select shows "No other folders in this class". "Move flashcard" (primary) stays disabled until a Folder is chosen. "Cancel" has default focus; Escape and Cancel close without moving; close is blocked while the request runs.
- On success: close, remove the row from cached `["folder", id]` data, and invalidate `["folder", id]`, `["folder", targetId]`, `["class-folders"]`, `["classes"]`. A `404` `NOT_FOUND` means it is already gone: refresh and close. A `404` `FOLDER_NOT_FOUND` keeps the modal open with "That folder no longer exists. Choose another." Other errors keep the modal open with an inline message. Branches use `error.code`, never message text.
- Hierarchy stays Class → Folder → Flashcard → Card; no UI or API nests Folders or Classes.
- UI uses DESIGN.md tokens via `globals.css`, the DNA `design_style` and the anti-generic rules; reuse `Modal`, `RowMenu`, `buttonPrimary`, `buttonSecondary`, `formErrorClass`, select styles from the Class and Folder forms.

**Never:**
- No Move Card, no bulk move, no drag and drop, no moving Folders between Classes, no schema change or migration, no Server Actions, no new dependencies, no change to delete cascades or to the Add cards flow.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Move within Class | Own Flashcard, other Folder of same Class | `200`; leaves old Folder list, appears in new with all Cards | N/A |
| Move across Classes | Own Flashcard, Folder in another Class | `200`; Class counts for both change | N/A |
| Name clash | Target Folder has "Idioms" (any casing); moving "idioms" | `200`; moved Flashcard is renamed "idioms (2)" | Next free number if "(2)" taken |
| Cards intact | Any successful move | Same Cards, same Scheduling Records and `cardId`s | N/A |
| Same Folder | `folderId` equals current | `200`, nothing changes | N/A |
| Foreign or unknown Flashcard | Other user's or missing id | `404` `NOT_FOUND`, nothing changed | UI: refresh and close |
| Foreign or unknown Folder | Other user's or missing `folderId` | `404` `FOLDER_NOT_FOUND`, Flashcard stays | UI: inline message, modal open |
| Invalid body | Missing or non-string `folderId`; bad JSON | `400` validation or `INVALID_JSON` | N/A |
| Unauthenticated | No session | `401` | N/A |
| Racing duplicate | Name taken between read and update | `409` `NAME_CONFLICT`, nothing changed | UI: inline "Try again." |
| Last Flashcard moved out | Only Flashcard in the Folder | Folder page shows empty state with Create flashcard | N/A |
| Server failure | `5xx` | Modal stays open with message; row still listed | Inline error |

</frozen-after-approval>

## Code Map

- `apps/web/app/api/flashcards/[id]/move/route.ts` -- new `POST`; transaction with `findFirst` on Flashcard and target Folder, names of target Flashcards, `uniqueFlashcardName`, `update`. Patterns: `app/api/flashcards/[id]/route.ts` (PATCH transaction and `HttpError`), `lib/prisma-errors.ts` (`isUniqueViolation`), `lib/api-response.ts`.
- `packages/domain/src/flashcards.ts` -- add `moveFlashcardSchema` and `MoveFlashcardResponse`; `uniqueFlashcardName` already exists. Framework-free.
- `apps/web/app/(shell)/folders/[id]/move-flashcard-modal.tsx` -- new, modeled on `delete-flashcard-modal.tsx` and `flashcard-form-modal.tsx`; picker uses `["classes"]` and `["class-folders", classId]` queries (`GET /api/classes`, `GET /api/classes/[id]/folders`).
- `apps/web/app/(shell)/folders/[id]/folder-detail-view.tsx` -- `Dialog` gains `{kind:"move", id}`; `FlashcardRow` gets `onMove` and the menu item.
- `tests/api/flashcards.spec.ts`, `tests/domain/flashcards.test.ts`, `tests/e2e/flashcards.spec.ts` -- extend; helpers exist in each.
- Do not change: schema, Card routes and UI, delete cascades, `classes/**` screens (browsing already meets the AC).

## Tasks & Acceptance

**Execution:**
- [x] `packages/domain/src/flashcards.ts`, `tests/domain/flashcards.test.ts` -- `moveFlashcardSchema`, response type, tests -- validation
- [x] `apps/web/app/api/flashcards/[id]/move/route.ts` -- POST per matrix -- every row
- [x] `move-flashcard-modal.tsx`, `folder-detail-view.tsx` -- menu item, modal, cache updates, error branches by code -- UI behavior
- [x] `tests/api/flashcards.spec.ts` -- same-Class and cross-Class move, Cards and Scheduling Records unchanged (query DB), clash suffix including case-insensitive and " (3)", same-Folder no-op, foreign Flashcard and Folder `404` with codes, bad body `400`, `401`, Class counts via `GET /api/classes`
- [x] `tests/e2e/flashcards.spec.ts` -- Move via keyboard menu, Cancel and Escape keep it, move across Classes shows it renamed in the target, last Flashcard shows empty state, 5xx and both mocked 404 branches, light and dark screenshots of the modal

**Acceptance Criteria:**
- Given an existing Flashcard, when I move it to another Folder (same or another Class), then it leaves the old Folder's list and appears in the new one with all its Cards; a name clash gets a number added.
- Given a Folder or a Flashcard, when I open it, then I see its Flashcards or Cards as rows under the right breadcrumb; and the Classes view shows each Class with Folder, Flashcard and Card counts, with no way to nest Folders or Classes.
- UI conforms to DESIGN.md tokens and the Design DNA design_style; passes the anti-generic UI rules; checked against a screenshot in both dark and light themes.

## Implementation Notes

No migration was needed. A racing-moves API test (six concurrent moves with the same name) covers the `409` matrix row: every response is `200` or `409`, names in the target stay unique, and a `409` leaves the Flashcard unchanged.

## Spec Change Log

## Review Triage Log

| Finding | Verdict | Route | Evidence |
|---|---|---|---|
| Concurrent delete between reads and update surfaces as an unhandled `P2025` / `P2003` 500 (blind, edge) | medium | patch | Route now maps `P2025` to `404 NOT_FOUND` and `P2003` to `404 FOLDER_NOT_FOUND`, matching the modal's branches. |
| `409 NAME_CONFLICT` UI branch untested (gap) | medium | patch | Stubbed-409 step added to the e2e error-branch test: modal stays open, "Try again.", Move still enabled. |
| "Choose the class again to retry" cannot work: re-selecting the same option fires no change (blind) | medium | patch | Folder-load error now has a "Try again" button calling `refetch()`. |
| Cache freshness after a move only checked after a full reload (gap) | low | defer | Not data loss; needs an in-app navigation step in the e2e. Recorded in deferred-work.md. |
| Name change on a clash is not announced after the modal closes (blind) | low | rejected | The modal copy already says a clashing name gets a number added; a toast adds new UI. |
| Classes query failure leaves Class select on "Loading..."; stale preselected Class; Folder select usable while load errors (blind, edge) | low | rejected | Rare; same picker behavior accepted in earlier stories. |
| `folderId` has no max length (blind, edge) | low | rejected | Id is only used in a scoped lookup that returns `404`. |
| Server-side retry on `409` instead of surfacing it (blind) | low | rejected | A rare race; the spec chose `409` and a UI retry. |
| Suffixed name can exceed the 80-character limit (edge) | false | rejected | `uniqueFlashcardName` truncates the base (fixed in 2.7, tested). |
| Cancel blocked while request hangs; `onSuccess` after unmount (edge) | low | rejected | Same pattern as the delete modals; no timeout machinery exists elsewhere. |

## Verification

**Commands:**
- `npm run typecheck` and `npm run lint` -- expected: clean
- `npx vitest run` -- expected: all pass
- `npx playwright test` (with `DATABASE_URL` and `BETTER_AUTH_SECRET` from `apps/web/.env.local`) -- expected: api and e2e pass

**Manual checks:**
- Screenshots of the Move modal and the Flashcard row menu in dark and light.
