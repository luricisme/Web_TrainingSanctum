---
title: 'Story 5.4: Cultivation & Stats Page'
type: 'feature'
created: '2026-11-14'
status: 'done'
baseline_commit: '02fafc133daaac312282319ad25283108e268873'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-5-7-day-settlement-penalties.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/DESIGN.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/EXPERIENCE.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/history/focus-indigo/working/design-dna-profile.json'
  - '{project-root}/.claude/skills/design-dna/references/generation-guide.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The Cultivation page shows the realm, notices and quests but not the rest of FR-15: no card totals, no SM-2 interval distribution, no XP history, and no Realm Ladder (UX-DR24). Users cannot see their progress or check that scheduling works.

**Approach:** Add `GET /api/stats` (card totals, interval distribution per studied Recall Direction, daily XP history from `XpEvent`) and a `realmsOfLadder` helper in the domain module. Extend the Cultivation page with the Realm Ladder, an XP-over-time chart, card totals and the interval distribution, drawn in hand-rolled SVG/CSS with no new dependency. No migration.

## Boundaries & Constraints

**Always:**
- Card totals use the AD-14 Card-level predicates (`learnedCardWhere`, `unlearnedCardWhere`) over the studied directions; "total" is learned + unlearned. The distribution counts Scheduling Records in studied directions only, one chart per direction, in the buckets New (unlearned), 1 d, 2–6 d, 7–20 d, 21–59 d, 60+ d. Learned means `firstGradedAt` set; never infer it from `interval`.
- XP history is the cumulative `cultivationXp` at the end of each of the last 30 local days (`User.timezone`, AD-8), replaying all `XpEvent`s in `createdAt, id` order through `applyXpDelta` (floor 0). A pure domain function builds the series; the last point equals the user's current XP. Days with no events repeat the previous value.
- The Ladder lists all 19 realms low to high from `CULTIVATION_LADDER` (via `realmsOfLadder`, one entry per realm: name, Bộ, first level index, stage count), each with `RealmAvatar` (decorative, empty alt) and its Vietnamese name. The current realm (`levelForXp(xp).realm`) is highlighted, carries a "Current" label and the written stage ("Ngưng Khí · Tầng 3"), and scrolls into view on load; passed realms look reached, later ones dimmed. Below 640px it scrolls horizontally; each realm is keyboard reachable.
- Stats reflect the latest grades on every visit: `staleTime: 0`, `refetchOnMount: "always"`, and the claim mutation invalidates `["stats"]` too.
- Charts carry a text equivalent (summary line plus an `sr-only` table), use DESIGN.md tokens in both themes, no gradient, glow or animation beyond existing motion, and never encode meaning by colour alone. English copy, direct and calm.
- Page order: realm + XP bar, notices, quests, Ladder, XP history, card totals, interval distribution.

**Never:**
- No schema change or migration; no change to the grade route, claim route, settlement or quest rules. No chart library. No export/restore work (5.2, 5.3). No per-card or per-class stats, no grade-value charts (SM-C1).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| New user | No cards | Totals 0 / 0; empty distribution with a one-line "Add cards to see your intervals." ; chart is a flat line at 0 | N/A |
| Mixed cards | Some graded, some not | Learned/unlearned per AD-14 over studied directions; New bucket = unlearned records | N/A |
| One direction studied | `studyDirections` = TERM_TO_DEFINITION | One distribution chart; totals over that direction only | N/A |
| XP history | Claim, then penalty that hits the floor | Series follows the floored running total; ends at current XP | N/A |
| Quiet days | No events for several days | Series repeats the last value | N/A |
| After grading | Grade cards, open Cultivation | Totals and distribution show the new state without a manual reload | N/A |
| Final realm | XP at Đạp Thiên Cảnh | Last Ladder item is "Current"; all others reached | N/A |
| Demotion | Realm drops after settlement | Ladder highlight moves to `levelForXp(xp).realm` | N/A |
| Load failure | `/api/stats` errors | Stats sections show an inline "Could not load your stats." with Try again; realm and quests still render | Standard error envelope |

</frozen-after-approval>

## Code Map

