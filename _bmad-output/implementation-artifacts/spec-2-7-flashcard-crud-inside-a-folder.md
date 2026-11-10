---
title: 'Flashcard CRUD inside a Folder'
type: 'feature'
created: '2026-11-10'
status: 'done'
baseline_commit: '5f04f34ed8e5ebe6587b93c199b211074eb0fec3'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/sprint-change-proposal-2026-11-10.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/DESIGN.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/EXPERIENCE.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/.working/design-dna-profile.json'
  - '{project-root}/.claude/skills/design-dna/references/generation-guide.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The hierarchy is Class → Folder → Card, but the product needs Class → Folder → **Flashcard** → Card: a Flashcard is a named set of Cards inside a Folder. Without it a user cannot group Cards into sets.

**Approach:** Add a `Flashcard` model (name only) between Folder and Card, replace `Card.folderId` with `Card.flashcardId`, and add Flashcard create, rename and delete. The Folder page lists Flashcards; a new Flashcard page hosts the existing Card UI (add, edit, delete Cards). Existing cascades and counts are re-pointed so the app keeps working. Moving a Flashcard is the follow-up rework of story 2.6.

## Boundaries & Constraints

**Always:**
- Every Card is in exactly one Flashcard, every Flashcard in exactly one Folder. A Flashcard has only `name` (trimmed, 1–80 chars). Name is unique per Folder, case-insensitive; a clash on create or rename returns `400` with `fields.name`.
- All routes call `requireSession`, scope by `userId`, validate with Zod, use the `{data}` / `{error}` envelope; foreign or unknown ids return `404`.
- New routes: `GET /api/folders/[id]` returns `{folder, class, flashcards:[{id,name,cardCount}]}`; `POST /api/folders/[id]/flashcards` (`201`); `GET`, `PATCH`, `DELETE /api/flashcards/[id]`. `GET /api/flashcards/[id]` returns `{flashcard, folder, class, cards}` (the old folder-cards shape). `POST /api/cards/batch` takes `flashcardId` instead of `folderId`.
- Flashcard delete confirms in a modal naming the Flashcard and its Card count; it removes the Flashcard, its Cards and their Scheduling Records in one transaction and logs a one-line summary.
- Folder delete: "Move flashcards to Unsorted" (default) moves its Flashcards to the same Class's Unsorted Folder, a clashing name gets " (2)", " (3)"; "Delete flashcards too" removes them with Cards and Scheduling Records. Class delete: Unsorted Flashcards merge into the target Class's Unsorted with the same suffix rule; other Folders move with their Flashcards; delete-all removes everything. Each cascade stays one transaction.
- `ClassSummary` gains `flashcardCount`; `FolderSummary` gains `flashcardCount` (keeping `cardCount`). Class and Folder rows show Flashcard and Card counts.
- Folder page `/folders/[id]`: breadcrumb "Classes / {Class} / {Folder}", Flashcards as rows (click opens it; trailing "..." menu: Rename, Delete), "Create flashcard" primary button, empty state "Create a flashcard to start adding cards." Flashcard page `/flashcards/[id]`: breadcrumb "Classes / {Class} / {Folder} / {Flashcard}", the existing Card list, Add cards panel (target is always this Flashcard), Edit and Delete Card. The Card row has no Move.
- Migration: new Prisma migration deletes all `scheduling_records` and `cards` rows (test data, no data migration), creates `flashcards` (cuid id, `name`, `folderId`, `userId`, timestamps, cascade FK, unique `(folderId, lower(name))` via raw SQL like the existing partial index), drops `cards.folderId`, adds `cards.flashcardId NOT NULL` with cascade FK and index. Classes and Folders are kept.
- The migration wipes data on the Neon database from `apps/web/.env.local`. Run it there only after the human approves this spec at the checkpoint; that approval is the confirmation.
- UI uses DESIGN.md tokens via `globals.css`, the DNA `design_style` and the anti-generic rules; reuse `Modal`, `RowMenu`, row, button and form-modal patterns from the Class and Folder screens.

