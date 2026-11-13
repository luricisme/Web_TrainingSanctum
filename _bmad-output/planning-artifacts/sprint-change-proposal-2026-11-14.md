# Sprint Change Proposal — Cultivation Progression Replaces the Streak (Epic 5)

- **Date:** 2026-11-14
- **Project:** Web_TrainingSanctum
- **Requested by:** Luric (product owner)
- **Workflow:** bmad-correct-course (batch mode: every edit is presented together for review)
- **Status:** Approved 2026-11-14 by Luric (revision 2). Edits applied to the PRD (and addendum), Architecture Spine, EXPERIENCE.md, DESIGN.md, epics.md, sprint-status.yaml and deferred-work.md. The Epic 4 story ACs in epics.md that mentioned the streak were also re-worded for the record (no behavior change).

---

## 1. Issue Summary

**What triggered it.** Before Epic 5 started, the product owner asked to replace the plain day-count streak (FR-12) with a cultivation progression in the style of tu tiên novels. Daily quests award XP. XP builds up and moves the user up a ladder of realms.

**Issue type.** A new requirement from the stakeholder. Epic 5 is still entirely in backlog, so no built story has to be undone.

**Problem statement.** FR-12 rewards one graded card per day and gives nothing else. The product owner wants a daily target that grows as the user advances, plus a long-term rank that reflects months of study.

**Decisions (product owner, 2026-11-14).**
1. **The streak is replaced, not kept alongside.** There is no day-count and no flame badge.
2. **There are exactly two daily quests:**
   - **Learn Flashcards:** fully learn a number of Flashcard sets.
   - **Clear Review:** review today's due cards.
3. **The Learn target equals the Bộ number:** Nhất Bộ 1 Flashcard a day, Nhị Bộ 2, Tam Bộ 3, Tứ Bộ 4. Transition realms count toward the Bộ they're listed under.
4. **Quests are ticked by hand, but only once the work is done.** A quest's checkbox unlocks only when the app can confirm the work happened that day. Ticking it claims the XP.
5. **Missed quests cost double, strictly.** At the day boundary, each quest not claimed loses **2 × its XP**. A quest whose work was done but wasn't ticked counts as not claimed.
6. **Demotion is allowed.** A penalty can drop the user by stages or by whole realms. The floor is Ngưng Khí · Tầng 1 (XP never goes below 0).
7. **Realms have stages.** Every major realm has 4 stages: Sơ kỳ / Trung kỳ / Hậu kỳ / Đại viên mãn. The exceptions keep the stages listed in the request:
   - Ngưng Khí has tầng 1–15.
   - Thiên Nhân Ngũ Suy has its 5 suy.
   - Không Kiếp has Đại Tôn / Kim Tôn / Thiên Tôn / Đại Thiên Tôn.
   - Đạp Thiên Kiều has bridges 1–9.
   - Đạp Thiên Cảnh is a single final level.
8. **A quest with no work available is skipped.** If nothing is due in Review, or no Flashcard has unlearned cards, that quest is shown as skipped for the day and is neither rewarded nor penalized.
9. **Pace:** if every quest is done every day, Nhất Bộ takes about 15 months.
10. **Language:** realm names are in Vietnamese. All other UI copy stays in English.

**Decisions made in this proposal (please confirm or change):**
- **A2. No penalty for days before the feature existed.** Settlement starts on the day cultivation first runs for the user.
- **A3. No penalty for the gap a restore creates.** A restore marks every day up to yesterday as settled, so restoring a month-old backup doesn't charge 30 missed days.

## 2. Impact Analysis

### Epic impact
- **Epic 5** can still be completed. It is renamed to **"Cultivation Progress & Data Safety"**.
  - **5.1** is rewritten (realm ladder and XP ledger).
  - **New 5.6** (Daily Quests) and **new 5.7** (Day Settlement & Penalties).
  - **5.2, 5.3 and 5.4** are amended.
  - **5.5** is unchanged.
- **Epic 4 (done or in review):** no rework. The Empty due-queue state gets the realm display where 4.5 left the streak out on purpose. This closes the deferred-work item from spec-4-5. The grade route is not changed.
- No new epic is needed, and no epic becomes obsolete.

### Story impact
- **Rewritten:** 5.1.
- **New:** 5.6, 5.7.
- **ACs amended:** 5.2, 5.3, 5.4.
- **Build order:** 5.1 → 5.6 → 5.7 → 5.4 → 5.2 → 5.3 → 5.5. Export and restore come after every new table exists, so the backup schema is written once.

