# PRD Quality Review — Training Sanctum — Flashcards

## Overall verdict

This PRD is a strong build input for a solo-developer portfolio project: it has a real thesis (daily-habit tool + portfolio artifact), FRs with testable consequences, honest scope decisions with reasoning shown, and clean ID/glossary hygiene. The few weak spots are narrow and mechanical — a couple of FRs lean on external knowledge ("standard SM-2 algorithm," undefined session "expiry") rather than fully specified bounds — not structural problems. Calibrated to a solo hobby/portfolio project, this PRD clears the bar for moving into architecture and story-writing with minimal rework.

## Decision-readiness — strong

Decisions are stated as decisions with reasoning shown, not smoothed over. §8.1 explicitly surfaces a real trade-off: export (FR-13) is "promoted into Phase 1... rather than waiting for Phase 2 polish" with the reason given (data loss is a stated dealbreaker). FR-5's folder-deletion default ("move to Unsorted... deleting the Cards with the Folder is available as an explicit alternative, not the default") names the choice and the road not taken. The single `[NOTE FOR PM]` (§4.5, on SM-2 test-coverage priority) lands at a real resourcing tension, not a safe checkpoint.

### Findings
- **low** Thin Open Questions list (§10, PRD Quality Review) — Only one open item (persistence choice), which is appropriate for this stakes level but worth naming: a reader shouldn't assume everything else is settled. *Fix:* none needed; note is informational only.

## Substance over theater — strong

No persona theater — §2 uses a single JTBD list for the one real user instead of inflating personas. The Vision (§1) is specific enough that it couldn't swap into another PRD: it names the dual mandate (daily-use survival + portfolio demonstration of "native SM-2, not approximated"), which is unusual and product-specific, not boilerplate. NFRs in §6 avoid generic adjectives — "sub-100ms perceived transition latency" (review performance) and "Full Unicode/special-character input" (accessibility) are both bounded, not vague ("scalable," "secure" do not appear unqualified).

### Findings
None — no findings needed for this dimension.

## Strategic coherence — strong

The PRD has a stated thesis: a daily-dependency habit tool that must survive the 60-day abandonment test, paired with a portfolio engineering goal. Feature prioritization follows this — the SM-2 engine (§4.5) is called "the product's algorithmic and portfolio centerpiece," review-session UX is treated as the surface users touch daily, and export was reprioritized into MVP specifically because of the thesis (data loss = dealbreaker, §8.1). Success Metrics mix engagement (SM-2: 60-day streak) with algorithmic correctness (SM-3, SM-4), and counter-metrics are explicitly named for both (SM-C1 against grade-dishonesty from streak pressure, SM-C2 against vanity test-coverage). This is exactly the pattern the rubric looks for and most PRDs skip.

### Findings
None — no findings needed for this dimension.

## Done-ness clarity — adequate

Every FR has a "Consequences (testable)" block, and several vague-sounding terms are converted into bounds inline — e.g. FR-9's "no perceptible lag" is pinned to "sub-100ms perceived transition latency," and FR-3's "special character support" is scoped to "full Unicode input/display, not a dedicated IPA/phonetic symbol picker." This is the dimension the rubric asks to be unforgiving on, and most FRs pass. Two gaps keep it at adequate rather than strong:

