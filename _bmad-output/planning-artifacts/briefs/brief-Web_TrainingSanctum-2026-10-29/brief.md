---
title: Training Sanctum — Flashcards Product Brief
status: draft
created: 2026-10-29
updated: 2026-10-29
---

# Training Sanctum — Flashcards Product Brief

## What This Is

A personal, single-user web application for language learning through flashcards, built by and for its own creator — a QA/Test Automation Engineer learning advanced English vocabulary, idioms, and expressions. It is the first module of a longer-term personal productivity and learning hub ("Training Sanctum"), but v1 is scoped strictly to flashcards.

## Why

Existing tools each solve half the problem:

- **Quizlet** has paywalled core features (spaced repetition, unlimited/offline study) behind a cluttered, social-first UI built around public sets, not distraction-free study.
- **Anki** has an unmatched scheduling algorithm and clean underlying data model, but a dated, clunky UI, and adding structured fields (example sentences, context, collocations) requires manual template/HTML editing — too much friction for daily use.

The gap: Anki's algorithmic rigor and data discipline, paired with a modern, minimal UI that gets out of the way. Two honest drivers justify building this instead of adopting an existing tool:

- **Functional** — a distraction-free, zero-paywall tool purpose-built for contextual English acquisition, with a native (not bolted-on) multi-field card model and correct SM-2 scheduling.
- **Career/portfolio** — a chance to design and ship a production-grade, highly testable web application end-to-end, demonstrating architectural and testing craft.

## Who It's For

The creator, exclusively. No multi-user, social, or public-sharing concerns exist in this product. Every design decision optimizes for one daily user's study workflow.

## Core Scope (v1)

- **Card creation & editing** — structured fields out of the box: Term, Definition, Example Sentence, Context/Collocation, Part of Speech. No custom template setup required.
- **Organization** — folders/collections for grouping sets.
- **Import** — paste term/definition pairs or import CSV/Excel for fast bulk entry.
- **Study & spaced repetition** — flip-card review driven by a classic SM-2 (Anki-style) scheduling algorithm, with **independent schedules per recall direction** (see Key Design Decisions).
- **Accounts & progress** — login, progress tracking, daily study streaks.
- **Special character support** for advanced vocabulary/idioms.

**Explicitly out of scope for v1:** Quizlet-style Test mode and Match game, public set discovery/sharing, collaboration, mobile native app, audio/pronunciation.

## Key Design Decisions

- **Dual-direction recall is independent, not shared.** Recognizing a word (Term → Definition, passive recall) is cognitively easier than producing it (Definition → Term, active recall). A single `Card` owns the content fields; each direction gets its own scheduling record (interval, repetitions, ease factor, next review date) so mastery in one direction doesn't mask weakness in the other. Full data model detail in `addendum.md`.
- **SM-2 is implemented natively**, not approximated — chosen deliberately over simpler heuristics for mathematical rigor and portfolio credibility.
- **Testability is a first-class requirement**, not an afterthought, consistent with the creator's QA/test-automation background.

## Goals & Success Criteria

**Functional (is this working as a daily tool?)**
- Adding a new multi-field card via paste/import takes under 5 seconds — fast enough that vocabulary actually gets logged mid-study instead of skipped.
- An unbroken daily study streak of 60+ days, sustained by fast load times and keyboard-driven review (flip, rate recall ease).
- A visible, correct SM-2 retention curve — mature cards resurface at optimal intervals, with observable improvement in long-term recall of advanced vocabulary and collocations.

**Portfolio (is this a strong engineering artifact?)**
- A fully unit-tested SM-2 scheduling engine, including edge cases (interval resets, ease-factor boundaries, rating transitions).
- Clean separation of concerns (Domain → API → UI) with automated test coverage across layers and a working CI/CD pipeline. Testing architecture detail in `addendum.md`.
- A live, publicly accessible deployment backed by architecture documentation, defined data models, and a case study covering engineering trade-offs.

## Delivery Approach

Phased, MVP-first — functionality before perfection, but high craft before broad scope:

- **Phase 1 (~4–6 weeks):** usable daily driver — core CRUD, CSV import, dual-direction SM-2 engine, keyboard-driven review UI.
- **Phase 2 (ongoing):** UI/UX polish, full Playwright E2E + CI/CD test automation, architecture documentation, portfolio case study.

## Risks & Mitigations

- **Scope creep from the "Sanctum" vision.** Future modules (Pomodoro timer with background music, a to-do/task manager) must not leak into v1. Mitigation: hard scope boundary — v1 is flashcards and SM-2 only.
- **Data trust.** This is a daily-dependency tool; lost study history or broken streaks would be a dealbreaker. Requires robust persistence and a backup/export strategy (e.g., JSON export or reliable managed Postgres) — to be settled in architecture.
- **Over-engineering vs. shipping.** Portfolio-grade test coverage (unit, API, E2E) must be balanced against actually shipping a working v1 rather than stalling on infrastructure.

## Technology Direction

Open, to be finalized in the architecture phase — leaning toward a modern TypeScript stack (e.g., React/Next.js) consistent with the portfolio goal and the testability requirement.

## Future Vision (Beyond v1)

Flashcards is module one of a longer-term personal productivity and learning hub. Planned future modules (not in scope now): a Pomodoro timer with background music, and a structured to-do/task manager.
