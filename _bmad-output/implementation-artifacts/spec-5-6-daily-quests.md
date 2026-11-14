---
title: 'Story 5.6: Daily Quests'
type: 'feature'
created: '2026-11-14'
status: 'done'
baseline_commit: 'dbc363c085b53fad295f9c65019d288be3a1c864'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-5-1-cultivation-realms-xp-ledger.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/DESIGN.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/EXPERIENCE.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/history/focus-indigo/working/design-dna-profile.json'
  - '{project-root}/.claude/skills/design-dna/references/generation-guide.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** XP exists (5.1) but nothing earns it. The Cultivation page is a stub and the Empty due-queue state has no quest count (FR-19, AD-15).

**Approach:** Add two daily quests (Learn Flashcards, Clear Review) as pure domain rules plus a per-day `CultivationDay` snapshot created on the first `GET /api/cultivation` of the local day. Add `POST /api/cultivation/quests/[kind]/claim`. Show a quest list with a Breakthrough notice on the Cultivation page and "Today's quests n / m" on the Empty due-queue state. No migration: the schema from 5.1 already fits.

## Boundaries & Constraints

**Always:**
- Targets and XP by Bộ: Nhất 1 / 10, Nhị 2 / 20, Tam 3 / 40, Tứ 4 / 40; Clear Review pays the same XP. Bộ comes from `levelForXp` when the snapshot is created and is frozen for that day.
- The local day comes only from `User.timezone` via `toLocalCalendarDay` (AD-8). Learned/unlearned and every filter use the AD-14 builders over `studiedDirections`.
- Both evaluators are pure functions in `packages/domain/src/cultivation.ts`; Route Handlers fetch facts and the domain decides. No evaluator reads a grade value (SM-C1).
- A claim re-checks server-side, writes `XpEvent(+xp, CLAIM)`, updates `User.cultivationXp` via `applyXpDelta` and flips that quest's claimed flag in one transaction. Concurrent claims award once.
- The user ticks quests themselves; nothing auto-claims. Copy is English, calm, no emoji; Realm names stay Vietnamese. Use DESIGN.md tokens only (mono for progress figures, `elevated` + `rounded.md` for the notice).

**Never:**
- No settlement, penalties or `cultivationSettledThrough` writes (5.7). No stats, chart or Realm Ladder (5.4). No export/restore change (5.2, 5.3).
- `POST /api/review/grade` and every Scheduling Record stay untouched. No animation beyond the XP bar fill, no modal.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| First read of the day | No `CultivationDay` for today | Row created. Learn target = min(Bộ target, Flashcards with unlearned records). Learn skipped if none. Clear Review skipped if nothing was due | Unique-conflict race returns the existing row |
| Same-day realm change | Claim raises the Bộ | Today's targets and XP unchanged | N/A |
| Learn unmet | 0 of target Flashcards fully learned today | Checkbox disabled, "0 / 1 Flashcards" with the reason | Claim returns 409 `QUEST_NOT_MET` |
| Learn met | Flashcard has no unlearned record in studied directions and its last `firstGradedAt` is today | Row says "Done. Tick to claim before the day ends." | N/A |
| Clear Review met | A record learned before today was graded today and the due queue is empty | Claimable | N/A |
| Clear Review unmet | Records still due | Disabled, "12 due left" | 409 `QUEST_NOT_MET` |
| Claim | Quest met, not claimed | `XpEvent(+xp)`, claimed, returns new XP and realm | N/A |
| Second claim | Already claimed | No extra XP | 409 `QUEST_ALREADY_CLAIMED` |
| Skipped quest | Skip flag set | "Nothing to do today.", cannot be claimed | 409 `QUEST_SKIPPED` |
| Breakthrough | Claim lands in a new stage | Quiet "Breakthrough: {realm · stage}" notice, XP bar fills | N/A |
| Bad kind | Unknown path slug | N/A | 404 `NOT_FOUND` |
| Unauthenticated | No session | N/A | 401 `UNAUTHENTICATED` |

</frozen-after-approval>

## Code Map

