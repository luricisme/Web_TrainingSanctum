# Adversarial Review — Training Sanctum Flashcards PRD

**Target:** `prd.md` (prd-Web_TrainingSanctum-2026-10-29)
**Reviewer stance:** adversarial, pre-architecture gate
**Scope note:** findings are grounded strictly in what the document states or fails to state; no requirements are invented.

---

## CRITICAL

### C-1. "Standard SM-2" is never actually specified, and the grade mapping hides a known SM-2 gotcha
**Location:** FR-8 (§4.5), Glossary "Grade"
**Problem:** The PRD maps Again/Hard/Good/Easy → quality 1/3/4/5 and calls this "the standard SM-2 algorithm," but never writes out the interval/EF update formulas in the document. "Standard SM-2" is not one unambiguous thing — SuperMemo's original 1987 formula, Anki's modified SM-2, and various reimplementations disagree on details. Critically, in classical SM-2, the *interval* computed on a pass (`I(n) = I(n-1) × EF`) does **not** depend on which passing quality (3, 4, or 5) was given — only the *next* EF differs. That means Hard/Good/Easy all produce the **same next interval** in the session they're graded in, with the difference only showing up one review later via the updated EF. This is deeply counter-intuitive (most users assume "Hard" immediately shortens the interval, the way Anki's UI implies) and is exactly the kind of thing a QA engineer building "correct, not approximated" SM-2 needs nailed down before architecture, not discovered during implementation or (worse) during the "100% SM-2 edge case coverage" testing pass.
**Failure scenario:** Architect/dev builds the engine assuming Hard yields a shorter interval than Good (Anki-like behavior), ships it, then the "correct algorithmic implementation" portfolio claim is factually wrong against the classical algorithm the PRD says it's implementing — a rework of the centerpiece feature after the fact.
**Fix:** Add an explicit worked table to FR-8 (or an appendix) specifying interval and EF formulas for at least 2-3 full example progressions per grade sequence (e.g., New→Good→Good→Hard→Again), so there's zero ambiguity about whether this is textbook SM-2 or an Anki-style variant.

### C-2. Backup/export has no restore path — the durability "dealbreaker" risk is not actually mitigated
**Location:** FR-13 (§4.7), §6 Cross-Cutting NFRs (Data durability)
**Problem:** FR-13 only specifies export (Card + both Scheduling Records + streak history → JSON). There is no FR for *importing/restoring* that export format. FR-6/FR-7 (the only import paths) map CSV/Excel columns to the five Card fields only — they say nothing about reconstructing `interval`, `repetitions`, `ease_factor`, `next_review_date`, or streak history. The JTBD explicitly states "a lost streak or corrupted schedule is a dealbreaker," and §6 calls durability a hard NFR — but as written, if the primary datastore is lost, the only recovery mechanism (export) produces a file nothing in the product can read back in to recover scheduling state or streak. Export without restore is not a backup.
**Failure scenario:** Database gets corrupted/lost. User has a JSON export. There is no FR describing how to turn that export back into working data — the "backup" is a file with no product-side consumer, exactly the dealbreaker scenario the brief calls out.
**Fix:** Add an FR for restore/import-from-backup that explicitly round-trips Scheduling Records and streak history (not just the five Card fields), or explicitly scope restore to Phase 2 and say so — but as written it's silently missing, not deferred.

---

## HIGH

### H-1. Streak completion criterion contradicts itself between UJ-2, Glossary, and FR-12
**Location:** UJ-2 (§2.3) vs. Glossary "Streak" (§3) vs. FR-12 (§4.7)
**Problem:** UJ-2 states "The streak counter updates only after the queue clears" — implying a full-queue-clear is required for a day to count. The Glossary and FR-12 both define streak as "consecutive calendar days with at least one completed Review Session," and "Review Session" is glossed as a sitting that clears "some or all" of the due queue. These are contradictory completion bars: does grading one card count, or must the whole day's due queue be emptied? Combined with FR-10 (new-card cap doesn't gate already-due cards, so the due queue could be large), this materially changes daily UX and is exactly the kind of ambiguity that causes a rebuild of streak logic post-implementation.
**Fix:** Pick one definition and make it textually identical everywhere: either "≥1 graded card" or "queue fully cleared" — and if "queue cleared" is the real intent, define what counts as "cleared" when the cap caused some new cards to roll to tomorrow.

