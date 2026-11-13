# Epic 5 Context: Cultivation Progress & Data Safety

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Give the user a long-term reason to come back and a guarantee their history is safe. A tu tiên cultivation progression replaces the day-count streak (Sprint Change 2026-11-14). Two daily quests, Learn Flashcards (sized by Bộ) and Clear Review, are ticked by hand once the work is done and award XP. XP moves the user up a fixed 90-level realm ladder. Unclaimed quests cost double XP at day end and can demote the user. The user sees realm, quests, card totals and the SM-2 retention curve on one Cultivation page outside review. They can export everything on demand and restore it atomically after an explicit confirmation. The epic closes with an app-wide accessibility and microcopy pass. The product contains no "streak" concept and no "streak" text anywhere.

## Stories

- Story 5.1: Cultivation Realms & XP Ledger
- Story 5.6: Daily Quests
- Story 5.7: Day Settlement & Penalties
- Story 5.4: Cultivation & Stats Page
- Story 5.2: Data Export/Backup
- Story 5.3: Restore from Backup
- Story 5.5: Cross-Cutting Accessibility & Microcopy Pass

(Listed in build order.)

## Requirements & Constraints

- **Ladder (90 levels, four Bộ):**
  - Nhất Bộ: Ngưng Khí has Tầng 1–15, where each stage costs 5·n + 5 XP (10 … 80). Then Trúc Cơ 100, Kết Đan 150, Nguyên Anh 200, Hóa Thần 250, Anh Biến 300, Vấn Đỉnh 350, Âm Hư 400 and Dương Thực 400 XP per stage.
  - Nhị Bộ: Khuy Niết 800, Tịnh Niết 900, Toái Niết 1,000, then Thiên Nhân Ngũ Suy with 5 suy at 1,200.
  - Tam Bộ: Không Niết 2,000, Không Linh 2,400, Không Huyền 2,800, Không Kiếp (Đại / Kim / Thiên / Đại Thiên Tôn) 4,000, then Đạp Thiên Kiều with 9 bridges at 4,800.
  - Tứ Bộ: Đạp Thiên Cảnh, the final level. XP keeps adding up past it.
  - Unless noted, a realm has 4 stages: Sơ kỳ / Trung kỳ / Hậu kỳ / Đại viên mãn.
  - Display format is `{realm} · {stage}`, for example "Trúc Cơ · Trung kỳ", or just "Đạp Thiên Cảnh".
  - Realm names are in Vietnamese. All other copy is in English.
  - The PRD addendum table is binding and is the single constant table in `cultivation.ts`. If you retune it, change both together.
- **XP:**
  - XP changes only by a claim (+XP) or by settlement (a penalty).
  - XP is floored at 0. The realm is always `levelForXp(xp)` and is never stored, so demotion across stages, realms or a whole Bộ falls out naturally.
- **Quests, by Bộ:** XP per quest is 10 / 20 / 40 / 40, and the Learn target is 1 / 2 / 3 / 4 Flashcards.
  - Targets come from the realm at the start of the day and are snapshotted. A realm change later that day doesn't change them.
  - If fewer Flashcards with unlearned records exist than the target, the target is the number available.
- **Learn Flashcards is done when:** at least the target number of Flashcards became fully learned today. A Flashcard counts when it has no unlearned record left in the studied directions and its last one got `firstGradedAt` today.
  - It is skipped when no Flashcard had an unlearned record at the start of the day.
- **Clear Review is done when:** at least one record learned before today was graded today, and the due queue (all Classes, studied directions) is now empty.
  - It is skipped when nothing was due at the start of the day.
- **Claiming:**
  - The checkbox unlocks only when the condition is met. Ticking it claims the XP.
  - The server re-checks the condition before it records the claim.
  - A claim can happen only once. A second claim is rejected with no extra XP.
  - A skipped quest can't be claimed and is neither rewarded nor penalized.
- **Settlement:**
  - At the next cultivation read or claim, every day from `settledThrough + 1` through yesterday is settled in order.
  - Each quest that was neither claimed nor skipped costs −2 × its XP. That includes a quest whose work was done but wasn't ticked, and days the app was never opened.
  - Each day is penalized exactly once, even with two tabs or concurrent requests.
