---
title: 'Reset a flashcard deck so Learn starts again from the first card'
type: 'feature'
created: '2026-11-19'
status: 'done'
baseline_commit: 'b1f752ab2045c731b4d61d6c83b891a24f600f42'
route: 'dispatch'
review_loop_iteration: 1
context:
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/DESIGN.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/EXPERIENCE.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/.working/design-dna-profile.json'
  - '{project-root}/.claude/skills/design-dna/references/generation-guide.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A learner who wants to relearn a deck from scratch cannot. Each card keeps its SM-2 schedule and learned marker, so Learn only offers due cards and never restarts at card one.

**Approach:** Add a Reset button beside "Learn" on the flashcard page. After a confirmation it returns every card of that deck to brand-new for the current learner, so the next Learn session starts at the first card.

**Decisions (agent, recorded):**
- **Per learner:** only the caller's Scheduling Records change. Owner and members both see Reset; no one else's progress is touched.
- **Both directions:** records for TERM_TO_DEFINITION and DEFINITION_TO_TERM are reset, whatever the study-directions setting says.
- **XP:** the ledger is untouched. Earned and claimed XP stays; unclaimed quest progress derived from live facts may drop.
- **Hidden when pointless:** Reset is disabled when no card of the deck has been graded.
- **First card (human decision):** "first card" is card 1/N on the deck page, and Learn after Reset starts there. To make both agree, the deck page and card viewer list cards oldest first (`createdAt asc, id asc`), matching Learn's existing order. Learn's queue order does not change.

## Boundaries & Constraints

**Always:**
- **Server:** `POST /api/flashcards/[id]/reset`, authorised with `requireClassAccess` (404 for strangers), in one `prisma.$transaction`, logged with `logOperation`.
- **Reset values:** `interval 0`, `repetitions 0`, `easeFactor 2.5`, `firstGradedAt null`, `nextReviewDate` today's local day in the user's timezone. Reuse the defaults of `createDefaultSchedulingRecords` rather than copying literals.
- **Confirm:** a modal copied from `delete-card-modal.tsx`: Cancel is autofocused, the danger button names the action, errors use `role="alert"`.
- **After success:** invalidate the flashcard query so the button reads "Learn · N new" and the learned marker clears.
- **UI:** uses DESIGN.md tokens only and passes the anti-generic UI rules. The accent stays on Learn; Reset is secondary.

**Never:** change `buildLearnQueue` ordering; touch `XpEvent`, `CultivationDay`, cards, or other users' records; add a schema migration; reset on a GET or without confirmation.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Reset graded deck | Learner graded some cards, confirms | All the learner's records for the deck return to defaults; Learn shows all cards new | N/A |
| Nothing graded | No record has `firstGradedAt` | Reset is disabled | N/A |
| Cancel | Modal open, Cancel or Esc | Nothing changes | N/A |
| Member isolation | Two learners share a class, one resets | The other's records are unchanged | N/A |
| Order | Deck page and Learn over the same cards | Deck card 1/N is the first card Learn asks, before and after Reset | N/A |
| Other deck | Same learner graded a second deck, resets one | The other deck's records stay graded | N/A |
| Stranger | User with no access to the class | 404, nothing changes | `HttpError` 404 |
| Server failure | Request fails | Modal stays open, shows the error | `role="alert"` message |

</frozen-after-approval>

## Code Map

- `apps/web/app/(shell)/flashcards/[id]/flashcard-detail-view.tsx` -- renders Learn at ~l.185-191 (`learnLabel` l.75); add Reset beside it; uses `data.learn`, `data.isOwner`.
- `apps/web/app/(shell)/flashcards/[id]/delete-card-modal.tsx` -- template for the confirm modal (`Modal`, `buttonDanger`, `buttonSecondary`, `formErrorClass`).
- `apps/web/app/api/review/undo/route.ts` -- model for a write route: `requireSession`, `readJson`, `validationFailure`, `HttpError`, `ok`/`fail`.
- `apps/web/lib/class-access.ts` -- `requireClassAccess(userId, {kind:"flashcard", id})`.
- `packages/domain/src/cards.ts` (l.121) -- `createDefaultSchedulingRecords`, source of default values.
- `packages/domain/src/learned.ts` -- learned marker is `firstGradedAt != null`.
- `apps/web/lib/learn-queue.ts` -- Learn orders unlearned `createdAt asc, cardId asc` (l.113-117); do not change.
- `apps/web/app/api/flashcards/[id]/route.ts` -- l.63 orders cards `createdAt desc, id desc`; flip to asc and fix the "newest first" comment (l.30).
- `apps/web/app/(shell)/flashcards/[id]/learn/learn-session.tsx` -- l.43 comment says the list is newest first; the practice run reads that order.
- `tests/e2e/card-viewer.spec.ts` (l.21) encodes the old deck order and must be updated; `tests/api/review-learn.spec.ts` encodes Learn order and stays.
- `packages/db/schema.prisma` -- `SchedulingRecord` unique `(userId, cardId, direction)`.
- `tests/api/review-undo.spec.ts` -- Playwright API template; `tests/domain/**` for pure helpers.

