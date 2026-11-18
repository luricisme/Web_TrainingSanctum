# Epic 5 Context: Cultivation Progress & Data Safety

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Users advance through a tu tiên cultivation ladder (90 levels, 19 realms, 4 Bộ) by claiming two daily quests that scale with their Bộ; unclaimed quests cost double XP and can demote them. Users see realm, quests and stats (including the SM-2 retention view) outside review. Admins can export and restore one user's full history, so months of study data are never lost, with destructive operations always confirmed and atomic. Story 5.5 is the final cross-cutting accessibility and microcopy audit over every surface in the product, including Admin, Planner and sharing screens.

## Stories

- Story 5.1: Cultivation Realms & XP Ledger (done)
- Story 5.2: Data Export/Backup (admin-only)
- Story 5.3: Restore from Backup (admin-only)
- Story 5.4: Cultivation & Stats Page
- Story 5.5: Cross-Cutting Accessibility & Microcopy Pass (runs last, after Epics 6-12)
- Story 5.6: Daily Quests
- Story 5.7: Day Settlement & Penalties

## Requirements & Constraints

- Realm is always derived from total XP; XP never goes below 0 and keeps accumulating past the final level. Realm names render in Vietnamese; other copy stays English.
- Two daily quests: Learn Flashcards (target = Bộ number, 1-4; XP 10 Nhất Bộ, 20 Nhị Bộ, 40 Tam/Tứ Bộ) and Clear Review. Quests are ticked manually, re-checked server-side, claimable once per day. Quests with nothing to do are skipped and unclaimable; Learn target is capped by available Flashcards.
- Unclaimed, non-skipped quests cost 2x XP at settlement, even if the work was done. First run penalizes nothing earlier than yesterday. Penalties can demote across stages, realms and Bộ.
- Quest and XP rules never read grade values (SM-C1). Planner XP (focus sessions, task done) is passive and never read by settlement or quest conditions.
- Export/restore are strictly on-demand, admin-only, per selected user (non-admin gets 403; no Settings control). Export carries owned Classes (with color and members[]), Folders, Flashcards, Cards, the user's own Scheduling Records (firstGradedAt verbatim), user.studyDirections, the cultivation section, a sharedClasses[] reference list, and the planner section when present.
- Restore replaces existing data only after explicit confirmation naming the user, runs in one transaction (all or nothing), restores verbatim, assigns colours by creation order if the backup lacks them, re-attaches members whose emails resolve (default records), ignores sharedClasses, and sets settledThrough to yesterday. Log names the target user.
- Cultivation page: realm and XP bar, total XP, today's quests, XP-over-time chart, learned/unlearned totals over studied directions, interval distribution per Recall Direction, and a Realm Ladder of all 19 realms (current one highlighted, scrolled into view, labelled "Current", never colour alone; horizontal scroll below 640px; keyboard reachable; decorative avatars). Data reflects the latest grades without a session reload.
- Story 5.5 accessibility scope:
  - WCAG AA in both themes: 4.5:1 text contrast matching the measured Pastel Frame ratios (text on the five tints included); the non-text 3:1 gaps are closed or accepted in writing.
  - Contrast scope covers the Planner surfaces (Tasks, Categories modal, Pomodoro screen, Calendar grid, tray and conflict border, music player) and the sharing surfaces (Share modal, bell and Invitations panel, Shared Class tiles, read-only Member pages).
  - Visible focus ring on every interactive element; tab order follows reading order on every surface.
  - Pointer cursor on every button or clickable area (buttons, icon buttons, Class/Folder/Flashcard tiles and rows, dock items, tabs, toggles, button-styled links, custom `role="button"`), including Admin screens (list, user page, dialogs) and Planner surfaces (task rows, plan strip, calendar blocks, tray chips, player controls). Disabled controls show `not-allowed` (or `default` where that would mislead) and don't react to hover; non-interactive text and surfaces keep the default cursor.
  - The cursor rule is one global base style for `button`, `[role="button"]`, `a[href]` and `summary`, not per component; any exception is recorded in the story.
  - All copy follows the direct, imperative Voice and Tone table: no cheerleading, emoji or mascot voice.

