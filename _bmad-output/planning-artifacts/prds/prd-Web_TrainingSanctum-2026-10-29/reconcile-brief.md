---
title: PRD Reconciliation vs. Source Brief
created: 2026-10-29
inputs:
  - brief.md
  - addendum.md
  - prd.md
---

# Reconciliation: PRD vs. Brief + Addendum

## Method

Read all three documents in full. Extracted every idea/requirement/nuance from brief.md and addendum.md, then checked whether each is (a) present in the PRD, (b) deliberately rescoped by a confirmed decision noted in the PRD (§11 Assumptions Index, explicit Phase 1/2 moves, etc.), or (c) silently dropped/contradicted.

## Items Confirmed Present (no gap)

- Dual-direction independent scheduling, rationale, and per-direction due queue — fully captured (Glossary, FR-8, FR-9).
- Native SM-2 (not approximated) — captured (§1 Vision, FR-8).
- Testability as first-class — captured (§6 NFR, FR-8 note).
- Quizlet/Anki comparison rationale — captured in §1 Vision and JTBD framing.
- Scope-creep risk re: future Sanctum modules — captured (§1, §5 Non-Goals).
- Data trust / backup as dealbreaker — captured (FR-13, §6 NFR, promoted to Phase 1 MVP deliberately).
- Unicode/special-character handling, scoped to "no IPA picker UI" — captured and explicitly confirmed as a decision (§11).
- Dark-mode default / Linear-Raycast aesthetic / no gamification — captured (§7).
- Sub-100ms review transition latency and new-card-only batch cap — captured and confirmed as decisions (§11).
- Persistence approach deferred to architecture — captured (Open Questions §10).
- SM-2 edge-case test coverage expectation (interval resets, EF floor) — captured (FR-8, SM-3).

## Gaps Found

1. **Live, publicly accessible deployment is dropped as a requirement.** The addendum states plainly: "Deployment target: live, publicly accessible demo (not just local), to support the portfolio/case-study goal," and the brief's Portfolio success criteria list "A live, publicly accessible deployment." The PRD never mentions public deployment anywhere — not in §1 Vision, §6 NFRs, §8 MVP Scope, or §9 Success Metrics (SM-3/SM-4 cover only test coverage and the retention curve). This isn't an explicit Phase 1/2 rescoping decision either; it's simply absent, so a reader of the PRD alone would not know a public demo is a stated success condition.

2. **"Progress tracking" and the user-visible retention curve have no corresponding FR.** The brief's Core Scope lists "progress tracking" as a capability distinct from "daily study streaks," and the Functional Goals describe "A visible, correct SM-2 retention curve — mature cards resurface at optimal intervals, with observable improvement in long-term recall." The PRD's §9 SM-4 restates this as an internal success metric ("Observable, correct SM-2 retention curve") but §4.7 Progress & Streaks contains only FR-12 (streak counter) and FR-13 (export) — no FR for a user-facing stats/progress view that would let the user actually observe the retention curve or any progress beyond the streak number. As written, SM-4 is unfalsifiable by the product itself.

3. **Ease-factor ceiling is unaddressed.** The addendum explicitly flags "ease-factor floor/ceiling boundaries" as an SM-2 edge case requiring unit test coverage. FR-8 in the PRD specifies the floor (1.3) but says nothing about a ceiling/cap, nor does it state there is deliberately no ceiling (standard SM-2 has none, but that's not stated). This is a minor but real ambiguity against an explicitly-named addendum test requirement.

4. **"Fast load times" is narrowed to only the review-loop transition.** The brief's functional success criteria tie the 60-day streak to being "sustained by fast load times and keyboard-driven review." The PRD's only load-time-adjacent NFR is FR-9's sub-100ms reveal/grade/advance transition inside an active review session. General app/page load time (e.g., opening the app, loading the due queue) isn't addressed as an NFR anywhere, and this narrowing isn't called out as a deliberate decision.

5. **Phase 2 scope quietly drops "UI/UX polish."** The brief's Delivery Approach lists Phase 2 as "UI/UX polish, full Playwright E2E + CI/CD test automation, architecture documentation, portfolio case study." PRD §8.2 Out of Scope for MVP restates Phase 2 as "Full Playwright E2E suite, CI/CD pipeline, architecture documentation, case study" — UI/UX polish is omitted from the list with no note that it was intentionally folded elsewhere or dropped.

## Contradictions

None found. No PRD statement directly contradicts a brief/addendum statement; all deviations above are omissions/narrowings, not conflicts.
