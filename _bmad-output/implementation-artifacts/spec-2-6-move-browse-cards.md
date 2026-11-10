---
title: 'Move & Browse Cards'
type: 'feature'
created: '2026-11-10'
status: 'done'
baseline_commit: '6ab1c42320bd6bb3701124fb91f0b702452664c4'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-5-delete-a-card.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/DESIGN.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/EXPERIENCE.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/.working/design-dna-profile.json'
  - '{project-root}/.claude/skills/design-dna/references/generation-guide.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A Card cannot be reorganized once created; it stays in the Folder it was added to (FR-6). Browsing (Classes view with counts, Class page, Folder page with breadcrumb and Card rows) already exists from 2.1–2.5 and must keep working.

**Approach:** Add `POST /api/cards/[id]/move` that re-parents a Card to a target Folder in any of the user's Classes. Add a "Move" action on each Card row that opens a modal with the existing Class → Folder picker.

## Boundaries & Constraints

**Always:**
- Handler calls `requireSession` and scopes both the Card and the target Folder to the session user. Body `{folderId}` is validated with Zod. Unknown or foreign Card → `404` "Card not found."; unknown or foreign Folder → `404` "Folder not found." Success `200` `{data: {id, folderId}}` (AD-10 envelope).
- A Card always ends in exactly one Folder. Moving updates `Card.folderId` only: Scheduling Records, Card text and `createdAt` are untouched. Moving to the Card's current Folder is a successful no-op.
- Modal shows the Card's Term, the Class and Folder pickers (reuse `FolderPicker` from `add-cards-panel.tsx`, extended with optional props: preselect the current Class, exclude the current Folder, skip last-used restore). "Move card" (primary) is disabled until a Folder is chosen; "Cancel" has default focus; Escape and Cancel close without moving.
- On success: close, remove the row from cached `["folder", id]` data, invalidate `["folder", id]`, `["folder", targetId]`, `["class-folders"]` and `["classes"]`; move focus as 2.5 does after delete. On `404` Card: treat as gone (refresh, close). On other errors the modal stays open with an inline message.
- Hierarchy stays Class → Folder → Card; add no UI or API that nests Folders or Classes.
- UI uses DESIGN.md tokens via `globals.css`, the DNA `design_style` and the anti-generic rules; reuse `Modal`, `buttonPrimary`, `buttonSecondary`. "Move" is a quiet control beside Edit and Delete.

**Never:**
- No bulk move, drag-and-drop, undo, schema change or migration, Server Actions, new dependencies, or change to Folder/Class delete cascades or the Add cards flow behavior.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Move within Class | Own Card, other Folder of same Class | `200`; Card leaves old Folder list, appears in new; counts update | N/A |
| Move across Classes | Own Card, Folder in another Class | `200`; same; Class card counts both change | N/A |
| Scheduling intact | Any successful move | Both Scheduling Records unchanged, same `cardId` | N/A |
| Same Folder | `folderId` equals current | `200`, no change | N/A |
| Foreign/unknown Card | Other user's or missing id | `404`, nothing changed | N/A |
| Foreign/unknown Folder | Other user's or missing `folderId` | `404`, Card stays | N/A |
| Invalid body | Missing or non-string `folderId`, bad JSON | `400` validation / `INVALID_JSON` | N/A |
| Unauthenticated | No session | `401` | N/A |
| Last Card moved out | Only Card in Folder | Folder page shows empty state with Add cards | N/A |
| Server failure | `5xx` | Modal stays open with message; Card still listed | Inline error |

</frozen-after-approval>

## Code Map

- `apps/web/app/api/cards/[id]/move/route.ts` -- new `POST`; `prisma.folder.findFirst({id: folderId, userId})` then `prisma.card.updateMany({where:{id,userId}, data:{folderId}})`, `count === 0` → 404. Patterns: `app/api/cards/[id]/route.ts`, `lib/api-response.ts` (`requireSession`, `ok`, `fail`, `readJson`, `validationFailure`).
- `packages/domain/src/cards.ts` -- add `moveCardSchema` (`{folderId: non-empty string}`) and `MoveCardResponse`; export from the package index. Framework-free.
- `apps/web/app/(shell)/folders/[id]/add-cards-panel.tsx` -- export `FolderPicker`; add optional `initialClassId`, `excludeFolderId`, `restoreLast` (default true keeps current behavior).
- `apps/web/app/(shell)/folders/[id]/move-card-modal.tsx` -- new, modeled on `delete-card-modal.tsx`.
- `apps/web/app/(shell)/folders/[id]/folder-detail-view.tsx` -- `CardRow` gains a Move button (`data-card-move`); view holds `moving: CardSummary | null`; reuse the post-removal focus logic from delete. Update the "move is 2.6" comment.
- `tests/api/cards.spec.ts`, `tests/e2e/cards.spec.ts`, `tests/domain/cards.test.ts` -- extend; patterns exist.
- Do not change: `packages/db/schema.prisma`, delete cascades, `classes-view.tsx` and `class-detail-view.tsx` (browsing already meets the AC).

