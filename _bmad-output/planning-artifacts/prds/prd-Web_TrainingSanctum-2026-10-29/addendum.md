---
title: Training Sanctum — Flashcards PRD Addendum
status: draft
created: 2026-10-29
updated: 2026-10-29
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
