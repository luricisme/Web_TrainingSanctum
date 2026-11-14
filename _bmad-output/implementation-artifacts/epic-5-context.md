# Epic 5 Context: Cultivation Progress & Data Safety

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Users advance through a tu-tiên cultivation ladder by earning XP from two daily quests (Learn Flashcards, Clear Review) that they tick off themselves once the work is done. Unclaimed quests cost double XP and can demote them, so skipping study has weight and months of study show up as a rank. Users see their realm, quests and basic stats (including the SM-2 retention curve) outside review. They can trust the product with months of history: export on demand and restore, with destructive operations always confirmed and atomic. This epic replaced the old day-streak (Sprint Changes 2026-11-14 and 2026-11-14b).

## Stories

- Story 5.1: Cultivation Realms & XP Ledger (done)
- Story 5.2: Data Export/Backup
- Story 5.3: Restore from Backup
- Story 5.4: Cultivation & Stats Page
- Story 5.5: Cross-Cutting Accessibility & Microcopy Pass
- Story 5.6: Daily Quests
- Story 5.7: Day Settlement & Penalties

Build order, interleaved with Epic 6: 5.1 (done) → 6.3 → 6.6 → 5.6 → 5.7 → 5.4 → 6.4 → 5.2 → 5.3 → 6.5 → 5.5.

## Requirements & Constraints

- Realm and stage derive only from total XP via a fixed 90-level ladder (Ngưng Khí · Tầng 1 to Đạp Thiên Cảnh). The realm is never stored. XP is floored at 0, and Đạp Thiên Cảnh is final (XP keeps adding up). Realm names are Vietnamese; all other copy is English.
- XP changes only by claiming a quest (+XP) or settling a past day (−2 × XP per quest neither claimed nor skipped, even if its work was done).
- Each local day has two quests sized by Bộ at the start of that day. Learn target is 1/2/3/4 Flashcards for Nhất/Nhị/Tam/Tứ Bộ. Quest XP is 10/20/40/40 by Bộ. Transition realms count toward the Bộ they sit under.
  - Learn is met when min(target, available) Flashcards became fully learned today, counting only studied directions.
  - Clear Review is met when at least one previously learned record was graded today and the due queue (all Classes) is empty.
  - A quest is skipped, neither rewarded nor penalized, when no work existed at the start of the day. A skipped quest can't be claimed.
  - A checkbox unlocks only when the condition is met. A claim is final and happens once per quest per day.
- No penalty for days before cultivation first ran, or for the gap a restore creates. Quests never read grade values (SM-C1).
- Export is strictly on-demand (no scheduled job). The payload includes all Classes (with `color`), Folders, Flashcards, Cards, both Scheduling Records per Card (`firstGradedAt` verbatim), `user.studyDirections` and the cultivation section.
- Restore requires explicit confirmation when data exists (replace, never a silent merge), runs in one transaction (all or nothing), and restores everything verbatim. A backup without class colours restores with colours assigned by creation order. After restore, `cultivationSettledThrough` = yesterday.
- Stats page: total Cards (learned/unlearned over studied directions), distribution of Scheduling Records by interval per Recall Direction, reflecting the latest grades without a session-tied reload.
- Accessibility pass (5.5): 4.5:1 text contrast in both themes against the measured Pastel Frame ratios, the non-text 3:1 gaps closed or accepted in writing, visible focus rings, tab order matching reading order, and direct imperative copy (no cheerleading, emoji or mascot voice).

## Technical Decisions