- `packages/domain/src/cultivation.ts` -- add `realmsOfLadder()` (derived from `CULTIVATION_LADDER`) and pure `xpSeries(events, localDays, startOfDay)`; `StatsResponse` type. `apps/web/app/(shell)/realm-avatar.tsx` has its own realm-index derivation: reuse `RealmAvatar`/`realmIndexForLevel`, do not copy the palettes.
- `packages/domain/src/learned.ts` -- `learnedCardWhere`, `unlearnedCardWhere`, `learnedRecordWhere`, `unlearnedRecordWhere` (AD-14). Add a `intervalBucket(interval)` helper beside or in `cultivation.ts` only if it is pure and unit-tested.
- `packages/domain/src/time.ts` -- `toLocalCalendarDay`, `localDayStart`, `DAY_MS` for the 30-day window.
- `apps/web/lib/study-directions.ts` -- `getStudiedDirections`. `apps/web/app/api/cultivation/route.ts` is the route pattern (`requireSession`, `ok`).
- `apps/web/app/api/stats/route.ts` -- new `GET`; counts via `prisma.card.count` and a `schedulingRecord.groupBy` on direction and bucketed interval (raw SQL `CASE` or per-bucket counts; verify table maps `scheduling_records`).
- `apps/web/app/(shell)/cultivation/page.tsx` -- add the sections; `quest-list.tsx` claim mutation invalidates `["stats"]`. `realm-badge.tsx` has `useCultivation`, `XpBar`, `xpText`.
- `apps/web/app/(shell)/cultivation/` -- new `realm-ladder.tsx`, `xp-chart.tsx`, `card-totals.tsx`, `interval-chart.tsx`.
- `apps/web/app/globals.css`, DESIGN.md -- tokens only; no new hard-coded colours.
- `tests/domain/cultivation.test.ts`, `tests/api/` (new `stats.spec.ts`), `tests/e2e/cultivation.spec.ts` -- patterns for fresh users and seeded `XpEvent`s are in `cultivation-settle.spec.ts`.

## Tasks & Acceptance

**Execution:**
- [x] `packages/domain/src/cultivation.ts` -- `realmsOfLadder`, `xpSeries`, `intervalBucket`, `StatsResponse` -- single source, no DB (AD-1).
- [x] `tests/domain/cultivation.test.ts` -- 19 realms in order, floor and quiet days in `xpSeries`, bucket edges (1, 2, 6, 7, 20, 21, 59, 60) -- rule correctness.
- [x] `apps/web/app/api/stats/route.ts` -- totals, per-direction distribution, 30-day series -- FR-15, AD-14.
- [x] `tests/api/stats.spec.ts` -- every matrix row, incl. studied-direction filtering and isolation between users -- API contract.
- [x] `apps/web/app/(shell)/cultivation/realm-ladder.tsx` and `page.tsx` -- Ladder with Current label, scroll into view, horizontal scroll, keyboard reach -- UX-DR24.
- [x] `xp-chart.tsx`, `card-totals.tsx`, `interval-chart.tsx` and `page.tsx` -- stats sections with text equivalents, loading, empty and error states -- UX-DR19.
- [x] `tests/e2e/cultivation.spec.ts` -- Ladder highlight and "Current" for a seeded realm, stats update after grading without reload, 390px layout, screenshots in both themes -- flow.

**Acceptance Criteria:**
- Given I open Cultivation after grading cards, then totals, intervals and chart show the new state without a session-tied reload.
- Given my realm changes (breakthrough or demotion), then the Ladder highlight and "Current" label move to that realm.
- Given a screen reader, then the Ladder, chart and distribution each expose their data as text, and avatars are not announced.
- UI conforms to DESIGN.md tokens and the Design DNA design_style; passes the anti-generic UI rules; checked against a screenshot in both dark and light themes.

## Implementation Notes

- `GET /api/stats` derives everything per request; `realmsOfLadder`, `xpSeries`, `intervalBucket` and `StatsResponse` live in `packages/domain/src/cultivation.ts`. Charts are plain SVG/CSS in `apps/web/app/(shell)/cultivation/` (`realm-ladder`, `xp-chart`, `card-totals`, `interval-chart`); the page runs a separate `["stats"]` query, invalidated by quest claims.
- The spec's DNA path `.working/design-dna-profile.json` does not exist; `history/focus-indigo/working/design-dna-profile.json` was used for `design_style` only. `stageCount` is 1 for Đạp Thiên Cảnh. A user whose `cultivationXp` was set without `XpEvent`s shows 0 on the chart.
- Verified: typecheck, lint, 277 unit, 171 API and 166 e2e tests pass. Screenshots: `test-results/screenshots/cultivation-stats-{low,high}-{dark,light}-{1280,390}.png`.