## Technical Decisions

- Ladder, quest table, `levelForXp`, `questsForLevel`, both quest-condition evaluators and `settleDays` are pure functions in `packages/domain/cultivation.ts`; route handlers fetch facts and pass them in. UI and the Ladder read the realm list from this one source.
- Schema (additive migration, must be deployed to Neon): `User.cultivationXp`, `User.cultivationSettledThrough`, `CultivationDay` (unique userId+localDay, quests JSON snapshot), append-only `XpEvent`. `cultivationXp` equals the XpEvent deltas applied in order with a floor at 0, updated in the same transaction. `XpEvent.questKind` is nullable and reasons include FOCUS_SESSION and TASK_DONE for Planner XP.
- XP write paths: quest claim (`POST /api/cultivation/quests/[kind]/claim`), settlement, plus the Planner's session-end and task-done. Settlement runs lazily at the start of `GET /api/cultivation` and the claim route inside one transaction, no cron. Idempotent via the unique day row, a conditional advance of settledThrough, and a claim that only flips an unclaimed quest.
- A day with no row is rebuilt during settlement; targets come from the Bộ in effect after the previous day settled; skip flags derive from data.
- Local-day attribution always uses `User.timezone` via `toLocalCalendarDay` (AD-8). Learned/unlearned and studied directions use the shared AD-14 predicates, filtered per viewer (`SchedulingRecord.userId`), so Shared Classes count for a Member with no change to quest rules. The grade route is unchanged.
- Export and the admin read-only view share one payload builder per `userId`, serialized to the single `backupExportSchema` also used to validate restore (restore writes SM-2 fields verbatim, the allowed exception to the single grade write path). Routes: `GET /api/admin/users/[id]/export`, `POST /api/admin/users/[id]/restore`, both behind `requireAdmin()`. All write paths log a structured single-line summary.
- All responses use `{ data }` and the standard error envelope; Zod validates every handler.

## UX & Interaction Patterns

- Realm badge in the app bar (avatar in an XP ring, "Ngưng Khí · Tầng 3", "5 / 20 XP"), hidden in focus mode and below 640px; the mobile dock reaches Cultivation. The empty due-queue shows the realm in heading size.
- Quest row: disabled checkbox with progress and reason when unmet; "Done. Tick to claim before the day ends." when met but unclaimed; "Nothing to do today." when skipped.
- Breakthrough is a quiet inline notice ("Breakthrough: realm · stage") with only the XP bar fill, no modal, confetti or sound. Demotion just shows the lower stage; settlement shows one quiet notice per settled range (for example "Nov 12: 2 quests missed, -40 XP. Now Ngưng Khí · Tầng 9.").
- Restore confirmation and the read-only user view live on the Admin user page; follow DESIGN.md components in both themes.

## Cross-Story Dependencies

- Current build order: 5.1 (done), 6.3, 6.6, 5.6, 5.7, 5.4, 6.4, then Epic 7 interleaved as 7.1, 7.2, 5.2, 7.3, 5.3, 7.4, 7.5, 7.6, then Epic 12 (12.1-12.5), Epics 8-11 (8.1 through 11.3), and finally 5.5.
- 5.6 needs 5.1 (ledger, ladder) and the AD-14 predicates; 5.7 needs 5.6's snapshots and claim route; 5.4 displays quests (5.6) and settlement notices (5.7).
- 5.2 needs Story 7.1 (`requireAdmin()`) and Story 6.4 (Class color); Story 7.3 reuses the 5.2 payload builder; Story 12.5 extends export/restore with members and sharedClasses. 5.3 follows 7.3 and relies on the cultivation section existing.
- 5.5 audits everything built before it (Admin, Planner, music player, sharing surfaces), so it runs last, after Story 11.3.