- Pure domain module `packages/domain/cultivation.ts` (AD-1, AD-12): ladder constants, `levelForXp`, `questsForLevel`, the two condition evaluators and `settleDays`. Route Handlers fetch the facts and pass them in. Unit tests run with no DB.
- Schema (one additive migration, already deployed with 5.1): `User.cultivationXp` (default 0), `User.cultivationSettledThrough` (nullable date), `CultivationDay` (unique on userId + localDay; snapshot of quests, targets, XP, skip flags, claim status) and `XpEvent`. `cultivationXp` caches the `XpEvent` deltas applied in order with a running floor at 0, updated in the same transaction as each event. New migrations must be deployed to Neon or every page returns 500.
- Routes: `GET /api/cultivation` settles past days, then returns realm, XP and today's quests with progress. `POST /api/cultivation/quests/[kind]/claim` re-checks the condition server-side and writes `XpEvent(+xp)`. Settlement also runs at the start of claim. Only these two paths write XP (AD-15).
- Settlement covers `cultivationSettledThrough + 1` to yesterday, in order, in one `$transaction`. A day's Bộ, targets and XP come from the realm in effect after the previous day settled. A day with no row is rebuilt, with skip flags derived from data (unlearned records with `createdAt ≤ day`, due records with `next_review_date ≤ day`). When `cultivationSettledThrough` is null it is set to yesterday and nothing earlier is settled.
- Idempotency: the unique day key, a conditional update that advances `cultivationSettledThrough` only from the value read, and a claim that only flips an unclaimed quest. A concurrent loser retries or returns current state. No cron.
- Day attribution uses `User.timezone` through `toLocalCalendarDay` (AD-8); never a raw client or server date.
- Learned vs. unlearned is one per-direction predicate (AD-14); quest conditions read `firstGradedAt`, `updatedAt` and `next_review_date`. The grade route is unchanged.
- Export and restore share one `backupExportSchema` (AD-10), and restore atomicity follows AD-11. Responses use the standard envelope and error shape. Write paths log a structured one-line summary (operation, counts, outcome).
- Build 5.2 and 5.3 after every new table exists (cultivation tables, Class colour) so the backup schema is written once.

## UX & Interaction Patterns

- Realm badge (avatar inside an XP ring, realm · stage, "n / m XP") sits in the app bar and is hidden during focus mode. The Empty due-queue state shows the realm in heading size with "Today's quests n / 2" linking to Cultivation.
- Cultivation page replaces Stats in the main nav: realm and stage with XP bar, today's quest list, XP-over-time chart, card totals, then the retention/interval visualization.
- Realm Ladder: all 19 realms in order with avatar and Vietnamese name. The current realm is highlighted, labelled "Current" (never colour alone) and scrolled into view. Passed realms look reached and later ones dimmed. It scrolls horizontally below 640px, is keyboard reachable, uses decorative avatars (empty alt, name as text) and reads realms from the domain module.
- Quest row states: locked (disabled, progress in mono such as "0 / 1 Flashcards" or "12 due left", plus the reason); done-unticked ("Done. Tick to claim before the day ends."); skipped (greyed, "Nothing to do today."); claimed (check, not interactive). Contrast must hold in both themes.
- Notices are quiet inline text, with no modal, confetti, sound or animation beyond the XP bar fill. A breakthrough shows "Breakthrough: {realm · stage}". After a settlement that charged XP, show one notice per settled range, such as "Nov 12: 2 quests missed, −40 XP. Now Ngưng Khí · Tầng 9." There is no vacation pause in v1.
- The Pastel Frame DESIGN.md and EXPERIENCE.md are the authority for visuals and voice (e.g. "Trúc Cơ · Trung kỳ — 40 / 100 XP", never "BREAKTHROUGH!!").

## Cross-Story Dependencies

- 5.6 builds on 5.1 (ladder, ledger, schema) and adds quests and the claim route. 5.7 builds on 5.6's `CultivationDay` snapshots and claim state. 5.4 displays 5.6's quests, 5.7's notices and 5.1's ladder.
- 5.2 depends on all cultivation tables (5.1/5.6/5.7) and on Story 6.4 (Class `color`). 5.3 depends on 5.2's schema and sets the settled-through date to yesterday, tying into 5.7's settlement rules.
- 5.5 runs last, after the Epic 6 shell, dock, contrast fix (6.6) and class colours (6.4) exist. It audits them against the Pastel Frame ratios. Stories 6.3 and 6.6 are built before 5.6.
- Epic 4 dependency: the grade route, `firstGradedAt` and the due queue (4.x) are consumed read-only. The 5.1 Empty due-queue realm display closes a deferred 4.5 item.
- Epic 6 owns the realm avatar (6.2) and the app-bar shell (6.1) that the Realm badge and Ladder reuse.