### H-2. "New card" is never defined, so FR-10's cap is unimplementable as specified
**Location:** FR-10 (§4.6), Glossary (no entry for "new card")
**Problem:** FR-10 caps "new-card introduction" at a configurable default (20), separate from already-due reviews. But the Glossary defines Due Queue as "Scheduling Records (not Cards)...pulled per-direction," and every Card always produces exactly two Scheduling Records (FR-8, FR-9). It's unclear whether: (a) a freshly-created Card counts as 1 against the cap even though it produces 2 queue entries, (b) each of its two directions counts separately against the cap (so 20 new cards actually means 10 new Cards), or (c) "new" means "repetitions = 0" generically, which could also apply to a card reset by "Again" — but FR-8 explicitly treats an "Again" reset as restarting learning steps, which reads a lot like "new" by the same state signature.
**Failure scenario:** Dev implements the cap counting Scheduling Records; user experiences half as many new words/day as the settings UI implies (or double), and the "daily digestible batch" UX promise in UJ-2 silently fails.
**Fix:** Define "new card" explicitly (e.g., "a Card neither of whose Scheduling Records has ever been graded") and state unambiguously whether the cap counts Cards or Scheduling Records.

### H-3. No duplicate-handling requirement anywhere in Import (FR-6/FR-7)
**Location:** §4.4 Import
**Problem:** Bulk import (the UJ-3 "30 words from a notes app" scenario) has no stated behavior for a pasted/uploaded term that already exists as a Card (exact match, case-variant, or whitespace-variant). Given the product's core risk is "friction causes abandonment" and vocabulary lists commonly accumulate duplicates, this is a realistic, high-frequency edge case with no defined behavior — silently create a duplicate Card (and duplicate Scheduling Records competing in the due queue), silently skip, or prompt?
**Fix:** Add a testable consequence to FR-6/FR-7 specifying duplicate-detection scope (exact term match within a Folder? Globally?) and default resolution.

### H-4. Success metric SM-3 contradicts counter-metric SM-C2 as worded
**Location:** §9 Success Metrics — SM-3 vs. SM-C2
**Problem:** SM-3 states the measurable target as "100% unit test coverage of SM-2 engine edge cases." SM-C2 then explicitly warns "test coverage percentage alone is not the goal — coverage that doesn't exercise real SM-2 edge cases counts as a false signal." But SM-3 itself is stated as a coverage percentage, which is exactly the metric SM-C2 says not to trust. "100% coverage of edge cases" is also not a standard, tool-measurable figure the way line/branch coverage is — "edge cases" isn't a denominator any coverage tool reports, so SM-3 as worded can't actually be verified by a coverage report despite reading like a coverage KPI.
**Fix:** Reword SM-3 as an enumerated checklist of required scenarios (interval-reset case, EF floor case, EF never-negative case, dual-direction independence case, grade-mapping case, etc.) with a pass/fail per scenario, not a percentage.

---

## MEDIUM

### M-1. SM-1 ("under 5 seconds end-to-end") doesn't define start/stop events
**Location:** §9 — SM-1, and echoed in FR-6 consequences
**Problem:** "End-to-end" timing needs a defined start event (first paste keystroke? click "Import"?) and end event (cards visible in UI? persisted to DB? queue updated?). As worded, this metric can be measured three different ways with three different results, and nothing in the architecture-facing NFRs pins it down beyond FR-9's unrelated "sub-100ms transition" standard.
**Fix:** Define the exact timer start/stop instrumentation points in FR-6 or §6.

### M-2. Timezone basis for `next_review_date` vs. streak day-boundary is not reconciled
**Location:** FR-12 ("local-timezone day boundary") vs. FR-8/FR-9 (no timezone mentioned for `next_review_date`)
**Problem:** Streak logic explicitly uses local-timezone calendar days, but Scheduling Record due dates never state a timezone basis. If `next_review_date` is computed/stored in UTC while streak breaks are evaluated in local time, a review done late at night could satisfy the due queue but land on the "wrong" calendar day for streak purposes, or vice versa — a believable bug given this is a single-developer app likely to run across a server timezone and a browser timezone that silently diverge.
**Fix:** State explicitly that both due-date computation and streak-day evaluation use the same timezone basis (presumably user-local), and that this is a single source of truth.

### M-3. SM-2 (60-day streak) and SM-4 (observable retention curve) are not verifiable at ship/release time
**Location:** §9 — SM-2, SM-4
**Problem:** Both metrics require months of real usage after release to evaluate, yet they're listed in the same table as FR-validating "Success Metrics" alongside release-gate-style items (SM-1, SM-3), with no notation distinguishing "acceptance criteria you check before calling this PRD done" from "outcome metrics you only know the answer to two months post-launch." This is fine for a passion project but as written it invites treating SM-2/SM-4 as sign-off gates for the PRD itself, which they structurally cannot be.
**Fix:** Label SM-2 and SM-4 as post-launch longitudinal metrics distinct from pre-ship acceptance metrics (SM-1, SM-3).

