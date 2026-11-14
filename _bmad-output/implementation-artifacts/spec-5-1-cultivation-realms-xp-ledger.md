---
title: 'Story 5.1: Cultivation Realms & XP Ledger'
type: 'feature'
created: '2026-11-14'
status: 'done'
baseline_commit: '8c2524feb92b831b6be26f2dac71ec75992fc6f4'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/prds/prd-Web_TrainingSanctum-2026-10-29/addendum.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/DESIGN.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/EXPERIENCE.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/history/focus-indigo/working/design-dna-profile.json'
  - '{project-root}/.claude/skills/design-dna/references/generation-guide.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Epic 5 replaced the streak with a tu tiên cultivation progression (FR-12, AD-15), but no XP, realm ladder or cultivation storage exists. Stories 5.6 and 5.7 (quests, settlement) need that foundation, and the sidebar and Empty due-queue state have no realm to show.

**Approach:** Add the 90-level ladder and `levelForXp` as a pure domain module. Add the cultivation schema in one additive migration. Add a read-only `GET /api/cultivation` returning the user's realm summary. Show it in a sidebar Realm badge and on the Empty due-queue state. Rename the Stats nav item and route to Cultivation (placeholder page until 5.4).

## Boundaries & Constraints

**Always:**
- The ladder matches the PRD addendum table exactly (stage costs, stage names, Bộ grouping). The realm is never stored; it is always `levelForXp(User.cultivationXp)`.
- Realm names are in Vietnamese; all other copy is in English, calm, with no emoji or cheer.
- The Realm badge and Empty due-queue realm use DESIGN.md tokens only (Realm badge spec). The badge is hidden in focus mode (FR-11) and, with the sidebar, below 640px.
- Ask the user before running `db:migrate:deploy` against Neon; the dev server 500s until it runs.

**Never:**
- No XP writes, quests, claim route or settlement (Stories 5.6, 5.7). No stats content on the Cultivation page (5.4). No export/restore changes (5.2, 5.3).
- No change to `POST /api/review/grade` or any Scheduling Record.
- No icon, flame, glow, gradient or animation on the badge.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| New account | xp = 0 | Nhất Bộ, "Ngưng Khí · Tầng 1", 0 / 10 XP | N/A |
| Inside Ngưng Khí | xp = 25 (10 + 15 spent) | "Ngưng Khí · Tầng 3", 0 / 20 | N/A |
| Realm boundary | xp = 675 (all of Ngưng Khí) | "Trúc Cơ · Sơ kỳ", 0 / 100 | N/A |
| Bộ boundary | xp = cumulative through Dương Thực | Nhị Bộ, "Khuy Niết · Sơ kỳ" | N/A |
| Final level | xp ≥ cumulative through Đạp Thiên Kiều · Đệ Cửu Kiều | Tứ Bộ, "Đạp Thiên Cảnh", xpForStage null, xp keeps counting | N/A |
| Bad input | xp negative, fractional or non-finite | — | throws RangeError |
| Unauthenticated | GET /api/cultivation without session | 401 `UNAUTHENTICATED` envelope | N/A |
| Badge fetch fails | network/500 | Badge renders nothing; nav still works | silent |

</frozen-after-approval>

## Code Map

- `packages/db/schema.prisma` -- `User` model (line ~34): add `cultivationXp`, `cultivationSettledThrough`, relations; add `CultivationDay`, `XpEvent`, enums `QuestKind`, `XpEventReason`. Follow existing `@@map` snake/plural naming.
- `packages/db/migrations/20261114000000_add_study_directions/migration.sql` -- pattern for a hand-commented additive migration.
- `packages/domain/src/index.ts` -- barrel; add `./cultivation` and drop the "streak helpers" comment.
- `packages/domain/src/settings.ts` -- pattern for a contract module (types + JSDoc, AD-1: no next/react/prisma imports).
- `apps/web/app/api/settings/route.ts` -- route pattern: `requireSession`, `prisma.user.findUniqueOrThrow`, `ok()` from `@/lib/api-response`.
- `apps/web/app/(shell)/layout.tsx` -- `QueryProvider` wraps only `children`; the `Sidebar` sits outside it. Move `QueryProvider` up so it wraps `FocusModeProvider` (sidebar + main).
- `apps/web/app/(shell)/sidebar.tsx` -- `items` array (Stats → Cultivation, `/cultivation`); add the badge pinned to the bottom of the `<aside>` (flex column, `mt-auto`). Already returns null in focus mode.
- `apps/web/app/(shell)/stats/page.tsx` -- delete; replaced by `cultivation/page.tsx`.
- `apps/web/app/(shell)/review/empty-due-queue.tsx` -- add the realm block above the calm line; fix the "streak joins it in Story 5.1" comment.
- `apps/web/app/(shell)/page-header.tsx`, `apps/web/lib/api-client.ts` (`apiFetch`) -- reuse.
- `tests/e2e/app-shell.spec.ts` -- lines 16 and 30 list "Stats"/"/stats"; update to Cultivation.
- `tests/api/settings.spec.ts` -- `newUser` pattern for the API test.

## Tasks & Acceptance

