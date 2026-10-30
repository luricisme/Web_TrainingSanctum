# Reconcile: quizlet-library-view.png

Source: `imports/quizlet-library-view.png` — Quizlet's folder/library screen.

## Taken

- **Left icon sidebar structure** — fixed-width sidebar with icon+label nav items, adapted into Training Sanctum's five-item sidebar (Review, Folders, Import, Stats, Settings), replacing Quizlet's own nav set (Home, Your library, Study groups, Flashcards, Games, Expert Solutions).
- **List-row structure grouped under date headers** — Quizlet groups folders under "In April 2026" / "In December 2025" style date headers; Training Sanctum repurposes this exact row+header grouping pattern for folder/alphabetical grouping instead of chronological grouping (`DESIGN.md.components.list_style`).
- **Row anatomy** — folder icon chip, name, overflow ("...") menu per row, hover-highlight state.
- **Top search bar concept** — acknowledged as part of Quizlet's persistent structure, though not elaborated into a committed Training Sanctum feature in this pass (no FR currently specifies in-app search; out of scope unless added later).

## Deliberately NOT taken

- **"Study groups," "Members," "Invite with Google / Invite by email / Copy link"** — all social/collaboration surfaces. Training Sanctum is explicitly single-user (PRD §2.2 Non-Users, §5 Non-Goals); no sharing or invite mechanism exists.
- **"Games" nav item** (Match, Blocks, Charms) — gamification explicitly excluded per PRD non-goals and the memlog decision calling out Quizlet's games by name as not-referenced.
- **"Upgrade: free 7-day trial" paywall banner and promotional "Help every student succeed" upsell card** — Training Sanctum is zero-paywall per the brief; no monetization chrome of any kind belongs in the UI.
- **Nested folder/subfolder breadcrumb implication** ("Folders / English Idioms / 6 subfolders" style) — the PRD explicitly makes folders flat, single-level only (FR-5, Glossary); any nested-folder browsing pattern from Quizlet's library view was not carried over.

## Dropped idea

Quizlet's "Members" tab (for shared sets) suggested a possible future collaboration surface, but this was dropped entirely — not deferred, not scaffolded — because the PRD's non-goals rule out multi-user functionality for this product's lifetime at v1, and the brief states Training Sanctum has no planned social dimension even in future Sanctum modules.
