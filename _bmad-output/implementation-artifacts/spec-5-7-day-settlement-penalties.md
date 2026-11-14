---
title: 'Story 5.7: Day Settlement & Penalties'
type: 'feature'
created: '2026-11-14'
status: 'done'
baseline_commit: '78a23e047696d3edcb88362691406e498dba5b02'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-5-6-daily-quests.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/DESIGN.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/EXPERIENCE.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/history/focus-indigo/working/design-dna-profile.json'
  - '{project-root}/.claude/skills/design-dna/references/generation-guide.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Quests earn XP (5.6) but skipping them costs nothing, so the cultivation loop has no weight (FR-19, AD-15). `cultivationSettledThrough` is never written and no PENALTY event exists.

**Approach:** Add a pure `settleDays` domain function and run settlement at the start of `GET /api/cultivation` and of the claim route, in one locked transaction, before today's snapshot is built. Return missed-quest notices derived from PENALTY events and show them on the Cultivation page. No migration.

## Boundaries & Constraints

**Always:**
- Each local day after `cultivationSettledThrough` through yesterday is settled in order: one `XpEvent(-2 × xp, PENALTY, questKind, localDay)` per quest neither claimed nor skipped (done but unclaimed still costs), `cultivationXp` via `applyXpDelta` (floor 0), then `cultivationSettledThrough` advances. A day's Bộ, targets and XP are those of the realm after the previous day settled.
- A day with a stored `CultivationDay` uses its frozen snapshot. A never-opened day is rebuilt with `buildDaySnapshot` from the Bộ in effect, and skip flags derived per AD-15 as of that day's start: Learn skipped unless a Flashcard had an unlearned record then; Clear Review skipped unless a learned record was due then. The derivation is approximate (current `nextReviewDate`/`firstGradedAt` are the only history) and this is accepted.
- Settlement serialises per user (row lock on the user, re-read inside the transaction) and advances `cultivationSettledThrough` only from the value it read, so each day is penalized exactly once under concurrent requests.
- A null `cultivationSettledThrough` is set to yesterday with no penalty. Today is never settled. Day arithmetic uses `User.timezone` (AD-8); DST days are single calendar days.
- Notices are derived from PENALTY events, one per settlement run (events sharing one `createdAt`), newest three. A notice reads "Nov 12: 2 quests missed, −40 XP. Now Ngưng Khí · Tầng 9." (a range reads "Nov 10–12: …"; "Now" is the current realm). Dismissal is remembered in this browser only (`localStorage`, wrapped in try/catch) as a watermark: dismissing hides that notice and every older one. A run that charged nothing makes no notice.
- English, calm copy; notice strip is `elevated` + `rounded.md` (DESIGN.md), no modal, no warning colour.

**Never:**
- No schema change or migration. No change to `POST /api/review/grade`, `QUEST_TABLE`, claim semantics or the 5.6 snapshot shape. No vacation pause. No stats, Ladder or export/restore work (5.4, 5.2, 5.3).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| First run | `cultivationSettledThrough` null | Set to yesterday, no events, no notice | N/A |
| One missed day | Yesterday's quests unclaimed, not skipped | Two `-2×xp` events, XP drops, through-date = yesterday, one notice | N/A |
| Done, unclaimed | Work done but not ticked | Penalized like undone | N/A |
| Skipped or claimed | Skip flag set, or claimed | No penalty for that quest | N/A |
| Never opened | No row for a past day | Rebuilt from the Bộ then in effect, derived skip flags, penalized | N/A |
| 30-day absence | 30 unsettled days | All settled in order in one transaction; later days sized by the shrinking Bộ | N/A |
| Demotion | Penalty exceeds XP in stage | Realm and Bộ drop via `levelForXp`; next day's targets and XP shrink | N/A |
| Floor | Penalty exceeds total XP | `cultivationXp` = 0, never negative | N/A |
| DST day | A 23- or 25-hour local day | Settled as one day | N/A |
| Concurrent | Two requests settle at once | Each day penalized once | Loser sees the settled state |
| Claim after absence | First request is a claim | Settles first, then today's snapshot and claim use the post-settlement realm | N/A |
| Notice | Penalized run, not dismissed | Strip on Cultivation; dismiss hides it and older ones | Storage unavailable: strip shows, dismiss lasts the session |