## Tasks & Acceptance

**Execution:**
- [x] `apps/web/app/api/flashcards/[id]/route.ts`, `learn-session.tsx` comment, `tests/e2e/card-viewer.spec.ts` -- list cards oldest first so card 1/N matches Learn -- human decision; check every deck-page test and the add-cards flow that assumed newest on top.
- [x] `apps/web/app/api/flashcards/[id]/route.ts` -- compute `hasProgress` with `findFirst`, not `count` + `take` -- states intent.
- [x] `packages/domain/src/cards.ts` -- extract or export the default scheduling values so reset and creation share them -- single source of truth.
- [x] `apps/web/app/api/flashcards/[id]/reset/route.ts` -- POST: access check, `updateMany` on the caller's records for the deck's cards, `logOperation("flashcard.reset")` -- the reset itself.
- [x] `apps/web/app/(shell)/flashcards/[id]/reset-deck-modal.tsx` -- confirm modal and `useMutation` -- destructive action needs confirmation.
- [x] `apps/web/app/(shell)/flashcards/[id]/flashcard-detail-view.tsx` -- render Reset next to Learn, disabled when nothing is graded -- entry point.
- [x] `apps/web/app/api/flashcards/[id]` (GET) -- expose a "has progress" flag if `data.learn` cannot give it -- drives the disabled state.
- [x] `tests/api/flashcard-reset.spec.ts` -- cover the I/O matrix: reset, member isolation, second deck untouched, nothing graded, repeat reset, stranger 404, `nextReviewDate` equals the start of today in the user's timezone -- regression safety.
- [x] `tests/e2e/learn.spec.ts` -- reset then Learn starts at the card shown as 1/N, and a failed reset keeps the modal open -- end-to-end proof.

**Acceptance Criteria:**
- Given a graded deck, when the learner confirms Reset and opens Learn, then the first card shown is the deck's first card and the label reads "Learn · N new".
- Given the modal is open, when focus lands, then it is on Cancel; Esc closes it; the dialog is labelled for screen readers.
- Given the UI, when checked against a screenshot in dark and light themes, then it conforms to DESIGN.md tokens and the Design DNA design_style and passes the anti-generic UI rules.

## Implementation Notes

## Spec Change Log

- Pass 1, intent_gap: the deck page listed cards newest first but Learn asks oldest first, so Learn after Reset did not start at card 1/N. Human chose card 1/N and to reorder the deck page. KEEP: reset route, modal, `DEFAULT_SCHEDULING_STATE`, tests and screenshots worked; re-apply them from the git stash named "reset-deck impl".

## Review Triage Log

Pass 1 (4 layers). Route of the group: intent_gap, so everything below `patch` is moot until the human answers.

