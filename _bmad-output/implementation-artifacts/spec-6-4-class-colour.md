---
title: 'Story 6.4: Class Colour'
type: 'feature'
created: '2026-11-14'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '5f114e1273950f4d12076053f70a4f84df4ecdac'
context:
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/DESIGN.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/EXPERIENCE.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/.working/design-dna-profile.json'
  - '{project-root}/.claude/skills/design-dna/references/generation-guide.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Class, Folder and Flashcard tiles take a tint from their list position, which carries no meaning and changes when the list changes, so users cannot tell their material apart at a glance.

**Approach:** Give each Class one of five colours (lavender, sky, mint, butter, rose), stored on `Class.color`. Its own tile, its Folder tiles and its Flashcard tiles use that colour's tint. The colour is picked in the create and rename modals and changed from the Class "..." menu (Colour). UI conforms to DESIGN.md tokens and the Design DNA design_style, passes the anti-generic UI rules, and is checked against a screenshot in both dark and light themes.

## Boundaries & Constraints

**Always:** `color` is validated by Zod as one of the five values on create and update (AD-6). A new Class defaults to the next colour in order (lavender, sky, mint, butter, rose, then repeat), by the number of the user's existing Classes. The migration is additive, gives existing Classes a colour by creation order per user, never leaves null, and is deployed to Neon with the code. The Class name and breadcrumb stay the primary cue; colour is never the only cue. Tint tokens come from the existing `tint-*` tokens in `globals.css`.

**Never:** No change to Folder or Flashcard schema. No backup export or restore code (Stories 5.2 and 5.3 carry it and read `color`). No hard-coded hex. No decorative use of the colour beyond the tiles.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Create, no colour sent | POST `{name}`, user has 2 Classes | Class gets the 3rd colour (mint) | N/A |
| Create with colour | POST `{name, color:"ROSE"}` | Stored as given | N/A |
| Rename only | PATCH `{name}` | Name changes, colour unchanged | N/A |
| Change colour | PATCH `{color}` | Colour changes, name unchanged; Class, Folder and Flashcard tiles show it | N/A |
| Invalid colour | `color:"RED"` | Rejected | 400 VALIDATION_ERROR with `fields.color` |
| Empty PATCH | `{}` | Rejected | 400 VALIDATION_ERROR |
| Foreign Class | PATCH colour on another user's Class | No change | 404 NOT_FOUND |

</frozen-after-approval>

## Code Map

- `packages/db/schema.prisma` -- `model Class` (line ~116): add `enum ClassColor` and `color ClassColor`.
- `packages/db/migrations/20261114000000_add_study_directions/migration.sql` -- pattern for an additive enum migration; new migration `20261115000000_add_class_color` adds the enum, the column with a temporary default, backfills by `ROW_NUMBER() OVER (PARTITION BY "userId" ORDER BY "createdAt", id) % 5`, then drops the default.
- `packages/domain/src/classes.ts` -- `createClassSchema`, `renameClassSchema`, `ClassSummary`: add `CLASS_COLORS`, `classColorSchema`, `nextClassColor(count)`, optional `color` on create, `name` and/or `color` (at least one) on update, `color` on `ClassSummary`.
- `packages/domain/src/folders.ts` (`ClassFoldersResponse.class`) and `flashcards.ts` (`FolderFlashcardsResponse.class`) -- add `color`.
- `apps/web/app/api/classes/route.ts` -- GET selects and returns `color`; POST counts the user's Classes for the default.
- `apps/web/app/api/classes/[id]/route.ts` -- PATCH: update only supplied fields, return `color`.
- `apps/web/app/api/classes/[id]/folders/route.ts` (line 24) and `apps/web/app/api/folders/[id]/flashcards/route.ts` (line 30), `apps/web/app/api/folders/[id]/route.ts` (line 43) -- select `color` on the class.
- `apps/web/app/components/ui.ts` -- `tintAt(index)` (line 55): add `tintFor(color)`; keep `tintAt` only if still used.
- `apps/web/app/(shell)/classes/class-form-modal.tsx` -- five-swatch picker (radio group, visible focus, name label); default is the next colour on create.
- `apps/web/app/(shell)/classes/class-row.tsx`, `classes-view.tsx`, `[id]/class-detail-view.tsx` (`FolderRow` line 175), `folders/[id]/folder-detail-view.tsx` (`FlashcardRow` line 215) -- use the Class colour; add the Colour item to the Class "..." menu (opens the same modal focused on the swatches, or a small colour modal).
- `tests/api/classes.spec.ts`, `tests/domain/classes.test.ts`, `tests/e2e/classes.spec.ts` -- extend; existing 138 e2e tests must still pass.