### Findings
- **medium** SM-2 algorithm cited, not specified (FR-8, §4.5) — FR-8 says intervals/EF are computed "using the standard SM-2 algorithm" and gives defaults, floors, and the grade→quality mapping, but never states the EF update formula itself (the standard SM-2 EF recalculation is `EF' = EF + (0.1 − (5−q)×(0.08+(5−q)×0.02))`). Consequences cover edge behavior (floor, reset-on-Again) but not the core computation an implementer would need to verify unit tests against. Since this PRD is also the architecture input, "standard algorithm" is a citation, not a testable consequence. *Fix:* either embed the EF formula and per-grade interval-growth rule in FR-8's consequences, or add an explicit pointer to the canonical SM-2 reference the implementation must match.
- **low** Undefined session expiry (FR-2) — "stays authenticated... until explicit logout or expiry" never states what the expiry duration is, so there's no testable consequence for the expiry half of the FR. *Fix:* state a duration (or "no expiry in v1") as a consequence.
- **low** Due-queue ordering unspecified (FR-9) — the FR states cards are pulled "per-direction, not per-card" but doesn't say what determines the order of due items within the queue (oldest-due-first, random, interleaved by direction). Low stakes for a single-user tool but worth a one-line consequence for architecture to anchor on.

## Scope honesty — strong

Non-Goals (§5) and MVP Out-of-Scope (§8.2) are explicit and specific (Quizlet-style modes, multi-user, native mobile, audio, custom templates, other Sanctum modules). The Assumptions Index (§11) shows a closed loop — every prior assumption is named by location and marked resolved rather than silently dropped. Open-items density (1 Open Question, 0 live `[ASSUMPTION]` tags, 1 `[NOTE FOR PM]`) is appropriately low for a solo green-light-to-build PRD at this stakes level — this is a good sign, not a gap.

### Findings
None — no findings needed for this dimension.

## Downstream usability — strong

Glossary (§3) terms (Card, Folder, Scheduling Record, Due Queue, Streak, Recall Direction) are used with consistent capitalization across FRs and UJs. FR IDs run FR-1–FR-13 with no gaps or duplicates; UJ-to-FR and SM-to-FR cross-references all resolve (e.g., UJ-1 → FR-3/FR-6, SM-2 → FR-9–FR-12) and every referenced ID exists in the document. Each Feature section (§4.x) carries its own Description plus FRs, so a section can be pulled out and read in isolation.

### Findings
- **low** UJs use "the user" rather than a named protagonist (§2.3) — the rubric calls named protagonists load-bearing for UJs, but this is explicitly flagged by the PRD itself as a deliberate single-operator calibration ("journeys are lighter-weight JTBD restatements... per the product's scope"). Acceptable given shape fit; noted for completeness only.

## Shape fit — strong

The PRD self-calibrates correctly: §2.3 explicitly states UJs are lightweight JTBD restatements rather than full narratives "per the product's scope," which is the right call for a single-operator, solo-dev tool. It doesn't over-formalize with a persona set or stakeholder sign-off process the product doesn't need, but it still keeps the substance bar (testable FRs, named trade-offs, glossary discipline) the rubric expects even from a hobby/portfolio project. No evidence of forcing a B2B or multi-stakeholder shape onto a one-user product.

### Findings
None — no findings needed for this dimension.

## Mechanical notes

- **Glossary drift:** Minimal. Narrative prose in UJ-2 uses lowercase "due cards" and "session queue" where the Glossary defines capitalized "Due Queue" — acceptable as prose but worth normalizing if the PRD gets reused verbatim by downstream agents doing text extraction.
- **ID continuity:** Clean. FR-1 through FR-13 contiguous, no gaps/dupes. UJ-1–UJ-3, SM-1–SM-4 plus SM-C1/C2, all contiguous.
- **Cross-reference resolution:** All UJ "(realizes FR-n)" and SM "Validates FR-n" references point to FRs that exist in §4.
- **Assumptions Index roundtrip:** Clean — §11 names four prior assumption locations (§4.1, §4.2, §4.6, §7) and states all are resolved; no live `[ASSUMPTION]` tags remain unindexed.
- **UJ protagonist naming:** All three UJs use "the user" as protagonist, consistent with the single-operator shape call-out in §2.3; not flagged as a defect given that context.
- **Required sections:** All present for this stakes level (Vision, Target User, Glossary, Features/FRs, Non-Goals, NFRs, MVP Scope, Success Metrics, Open Questions, Assumptions Index).