| Finding | Verdict | Evidence |
|---|---|---|
| Learn after Reset starts at the opposite end from the viewer's card 1 (edge-hunter, claim) | medium, intent_gap | Viewer orders cards `createdAt desc, id desc` (`api/flashcards/[id]/route.ts:63`); Learn queue orders unlearned `createdAt asc, cardId asc` (`lib/learn-queue.ts:113-117`). Exact reverse, so "first card" has two readings. |
| Reset not scoped-tested against a second deck (verification-gap) | medium, patch | Single-deck tests pass even if the `card.flashcardId` filter is dropped. |
| `hasProgress` uses `count` + `take: 1` (verification-gap, blind) | low, patch | `take` is ignored by count; `findFirst` states intent. |
| `nextReviewDate` only checked `<= now`, UTC only (verification-gap, blind) | low, patch | A date ten days in the past would pass. |
| Nothing-graded and repeat-reset not tested (blind, edge) | low, patch | Matrix row "Nothing graded" is covered only by the e2e disabled check. |
| Learn query cache stale after Reset (edge) | false | `learn-session.tsx:80-90` sets `gcTime: 0`, so the cache is dropped on unmount. |
| `class-folders` not invalidated (blind, edge) | maybe-false | Key exists and sibling modals invalidate it; whether it shows learned or due counts is unverified. |
| Undo state survives Reset (blind) | false | There is no undo log; undo is session-local and its server write 409s when `nextReviewDate` differs from the expected one. |
| Missing Scheduling Records are not recreated (blind, edge) | false | Records are created on card batch, invitation accept and class fan-out (`cards/batch`, `invitations/[id]/accept`, `class-access.ts:147`). |
| Concurrent open session overwrites reset (blind, edge) | low, rejected | Grade needs a due card and undo 409s on mismatch; fix adds row locks for a rare race. |
| Disabled Reset has no reason text (blind, design, edge) | low, rejected | Unlikely to be met; fix adds copy and ARIA wiring. |
| Null or invalid timezone (edge) | false | `User.timezone` is a required column. |
| `hasProgress` ignores non-default state with null `firstGradedAt` (edge) | false | Undo restores `firstGradedAt` together with the SM-2 fields; learned means `firstGradedAt != null` (AD-14). |
| Disabled while refetching (edge) | low, rejected | Fix adds state for a negligible window. |
| Spec says "hidden" but code disables (blind, edge) | rejected | Fix edits the build's spec. |
| Modal copy "cannot be undone" vs undo feature (blind) | false | Undo is per-card in a session; it cannot restore a reset deck. |
| Modal props, transaction shape, screenshot tests, empty log sections (blind) | low, rejected | Cosmetic, no named harm. |
| DESIGN.md/EXPERIENCE.md Modal list lacks "Reset deck" (design) | low, defer | Documentation gap, pre-existing list. |

Pass 2 (4 layers, after the card-order decision). No intent_gap, bad_spec or patch entries remain.

| Finding | Verdict | Evidence |
|---|---|---|
| Pass 1 findings repeated (undo state, missing records, concurrency, disabled reason, cache keys, hasProgress definition, "cannot be undone", transaction shape, screenshot tests, timezone) | carried | Same location and claim as the pass 1 rows; verdicts unchanged. |
| Refetch rejection skips `onReset` (edge) | false | `invalidateQueries` resolves when the refetch fails (no `throwOnError`), so `onReset` still runs. |
| `class-folders` not invalidated (blind, edge) | false | `api/classes/[id]/folders/route.ts` carries no learned or due counts; reset changes none of what it shows. |
| Review, dashboard and cultivation caches stale (blind) | low, rejected | `["cultivation"]` and `["stats"]` use default staleness and refetch on mount; Learn and Review take a fresh snapshot per session. |
| XP re-awarded after reset (blind) | false | Only the claim route writes quest XP and it claims once per quest per day; reset touches no XP rows. Re-doing the daily learn quest on old cards is the user's own data. |
| Deck order flip is unrelated to reset (blind) | false | It is the human decision recorded in the frozen block. |
| Other consumers assume newest first (edge, blind) | false | Verification-gap searched `apps/web` and tests; no other deck-card ordering, delete flow filters by id. |
| Equal `createdAt` tie-break could diverge (edge) | false | Deck page and Learn both break ties on id ascending (`cardId` is the card id). |
| `practiceEntries` depends on API order (edge, blind) | low, rejected | One caller; covered by the "Study all cards again" test. |
| Read-only roles see Reset (edge) | false | Spec decision: owner and members both see it; state is per learner. |
| Deleted user gives 500, pending label not announced, no-ellipsis, serial awaits, duplicate-match `.first()`, brittle "1 / 4", `<= now` assertion in the first API test | low, rejected | Cosmetic or unlikely, and each fix adds guards or ARIA for no named harm; exact `nextReviewDate` is asserted in the Kiritimati test. |
| Spec file shows in-progress while code looks done (blind) | false | Process state, set to in-review by this step. |
| DESIGN.md Modal list lacks "Reset deck" | low, defer | Documentation only; deferred in pass 1. |

## Verification

**Commands:**
- `pnpm test` (run in PowerShell) -- expected: all vitest suites pass
- `pnpm playwright test tests/api/flashcard-reset.spec.ts tests/e2e/learn.spec.ts` -- expected: pass

**Manual checks (if no CLI):**
- Flashcard page in both themes: Reset sits beside Learn, secondary styling, modal copy is clear.