## Tasks & Acceptance

**Execution:**
- [x] `packages/db/schema.prisma` + new migration -- enum, column, ordered backfill -- additive, no nulls
- [x] `packages/domain/src/classes.ts` (+ folders, flashcards types) -- colour schema, `nextClassColor`, summary types -- single validation source
- [x] Class, Folder and Flashcard route handlers -- accept, default and return `color` -- AD-6
- [x] `ui.ts`, class modal, Class row and menu, Folder and Flashcard tiles -- picker and colour-driven tints -- UX-DR22
- [x] `tests/domain/classes.test.ts`, `tests/api/classes.spec.ts`, `tests/e2e/classes.spec.ts` -- cover the I/O matrix, backfill order, tile colours
- [x] Deploy the migration to Neon; update DESIGN.md and EXPERIENCE.md notes on Class colour

**Acceptance Criteria:**
- Given the Class create modal, when it opens, then five colour swatches show and the next colour in order is selected.
- Given an existing Class, when I choose Colour from its "..." menu or rename it, then I can change its colour and its Class, Folder and Flashcard tiles show the new colour at once.
- Given Classes that existed before this story, when the migration has run, then each has a colour by creation order and nothing else changed.
- Given the Class name and breadcrumb, then they remain visible and colour is never the only cue.
- Given UI changes, then they conform to DESIGN.md tokens and the Design DNA design_style, pass the anti-generic UI rules, and were checked against a screenshot in both dark and light themes.

## Implementation Notes

**Done (2026-11-14):** `Class.color` enum and migration `20261115000000_add_class_color` (ordered per-user backfill, deployed to Neon); domain `CLASS_COLORS`, `classColorSchema`, `nextClassColor`; class, folder and flashcard routes return `color`; swatch picker in the Class modal, Colour menu item, `tintFor(color)` for all three tile levels; DESIGN.md and EXPERIENCE.md updated. Verified: typecheck, lint, vitest 246, api 138, e2e 139.

## Spec Change Log

## Review Triage Log

- Stale Folder/Flashcard caches after colour change (medium): real; fixed by invalidating `class-folders` and `folder` queries.
- Backfill SQL untested (medium): real; fixed with `tests/api/class-color-backfill.spec.ts`.
- Folder/Flashcard tint and `class.color` not asserted (medium): real; fixed in API and e2e tests.
- PATCH 500 if Class deleted mid-request (low): real; fixed, now 404.
- Swatch hover, stale comment, schema enum placement (low): real; fixed.
- Stale modal state overwrites, client default from cache, concurrent default colour, editable name in "Class colour" modal, `updateClassSchema` alias, empty-path refine error, extra screenshot steps (low): rejected; unlikely and the fix adds complexity.
- Required `color` with no default (false): intended, never null per spec.
- autoFocus vs dialog focus trap (maybe-false): would be low; rejected.

## Verification

**Commands:**
- Run typecheck, lint, vitest and Playwright as in the "Run tests in PowerShell" memory -- expected: clean, all existing and new tests pass
- `prisma migrate deploy` against Neon -- expected: migration applied, dev server pages return 200