### Artifact conflicts
- **PRD:**
  - Glossary: Streak is replaced by Cultivation Realm, Stage, XP and Daily Quest.
  - UJ-2 and FR-11: "streak badge" becomes "realm badge".
  - FR-12 is rewritten, and a new **FR-19** (Daily Quests) is added.
  - FR-13, FR-14, FR-15 and FR-17 are amended.
  - §6 Data durability, §4.7 heading, MVP list and the SM-2 metric are amended.
  - Addendum: realm and quest tables.
- **Architecture Spine:**
  - AD-8 now binds FR-12 and FR-19 to quest-day attribution.
  - **New AD-15** (Cultivation ledger and lazy settlement).
  - The ERD loses `STREAK_LOG` and gains `CULTIVATION_DAY`, `XP_EVENT` and two `User` columns.
  - Structural Seed: `streak.ts` becomes `cultivation.ts`.
  - The capability map and the AD-10 export schema are updated.
- **EXPERIENCE.md:**
  - IA: the Stats row becomes the Cultivation page.
  - Voice table.
  - The Empty due-queue pattern and the "Streak broken" state.
  - New component patterns: Daily quest list and Realm badge.
- **DESIGN.md:**
  - Mono font usage.
  - The streak indicator becomes the Realm badge.
  - Empty due-queue state.
  - New Quest row component.
- **epics.md:**
  - FR-11, FR-12, FR-13, FR-14, FR-15, FR-17 and new FR-19 inventory lines, plus NFR-1, AD-8 and AD-15 in Additional Requirements.
  - UX-DR6 and UX-DR8, and a new UX-DR19.
  - Coverage map, Epic 5 summary and body, and Stories 5.1–5.7.
- **sprint-status.yaml:**
  - Rename `5-1-streak-tracking` to `5-1-cultivation-realms-xp-ledger`.
  - Add `5-6-daily-quests` and `5-7-day-settlement-penalties`.