**Execution:**
- [x] `packages/domain/src/cultivation.ts` -- `CULTIVATION_LADDER` (90 levels: bộ, realm, stage label | null, xpToNext | null), `levelForXp(xp) → RealmSummary { bo, boName, realm, stage, label, levelIndex, xp, xpIntoStage, xpForStage }`, `applyXpDelta(current, delta) = max(0, current + delta)`, and the `CultivationResponse` type -- single source of the ladder (AD-15).
- [x] `packages/domain/src/index.ts` -- export it.
- [x] `tests/domain/cultivation.test.ts` -- every matrix row, 90 levels, every realm's first stage, stage labels for Thiên Nhân Ngũ Suy / Không Kiếp / Đạp Thiên Kiều, `applyXpDelta` floor and replay -- ladder correctness.
- [x] `packages/db/schema.prisma` + `packages/db/migrations/20261114010000_add_cultivation/migration.sql` -- additive migration; `CultivationDay` unique `(userId, localDay)`; `XpEvent` indexed by `(userId, localDay)`; both cascade on user delete.
- [x] `apps/web/app/api/cultivation/route.ts` -- `GET` returns `{ data: levelForXp(user.cultivationXp) }`.
- [x] `tests/api/cultivation.spec.ts` -- 401, and a new user gets "Ngưng Khí · Tầng 1", 0 / 10.
- [x] `apps/web/app/(shell)/realm-badge.tsx` -- client component, `useQuery(["cultivation"])`, links to `/cultivation`; renders nothing while pending or on error.
- [x] `apps/web/app/(shell)/layout.tsx`, `sidebar.tsx` -- provider move, nav rename, badge at bottom.
- [x] `apps/web/app/(shell)/cultivation/page.tsx` -- `PageHeader title="Cultivation"` with "Your quests and progress will show here."; delete `stats/page.tsx`.
- [x] `apps/web/app/(shell)/review/empty-due-queue.tsx` -- realm label in `heading-1` + XP bar + mono XP, from the same query.
- [x] `tests/e2e/app-shell.spec.ts` (+ a badge/empty-state check in `tests/e2e/review.spec.ts`) -- nav rename; badge shows "Ngưng Khí · Tầng 1" and hides during a session; Empty due-queue shows the realm.

**Acceptance Criteria:**
- Given the migration, when applied to a database with users, then every existing user has `cultivationXp = 0` and a null `cultivationSettledThrough`, and no other row changes.
- Given I am outside review, when any shell page loads, then the sidebar bottom shows "Ngưng Khí · Tầng 1", a 4px XP bar and "0 / 10 XP", linking to Cultivation.
- Given a review or Learn session is running, then the badge is not rendered.
- Given nothing is due, when Review shows the Empty due-queue state, then the realm label and XP bar sit above the calm line.
- UI conforms to DESIGN.md tokens and the Design DNA design_style; passes the anti-generic UI rules; checked against a screenshot in both dark and light themes.

## Implementation Notes

- `levelIndex` is 0-based (0 … 89); `boName` is the full Bộ name ("Nhất Bộ Tung Hoành"). `CultivationResponse` is `RealmSummary` until 5.6 adds quests.
- The migration was generated with `prisma migrate diff` and hand-trimmed: the diff also wanted `users.name DROP DEFAULT`, the pre-existing intentional default from `add_better_auth_tables`, which is left alone.
- `XpBar` takes `track`: the sidebar badge keeps `elevated` (DESIGN.md) and steps to `border` on row hover, where the row itself turns `elevated`. On the Empty due-queue state the bar sits on `bg`, where `elevated` is nearly invisible in light theme, so it uses `border`.
- XP figures use en-US grouping ("120,000 XP" at the final level, which shows the running total instead of "x / y").
- The realm block on the Empty due-queue state is not a link; the Cultivation link there arrives with "Today's quests 1 / 2" in 5.6.
- Neon deploy (`npm run db:migrate:deploy`) is still pending the user's go-ahead; only the local test DB has the migration.

## Spec Change Log

- 2026-11-14: presentation superseded by [spec-restyle-pastel-frame](./spec-restyle-pastel-frame.md). The Realm badge now sits at the right end of the app bar as an XP ring with the label and XP figure, not at the sidebar bottom with a 4px bar. Its link name and `progressbar` attributes are unchanged. The 4px `XpBar` remains on the Empty due-queue state.

## Review Triage Log

Pass 1 (blind, edge-case, verification-gap, design-fidelity):

| # | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|
| 1 | Empty due-queue: realm block returns null while pending, so the calm line and next step jump down when it arrives (edge, blind, design) | low | `RealmSummaryBlock` returns null on `!data` inside a `justify-center gap-8` column; the sidebar badge fetches the same key on the same load, so the first render after navigation is pending. Seen every time the empty state opens cold. | patch |
| 2 | Failure-path e2e asserts progressbar count 0 before the mocked 500 arrives (edge, blind, verification-gap) | medium | Pending also renders nothing, so `toHaveCount(0)` passes during loading; the error branch is never pinned. Pre-verified gap. | patch |
| 3 | No API/e2e test with non-zero XP: route field, `xpText` grouping, final-level bar never exercised (verification-gap, blind) | medium | All API/e2e assertions use a fresh 0-XP account; a route hardcoding `levelForXp(0)` would pass. Pre-verified gap. | patch |
| 4 | Empty due-queue with a failed cultivation load is untested (verification-gap) | low | `review.spec.ts` mocks only grade/unlearned; nothing pins "calm line and next step still show". Pre-verified gap. | patch |
| 5 | Schema doc says `cultivationSettledThrough` is "null until the first cultivation read", but the 5.1 GET never writes it (blind) | low | `schema.prisma` comment vs `api/cultivation/route.ts` (read-only) and the migration header ("stays null"); misleads 5.7. Direct comment fix. | patch |
| 6 | XP bar track uses `border` (badge hover, empty state) where DESIGN.md says `elevated` (design) | low | Real deviation, recorded in Implementation Notes; `elevated` (#ececf6) on `bg` (#f5f5fa) is near-invisible in light theme. Fix: record the rule in DESIGN.md Realm badge. | patch |
| 7 | Negative `cultivationXp` makes `levelForXp` throw → 500; no DB CHECK (edge, blind) | low | No writer exists in 5.1, and AD-15 writers go through `applyXpDelta` (floored). Unreachable today; fix adds a guard. | reject |
| 8 | User deleted between `requireSession` and `findUniqueOrThrow` → raw 500 (edge) | low | Same pattern as `api/settings`; needs a delete racing a request on a single-user app. | reject |
| 9 | Accent spread: sidebar XP fill, empty-state XP fill, nav item, Add card (design) | false | DESIGN.md Colors > Accent lists "the progress bar" as a sanctioned accent use, and the Realm badge spec mandates the `accent` fill; both realm displays are mandated by DESIGN.md/EXPERIENCE.md. | reject |
| 10 | `max-w-xs` is not a DESIGN.md token (design) | low | Tailwind scale value, not an arbitrary one; DESIGN.md sets no empty-state bar width. Negligible. | reject |
| 11 | Cultivation nav keeps the Stats bar-chart icon (design, blind) | false | The Cultivation page hosts the FR-15 stats (Story 5.4, UX-DR19), so a chart icon still matches the destination. | reject |
| 12 | `xp_events` has no unique constraint for idempotent claims/penalties (blind) | false | AD-15 puts idempotency on the `CultivationDay` claim flip and the conditional `cultivationSettledThrough` update; no writer exists in 5.1. | reject |
| 13 | Realm query uses the 15 s staleTime while the empty state's own query is fresh; nothing invalidates `["cultivation"]` (blind, verification-gap) | false | XP never changes in 5.1, so nothing can be stale. Refresh-after-claim belongs to 5.6. | reject |
| 14 | Realm not visible on mobile (sidebar hidden <640px) (blind) | false | Spec Always: the badge hides with the sidebar below 640px; the Empty due-queue realm shows on mobile. | reject |
| 15 | `/stats` now 404s with no redirect (blind) | low | Single-user app whose nav was updated in the same change; a bookmark is the only way to hit it. Fix adds a route. | reject |
| 16 | Link `aria-label` and progressbar label both carry the realm (blind) | low | The link name comes from its `aria-label`; duplicated text inside is harmless. Deep ARIA tuning is out of scope (EXPERIENCE.md Accessibility Floor). | reject |
| 17 | No shared helper enforces "XpEvent write updates cultivationXp"; `questKind` required on every event (blind) | false | No XpEvent writer exists in 5.1; `questKind` on every event is the AD-15 schema (every XP change is a claim or a quest penalty). | reject |
| 18 | `Card` model whitespace churn (blind) | false | It is `prisma format`'s canonical alignment after adding wider `User` columns; reverting would be undone by the next format. | reject |

## Design Notes

Cumulative thresholds: Ngưng Khí Tầng n costs 5·n + 5, so the whole realm is 675 XP; Trúc Cơ starts at 675, Kết Đan at 1,075. Build the ladder from a compact table (realm, stage names, cost) and derive the 90 entries and cumulative starts once at module load; `levelForXp` walks or binary-searches the starts.

`xpIntoStage` / `xpForStage` drive both "0 / 10 XP" and the bar width (`xpIntoStage / xpForStage`, full at the final level). The XP bar is a `role="progressbar"` with `aria-valuenow`/`aria-valuemax` and an accessible label of the realm.

The Stats → Cultivation rename lands here (not 5.4) because the badge needs a link target and the sidebar must not show both items.

## Verification

**Commands (PowerShell; API/e2e with `$env:DATABASE_URL='postgresql://postgres:postgres@localhost:5432/training_sanctum_test'` and `$env:BETTER_AUTH_URL='http://localhost:3100'`):**
- `npm run typecheck` -- expected: no errors
- `npm run lint` -- expected: no errors
- `npm test` -- expected: all pass, incl. `cultivation.test.ts`
- `npm run test:api` and `npm run test:e2e` -- expected: all pass

**Manual checks:**
- Screenshot the sidebar badge and Empty due-queue state in dark and light themes.