</frozen-after-approval>

## Code Map

- `packages/domain/src/cultivation.ts` -- add pure `settleDays` and notice types beside `buildDaySnapshot`, `parseDaySnapshot`, `QUEST_TABLE`, `levelForXp`, `applyXpDelta`. `CultivationResponse` (l.126) gains `notices`.
- `packages/domain/src/time.ts` -- `toLocalCalendarDay`, `toLocalDate`. No add-a-day helper: step `@db.Date` values by 86,400,000 ms; get each day's start with `toLocalCalendarDay`.
- `apps/web/lib/cultivation-day.ts` -- `Db`, `ensureToday` (reads XP before settlement, so it must receive post-settlement XP), `gatherQuestFacts`, `countDue`. Add `settleUser` here (or `cultivation-settle.ts`) and the derived-notice query.
- `apps/web/app/api/cultivation/route.ts`, `.../quests/[kind]/claim/route.ts` -- call settlement before `ensureToday`; the claim route's `FOR UPDATE` pattern is the locking model.
- `packages/db/schema.prisma` -- `User.cultivationSettledThrough`, `XpEvent` (PENALTY, no unique key), `CultivationDay` (unique `(userId, localDay)`). Verify the `users` table map name before raw SQL.
- `apps/web/app/(shell)/cultivation/page.tsx`, `quest-list.tsx` -- notice strip above the quest list; reuse the Breakthrough strip classes.
- `tests/api/cultivation.spec.ts` -- two `toEqual` checks on the whole payload must gain `notices`. `cultivation-claim.spec.ts` and `tests/e2e/cultivation.spec.ts` use fresh users (null through-date), which the first-run rule keeps passing.

## Tasks & Acceptance

**Execution:**
- [x] `packages/domain/src/cultivation.ts` -- `settleDays(startXp, days)` over `{ localDay, stored snapshot | null, start-of-day facts }` returning per-day penalties and end XP, plus notice grouping types -- single source (AD-15).
- [x] `tests/domain/cultivation.test.ts` -- single day, 30 days, realm and Bộ demotion, floor, DST day, skipped and claimed quests, rebuilt day sizing -- rule correctness.
- [x] `apps/web/lib/cultivation-settle.ts` -- locked transaction: first-run rule, load stored days, derive start-of-day facts for rebuilt days, write events, XP and conditional through-date, then derive notices -- keeps routes thin.
- [x] `apps/web/app/api/cultivation/route.ts`, `quests/[kind]/claim/route.ts` -- settle first, pass post-settlement XP onward, return `notices` -- AD-15.
- [x] `tests/api/cultivation-settle.spec.ts` (+ update `cultivation.spec.ts`) -- every matrix row incl. concurrent requests, a 365-day gap completing well inside the transaction timeout, claim-triggered settlement -- idempotency and cost.
- [x] `apps/web/app/(shell)/cultivation/missed-notices.tsx`, `page.tsx` -- strips, dismiss watermark, live region -- UX.
- [x] `tests/e2e/cultivation.spec.ts` -- notice shown after a seeded missed day, dismissed, stays dismissed after reload -- flow.

**Acceptance Criteria:**
- Given a missed day, when I load Cultivation twice or in two tabs, then the penalty is charged once.
- Given a settlement that dropped my realm, then the realm badge, Empty due-queue state and today's targets all show the lower realm.
- UI conforms to DESIGN.md tokens and the Design DNA design_style; passes the anti-generic UI rules; checked against a screenshot in both dark and light themes.

## Implementation Notes

- Settlement lives in `apps/web/lib/cultivation-settle.ts` (`settleUser`, `getMissedNotices`); `settleDays` and `formatMissedNotice` are pure in `packages/domain/src/cultivation.ts`. `localDayStart(localDay, tz)` and `DAY_MS` were added to `time.ts`.
- `settleUser` returns early (no lock) when `cultivationSettledThrough` is already yesterday; otherwise it locks the `users` row, re-reads, writes events with one shared `createdAt` (the run id), and advances the through-date with a conditional `updateMany`.
- Rebuilt days use `startFacts` over the user's records as they are now (AD-15 approximation). A day's settlement time budget is 60 s; a 365-day gap is tested.
- `GET /api/cultivation` returns `notices`; the claim route settles first but returns no notices, since the client invalidates `["cultivation"]` after a claim.
- Screenshots: `test-results/screenshots/cultivation-missed-*.png`.

