---
title: 'Folder CRUD inside a Class'
type: 'feature'
created: '2026-11-08'
status: 'done'
baseline_commit: 'c22ecaf7e187239d4adf5043b7261ec6da07aadb'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-Web_TrainingSanctum-2026-11-01/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/DESIGN.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/EXPERIENCE.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/history/focus-indigo/working/design-dna-profile.json'
  - '{project-root}/.claude/skills/design-dna/references/generation-guide.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A Class has an Unsorted Folder but a user cannot see its Folders, create more, or rename or delete them, and Class rows lead nowhere (FR-5, second half).

**Approach:** Add a Class detail page at `/classes/[id]` (breadcrumb, Folder rows with card counts, create, rename and delete modals), the Folder Route Handlers behind it, and link Class rows to it.

## Boundaries & Constraints

**Always:**
- Every handler calls `requireSession`, validates with Zod (AD-6), returns AD-10 envelopes, and scopes queries to the session user. A foreign or unknown Class or Folder id returns `404`.
- Folder names are trimmed, 1 to 80 characters, and unique within their Class, compared case-insensitively. This covers "Unsorted", so a clash returns `400` with `fields.name`.
- The Unsorted Folder cannot be renamed or deleted: its row shows no "..." menu, and the server rejects both with `400`.
- Folder delete runs in one `$transaction` (AD-11) and logs one structured line (operation, mode, card count, outcome). "Move cards to Unsorted" (default) moves the Folder's Cards into the same Class's Unsorted Folder; "Delete cards too" removes the Folder, its Cards and their Scheduling Records.
- Pure rules (name schema, clash check) live in `packages/domain`; the UI may import the Zod schemas (AD-1).
- UI uses DESIGN.md tokens via `globals.css`, the Design DNA `design_style` and the anti-generic rules. Reuse the existing `Modal`, row-menu pattern, `PageHeader`, `SectionMarker` and shared button classes.
- Folder create, rename and delete invalidate the `["classes"]` query so Class counts stay correct.

**Never:**
- No Folder page and no Folder row link (Story 2.6), no Card create, edit, move or delete (2.3 to 2.6), no "Review this class" button, no schema change or migration.
- No Server Actions, no new dependencies, no raw SQL, no nested Folders.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| List | `GET /api/classes/:id/folders` | `200`, `{class:{id,name}, folders[]}`, Unsorted first then by name, each with `cardCount` | Foreign or unknown Class: `404` |
| Create | `POST` same path `{name:"Weather"}` | `201`, Folder with `cardCount:0`, row appears at once | Blank, over 80 or clashing name: `400` `fields.name` |
| Rename | `PATCH /api/folders/:id {name}` on a custom Folder | `200`, new name shown | Unsorted: `400`; clash: `400` `fields.name`; foreign: `404` |
| Delete, move | `DELETE /api/folders/:id {mode:"move"}` | Cards now in the Class's Unsorted, Folder gone | Unsorted: `400`; any failure rolls back everything |
| Delete, cards | `{mode:"delete"}` | Folder, Cards and Scheduling Records removed | Unsorted: `400` |
| Empty Class | Only Unsorted exists | Unsorted row with "0 cards", no menu | N/A |
| Unauthenticated | No session | `401` envelope | N/A |

</frozen-after-approval>

## Code Map

- `packages/domain/src/classes.ts` -- has `UNSORTED_FOLDER_NAME`, `uniqueFolderName`, `classNameSchema`; pattern for the new file.
- `packages/domain/src/folders.ts`, `src/index.ts` -- new: `folderNameSchema`, `createFolderSchema`, `renameFolderSchema`, `deleteFolderSchema` (`move` | `delete`), `isFolderNameTaken`, `FolderSummary`, `ClassFoldersResponse`; export from the barrel.
- `apps/web/app/api/classes/[id]/folders/route.ts` -- new GET and POST. `app/api/folders/[id]/route.ts` -- new PATCH and DELETE. Patterns: `app/api/classes/route.ts`, `[id]/route.ts`; reuse `HttpError`, `fail`, `ok`, `readJson`, `validationFailure` from `lib/api-response.ts`.
- `apps/web/app/(shell)/classes/row-menu.tsx` -- new: the overflow menu extracted from `class-row.tsx` (keyboard, focus, Escape), taking its items as props; `class-row.tsx` uses it and its name becomes a link to `/classes/[id]`.
- `apps/web/app/(shell)/classes/[id]/page.tsx` plus client components -- detail view with breadcrumb "Classes / {Class}", `SectionMarker` "All folders", Folder rows, create and rename modal, delete modal. Reuse `../modal.tsx`, `../ui.ts`, `class-form-modal.tsx` and `delete-class-modal.tsx` as patterns.
- `apps/web/app/(shell)/sidebar.tsx` -- already marks Classes active on sub-paths; do not change.
- `tests/domain/`, `tests/api/`, `tests/e2e/` -- new specs; patterns: `tests/domain/classes.test.ts`, `tests/api/classes.spec.ts` (user helper, Prisma seeding), `tests/e2e/classes.spec.ts`.

## Tasks & Acceptance