- **No-penalty rules:**
  - On first run, `settledThrough` is set to yesterday, so no earlier day is penalized.
  - A restore also sets it to yesterday, so the gap between export and restore is never charged.
- **SM-C1:** no quest or XP rule reads grade values.
- **Export (FR-13):**
  - On demand only, with no scheduled job.
  - A JSON file containing every Class, Folder, Flashcard and Card, both Scheduling Records per Card (including `firstGradedAt`), `user.studyDirections`, and the cultivation section. That section holds XP, settledThrough, the CultivationDay snapshots and the XpEvents.
- **Restore (FR-14):**
  - Recreates the full hierarchy and every record exactly. The cultivation section is restored verbatim, except settledThrough, which is set to yesterday.
  - If the account already has data, the user must confirm, and the restore replaces it. It never merges.
  - It is all-or-nothing.
- **Stats:** the page reflects the latest graded state without a reload tied to a particular session. Learned and unlearned counts cover the studied directions only.
- **5.5 pass:** WCAG AA (4.5:1) in both themes against the "Focus Indigo" ratios, a visible `:focus-visible` ring and reading-order tab order on every surface, and copy that follows the Voice table.
- **Success:**
  - `cultivation.ts` is unit-tested for the ladder (every realm boundary, 0, and past the final level), both quest kinds including the skip and reduced-target cases, and `settleDays`. The `settleDays` cases are one missed day, a 30-day absence, demotion across a realm and across a Bộ, the 0 floor, a DST day, and skipped quests.
  - Export → restore round-trips the cultivation section with no gap penalty.
  - Every migration is deployed to Neon (`npm run db:migrate:deploy`) before the dev server runs.

## Technical Decisions

- **AD-15 (cultivation ledger):**
  - Pure module `packages/domain/cultivation.ts` holds the ladder, the quest table, `levelForXp`, `questsForLevel`, the `LEARN_FLASHCARDS` / `CLEAR_REVIEW` evaluators and `settleDays`. It imports no DB or framework code. Routes fetch the facts (counts, timestamps) and the domain decides.
  - Only two paths write XP: the claim route and settlement.
  - Every `XpEvent` write updates `User.cultivationXp` in the same transaction. That field caches the running sum of deltas, floored at 0.
- **Schema (one additive migration, 5.1):**
  - `User.cultivationXp Int @default(0)` and `User.cultivationSettledThrough` (date, nullable).
  - `CultivationDay(userId, localDay date, quests JSON)`, unique on `(userId, localDay)`. Each snapshot holds the quest kinds, targets, XP, skip flags and claim status.
  - `XpEvent(userId, localDay, questKind, delta int, reason CLAIM | PENALTY, createdAt)`, append-only.
- **Snapshots:**
  - The day's row is created on the first cultivation read of that day.
  - Settlement rebuilds a missing day from the realm in effect after the previous day settled. Its skip flags come from the data: Flashcards with unlearned records with `createdAt ≤ day`, and learned records with `next_review_date ≤ day`.
- **Settlement:**
  - Runs at the start of `GET /api/cultivation` and of `POST /api/cultivation/quests/[kind]/claim`, inside one Prisma `$transaction`.
  - Idempotent through the unique day row, a conditional update that advances `cultivationSettledThrough` only from the value it read, and a claim that only flips an unclaimed quest.
  - A concurrent loser retries or returns the current state.
  - No cron job.
- **Grade route:** `POST /api/review/grade` is unchanged. Quest conditions read the `first_graded_at`, `updated_at` and `next_review_date` it already writes. No grade-history table is needed.
- **Shared helpers:**
  - Local day: `toLocalCalendarDay` with `User.timezone`, the same clock as the due queue (AD-8).
  - Learned/unlearned and studied directions: only the existing AD-14 builders in `packages/domain/learned.ts`, used by both evaluators and Stats.
- **Export/restore:**
  - One Zod `backupExportSchema` in `packages/domain`, used by both routes (AD-10). The export serializes to it and restore validates against it.
  - Restore runs in a single Prisma transaction (AD-11) and is one of the two paths allowed to write SM-2 fields (AD-4).
  - Both the export and restore routes log a one-line structured summary: operation, counts and outcome.