- `packages/domain/src/cultivation.ts` -- add the quest table, `questsForSnapshot`, both evaluators and the `QuestView` shape. `CultivationResponse` (l.126) becomes `RealmSummary & { quests: QuestView[] }`.
- `packages/domain/src/time.ts` -- `toLocalCalendarDay` returns an instant. Add a sibling returning the UTC-midnight `Date` of the local Y-M-D for `CultivationDay.localDay` (`@db.Date`).
- `packages/domain/src/learned.ts` -- reuse `studiedDirections` and the four `*Where` builders.
- `packages/db/schema.prisma` -- `CultivationDay.quests` (Json) holds the snapshot: per kind `{ target?, xp, skipped, claimed }`. `XpEvent` has no unique key, so idempotency comes from locking the day row (`SELECT … FOR UPDATE`) and re-reading inside the transaction.
- `apps/web/lib/study-directions.ts` -- `getStudiedDirections(userId)`.
- `apps/web/app/api/review/queue/route.ts` -- "due" = learned record with `nextReviewDate <= now`; use the same predicate. `lib/learn-queue.ts` is the pattern for per-Flashcard filters.
- `apps/web/app/api/cultivation/route.ts` -- GET: ensure today's snapshot, return realm + quests. Extract the day logic into `apps/web/lib/cultivation-day.ts`.
- `apps/web/app/api/cultivation/quests/[kind]/claim/route.ts` -- new POST. Slugs `learn-flashcards` and `clear-review`.
- `apps/web/app/(shell)/realm-badge.tsx` -- `useCultivation`, `XpBar`, `xpText`, key `["cultivation"]`; keep compatible.
- `apps/web/app/(shell)/cultivation/page.tsx` -- stub to extend. `review/empty-due-queue.tsx` -- add the quest line (its docstring defers it to 5.6).
- `tests/api/cultivation.spec.ts` -- `newUser` pattern. Its `toEqual` on the whole payload must change. There is no clock injection: seed `firstGradedAt`, `updatedAt`, `nextReviewDate` with `prisma`.

## Tasks & Acceptance

**Execution:**
- [x] `packages/domain/src/cultivation.ts`, `time.ts` -- quest table, snapshot builder, evaluators, local-date helper -- single source (AD-15).
- [x] `tests/domain/cultivation.test.ts` (+ time test) -- targets per Bộ, reduced target, both skips, met/unmet edges, no grade input -- rule correctness.
- [x] `apps/web/lib/cultivation-day.ts` -- ensure-snapshot with race retry; gather facts (Flashcards fully learned today, learned-before-today graded today, due count) -- keeps routes thin.
- [x] `apps/web/app/api/cultivation/route.ts`, `quests/[kind]/claim/route.ts` -- GET with quests; locked, transactional claim with the matrix's errors -- AD-15.
- [x] `tests/api/cultivation.spec.ts` (+ `cultivation-claim.spec.ts`) -- every matrix row incl. double claim, concurrent claims, skips -- idempotency.
- [x] `apps/web/app/(shell)/cultivation/quest-list.tsx`, `cultivation/page.tsx` -- realm bar, quest rows, Breakthrough notice, invalidate `["cultivation"]`, fresh on mount -- UX.
- [x] `apps/web/app/(shell)/review/empty-due-queue.tsx` -- "Today's quests n / m" (claimed / non-skipped) linking to Cultivation; hidden when all skipped -- EXPERIENCE.md l.84.
- [x] `tests/e2e/cultivation.spec.ts` -- disabled box with progress, tick, XP bar, notice, empty-state count -- flow.

**Acceptance Criteria:**
- Given a first visit of the local day, when any shell page loads, then today's snapshot exists and later realm changes do not alter its targets.
- Given a claimed quest, then reloading, a second tab or a direct POST awards nothing more.
- UI conforms to DESIGN.md tokens and the Design DNA design_style; passes the anti-generic UI rules; checked against a screenshot in both dark and light themes.

## Implementation Notes

- No migration: `CultivationDay.quests` holds `{ LEARN_FLASHCARDS: { target, xp, skipped, claimed }, CLEAR_REVIEW: { xp, skipped, claimed } }`. `GET /api/cultivation` returns `RealmSummary & { quests: QuestView[] }`; the claim route returns `QuestClaimResponse` (`xpAwarded`, new `realm`, `breakthrough`).
- Claim serialises on the day row with `SELECT ... FOR UPDATE`, then re-reads the snapshot and re-checks facts inside the transaction.
- "Reviewed today" uses `updatedAt` as the grade-time proxy because the grade route cannot change (AD-15). See deferred-work for the restore (5.3) interaction.
- Playwright `.check()` fails on the server-driven checkbox; tests use `.click()` plus assertions.
- Screenshots: `test-results/screenshots/cultivation-*-{dark,light}-{1280,390}.png` (regenerated on each e2e run).

## Spec Change Log

## Review Triage Log

Pass 1 (blind, edge-case, verification-gap, design-fidelity):

| # | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|
| 1 | Skipped row `opacity-70` stacks on `text-tertiary`, breaking 4.5:1 (design) | low | `quest-list.tsx` dimmed the whole row; tertiary text on `card` is already near the floor | patch |
| 2 | Locked checkbox at 0.6 opacity, DESIGN.md disabled token is 0.4 (design, blind) | low | One-off value, no token | patch |
| 3 | No non-UTC test for `ensureToday` / day boundaries (verification-gap, edge, blind) | medium | Every API test signs up with UTC; hard-coding UTC in the routes would pass all tests | patch |
| 4 | No test grades through `/api/review/grade` and then reads quests (verification-gap) | medium | All quest tests fabricate `firstGradedAt`/`updatedAt`; a grade-route change would pass them | patch |
| 5 | Breakthrough live region swapped between two elements, may not announce (blind) | low | `role="status"` element was replaced, not updated | patch |
| 6 | `realm-badge.tsx` XpBar line not formatted (blind) | low | Repo is not Prettier-formatted at 80 cols; formatted by hand to match neighbours | patch |
| 7 | Clear Review treats any `updatedAt` write as "graded today" (edge, blind, verification-gap) | medium | AD-15 mandates reading `updatedAt` and forbids changing the grade route; today only grading writes records, but Story 5.3 restore will touch every row | defer |
| 8 | e2e `seedWork` deletes `CultivationDay` right after register; the badge's in-flight GET could recreate it with empty skip flags (blind) | maybe-false | Passed in two full runs; would need a deliberately slow GET to settle | defer |
| 9 | Snapshot skip flags computed at first read, not true start of day (edge, claim) | false | The shell layout mounts the realm badge on every page load, so the first read precedes the first review; focus mode is entered from a loaded page | reject |
| 10 | Timezone changes mid-day create a second day row (edge) | false | `User.timezone` is captured at signup and not editable (AD-8) | reject |
| 11 | Midnight rollover inside a claim; page left open overnight (edge, blind) | low | Needs a claim to straddle local midnight; the page refetches on focus with `staleTime: 0` | reject |
| 12 | Learned-earlier Flashcard with a new Card learned today counts (edge) | false | Matches the AC literally: a Flashcard counts when its last unlearned record was first-graded today (AD-14) | reject |
| 13 | Breakthrough notice below the list, not above (design) | false | EXPERIENCE.md lists quests before notices; the spec fixes only the notice style, which matches | reject |
| 14 | `transition-[width]`, `max-w-md` are not named tokens (design) | low | Tailwind scale values; 5.1 used `max-w-xs` the same way; fix adds a utility | reject |
| 15 | GET runs ~5 queries and writes; reads not in one transaction (edge, blind) | low | AD-15 requires lazy creation on read; the claim re-checks inside its transaction | reject |
| 16 | Malformed snapshot or invalid timezone returns 500 (edge, blind) | low | Only this code writes the row; timezone is captured from the browser at signup | reject |
| 17 | Stale 409 error text, other rows disabled while a claim is pending, stale Bộ on concurrent first creation (edge) | low | Each needs a race or a second claim inside the same few hundred ms; fixes add state | reject |
| 18 | `takes no grade input` asserts arity only; screenshot tests assert nothing visual (verification-gap, blind) | low | Evaluators take only counts, so SM-C1 holds by type; the screenshots serve the manual dark/light check | reject |
| 19 | Claim 409s are not logged; locked-state copy gives no remaining count (blind) | low | Not required by the spec; copy follows EXPERIENCE.md | reject |
| 20 | Docs drift: `epic-5-context.md` rewritten, sprint-status comment and timestamp (blind) | false | `epic-5-context.md` is a regenerated cache; sprint-status is synced at the end of the run | reject |

## Design Notes

The realm badge fetches `GET /api/cultivation` on every shell page, so the snapshot (and its start-of-day skip flags) is normally created before the first review of the day, not on the first visit to the Cultivation page.

## Verification

**Commands (PowerShell; API/e2e with `$env:DATABASE_URL='postgresql://postgres:postgres@localhost:5432/training_sanctum_test'` and `$env:BETTER_AUTH_URL='http://localhost:3100'`):**
- `npm run typecheck` and `npm run lint` -- expected: no errors
- `npm test`, `npm run test:api`, `npm run test:e2e` -- expected: all pass

**Manual checks:**
- Screenshot the quest list in each state (locked, ready, claimed, skipped) and the Breakthrough notice in dark and light themes.
