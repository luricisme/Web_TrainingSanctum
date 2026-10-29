---
title: Training Sanctum — Flashcards Brief Addendum
status: draft
created: 2026-10-29
updated: 2026-10-29
---

# Addendum: Supporting Detail for Architecture

This content was volunteered during brief discovery and is a direct input to the architecture phase — not restated in the brief itself to keep it at a readable length.

## Data Model Detail: Dual-Direction Scheduling

- A single `Card` entity owns the shared content fields: `term`, `definition`, `example_sentence`, `context` (collocation/usage), `part_of_speech`.
- Each `Card` generates two independent scheduling records — one per recall direction (`term → definition`, passive recall; `definition → term`, active recall).
- Each direction's scheduling record carries its own SM-2 state independently: `interval`, `repetitions`, `ease_factor`, `next_review_date`.
- Rationale: passive recognition and active production are cognitively distinct skills; collapsing them into one schedule would mask weakness in production even when recognition is strong.
- Review queues must pull due items per-direction, not per-card, since the two directions of the same card may be due at different times.

## Testing & Architecture Detail

- Clean separation: Domain logic (SM-2 scheduling engine) → API layer → UI layer.
- SM-2 engine requires full unit test coverage including edge cases: interval resets on failed recall, ease-factor floor/ceiling boundaries, rating-to-interval transition correctness.
- Automated coverage expected across layers: unit tests (domain), API/integration tests, and Playwright E2E tests for the review/study flow.
- CI/CD pipeline to run the above automatically; this is a stated success criterion, not optional polish.
- Deployment target: live, publicly accessible demo (not just local), to support the portfolio/case-study goal.

## Comparison Notes (Why Not Just Use Existing Tools)

- **Quizlet:** paywalls spaced repetition and unlimited/offline study; UI is social/public-set-first, not distraction-free.
- **Anki:** scheduling algorithm and data discipline are strong, but UI is dated; adding structured extra fields (context, collocations, example sentences) requires manual card-template/HTML/CSS editing, which is too high-friction for daily use.
- Desired synthesis: Anki's rigor + a native structured language-card data model + a modern minimal UI.

## Persistence & Backup Considerations (Flagged for Architecture)

- Daily-dependency tool — data loss or broken streaks are a dealbreaker, so this is a hard non-functional requirement, not a nice-to-have.
- Candidate directions raised during discovery: reliable managed Postgres persistence, and/or a JSON export/backup capability. Final approach deferred to architecture phase.