**Never:**
- No Move Flashcard, no Move Card (the 2.6 Move Card route, modal and tests are removed), no sub-flashcards, no extra Flashcard fields, no Server Actions, no new dependencies, no import-flow changes, no change to scheduling logic.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Create | Name "Weather idioms" in own Folder | `201`; listed with 0 cards | N/A |
| Duplicate name | Same name, any casing, same Folder | `400` `fields.name`, nothing created | Inline field error |
| Rename | New unique name | `200`; new name shown on both pages | Duplicate → `400` |
| Delete | Own Flashcard with Cards | `200`; Flashcard, Cards, Scheduling Records gone | N/A |
| Foreign or unknown | Other user's or missing id | `404`, nothing changed | N/A |
| Unauthenticated | No session | `401` | N/A |
| Add Cards | `POST /api/cards/batch` with `flashcardId` | Cards created with two Scheduling Records each | Unknown or foreign Flashcard → `404` |
| Folder delete, move | Folder with Flashcards, name clash in Unsorted | Flashcards land in Unsorted, clash renamed " (2)" | Atomic; failure leaves all rows |
| Folder delete, all | Delete mode | Flashcards, Cards, Scheduling Records removed | Atomic |
| Class delete, move | Source Unsorted has Flashcard named like target's | Merged into target Unsorted with " (2)" | Atomic |
| Empty Folder | No Flashcards | Empty state with Create flashcard | N/A |
| Counts | Class and Folder lists | Show Folder, Flashcard and Card counts | N/A |

</frozen-after-approval>

## Code Map

- `packages/db/schema.prisma`, new migration folder under `packages/db/migrations/` -- add `Flashcard`, `Card.flashcardId`; follow `20261108020000_add_class_folder_card` for raw SQL; run `npm run generate -w packages/db` after.
- `packages/domain/src/flashcards.ts` (+ `index.ts` export) -- `flashcardNameSchema`, create, rename, `FlashcardSummary`, `FolderFlashcardsResponse`, `FlashcardCardsResponse`, `isFlashcardNameTaken`, `uniqueFlashcardName` (mirror `folders.ts`, `uniqueFolderName`); `cards.ts` -- batch schema uses `flashcardId`, drop `MoveCard*`; `classes.ts`, `folders.ts` -- summary counts.
- `apps/web/app/api/folders/[id]/route.ts` -- GET returns Flashcards; PATCH and DELETE re-point (`flashcards` counts, cascade); `app/api/folders/[id]/flashcards/route.ts` -- new GET/POST; `app/api/flashcards/[id]/route.ts` -- new; `app/api/cards/batch/route.ts` -- `flashcardId`; `app/api/classes/route.ts`, `classes/[id]/route.ts`, `classes/[id]/folders/route.ts` -- counts and cascades via `flashcard`; delete `app/api/cards/[id]/move/`.
- `apps/web/app/(shell)/folders/[id]/` -- becomes the Flashcard list (`folder-detail-view.tsx` rewritten; modeled on `classes/[id]/class-detail-view.tsx`, `folder-form-modal.tsx`, `delete-folder-modal.tsx`); new `app/(shell)/flashcards/[id]/` receives the old card view, `add-cards-panel.tsx`, `edit-card-modal.tsx`, `delete-card-modal.tsx` (git mv); remove `move-card-modal.tsx`, Move button and the Folder picker/last-used code in the panel.
- `apps/web/app/(shell)/classes/**` -- Class and Folder rows and `delete-folder-modal.tsx` / `delete-class-modal.tsx` wording and counts ("flashcards").
- `tests/api/{cards,folders,classes}.spec.ts`, `tests/api/flashcards.spec.ts` (new), `tests/e2e/{cards,folders,classes}.spec.ts`, `tests/e2e/flashcards.spec.ts` (new), `tests/domain/*.test.ts` -- update and extend; seed helpers create Flashcards.
- Do not change: auth, shell, sidebar, theme, scheduling and `createCardWithSchedulingRecords`.

## Tasks & Acceptance