## Spec Change Log

## Review Triage Log

Pass 1 (blind, edge-case, verification-gap, design-fidelity):

| # | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|
| 1 | Dismiss unmounts the focused button, focus falls to body (blind) | medium | Keyboard users lose their place; EXPERIENCE.md sets a focus floor | patch |
| 2 | Multi-notice watermark rule untested (verification-gap) | medium | The e2e test dismisses one notice; an exact-id match would pass | patch |
| 3 | `startFacts` boundaries unasserted: all seeded records are ~400 days old (verification-gap) | medium | Flipping `>=` to `>` or dropping the `createdAt` guard passes every test | patch |
| 4 | No non-UTC or DST end-to-end settlement test (verification-gap, blind, edge) | medium | `localDayStart` is only unit-tested; the matrix DST row is partly covered | patch |
| 5 | Settlement only runs via GET /api/cultivation and the claim route (blind) | false | The realm badge fetches that same GET on every shell page, so settlement runs on the first page load of the day | reject |
| 6 | Settlement is a write on a GET, with up to 60 s of locks (blind) | low | AD-15 mandates lazy settlement at the start of those routes; the common case returns before the lock | reject |
| 7 | Run `createdAt` from the app clock; two runs in one ms merge; clock skew vs watermark (blind, edge) | low | One lock per user serialises runs; a single app instance; a run id column needs a migration the spec forbids | reject |
| 8 | No cap on the day loop; corrupt through-date; very old accounts (blind, edge) | low | Only this code writes the through-date; 365 days is tested; a clamp would silently forgive penalties | reject |
| 9 | Timezone change moves "yesterday" before the through-date (blind, edge) | false | `User.timezone` is captured at signup and not editable (AD-8) | reject |
| 10 | Notice copy: floor shows more XP than lost, "Now" always shown, range from penalized days only (blind) | low | All three are recorded decisions in the spec's Boundaries and Design Notes | reject |
| 11 | Rebuilt-day derivation penalizes active users who never opened Cultivation (blind, edge) | low | The spec accepts the approximation, since current `nextReviewDate`/`firstGradedAt` are the only history | reject |
| 12 | Claim route returns no `notices` (blind, edge claim) | low | The client invalidates `["cultivation"]` after a claim and the GET returns them; the spec task text covers GET | reject |
| 13 | Malformed stored snapshot makes settlement throw; unreachable "raced" error; timeout handling (edge, blind) | low | Only this code writes `CultivationDay.quests`; the lock makes the race branch unreachable | reject |
| 14 | A claim in flight across local midnight can be penalized after it commits (edge) | low | Needs a claim to straddle midnight within one transaction window; the claim targets today's row | reject |
| 15 | Notice watermark key not scoped per user (edge) | low | Single-user app; a fix needs the user id on the client | reject |
| 16 | Dismiss hover fill nearly invisible; `−40 XP` in the body face, not mono; three strips crowd the page (design, blind) | low | The hover text colour still changes; the figure is part of one sentence from EXPERIENCE.md; three strips need three missed runs | reject |
| 17 | Live region mounted already populated may not announce; no index on (userId, reason, createdAt); 15 s timing assertion (blind) | low | Notices are page content rather than a transient event; the table is per-user and small; the assertion is generous | reject |

## Design Notes

`XpEvent.delta` records `-2 × xp` as charged, even where the floor clamps `cultivationXp`, so a notice can show more XP than was actually lost at 0. The shared `createdAt` of one transaction is what groups events into a run.

## Verification

**Commands (PowerShell; API/e2e with `$env:DATABASE_URL='postgresql://postgres:postgres@localhost:5432/training_sanctum_test'` and `$env:BETTER_AUTH_URL='http://localhost:3100'`):**
- `npm run typecheck` and `npm run lint` -- expected: no errors
- `npm test`, `npm run test:api`, `npm run test:e2e` -- expected: all pass

**Manual checks:**
- Screenshot the notice strip (one day, a range, after a demotion) in dark and light themes.
