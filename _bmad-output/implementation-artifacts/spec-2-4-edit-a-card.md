---
title: 'Edit a Card'
type: 'feature'
created: '2026-11-09'
status: 'done'
baseline_commit: '6b21f4060082aced2868ac5f8884a591eb832bac'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-3-add-cards-manual-mode.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/DESIGN.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/EXPERIENCE.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/history/focus-indigo/working/design-dna-profile.json'
  - '{project-root}/.claude/skills/design-dna/references/generation-guide.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Cards on the Folder page are read-only, so a typo or a weak definition means deleting and recreating the Card (FR-4).

**Approach:** Add `PATCH /api/cards/[id]` that replaces a Card's five text fields, and an "Edit" action on each Card row that opens a modal form (Term, Definition, plus Example, Context/Collocation, Part of Speech) reusing the shared `cardInputSchema`.

## Boundaries & Constraints

**Always:**
- Handler calls `requireSession`, validates the body with the shared `cardInputSchema` (AD-6), returns AD-10 envelopes (`{data: CardSummary}`; validation errors via `fields`, never `details`), scopes to the session user; a foreign or unknown Card id returns `404`.
- The update writes only Card text columns. It never reads, creates, updates or deletes Scheduling Records, and never changes `folderId` or `createdAt`.
- Same field rules as 2.3: Term and Definition required, trimmed, non-empty; the rest optional (blank stored as `null`); only trim, never normalize Unicode; same max lengths.
- Modal opens prefilled with the Card's current values (optional fields expanded when non-empty). Client validates first and shows field-level errors; on a server `fields` error it shows those too. On any error the modal stays open with the typed values, and the Card on the page keeps its previous values.
- On success the modal closes and `["folder", id]` is refreshed so the row shows the new values immediately; focus returns to the row's Edit button. Closing with unsaved changes asks before discarding (same pattern as the Add cards panel).
- UI uses DESIGN.md tokens via `globals.css`, the Design DNA `design_style` and the anti-generic rules; reuse `Modal`, shared button/input classes and the `manual-row` underlined field style. The Edit control is a quiet secondary control on the row, not accent-colored.

**Never:**
- No delete or move of Cards (2.5, 2.6), no bulk or inline-in-row editing, no schema change or migration, no Server Actions, no new dependencies, no change to Scheduling Records or to the batch endpoint.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Edit fields | `PATCH /api/cards/:id` with valid fields | `200` `{data: CardSummary}` with new values; Folder page shows them | N/A |
| Clear optional field | `example: ""` | Stored as `null` | N/A |
| Clear Term or Definition | Empty or whitespace | `400` `fields.term` / `fields.definition`; row unchanged; modal keeps typed values | Inline field error |
| Over-length field | Term over 200 chars | `400` with `fields`; nothing changed | Inline field error |
| Scheduling Records | Any successful edit | Both records identical before and after (ease, repetitions, interval, nextReviewDate, direction) | N/A |
| Unicode | `/ˈkɒl.ə.keɪt/`, `café`, `日本語` | Stored and rendered unchanged | N/A |
| Foreign or unknown Card | Other user's id | `404`, nothing changed | N/A |
| Unauthenticated | No session | `401` | N/A |
| Malformed JSON | Body not JSON | `400 INVALID_JSON` | N/A |

</frozen-after-approval>

## Code Map

- `apps/web/app/api/cards/[id]/route.ts` -- new PATCH. Use `prisma.card.updateMany({where:{id,userId}})` then re-read, or `findFirst` + `update`; text columns only. Patterns: `app/api/classes/[id]/route.ts` PATCH, `lib/api-response.ts` (`fail`, `ok`, `readJson`, `validationFailure`).
- `packages/domain/src/cards.ts` -- reuse `cardInputSchema`, `CardSummary`; add `updateCardSchema = cardInputSchema` alias only if it reads clearer; no other change. Barrel already exports.
- `apps/web/app/(shell)/folders/[id]/edit-card-modal.tsx` -- new: modal form, five fields, dirty-discard prompt. Reuse `Modal`, `buttonPrimary`, `buttonSecondary`, `fieldErrorClass`, `overlineClass`; export `underlineInput` from `add-cards-panel.tsx` (currently module-private) rather than duplicating it.
- `apps/web/app/(shell)/folders/[id]/folder-detail-view.tsx` -- `CardRow` gains an Edit button and the view holds the `editing: CardSummary | null` state; invalidate `["folder", folderId]` on success (also `["class-folders"]` is unaffected: counts do not change).
- `tests/domain/cards.test.ts`, `tests/api/cards.spec.ts`, `tests/e2e/cards.spec.ts` -- extend; patterns exist in each.