**Execution:**
- [x] `packages/db/schema.prisma` + migration, regenerate client -- Flashcard level, data reset -- matrix rows; apply to Neon only after approval
- [x] `packages/domain/src/*` and `tests/domain/*` -- flashcard schemas, name helpers, summaries, batch schema -- validation
- [x] `apps/web/app/api/**` -- flashcard routes, folders GET, cards batch, folder/class cascades and counts, remove Move Card route -- every matrix row
- [x] `apps/web/app/(shell)/**` -- Flashcard list page and modals, Flashcard page (moved Card UI), counts, wording; remove Move Card UI -- UI behavior
- [x] `tests/api/**` -- flashcard CRUD, name clash, cascades (move and delete, with ` (2)` renames), counts, cross-user `404`, `401`, batch with `flashcardId`
- [x] `tests/e2e/**` -- create, rename, duplicate error, delete confirm (Cancel and Escape keep it), open a Flashcard and add, edit, delete Cards, empty states, light and dark screenshots of the Flashcard list, Flashcard page and delete modal

**Acceptance Criteria:**
- Given the data model, when this story is complete, then a Flashcard level exists between Folder and Card and no Card references a Folder directly.
- Given a Folder, when I open it, then I see its Flashcards as rows with Card counts under the breadcrumb; and the Classes view and Folder list show Flashcard and Card counts.
- Given a Flashcard, when I open it, then I can add, edit and delete Cards in it, and deleting the Flashcard removes its Cards and Scheduling Records after confirmation.
- UI conforms to DESIGN.md tokens and the Design DNA design_style; passes the anti-generic UI rules; checked against a screenshot in both dark and light themes.

## Implementation Notes

Migration `20261110000000_add_flashcard` was applied to the Neon database after the human approved the data wipe. The e2e flow for the Folder page was fixed during verification (test navigated to the wrong page). Stories 2.2-2.6 remain rework items (2.6: Move Flashcard).

## Spec Change Log

## Review Triage Log

| Finding | Verdict | Route | Evidence |
|---|---|---|---|
| Racing duplicate Flashcard name passes the pre-check and hits the unique index, giving an unhandled 500 on create and rename (blind, edge, gap) | medium | patch | Create and rename now map Prisma `P2002` to the same `400` `fields.name` response (`lib/prisma-errors.ts`). |
| `uniqueFlashcardName` can exceed the 80-character limit after adding " (2)" (blind, edge) | medium | patch | Base name is truncated to fit; domain test added. |
| Flashcard delete modal leaves a stale row on `404` (edge) | low | patch | `404` now counts as already deleted: refresh and close, as in card delete. |
| Class rename response counts (`flashcardCount`, `cardCount`) unasserted (gap) | medium | patch | API rename test now seeds Folders, Flashcards and Cards and asserts counts. |
| Folder-page counts after card add/delete only checked after a full reload (gap) | medium | patch | E2E now returns to the Folder page through the breadcrumb, without reload, and asserts fresh counts. |
| No forced-failure rollback test for Flashcard DELETE (gap) | low | defer | Pattern copied from Folder delete, which is covered; recorded in deferred-work.md. |
| "Move to…" missing from Flashcard row menu; Move Card gone (design, blind, edge) | low | rejected | Spec "Never" list defers Move Flashcard to the 2.6 rework; Move Card retired on purpose. |
| Card rows use bordered cards, inline Edit/Delete, `px-5`, "i / total" counter, hover on non-link row (design) | low | rejected | Pre-existing from 2.3-2.5, only moved; not caused by this story. |
| Sequential updates in cascades vs 5 s transaction timeout; late-created Flashcard cascade-deleted mid Folder delete (blind, edge) | low | rejected | Single-user app with small data; fix adds locking or batching machinery. |
| Migration wipe has no guard or backfill (blind, edge) | false | rejected | The owner chose a wipe of test data and approved it at the checkpoint. |
| Duplicate `GET` folder routes, sort mutates cache, focus lost after Flashcard delete, modal unmounts if row vanishes, inconsistent error logging, `userId` consistency, no API versioning (blind, edge) | low | rejected | Same patterns as Folder delete and PATCH in earlier stories; cosmetic or machinery-heavy fixes. |
| Global Add cards path removed with the Folder picker (edge) | low | rejected | Intended by the spec; Epic 4's empty state reintroduces a Flashcard picker. |

## Verification

**Commands:**
- `npm run typecheck` and `npm run lint` -- expected: clean
- `npx vitest run` -- expected: all pass
- `npx playwright test` (with `DATABASE_URL` and `BETTER_AUTH_SECRET` from `apps/web/.env.local`, after the migration is applied) -- expected: api and e2e pass

**Manual checks:**
- Screenshots of the Flashcard list, the Flashcard page and the delete modal in dark and light.