## Spec Change Log

## Review Triage Log

Pass 1 (blind, edge-case, verification-gap, design-fidelity):

| # | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|
| 1 | Ladder scroll uses `offsetLeft` of a non-positioned `<ol>` (edge) | medium | `offsetLeft` is relative to the offsetParent, not the list, so centring can be off | patch |
| 2 | `/api/stats` races the settlement that `GET /api/cultivation` runs, so the chart can miss fresh penalty events (blind) | medium | Both fire in parallel on mount; settlement writes the ledger the chart replays | patch |
| 3 | No test claims a quest on the page and checks the chart refreshes (verification-gap) | medium | Deleting the `["stats"]` invalidation passes every test | patch |
| 4 | No non-UTC route test for day bucketing (verification-gap, blind) | medium | Swapping in UTC bucketing passes every test | patch |
| 5 | SVG `aria-label` repeats the visible summary and the table (blind) | low | Doubled announcement; direct fix is `aria-hidden` on the SVG | patch |
| 6 | Spec `context:` names a DNA path that does not exist (blind) | low | The path is in frontmatter, outside the frozen block | patch |
| 7 | Ladder avatars conflict with the DESIGN.md "avatar only in the Realm badge" rule (design) | medium | UX-DR24 requires them; DESIGN.md should be updated, which is not this diff | defer |
| 8 | Chart ends at 0 for users whose XP has no ledger events (edge, blind) | low | AD-15: only claim and settlement write XP, both write events; noted in Implementation Notes | reject |
| 9 | Whole ledger read per request (edge, blind) | low | At most two events per day; a SQL seed adds complexity | reject |
| 10 | `tabIndex={0}` on non-interactive Ladder items (blind, edge, design) | low | The spec's Always rule requires each realm to be keyboard reachable | reject |
| 11 | `intervalBucket(0)` is "1 d"; totals count Cards while the distribution counts records (blind) | low | `applyGrade` never returns interval 0; the chart labels say "records" | reject |
| 12 | Resize or rotation does not re-centre the Ladder; `currentIndex` -1 unhandled (edge) | low | The realm always exists on the ladder; a ResizeObserver is extra complexity | reject |
| 13 | Non-transactional reads; `findUniqueOrThrow`; Try again has no pending state (edge, blind) | low | Same pattern as the existing routes and page | reject |
| 14 | Mixed number formatting, `shortBo` parses a display string, `pl-15` off the spacing scale, duplicated `86_400_000` (blind, design, edge) | low | Cosmetic; `pl-15` is valid in Tailwind 4.3 | reject |
| 15 | Bars use `bg-border`, Ladder uses `rounded-md`, a permanent border looks like hover, `opacity-40 grayscale` for Ahead, KPI strip and card stack read as a dashboard (design) | low | Counts and labels are written out so colour carries nothing; judgment calls with no named harm | reject |
| 16 | Midnight flake in the XP history API test (verification-gap, blind) | low | Needs a run to straddle UTC midnight | reject |
| 17 | No demotion test (blind) | false | The highlight derives from `levelForXp(xp).realm` on every render; the "Current" tests seed realms directly | reject |

## Design Notes

The XP series is replayed from the ledger rather than stored, so it stays correct after any settlement (AD-15). The distribution buckets are the decision here: they follow typical SM-2 maturity (new, learning, young, mature) and need no config.

## Verification

**Commands (PowerShell; API/e2e with `$env:DATABASE_URL='postgresql://postgres:postgres@localhost:5432/training_sanctum_test'` and `$env:BETTER_AUTH_URL='http://localhost:3100'`):**
- `npm run typecheck` and `npm run lint` -- expected: no errors
- `npm test`, `npm run test:api`, `npm run test:e2e` -- expected: all pass

**Manual checks:**
- Screenshot the Cultivation page at desktop and 390px, dark and light, with a low and a high realm.
