---
title: 'Delete a Card'
type: 'feature'
created: '2026-11-10'
status: 'done'
baseline_commit: 'c8164b0daa6e0782a47b1c7b4add84d504dd7fe0'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-4-edit-a-card.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/DESIGN.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/EXPERIENCE.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/.working/design-dna-profile.json'
  - '{project-root}/.claude/skills/design-dna/references/generation-guide.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A stale or duplicate Card can only be hidden by ignoring it; there is no way to remove it (FR-5).

**Approach:** Add `DELETE /api/cards/[id]` that removes the Card and, through the existing `onDelete: Cascade`, both its Scheduling Records. Add a "Delete" action on each Card row that opens a small confirmation modal (Cancel, and a danger "Delete card").

## Boundaries & Constraints

**Always:**
- Handler calls `requireSession`, scopes to the session user; a foreign or unknown Card id returns `404`. Success returns `200` `{data: {id}}` (AD-10 envelope).
- Deleting a Card removes the Card row and both its Scheduling Records in one statement (schema cascade `SchedulingRecord.card → onDelete: Cascade`); no orphaned records. A deleted Card is in no due queue afterwards (queue reads Scheduling Records, which no longer exist).
- Confirmation modal names the Card's Term, states that its scheduling history is deleted too and that this cannot be undone, and offers "Cancel" (default focus) and "Delete card" (secondary-danger style, not accent). Escape and Cancel close without deleting.
- On success the modal closes, the row is removed from the cached `["folder", id]` data at once and the query is refetched; the `["class-folders"]` and `["classes"]` count queries are invalidated; focus moves to the next row's Delete/Edit control, or the Add cards button when none remain.
- On error (network, 5xx) the modal stays open with an inline message and the Card remains. On `404` the Card is already gone: treat it as success for the list (refresh, close).
- UI uses DESIGN.md tokens via `globals.css`, the Design DNA `design_style` and the anti-generic rules; reuse `Modal`, `buttonSecondary`, danger button classes already used by folder and class delete. The Delete control is a quiet secondary control beside Edit.

**Never:**
- No bulk delete, no undo or soft delete, no move of Cards (2.6), no schema change or migration, no Server Actions, no new dependencies, no change to Folder or Class delete cascades.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Delete a Card | `DELETE /api/cards/:id`, own Card | `200` `{data:{id}}`; Card and both Scheduling Records gone; other Cards in the Folder untouched | N/A |
| Due queue | Card was due today | Not returned by any due-queue read after delete | N/A |
| Foreign or unknown id | Other user's or missing id | `404`, nothing deleted | N/A |
| Already deleted | Second `DELETE` of same id | `404` | UI treats as success |
| Unauthenticated | No session | `401` | N/A |
| Last Card in Folder | Delete only Card | Folder page shows the empty state with Add cards | N/A |
| Server failure | `5xx` | Modal stays open with message; Card still listed | Inline error |

</frozen-after-approval>

## Code Map

- `apps/web/app/api/cards/[id]/route.ts` -- add `DELETE` beside PATCH; `prisma.card.deleteMany({where:{id,userId}})`, `count === 0` → `404`. Patterns: `requireSession`, `ok`, `fail` from `lib/api-response.ts`; folder `DELETE` in `app/api/folders/[id]/route.ts`.
- `packages/db/schema.prisma` -- `SchedulingRecord.card` already `onDelete: Cascade` (line ~167); do not change.
- `apps/web/app/(shell)/folders/[id]/delete-card-modal.tsx` -- new: confirm modal. Reuse `Modal`, `buttonSecondary`, the danger button class from `classes/ui.ts` / `delete-class-modal.tsx`.
- `apps/web/app/(shell)/folders/[id]/folder-detail-view.tsx` -- `CardRow` gains a Delete button next to Edit; view holds `deleting: CardSummary | null`; refocus logic.
- `tests/api/cards.spec.ts`, `tests/e2e/cards.spec.ts` -- extend; patterns exist in each.

## Tasks & Acceptance

**Execution:**
- [x] `apps/web/app/api/cards/[id]/route.ts` -- `DELETE` handler with 404 scoping -- every matrix row
- [x] `apps/web/app/(shell)/folders/[id]/delete-card-modal.tsx`, `folder-detail-view.tsx` -- Delete button, confirm modal, cache update, count invalidation, focus management
- [x] `tests/api/cards.spec.ts` -- delete removes Card and both Scheduling Records (query DB), siblings untouched, cross-user `404` and Card intact, second delete `404`, `401`
- [x] `tests/e2e/cards.spec.ts` -- Delete via keyboard, Cancel and Escape keep the Card, confirm removes the row and count, last Card shows empty state, light and dark screenshots of the modal

**Acceptance Criteria:**
- Given an existing Card, when I confirm Delete, then the Card disappears from the Folder page, both its Scheduling Records are removed, and it is in no due queue.
- Given the confirmation modal, when I press Cancel or Escape, then nothing is deleted.
- UI conforms to DESIGN.md tokens and the Design DNA design_style; passes the anti-generic UI rules; checked against a screenshot in both dark and light themes.

## Implementation Notes

## Spec Change Log

## Review Triage Log

| Finding | Verdict | Route | Evidence |
|---|---|---|---|
| Server-failure (5xx) and 404-as-success UI branches untested (matrix rows) | medium | patch | Matrix rows "Server failure" and "Already deleted" had only API coverage; added e2e test with `page.route` for 500 and a 404 after an out-of-band delete. |
| `findIndex` returns -1 when the Card already left the list, so no focus target | low | patch | `deletes[-1]` is undefined; clamped with `Math.max(0, ...)`. |
| Class/folder counts refresh not asserted after delete | low | rejected | Same invalidation pattern as add-cards, already deferred in 2.3; fix is a new navigation test. |
| rAF focus timing, double rAF / effect-based focus | low | rejected | e2e passes consistently; alternatives add complexity. |
| `setQueryData` vs in-flight refetch can briefly resurrect the row | low | rejected | The follow-up invalidate refetches the true state; transient only. |
| No try/catch around `deleteMany` | false | rejected | PATCH and sibling routes also let DB errors surface; not a regression. |
| No timeout/AbortController, modal trapped while request hangs | low | rejected | Fix adds machinery; no such pattern elsewhere. |
| 404 treated as success without checking `code` | low | rejected | Same API only returns NOT_FOUND for this route; fix adds a branch. |
| Due-queue assertion is a DB count, not a queue read | false | rejected | No due-queue endpoint exists until Epic 4; Scheduling Records are the queue's source. |
| Escape focus-return not asserted before next step | low | rejected | Cosmetic test hardening; test passes. |
| Edit and Delete as inline text buttons vs overflow menu; no error colour on Delete | low | rejected | Same design interpretation accepted in 2.4; 2.6 decides row-action placement. |
| `buttonDanger` not defined in diff | false | rejected | Existing export in `classes/ui.ts`, used by delete-class-modal; typecheck clean. |
| `addRef` on two buttons never co-mounted | false | rejected | Branches are mutually exclusive on `empty`. |
| Stale tab deleting a moved Card, no id-format validation, aria-busy, live region, touch target, screenshots assert nothing, mobile layout | low | rejected | Cosmetic or out of intent; fixes add branches or new surface. |

## Verification

**Commands:**
- `npm run typecheck` and `npm run lint` -- expected: clean
- `npx vitest run` -- expected: all pass
- `npx playwright test` -- expected: api and e2e pass

**Manual checks:**
- Screenshots of the delete confirmation and the Folder page row actions in dark and light.
