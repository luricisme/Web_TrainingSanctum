# Epic 5 Context: Cultivation Progress & Data Safety

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Users advance through a tu tiên cultivation ladder (90 levels, 19 realms, 4 Bộ) by claiming two daily quests that scale with their Bộ; unclaimed quests cost double XP and can demote them. Users see realm, quests and stats (including the SM-2 retention view) outside review. Admins can export and restore one user's full history, so months of study data are never lost, with destructive operations always confirmed and atomic.

## Stories

- Story 5.1: Cultivation Realms & XP Ledger (done)
- Story 5.2: Data Export/Backup (admin-only)
- Story 5.3: Restore from Backup (admin-only)
- Story 5.4: Cultivation & Stats Page
- Story 5.5: Cross-Cutting Accessibility & Microcopy Pass
- Story 5.6: Daily Quests
- Story 5.7: Day Settlement & Penalties

## Requirements & Constraints

- Realm is always derived from total XP; XP never goes below 0 and keeps accumulating past the final level. Realm names render in Vietnamese; other copy stays English.
- Two daily quests: Learn Flashcards (target = Bộ number, 1-4; XP 10 Nhất Bộ, 20 Nhị Bộ, 40 Tam/Tứ Bộ) and Clear Review. Quests are ticked manually, re-checked server-side, claimable once per day. Quests with nothing to do are skipped and unclaimable; Learn target is capped by available Flashcards.
- Unclaimed, non-skipped quests cost 2x XP at settlement, even if the work was done. First run penalizes nothing earlier than yesterday. Penalties can demote across stages, realms and Bộ.
- Quest and XP rules never read grade values (SM-C1).
- Export/restore are strictly on-demand, admin-only, per selected user (non-admin gets 403; no Settings control). Export carries all Classes (with color), Folders, Flashcards, Cards, both Scheduling Records (firstGradedAt verbatim), user.studyDirections, and the cultivation section.
- Restore replaces existing data only after explicit confirmation naming the user, runs in one transaction (all or nothing), restores everything verbatim, assigns colours by creation order if the backup lacks them, and sets settledThrough to yesterday. Log names the target user.
- Cultivation page: realm and XP bar, total XP, today's quests, XP-over-time chart, learned/unlearned totals over studied directions, interval distribution per Recall Direction, and a Realm Ladder of all 19 realms (current one highlighted, scrolled into view, labelled "Current", never colour alone; horizontal scroll below 640px; keyboard reachable; decorative avatars). Data reflects the latest grades without a session reload.
- Accessibility pass: WCAG AA (4.5:1 text, 3:1 non-text gaps closed or accepted in writing), visible focus rings, pointer cursor applied once via a global base style (disabled controls get not-allowed), including Admin screens; copy follows the direct, imperative Voice and Tone table with no cheerleading or emoji.

## Technical Decisions

- Ladder, quest table, `levelForXp`, `questsForLevel`, both quest-condition evaluators and `settleDays` are pure functions in `packages/domain/cultivation.ts`; route handlers fetch facts and pass them in. UI and the Ladder read the realm list from this one source.
- Schema (additive migration, must be deployed to Neon): `User.cultivationXp`, `User.cultivationSettledThrough`, `CultivationDay` (unique userId+localDay, quests JSON snapshot), append-only `XpEvent` (CLAIM or PENALTY). `cultivationXp` equals the XpEvent deltas applied in order with a floor at 0, updated in the same transaction.
- Only two paths write XP: `POST /api/cultivation/quests/[kind]/claim` and settlement. Settlement runs lazily at the start of `GET /api/cultivation` and the claim route inside one transaction, no cron. Idempotent via the unique day row, a conditional advance of settledThrough, and a claim that only flips an unclaimed quest.
- A day with no row is rebuilt during settlement; targets come from the Bộ in effect after the previous day settled; skip flags derive from data.
- Local-day attribution always uses `User.timezone` via `toLocalCalendarDay` (AD-8). Learned/unlearned and studied directions use the shared AD-14 predicates (a Flashcard counts for Learn once all its unlearned studied-direction records are learned and the last was first-graded today). The grade route is unchanged.
- Export and the admin read-only view share one payload builder per `userId`, serialized to the single `backupExportSchema` also used to validate restore (restore writes SM-2 fields verbatim, the allowed exception to the single grade write path). Routes: `GET /api/admin/users/[id]/export`, `POST /api/admin/users/[id]/restore`, both behind `requireAdmin()`. All write paths log a structured single-line summary.
- All responses use `{ data }` and the standard error envelope; Zod validates every handler.

## UX & Interaction Patterns

- Realm badge in the app bar (avatar in an XP ring, "Ngưng Khí · Tầng 3", "5 / 20 XP"), hidden in focus mode and below 640px; the mobile dock reaches Cultivation. The empty due-queue shows the realm in heading size.
- Quest row: disabled checkbox with progress and reason when unmet; "Done. Tick to claim before the day ends." when met but unclaimed; "Nothing to do today." when skipped.
- Breakthrough is a quiet inline notice ("Breakthrough: realm · stage") with only the XP bar fill, no modal, confetti or sound. Demotion just shows the lower stage; settlement shows one quiet notice per settled range (for example "Nov 12: 2 quests missed, -40 XP. Now Ngưng Khí · Tầng 9.").
- Restore confirmation and the read-only user view live on the Admin user page; follow DESIGN.md components in both themes.

## Cross-Story Dependencies

- Build order: 5.1 (done), 6.3, 6.6, 5.6, 5.7, 5.4, 6.4, 5.2, 5.3, 5.5, interleaved with Epic 7 as 7.1, 7.2, 5.2, 7.3, 5.3, 7.4, 7.5, 7.6, 5.5.
- 5.6 needs 5.1 (ledger, ladder) and the AD-14 predicates; 5.7 needs 5.6's snapshots and claim route; 5.4 displays quests (5.6) and settlement notices (5.7).
- 5.2 needs Story 7.1 (`requireAdmin()`) and Story 6.4 (Class color); Story 7.3 reuses the 5.2 payload builder. 5.3 follows 7.3 and relies on the cultivation section existing.
- 5.5 audits everything built before it, including Admin screens, so it runs last.