**Execution:**
- [x] `packages/domain/src/folders.ts` + barrel -- schemas, clash check, response types -- AD-1, AD-6
- [x] `apps/web/app/api/classes/[id]/folders/route.ts`, `app/api/folders/[id]/route.ts` -- list, create, rename, delete (move and cards) with Unsorted guards and a log line -- every matrix row
- [x] `(shell)/classes/row-menu.tsx`, `class-row.tsx` -- extract the menu, link Class rows -- reuse, drill-in
- [x] `(shell)/classes/[id]/*` -- breadcrumb, Folder rows with counts, Unsorted without menu, create, rename and two-button delete modal (move primary, cards secondary danger), empty and error states, focus handling -- AC1 to AC5
- [x] `tests/domain/folders.test.ts` -- name rules and clash check
- [x] `tests/api/folders.spec.ts` -- every matrix row, cross-user `404`, Unsorted guards, atomic move and cascade including Scheduling Records, Class counts after changes
- [x] `tests/e2e/folders.spec.ts` -- open a Class, create, rename, delete both ways, Unsorted has no menu, light and dark screenshots

**Acceptance Criteria:**
- Given a Class, when its page opens, then Unsorted and the custom Folders show with card counts and the breadcrumb links back to Classes.
- Given a created or renamed Folder, then the list reflects it at once, and the Classes list shows the new Folder count.
- Given a Folder with Cards, when deleted with either choice, then the matrix outcome holds atomically and no Card is orphaned or silently lost.
- UI conforms to DESIGN.md tokens and the Design DNA design_style; passes the anti-generic UI rules; checked against a screenshot in both dark and light themes.

## Implementation Notes

Result: all tasks done by the implementation subagent. Typecheck, lint and Vitest clean per its report; Playwright api and e2e passed against the Neon dev database from `apps/web/.env.local`. Review patches applied: the create and rename modal ignores close while a save is pending, and a new API test forces a mid-transaction failure (Class without Unsorted, `mode:"move"`) and asserts rollback. Not re-screenshotted after the patch. Concurrent same-name creates can still both pass the check (no unique constraint; schema changes are out of scope).

## Spec Change Log

## Review Triage Log

- **medium, patch** — Create and rename modal can be dismissed mid-save (Blind, Edge): Escape and Cancel stay live while `save.isPending`, so a late success or error appears after the user believes the action was cancelled; the delete modal already blocks this.
- **medium, patch** — Atomic rollback of Folder delete is untested (Gap, Blind): no test forces a mid-transaction failure, so dropping `$transaction` would pass every test.
- **low, rejected** — Check-then-insert race can create duplicate Folder names (Blind, Edge, Gap): needs a unique index, and the frozen intent forbids schema changes; single-user product.
- **low, rejected** — PATCH rethrows non-`HttpError` and POST has no catch, so no envelope on unexpected failure (Blind, Edge): matches `/api/me` and Story 2.1's rejected finding; `apiFetch` degrades to a generic message.
- **low, rejected** — Invalid body on a foreign or unknown id returns 400 before 404 (Blind, Edge): same ordering as Story 2.1; no data exposed.
- **low, rejected** — Delete log lacks `cardCount` on rejected or failed lines, no `userId` (Blind, Edge): same as Story 2.1; success lines carry the count.
- **low, rejected** — 404 from a mutation after the Folder or Class vanished elsewhere leaves a stale row and error (Edge): rare in a single-user product; reload recovers.
- **low, rejected** — Delete modal has no Cancel button and does not say history is deleted (Blind): EXPERIENCE.md specifies exactly two buttons; Escape and backdrop close; the button label says cards are deleted.
- **low, rejected** — Focus lands on body after a delete, dialog vanishes if its Folder disappears, stale Unsorted count until refetch (Blind, Edge): same pattern as Story 2.1; the refetch converges at once.
- **low, rejected** — Unicode normalization and UTF-16 length in name checks (Blind, Edge): cosmetic, same as Story 2.1.
- **low, rejected** — `max-w-sm`, `animate-pulse` skeleton, hover on non-link Folder rows (Design): identical to the accepted Classes screen; the hover matches DNA hover_behavior and rows link in Story 2.6.
- **low, rejected** — `RowMenu` lacks Home/End and typeahead, only the Class name is a link, thin loading state, no page title, brittle `getByText` and assertion-free screenshot tests, unbounded list (Blind): same conventions as Story 2.1; no demonstrated harm.
- **false** — Spec bookkeeping inconsistent, tasks unchecked, no verification record (Blind): the reviewer read the diff mid-run; tasks are now checked and results are in Implementation Notes.

## Design Notes

The Folder routes live under `app/api/folders/**` for Folder-level calls and under the Class for list and create, matching the spine's "always under a Class" rule. Deleting a Folder never needs a target picker because the destination is fixed (the same Class's Unsorted), so the modal has two buttons and no typed-name gate, per EXPERIENCE.md.

## Verification

**Commands:**
- `npm run typecheck` and `npm run lint` -- expected: clean
- `npx vitest run` -- expected: all pass
- `npx playwright test` -- expected: api and e2e pass

**Manual checks:**
- Screenshots of the Class detail page (populated, empty custom list, delete modal) in dark and light.