## Tasks & Acceptance

**Execution:**
- [ ] `apps/web/app/api/cards/[id]/route.ts` -- PATCH replacing the five fields, 404 scoping, field-level validation -- every matrix row
- [ ] `apps/web/app/(shell)/folders/[id]/edit-card-modal.tsx`, `add-cards-panel.tsx` (export style), `folder-detail-view.tsx` -- Edit button, prefilled modal, validation, discard prompt, refresh and focus return
- [ ] `tests/api/cards.spec.ts` -- edit, clear optional, clear required, over-length, Unicode, Scheduling Records unchanged (compare snapshot before/after), cross-user `404`, `401`, bad JSON
- [ ] `tests/e2e/cards.spec.ts` -- open Edit, change fields with keyboard, save and see the row update, clear Term shows an error and the row keeps old text, discard prompt, light and dark screenshots
- [ ] `tests/domain/cards.test.ts` -- only if the domain file changes

**Acceptance Criteria:**
- Given a Card on the Folder page, when I change any field and press Save, then the row shows the new values immediately and its Scheduling Records are unchanged.
- Given the edit modal, when I clear Term or Definition and save, then a field-level error shows, nothing is sent or saved, and the previous values stay on the page.
- UI conforms to DESIGN.md tokens and the Design DNA design_style; passes the anti-generic UI rules; checked against a screenshot in both dark and light themes.

## Implementation Notes

## Spec Change Log

## Review Triage Log

| Finding | Verdict | Route | Evidence |
|---|---|---|---|
| Row shows stale text after Save until refetch (edit-card-modal) | medium | patch | onSuccess only invalidated; now patches the cached row with `setQueryData` first. |
| Card list stays stale after a 404 on Save | medium | patch | Modal stayed open and the deleted Card kept showing; 404 now invalidates the folder query. |
| No test for Escape with unsaved changes | medium | patch | Wiring `Modal onClose={onClose}` would pass every test; e2e now presses Escape and asserts the discard prompt. |
| Server `fields` / 404 error branches have no UI test | low | defer | Server contract is covered by API tests; only the thin client mapping is unexercised (needs `page.route`). |
| Enter submits while discard prompt shows | false | rejected | Save button is unmounted then; a form with two text fields and no submit button has no implicit submission. |
| Zod issue path not one of the five fields | false | rejected | `cardInputSchema` is an object of exactly those fields, so `path[0]` is always one of them. |
| 5xx shows raw `err.message` | false | rejected | Messages come from the server's own AD-10 envelope text, not internals. |
| Escape while prompt is open does nothing visible | low | rejected | Harmless no-op; fix adds a branch. |
| No-op save still sends PATCH | low | rejected | Harmless; fix adds a branch. |
| Dirty check compares raw, not trimmed | low | rejected | Cosmetic; worst case is an extra prompt. |
| Response built from input, no try/catch around the update | low | rejected | Writes the same values; sibling routes also let DB errors surface. |
| Stale `editing` snapshot, last write wins | low | rejected | Single-user data; no conflict model in scope. |
| Edit button hybrid shape, no overflow menu | low | rejected | Design interpretation; 2.5/2.6 will decide placement. |
| Discard styled secondary, not danger | low | carried | Same as the 2.3 triage: rejected there. |
| a11y label length, touch target, rAF not cancelled, `underlineInput` export coupling, screenshot tests without assertions, e2e getByText fragility, extra invalidation keys | low | rejected | Cosmetic or out of intent; fix is more than a direct correction. |

## Design Notes

Why a modal rather than inline editing: the Card row is a two-column Term/Definition layout that the Quizlet-style Folder page keeps calm; five fields with per-field errors and a discard guard fit the existing `Modal` pattern better than expanding the row, and the modal reuses the underlined `manual-row` field look from Add cards.

## Verification

**Commands:**
- `npm run typecheck` and `npm run lint` -- expected: clean
- `npx vitest run` -- expected: all pass
- `npx playwright test` -- expected: api and e2e pass

**Manual checks:**
- Screenshots of the edit modal (prefilled, and with a field error) and the updated Card row in dark and light.