- **deferred-work.md:** the 4.5 streak entry is re-targeted to "realm display (Story 5.1)".
- **Code comment:** [empty-due-queue.tsx:20](apps/web/app/(shell)/review/empty-due-queue.tsx#L20) says "The streak joins it in Story 5.1". Story 5.1 fixes the wording.

### Technical impact
- **Prisma migration (additive only):**
  - `User.cultivationXp Int @default(0)`.
  - `User.cultivationSettledThrough DateTime? @db.Date`.
  - New tables `CultivationDay` and `XpEvent`.
  - No existing rows change. Deploy to Neon before the dev server runs.
- **Domain:**
  - New pure module `packages/domain/cultivation.ts` with the realm ladder, `levelForXp`, `questsForLevel`, the two quest-condition evaluators and `settleDays`.
  - It is unit-tested with no DB, per AD-1 and AD-12.
- **Quest conditions read existing data only:**
  - `SchedulingRecord.firstGradedAt` for Learn.
  - The due queue plus `SchedulingRecord.updatedAt` for Clear Review.
  - No grade-history table is needed.
- **Routes:**
  - New `GET /api/cultivation`: settles past days, then returns the realm, XP and today's quests with their progress.
  - New `POST /api/cultivation/quests/[kind]/claim`.
  - `backupExportSchema` gains the cultivation section.
- **No new dependency.**

## 3. Recommended Approach

**Direct Adjustment.** Rewrite Story 5.1, add 5.6 and 5.7, and amend 5.2–5.4.

- **Effort:** Medium.
- **Risk:** Low to medium. The parts most likely to break are the settlement edge cases: long absences, timezone day boundaries, a restore landing mid-gap, and claims racing settlement. They live in one pure function, so tests can cover them.

Other options:
- **Rollback:** not applicable, because nothing in Epic 5 is built.
- **MVP review:** not needed. The change swaps one motivation feature for another of the same kind, and the core loop (FR-8/9/17) doesn't change.

**Timeline:** about +2 stories on Epic 5.

## 4. Detailed Change Proposals

### 4.1 Numbers (go in the PRD addendum; one constant table in `packages/domain/cultivation.ts`)

**Daily quests.**

| Bộ | XP per quest | Learn target | Clear Review | Max XP per day | Penalty for a fully missed day |
|---|---|---|---|---|---|
| Nhất Bộ Tung Hoành (Ngưng Khí → Dương Thực) | 10 | 1 Flashcard | yes | 20 | −40 |
| Nhị Bộ Phi Thăng (incl. Thiên Nhân Ngũ Suy) | 20 | 2 Flashcards | yes | 40 | −80 |
| Tam Bộ Vô Biên (incl. Đạp Thiên Kiều) | 40 | 3 Flashcards | yes | 80 | −160 |
| Tứ Bộ Đạp Thiên (Đạp Thiên Cảnh) | 40 | 4 Flashcards | yes | 80 | −160 |

**Quest kinds:**

| Kind | Done when (local day, studied directions) | Skipped when |
|---|---|---|
| `LEARN_FLASHCARDS` (k) | At least min(k, available) Flashcards became fully learned today. "Fully learned today" means the Flashcard has no unlearned record left, and its last unlearned record got `firstGradedAt` today. | No Flashcard had an unlearned record at the start of the day. |
| `CLEAR_REVIEW` | At least one record learned before today was graded today, and the due queue (all Classes) is now empty. | Nothing was due at the start of the day. |

**Ladder: 90 levels, at the 2× pace.**

| Bộ | Realm | Stages | XP to advance each stage | Days per stage* |
|---|---|---|---|---|
| Nhất Bộ | Ngưng Khí | Tầng 1–15 | 5·n + 5 (Tầng 1 → 2: 10 … Tầng 15 → next realm: 80) | 1 → 4 |
| | Trúc Cơ | Sơ / Trung / Hậu kỳ / Đại viên mãn | 100 | 5 |
| | Kết Đan | 4 | 150 | 7.5 |
| | Nguyên Anh | 4 | 200 | 10 |
| | Hóa Thần | 4 | 250 | 12.5 |
| | Anh Biến | 4 | 300 | 15 |
| | Vấn Đỉnh | 4 | 350 | 17.5 |
| | Âm Hư (transition) | 4 | 400 | 20 |
| | Dương Thực (transition) | 4 | 400 | 20 |
| Nhị Bộ | Khuy Niết | 4 | 800 | 20 |
| | Tịnh Niết | 4 | 900 | 22.5 |
| | Toái Niết | 4 | 1,000 | 25 |
| | Thiên Nhân Ngũ Suy (transition) | Nhất → Ngũ Suy (5) | 1,200 | 30 |
| Tam Bộ | Không Niết | 4 | 2,000 | 25 |
| | Không Linh | 4 | 2,400 | 30 |
| | Không Huyền | 4 | 2,800 | 35 |
| | Không Kiếp | Đại Tôn / Kim Tôn / Thiên Tôn / Đại Thiên Tôn | 4,000 | 50 |
| | Đạp Thiên Kiều (transition) | Đệ Nhất → Đệ Cửu Kiều (9) | 4,800 | 60 |
| Tứ Bộ | Đạp Thiên Cảnh | final level | — (XP keeps adding up) | — |

\* Days per stage assume both quests are claimed every day.
- Ngưng Khí takes about 34 days.
- Nhất Bộ takes about 15 months.
- Đạp Thiên Cảnh takes about 5.5 years.
- On a day with a skipped quest, only one quest's XP is available, so real progress is slower.

### 4.2 PRD

**Glossary.**

OLD:
> **Streak** — Count of consecutive calendar days on which at least one Scheduling Record was graded (local-timezone day boundary, same basis as `next_review_date` — see FR-12).

NEW:
> **Cultivation Realm / Stage** — The user's rank on a fixed 90-level ladder (Ngưng Khí · Tầng 1 … Đạp Thiên Cảnh), derived only from total XP (FR-12).
> **XP** — Points gained by claiming Daily Quests and lost through missed-quest penalties. It never goes below 0.
> **Daily Quest** — One of the two targets for a local calendar day (Learn Flashcards, Clear Review), sized by the user's Bộ at the start of that day (FR-19).

**§4.7 heading:** "Progress & Streaks" becomes **"Progress & Cultivation"**.

**FR-12, rewritten.**

OLD: *FR-12: Streak tracking* (the whole section).

NEW:
> #### FR-12: Cultivation progression
> The system keeps a total XP per user and derives the user's Cultivation Realm and Stage from it using the fixed ladder (PRD addendum: realm table). The realm and XP progress toward the next stage are shown outside active review.
> - XP changes only when a Daily Quest is claimed (+ its XP) or when a past day is settled (−2 × the XP of each unclaimed quest; FR-19).
> - XP is floored at 0. The realm is always recomputed from XP, so a penalty can move the user down by stages or realms (lowest: Ngưng Khí · Tầng 1).
> - Đạp Thiên Cảnh is the final level. XP keeps adding up past it.
> - Quest days use the same `User.timezone` local-day basis as `next_review_date`.
> - Realm names are shown in Vietnamese. Other copy follows the app's language.

**New FR-19.**
> #### FR-19: Daily Quests
> Each local day, the user has two quests, sized by their Bộ at the start of that day (PRD addendum: quest table):
> - **Learn Flashcards:** fully learn 1 (Nhất Bộ), 2 (Nhị Bộ), 3 (Tam Bộ) or 4 (Tứ Bộ) Flashcards.
> - **Clear Review:** clear the due queue.
>
> Rules:
> - A quest's checkbox unlocks only when its condition is met that day. The user ticks it to claim its XP. A claim is final and can happen only once.
> - A quest whose work does not exist that day (nothing due, no unlearned cards) is shown as skipped and is neither rewarded nor penalized.
> - When a day ends, every quest on it that wasn't claimed or skipped costs 2 × its XP, even if its work was done. That includes days the user never opened the app. Days are settled in order, the next time the user opens the app.
> - There are no penalties for days before cultivation started for the user, or for the gap before a restore.
> - No quest depends on grade quality (SM-C1).

**FR-11 and UJ-2.** "streak badge" becomes **"realm badge"**.

**FR-13.** "Card + Scheduling Record + streak history" becomes **"Card + Scheduling Record + cultivation history (XP, quest days, XP events)"**.

**FR-14.** "streak history" becomes **"cultivation history"**. Add this bullet:
> After a restore, every day up to yesterday counts as settled.

**FR-15.** "current and longest streak" becomes **"current realm and stage, total XP, XP progress to the next stage, and XP history over time"**.

**FR-17.** "Learn grades count toward the streak (FR-12)" becomes **"Learn grades count toward the Learn Flashcards quest (FR-19)"**.

**§6 Data durability, §2 JTBD and data scope (line 79).** "streak data/history" becomes **"cultivation data"**.

**MVP list.** "Streak tracking (FR-12)" becomes **"Cultivation progression and Daily Quests (FR-12, FR-19)"**.

**SM-2 metric.**

OLD:
> Unbroken daily study streak of 60+ days.

NEW:
> Reach Trúc Cơ (all of Ngưng Khí, about 34 days of full quests) and then hold 60+ days without a demotion.

**SM-C1.** Append:
> Mitigation: no quest or XP rule reads grade values.

**Addendum.** Add the tables from §4.1.

### 4.3 Architecture Spine

**AD-8.** Binds: "FR-12 (streak-day attribution)" becomes **"FR-12 and FR-19 (quest-day attribution and settlement)"**. Update the Prevents line the same way.

**New AD-15: Cultivation ledger and lazy settlement.**
> - **Binds:** FR-12, FR-19, FR-13/14 (cultivation section).
> - **Prevents:** XP drifting from its history; double claims; penalties charged twice; a scheduled job.
> - **Rule:**
>   - The ladder, quest table, condition evaluators and `settleDays(fromDay, toDay, xp, history)` are pure functions in `packages/domain/cultivation.ts`.
>   - Only two paths write XP:
>     1. `POST /api/cultivation/quests/[kind]/claim`, which checks the condition server-side and then writes an `XpEvent(+xp)` and marks the quest claimed.
>     2. Settlement, which runs at the start of `GET /api/cultivation` and of the claim route. It covers every day from `cultivationSettledThrough + 1` to yesterday, in order, in one transaction. For each day it writes `XpEvent(−2·xp)` per unclaimed, non-skipped quest, then advances `cultivationSettledThrough`.
>   - The quests for each day come from the `CultivationDay` row, which holds a snapshot of the quest list, targets and skip flags. The snapshot is created on the first cultivation read of that day. A day with no row (the app wasn't opened) is rebuilt from the realm in effect after the previous day settled. Its skip flags come from the data: unlearned records with `createdAt ≤ day`, and due records with `next_review_date ≤ day`.
>   - `User.cultivationXp` is a cache of the `XpEvent` deltas applied in order with a floor at 0. It is updated in the same transaction as each `XpEvent`.
>   - Unique `(userId, localDay)` on `CultivationDay` and the `cultivationSettledThrough` guard make settlement idempotent.
>   - No cron job.

**ERD.**
- Remove `USER ||--o{ STREAK_LOG`.
- Add `USER ||--o{ CULTIVATION_DAY` and `USER ||--o{ XP_EVENT`.
- Add the `User` fields `cultivationXp` and `cultivationSettledThrough`.

**Structural Seed.**
- `streak.ts  # FR-12` becomes `cultivation.ts  # FR-12, FR-19, AD-15`.
- Add `app/api/cultivation/route.ts` and `app/api/cultivation/quests/[kind]/claim/route.ts`.

**Capability map.**
- The FR-12 row becomes `packages/domain/cultivation.ts`, `app/api/cultivation/**` (AD-8, AD-15).
- Add an FR-19 row with the same mapping.

**AD-10.** `backupExportSchema` gains:
> `cultivation: { xp, settledThrough, days[], xpEvents[] }`

### 4.4 UX (EXPERIENCE.md, DESIGN.md)

**EXPERIENCE.md IA.**

OLD:
> | Stats | Sidebar | Streak, card totals, SM-2 retention-curve visualization (FR-15) |

NEW:
> | Cultivation | Sidebar (replaces Stats) | Realm and stage, XP bar, today's quests, then card totals, retention curve and XP history (FR-12, FR-15, FR-19) |

**Voice table.**

OLD:
> "14-day streak" vs "🔥🔥🔥 14 DAY STREAK!!"

NEW:
> "Trúc Cơ · Trung kỳ — 40 / 100 XP" vs "⚡ BREAKTHROUGH!! You are now a TRÚC CƠ master!!"

**Empty due-queue pattern.** "Shows current/longest streak" becomes:
> Shows the realm and stage with the XP bar, then "Today's quests 1 / 2" linking to Cultivation.

**State table.** The "Streak broken" row becomes:
> | Quests missed | Cultivation / outside review | At the first visit after a missed day, one quiet notice: "Nov 12: 2 quests missed, −40 XP. Now Ngưng Khí · Tầng 9." No vacation pause in v1. |

**Breakthrough.** Add a state:
> A quiet inline notice on the Cultivation page: "Breakthrough: Trúc Cơ · Sơ kỳ." No modal, confetti or sound.

**New component patterns.**
- **Daily quest list:**
  - Two checkbox rows. Each shows its label ("Learn 1 Flashcard", "Clear Review"), mono progress ("0 / 1 Flashcards", "12 due left"), and "+10 XP" on the right.
  - Locked rows are disabled, with the reason as helper text.
  - Done-but-unticked rows show "Done. Tick to claim before the day ends."
  - Skipped rows are greyed out with "Nothing to do today."
  - Claimed rows show a check and are no longer interactive.
- **Realm badge:**
  - Realm and stage text, plus a thin XP progress bar.
  - It sits at the bottom of the sidebar and is hidden in focus mode (FR-11).

**DESIGN.md.**
- Mono usage: "streak day-count" becomes **"XP figures and quest progress"**.
- "streak indicator (flame icon + day count)" becomes **"Realm badge (realm · stage text + 4px XP bar in `accent`, no icon)"**.
- The Empty due-queue state shows the realm in display size in place of the streak count.
- New **Quest row**: it reuses the list-row component, and the checkbox uses `accent` when claimed. Its contrast must be checked in both themes (UX-DR13).

### 4.5 epics.md

**FR inventory.**
- Replace FR-12 with the new FR-12 text.
- Add FR-19.
- Edit FR-11, FR-13, FR-14, FR-15 and FR-17 as in §4.2.
- NFR-1: "streak data" becomes "cultivation data".
- AD-8 bullet: "streak-day attribution" becomes "quest-day attribution". Add an AD-15 bullet.

**UX-DR6.**

OLD:
> Build the Progress counter (mono-font "X / Y") and streak indicator (flame icon + day count)…

NEW:
> Build the Progress counter (mono-font "X / Y") and the Realm badge (realm · stage + XP bar), both visible outside active review only (per FR-11/FR-12).

**UX-DR8.** "prominent streak count" becomes **"prominent realm and stage with XP bar and today's quest count"**.

**New UX-DR19.**
> Build the Cultivation page (replacing Stats in the sidebar):
> - Realm card.
> - Daily quest list with locked, done-unticked, skipped and claimed rows.
> - Quiet breakthrough and missed-day notices.
> - Then the stats from FR-15.

**Coverage map.**
- FR-12: Epic 5 - Cultivation progression (realm ladder, XP ledger)
- FR-19: Epic 5 - Daily Quests (claim, skip, double penalty)

**Epic 5 summary.**

OLD:
> ### Epic 5: Progress, Streaks & Data Safety
> A user can see their current/longest streak and basic stats …

NEW:
> ### Epic 5: Cultivation Progress & Data Safety
> A user advances through a tu-tiên cultivation ladder by claiming two daily quests, Learn Flashcards (sized by Bộ) and Clear Review. Unclaimed quests cost double XP and can demote them. They can see their realm, quests and basic stats (including the SM-2 retention curve) outside review, and can trust the product with months of history: exporting it on demand and restoring it, with destructive operations always confirmed and atomic.
> **FRs covered:** FR-12, FR-13, FR-14, FR-15, FR-19
> **Implementation notes:**
> - Quest-day attribution reuses `toLocalCalendarDay` (AD-8).
> - The XP ledger and lazy settlement follow AD-15.
> - FR-13/FR-14 share `backupExportSchema` (AD-10), now with the cultivation section, and restore runs in one transaction (AD-11).
> - Realm badge, Empty due-queue realm and Cultivation page: UX-DR6, UX-DR8, UX-DR19.
> - Closing cross-cutting pass: UX-DR13–15.
> - Build order: 5.1 → 5.6 → 5.7 → 5.4 → 5.2 → 5.3 → 5.5.

**Story 5.1, rewritten.**

> ### Story 5.1: Cultivation Realms & XP Ledger
>
> As a user,
> I want a cultivation realm that rises with the XP I earn,
> So that months of study show up as a rank I care about.
>
> **Acceptance Criteria:**
>
> **Given** the realm ladder
> **Then** `packages/domain/cultivation.ts` defines the 90 levels and the XP each stage needs, from the PRD addendum. `levelForXp(xp)` returns the Bộ, realm, stage, XP into the stage and XP needed, and it is unit-tested at every realm boundary, at 0 and past Đạp Thiên Cảnh.
>
> **Given** my total XP
> **Then** the sidebar shows the Realm badge ("Ngưng Khí · Tầng 3" + XP bar), hidden during focus mode
> **And** the Empty due-queue state shows the realm in display size where the streak was planned (closes the 4.5 deferred item)
>
> **Given** the schema
> **Then** `User.cultivationXp`, `User.cultivationSettledThrough`, `CultivationDay` and `XpEvent` are added in one additive migration
> **And** applying the `XpEvent` deltas in order with a floor at 0 always equals `User.cultivationXp`

**New Story 5.6.**

> ### Story 5.6: Daily Quests
>
> As a user,
> I want two daily quests that grow with my Bộ and that I tick off myself,
> So that each day has a clear target and finishing it feels earned.
>
> **Acceptance Criteria:**
>
> **Given** I open Cultivation for the first time on a local day
> **Then** a `CultivationDay` snapshot is created with Learn Flashcards (target = my Bộ number: 1–4) and Clear Review, their XP (10 / 20 / 40 by Bộ), and their skip flags
> **And** realm changes later that day don't change today's targets
>
> **Given** a quest's condition is not met
> **Then** its checkbox is disabled and shows its progress ("0 / 1 Flashcards", "12 due left") and the reason
>
> **Given** a quest's condition is met
> **When** I tick it
> **Then** `POST /api/cultivation/quests/[kind]/claim` checks the condition again server-side, writes `XpEvent(+xp)`, marks it claimed and updates my XP and realm
> **And** a second claim of the same quest that day is rejected with no extra XP
>
> **Given** a quest's condition is met but it is not ticked
> **Then** its row says "Done. Tick to claim before the day ends."
>
> **Given** nothing was due at the start of the day, or no Flashcard had unlearned records
> **Then** Clear Review, or Learn Flashcards, shows as skipped
>
> **Given** fewer Flashcards with unlearned records than my target
> **Then** the Learn target that day is the number available
>
> **Given** Learn Flashcards
> **Then** a Flashcard counts once all its unlearned records in my studied directions are learned and the last one was first-graded today
>
> **Given** the quest rules
> **Then** neither quest reads grade values (SM-C1)
> **And** both condition evaluators are pure domain functions, unit-tested including the skip cases
>
> **Given** I reach a new stage by claiming
> **Then** a quiet "Breakthrough: {realm · stage}" notice appears, with no modal or animation beyond the XP bar fill

**New Story 5.7.**

> ### Story 5.7: Day Settlement & Penalties
>
> As a user,
> I want unclaimed quests to cost me,
> So that skipping study has real weight.
>
> **Acceptance Criteria:**
>
> **Given** past days after `cultivationSettledThrough`
> **When** I next load Cultivation or claim a quest
> **Then** each day through yesterday is settled in order in one transaction: −2 × XP per quest that was neither claimed nor skipped (even if its work was done), then `cultivationSettledThrough` moves forward
>
> **Given** a day I never opened the app
> **Then** its quests are rebuilt from my Bộ after the previous day settled, with skip flags derived from the data, and are penalized the same way
>
> **Given** penalties larger than my XP into the current stage
> **Then** I drop stages or realms as `levelForXp` says, and XP never goes below 0
>
> **Given** cultivation runs for the first time on my account
> **Then** settlement starts today, and no earlier day is penalized
>
> **Given** settlement runs twice at once (two tabs, or two requests at the same time)
> **Then** each day is penalized exactly once
>
> **Given** a settlement that charged XP
> **Then** the next Cultivation view shows one quiet notice per settled range ("Nov 12: 2 quests missed, −40 XP. Now Ngưng Khí · Tầng 9.")
> **And** `settleDays` is unit-tested for a single missed day, a 30-day absence, demotion across a realm and a Bộ boundary (the targets shrink with it), the 0 floor, a DST day, and skipped quests

**Story 5.2 (export), amended.**
- "and streak history" becomes **"and the cultivation section (XP, settledThrough, CultivationDay snapshots, XpEvents)"**.
- In the user story line, "streak history" becomes "cultivation history".

**Story 5.3 (restore), amended.**
- "and streak history is restored" becomes **"and the cultivation section is restored verbatim"**.
- Add this AC:
  > **Given** a restore completes
  > **Then** `cultivationSettledThrough` is set to yesterday, so no penalty is charged for days between the export and the restore

**Story 5.4, amended.** Retitled to **"Cultivation & Stats Page"**.
- AC 1: "current/longest streak" becomes **"realm and stage, total XP, XP bar, today's quest list (Story 5.6) and an XP-over-time chart from `XpEvent`"**.
- Add: "The page replaces Stats in the sidebar (UX-DR19)."

**Story 5.5.** Unchanged.

### 4.6 sprint-status.yaml

```yaml
  epic-5: backlog
  5-1-cultivation-realms-xp-ledger: backlog   # was 5-1-streak-tracking (Sprint Change 2026-11-14)
  5-2-data-export-backup: backlog
  5-3-restore-from-backup: backlog
  5-4-progress-stats-view: backlog            # now "Cultivation & Stats Page"
  5-5-cross-cutting-accessibility-microcopy-pass: backlog
  5-6-daily-quests: backlog
  5-7-day-settlement-penalties: backlog
  # build order: 5.1 → 5.6 → 5.7 → 5.4 → 5.2 → 5.3 → 5.5
  epic-5-retrospective: optional
```

## 5. Implementation Handoff

- **Scope: Moderate.** This is a backlog reorganization inside one epic with new stories, plus PRD, Architecture and UX text edits. It does not replan the MVP.
- **Product owner / PM (Luric):** approve this proposal, including §4.1's numbers and decisions A2 and A3.
- **Correct-course follow-through (this workflow, after approval):** apply §4.2–§4.6 to the PRD (and its addendum), ARCHITECTURE-SPINE.md, EXPERIENCE.md, DESIGN.md, epics.md, sprint-status.yaml and deferred-work.md.
- **Developer (bmad-build):** build in the order 5.1 → 5.6 → 5.7 → 5.4 → 5.2 → 5.3 → 5.5. Deploy the 5.1 migration to Neon before running the dev server.
- **Success criteria:**
  - `cultivation.ts` passes unit tests for the ladder, both quest kinds and settlement.
  - A claim can't be made twice.
  - A missed day costs exactly 2 × XP per unclaimed quest, once.
  - Demotion works across realm and Bộ boundaries.
  - Export → restore round-trips the cultivation section, with no gap penalty.
  - No user-facing "streak" text remains.