- **Routes:** `api/cultivation`, `api/cultivation/quests/[kind]/claim`, `api/stats`, `api/export` and `api/restore`. The page is `(routes)/cultivation`, which replaces stats.
- **Conventions:**
  - Validate input with Zod before calling domain or DB code.
  - Success responses are `{ data }`. Errors are `{ error: { code, message, fields?|details? } }`.
  - A Better Auth session is required, otherwise 401.

## UX & Interaction Patterns

- **Sidebar:** Review, Classes, Cultivation and Settings, with Cultivation replacing Stats.
- **Realm badge (sidebar bottom):**
  - "{realm} · {stage}" in `body-small` 600 weight.
  - Below it, a 4px `rounded.full` XP bar: track `elevated`, fill `accent`.
  - Mono "40 / 100 XP" in `caption` / `text-tertiary`.
  - No icon, flame or glow. Links to Cultivation. Hidden in focus mode and on mobile.
- **Empty due-queue (closes the 4.5 deferred item):**
  - Realm · stage in `heading-1` with the XP bar, then mono "Today's quests 1 / 2" linking to Cultivation.
  - Then the existing calm line and Flashcard list or "+ Add card".
  - Fix the stale streak comment in `empty-due-queue.tsx`.
- **Cultivation page:** realm card with XP bar and total XP, the missed-quests and breakthrough notices, then the daily quest list. Below that come the FR-15 stats: card totals (learned / unlearned), the interval distribution per Recall Direction and the XP-over-time chart from `XpEvent`.
- **Quest row (folder-tile row geometry):**
  - Each row shows a checkbox, the label ("Learn 1 Flashcard", "Clear Review"), mono progress ("0 / 1 Flashcards", "12 due left") and a right-aligned "+10 XP".
  - Locked: checkbox at 0.4 opacity, with the reason in `text-tertiary`.
  - Done, not ticked: enabled checkbox and "Done. Tick to claim before the day ends."
  - Skipped: the whole row in `text-tertiary`, "Nothing to do today.", no checkbox.
  - Claimed: checkbox filled `accent` with an `on-accent` check, not interactive.
  - Ticking claims immediately, with no confirm. On failure the tick rolls back and an inline error shows. Space toggles a focused checkbox.
- **Notices:**
  - Both are `elevated`, `rounded.md` strips above the quest list in `body-small`.
  - Missed quests: a 2px `warning` left border (never `error`). Dismissible, one per settled range: "Nov 12: 2 quests missed, −40 XP. Now Ngưng Khí · Tầng 9."
  - Breakthrough: "Breakthrough: Trúc Cơ · Sơ kỳ." with no modal, confetti, sound or animation beyond the bar fill.
  - Demotion just shows the lower stage. No vacation pause in v1.
- **Restore modal:** consequence statement "This will replace all current data." with Confirm/Cancel and no type-to-confirm. Export and restore live in Settings.
- **Voice:**
  - Direct and calm, with no cheerleading or emoji.
  - Write "Trúc Cơ · Trung kỳ — 40 / 100 XP", never "⚡ BREAKTHROUGH!!".
- **Theme contrast:** check every new token (quest checkbox, notices) against `card` and `bg` in both themes.

## Cross-Story Dependencies

- **Build order:** 5.1 → 5.6 → 5.7 → 5.4 → 5.2 → 5.3 → 5.5.
- **5.1** lays the ground for the rest: the schema and Neon deploy, `levelForXp`, the badge and the Empty-state realm.
- **5.6** builds `GET /api/cultivation` and the claim route that 5.7's settlement plugs into. Its quest list appears on 5.4's page.
- **5.2 and 5.3** follow every new table so that `backupExportSchema` is written once, with the cultivation section, `firstGradedAt` and `studyDirections`.
- **5.5** audits everything built across Epics 1–5.
- **Epic 4 dependencies:**
  - Settled Epic 4 work is reused, not reworked: `toLocalCalendarDay` (AD-8), the AD-14 predicates and studied directions, `first_graded_at`, focus mode hiding chrome (now the realm badge) and the 4.5 Empty due-queue component.
  - Learn grades feed Learn Flashcards, and Review grades feed Clear Review.
