---
title: Training Sanctum — Flashcards PRD Addendum
status: draft
created: 2026-10-29
updated: 2026-11-14
---

# Addendum: Supporting Detail for Architecture & QA

This content supports FR-8 (SM-2 scheduling) but is worked-example detail, not core requirement text — kept here so the PRD's main narrative stays scannable. It is binding as test/implementation input, same as the PRD itself.

## FR-8 Worked Examples: Classical SM-2 Grade Sequences

Both examples start a fresh Scheduling Record at `ease_factor = 2.5`, `repetitions = 0`. Formula: `EF' = EF + (0.1 − (5−q) × (0.08 + (5−q) × 0.02))`, floored at 1.3; interval uses Step 1 = 1 day, Step 2 = 6 days, then `round(previous_interval × previous_EF)` from the 3rd repetition on. Again (q=1) resets `repetitions` to 0, resets interval to Step 1, and leaves `ease_factor` unchanged.

**Sequence A — Good, Good, Hard, Again:**

| # | Grade (q) | repetitions before→after | EF before→after | interval before→after |
|---|---|---|---|---|
| 1 | Good (4) | 0→1 | 2.5→2.5 | — → 1 day |
| 2 | Good (4) | 1→2 | 2.5→2.5 | 1→6 days |
| 3 | Hard (3) | 2→3 | 2.5→2.36 | 6→15 days *(6 × 2.5, previous EF)* |
| 4 | Again (1) | 3→0 | 2.36→2.36 *(unchanged)* | 15→1 day *(reset to Step 1)* |

**Sequence B — Good, Easy, Easy:**

| # | Grade (q) | repetitions before→after | EF before→after | interval before→after |
|---|---|---|---|---|
| 1 | Good (4) | 0→1 | 2.5→2.5 | — → 1 day |
| 2 | Easy (5) | 1→2 | 2.5→2.6 | 1→6 days |
| 3 | Easy (5) | 2→3 | 2.6→2.7 | 6→16 days *(6 × 2.6, previous EF, rounded)* |

These two sequences are the minimum unit-test fixtures implied by SM-3's checklist item (d): "Hard/Good/Easy identical next-interval at equal `repetitions`." Additional fixtures (EF floor under repeated Again/Hard, dual-direction independence) are left to the test-design phase but must reconcile against this formula, not an Anki-style approximation.

## FR-12 / FR-19: Cultivation Ladder and Daily Quests

*Added by Sprint Change 2026-11-14. Binding as implementation input: these values are the single constant table in `packages/domain/cultivation.ts` (AD-15). Retuning means editing that table and this section together.*

### Daily quest table

| Bộ | Realms in it | XP per quest | Learn Flashcards target | Clear Review | Max XP per day | Fully missed day |
|---|---|---|---|---|---|---|
| Nhất Bộ Tung Hoành | Ngưng Khí → Dương Thực | 10 | 1 | yes | 20 | −40 |
| Nhị Bộ Phi Thăng | Khuy Niết → Thiên Nhân Ngũ Suy | 20 | 2 | yes | 40 | −80 |
| Tam Bộ Vô Biên | Không Niết → Đạp Thiên Kiều | 40 | 3 | yes | 80 | −160 |
| Tứ Bộ Đạp Thiên | Đạp Thiên Cảnh | 40 | 4 | yes | 80 | −160 |

The penalty for each quest neither claimed nor skipped is 2 × its XP.

### Quest conditions (local day, studied directions)

| Kind | Done when | Skipped when |
|---|---|---|
| `LEARN_FLASHCARDS` (k) | At least min(k, available) Flashcards became fully learned today: the Flashcard has no unlearned record left, and its last unlearned record got `firstGradedAt` today. | No Flashcard had an unlearned record at the start of the day. |
| `CLEAR_REVIEW` | At least one record learned before today was graded today, and the due queue (all Classes) is now empty. | Nothing was due at the start of the day. |

### Cultivation realm ladder (90 levels)

| Bộ | Realm | Stages | XP to advance each stage | Days per stage* |
|---|---|---|---|---|
| Nhất Bộ | Ngưng Khí | Tầng 1–15 | 5·n + 5 (Tầng 1 → 2: 10 … Tầng 15 → Trúc Cơ: 80) | 1 → 4 |
| | Trúc Cơ | Sơ kỳ / Trung kỳ / Hậu kỳ / Đại viên mãn | 100 | 5 |
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
| | Thiên Nhân Ngũ Suy (transition) | Nhất Suy → Ngũ Suy (5) | 1,200 | 30 |
| Tam Bộ | Không Niết | 4 | 2,000 | 25 |
| | Không Linh | 4 | 2,400 | 30 |
| | Không Huyền | 4 | 2,800 | 35 |
| | Không Kiếp | Đại Tôn / Kim Tôn / Thiên Tôn / Đại Thiên Tôn | 4,000 | 50 |
| | Đạp Thiên Kiều (transition) | Đệ Nhất Kiều → Đệ Cửu Kiều (9) | 4,800 | 60 |
| Tứ Bộ | Đạp Thiên Cảnh | final level | — (XP keeps adding up) | — |

\* Assumes both quests are claimed every day. At that pace Ngưng Khí takes about 34 days, Nhất Bộ about 15 months and Đạp Thiên Cảnh about 5.5 years.

Display format: `{realm} · {stage}`, e.g. "Ngưng Khí · Tầng 3", "Trúc Cơ · Trung kỳ", "Thiên Nhân Ngũ Suy · Tam Suy", "Không Kiếp · Kim Tôn", "Đạp Thiên Kiều · Đệ Tam Kiều", "Đạp Thiên Cảnh".