## Tasks & Acceptance

**Execution:**
- [x] `packages/domain/src/cards.ts` (+ index export), `tests/domain/cards.test.ts` -- `moveCardSchema`, response type, schema tests -- validation
- [x] `apps/web/app/api/cards/[id]/move/route.ts` -- POST with user-scoped Card and Folder checks -- every matrix row
- [x] `add-cards-panel.tsx`, `move-card-modal.tsx`, `folder-detail-view.tsx` -- parametrize and export picker, Move button, modal, cache updates, focus
- [x] `tests/api/cards.spec.ts` -- same-Class and cross-Class move, Scheduling Records unchanged (query DB), same-Folder no-op, cross-user Card and Folder `404`, bad body `400`, `401`, Class counts via `GET /api/classes`
- [x] `tests/e2e/cards.spec.ts` -- Move via keyboard, Cancel and Escape keep the Card, move across Classes shows the Card in the target Folder and removes the row, last Card shows empty state, 5xx keeps the modal open, light and dark screenshots of the modal

**Acceptance Criteria:**
- Given an existing Card, when I move it to another Folder (same or another Class), then it leaves the old Folder's list and appears in the new one, in exactly one Folder.
- Given a Folder, when I open it, then I see its Cards as rows with breadcrumb "Classes / {Class} / {Folder}"; and the Classes view shows every Class with its Folder and Card counts, with no way to nest Folders or Classes.
- UI conforms to DESIGN.md tokens and the Design DNA design_style; passes the anti-generic UI rules; checked against a screenshot in both dark and light themes.

## Implementation Notes

## Spec Change Log

## Review Triage Log

| Finding | Verdict | Route | Evidence |
|---|---|---|---|
| Modal tells Folder 404 from Card 404 by matching message text (blind, edge, gap) | medium | patch | Reworded server text would close the modal on a missing Folder; route now returns code `FOLDER_NOT_FOUND`, modal checks `err.code`, API test asserts the code. |
| Move 404 branches ("Folder not found" keeps modal, "Card not found" closes) untested in e2e (gap) | medium | patch | Added mocked-404 e2e test covering both branches. |
| Class whose only Folder is the current one shows an empty Folder dropdown with no hint (edge) | low | patch | Placeholder now reads "No other folders in this class"; trivial fix, common for new users with only Unsorted. |
| Folder deleted between check and `updateMany` gives an unhandled FK 500 (blind, edge, gap) | low | rejected | Narrow race; PATCH and DELETE routes also let DB errors surface; fix adds a try/catch pattern used nowhere else. |
| Focus handoff to next row's Move button untested with 2+ cards (gap) | low | rejected | Same effect covers delete, whose multi-card focus is tested; test-only hardening. |
| `initialClassId` stale or localStorage overwritten when `restoreLast=false` (edge, blind) | false | rejected | `initialClassId` is the open Folder's own Class; the picker never writes localStorage (only AddCardsPanel does). |
| `pendingFocus` lost if effect runs before cache removal (edge) | false | rejected | Update and tick are batched in one commit; the focus tests pass 33/33. |
| Escape ignored while move is pending (edge) | low | rejected | Same behavior as delete modal; avoids an orphaned request. |
| Third inline row button vs DESIGN.md overflow menu (design) | low | rejected | Extends the Edit/Delete decision accepted in 2.4 and 2.5; no new deviation. |
| Cache invalidation, aria-live, "Moving" ellipsis, unused `MoveCardInput`, ignored `onMoved` arg, screenshot assertions, 5xx row assertion (blind, edge) | low | rejected | Cosmetic or consistent with 2.5; fixes add machinery. |

## Verification

**Commands:**
- `npm run typecheck` and `npm run lint` -- expected: clean
- `npx vitest run` -- expected: all pass
- `npx playwright test` -- expected: api and e2e pass

**Manual checks:**
- Screenshots of the Move modal and Folder page row actions in dark and light.