### M-4. SM-2 (primary success metric) directly incentivizes the exact behavior SM-C1 warns against, with no product mechanism to resolve the tension
**Location:** §9 — SM-2 vs. SM-C1
**Problem:** The PRD correctly identifies the risk ("a streak kept alive by dishonest grading defeats the product's purpose") but the primary metric is still raw streak length, and no FR introduces any mitigating mechanism (e.g., grade-distribution visibility, retention-vs-grade consistency checks). The counter-metric is observational only ("should not skew") with no owner mechanism — it's a warning label, not a requirement. Worth flagging now since it's cheap to address at FR level (e.g., optionally surfacing grade distribution to the user) and expensive to retrofit later.
**Fix:** Either accept this as an acknowledged, unaddressed tension (valid for v1) or add a lightweight FR (e.g., a simple grade-distribution stat) — but make the choice explicit rather than silent.

### M-5. FR-6's "configurable delimiter" doesn't say where/how it's configured
**Location:** FR-6 (§4.4)
**Problem:** Is the delimiter chosen per paste action (a UI control shown at import time) or a persistent user setting? This changes the import UI design non-trivially and isn't decided.
**Fix:** State whether delimiter selection is per-import or a saved preference.

### M-6. No restart/graduation formula distinguishes "Again" reset from a brand-new card for cap purposes (ties to H-2)
**Location:** FR-8 vs. FR-10
**Problem:** Already flagged under H-2 but worth separating: even once "new card" is defined, FR-8 doesn't say whether a card that failed back to repetitions=0 re-enters the "new" bucket for FR-10's cap, or is treated as "already due" (uncapped) since it was previously introduced. The two FRs were clearly written by thinking about each feature in isolation; they need a reconciling sentence.
**Fix:** Add one sentence to FR-10 clarifying that the cap is keyed on "never-before-graded," not "repetitions == 0."

---

## LOW

### L-1. No explicit non-goal for manual schedule editing / "reset card progress"
**Location:** §5 Non-Goals
**Problem:** Anki-adjacent products commonly get asked for "manually reschedule this card" / "reset to new." Not mentioned anywhere — presumably out of scope, but since this PRD is otherwise careful to enumerate non-goals explicitly (even listing "audio/pronunciation playback" as a non-goal), this omission could be read as an open question rather than a decision.
**Fix:** Add one line to §5 if it's genuinely out of scope.

### L-2. Folder hierarchy (nesting) is assumed flat but never stated
**Location:** FR-5 (§4.3)
**Problem:** "A Card belongs to exactly one Folder" implies flat, non-nested folders, but nesting is never explicitly ruled out the way other scope boundaries are.
**Fix:** One sentence confirming folders are a flat, single-level structure.

### L-3. FR-2 session expiry duration is unstated
**Location:** FR-2 (§4.1)
**Problem:** "Until explicit logout or expiry" doesn't give an expiry value. Low impact for a single-user app, but worth a number before architecture picks a session/token strategy.
**Fix:** State a default (e.g., 30 days) or explicitly defer to architecture.

### L-4. Multi-device/concurrent access is unaddressed
**Location:** FR-2, Glossary
**Problem:** FR-2 mentions "across browser sessions," implying possible access from more than one browser/device under the same single account, but nothing addresses what happens if the same due card is reviewed from two sessions near-simultaneously (double-grading, race on Scheduling Record update). Low priority for a true single-operator workflow, but worth a one-line acknowledgment given FR-2's wording already opens the door to it.
**Fix:** Either explicitly scope to "one active session at a time" or note last-write-wins is acceptable for v1.

---

## Summary Table

| ID | Severity | Area |
|----|----------|------|
| C-1 | Critical | SM-2 algorithm underspecified / Hard-Good-Easy interval gotcha |
| C-2 | Critical | Export has no restore path — durability requirement unmet |
| H-1 | High | Streak completion criterion self-contradictory |
| H-2 | High | "New card" undefined — breaks FR-10 cap |
| H-3 | High | No duplicate-handling in import |
| H-4 | High | SM-3 contradicts SM-C2 (coverage % as the "not the goal" metric) |
| M-1 | Medium | SM-1 timing boundary undefined |
| M-2 | Medium | Timezone basis for due-dates vs. streak not reconciled |
| M-3 | Medium | SM-2/SM-4 not verifiable at ship time, mixed with release-gate metrics |
| M-4 | Medium | SM-2 incentivizes the behavior SM-C1 warns against, no mitigation |
| M-5 | Medium | Delimiter configuration scope unclear |
| M-6 | Medium | "Again"-reset vs. brand-new card for cap purposes unreconciled |
| L-1 | Low | No explicit non-goal for manual schedule editing |
| L-2 | Low | Folder nesting assumption unstated |
| L-3 | Low | Session expiry duration unstated |
| L-4 | Low | Multi-device/concurrent access unaddressed |
