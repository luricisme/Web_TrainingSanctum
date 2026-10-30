---
status: final
created: 2026-10-29
updated: 2026-10-30
sources:
  - ../../prds/prd-Web_TrainingSanctum-2026-10-29/prd.md
  - ../../briefs/brief-Web_TrainingSanctum-2026-10-29/brief.md
---

# Training Sanctum — Experience Spine

> Single-user responsive web app for flashcard-based spaced repetition. Paired with `DESIGN.md`. Protagonist throughout Key Flows is Luric, the real builder and user (QA/Test Automation Engineer) — not a generic persona, per this product's single-operator scope (PRD §2.3).

## Foundation

Responsive web, no native mobile app (PRD §5 Non-Goals: "Native mobile app (responsive web only)"). Single-user, single-tenant — one real account, though the data model is user-scoped for future-proofing (PRD FR-1).

Training Sanctum's visual identity and app structure are deliberately borrowed from two sources, reconciled in `DESIGN.md`:
- **Quizlet** contributes the app shell and component shapes — sidebar navigation, the flashcard/review-card anatomy, the progress counter, and list-row structure for folder/library browsing. Explicitly *not* Quizlet's gamification, social features, or promotional surfaces.
- **spy-family.net** contributes color and editorial grid rhythm — see `{colors.accent}`, `{colors.bg-light}`, and the section-bullet motif in `DESIGN.md`.

This spine describes behavior; visual specs (exact colors, type, radii, shadows) live in `DESIGN.md` and are referenced here only by `{path.to.token}`, never restated as raw values.

## Information Architecture

| Surface | Reached from | Purpose |
|---|---|---|
| Review | Sidebar / app open (default landing when cards are due) | Daily due-queue review session (focus mode) |
| Folders | Sidebar | Browse/manage folders and the cards within them (FR-5) |
| Import | Sidebar | Paste or upload-file bulk card entry (FR-6, FR-7) |
| Stats | Sidebar | Streak, card totals, SM-2 retention-curve visualization (FR-15) |
| Settings | Sidebar | Daily new-card limit, theme toggle, export, restore, logout |

Five-item flat sidebar nav (`{components.sidebar}` in `DESIGN.md`): Review, Folders, Import, Stats, Settings — no nesting, no secondary nav level. During an active Review Session, the sidebar and all other chrome are hidden entirely (focus mode, FR-11); exiting review (queue cleared or user navigates away) restores it. When the due queue is empty, Review shows the Empty due-queue state instead of the sidebar-less review card.

→ Composition reference: [`mockups/key-screens.html`](./mockups/key-screens.html) (Review Session, Folders, Empty Queue, theme toggle, all live/interactive). Spine wins on conflict with the mockup.

## Voice and Tone

Microcopy. Brand voice and aesthetic posture live in `DESIGN.md`.

| Do | Don't |
|---|---|
| "+ Add card" | "Let's log a new word! ✨" |
| "You're all caught up — nothing is due for review right now." | "Great job! You crushed it today! 🎉" |
| "14-day streak" | "🔥🔥🔥 14 DAY STREAK!!" |
| "Created (24) · Duplicates skipped (3) · Errors (2)" | "Import successful!" (toast-only, no detail) |
| "This will replace all current data." (restore warning) | "⚠️ WARNING: Are you REALLY sure?!" |
| Direct imperative, short labels: "Add card", "Import", "Grade" | Cheerleading, exclamation marks, mascot voice |

## Component Patterns

Behavioral. Visual specs live in `DESIGN.md.components`.

| Component | Use | Behavioral rules |
|---|---|---|
| Flip-card | Review | Click/tap anywhere on the card, or press Space, triggers the Quizlet-style 3D Y-axis flip to reveal the answer. Card bounds stay fixed before and after flip — no resize, no content-swap-without-motion. Grading resets the card to its unflipped prompt state for the next queue entry. |
| Grade buttons | Review, appear after flip only | Again / Hard / Good / Easy, keyboard-mapped 1–4 (or J/K/L/; per PRD FR-9). Again is visually distinct (danger-toned); Hard/Good/Easy are equal in weight to each other — this is intentional, since classical SM-2 (FR-8) makes Hard/Good/Easy produce an identical next interval; a UI implying otherwise would misrepresent the algorithm. |
| Import tabs | Import screen | Paste / Upload-file pill tabs on one unified screen. Both tabs feed the same column-mapping + error-review step before commit — no divergent flows per source type. |
| Import results | Import screen, post-commit | Single results screen grouped into exactly 3 sections: Created (N), Duplicates skipped (N), Errors (N, each with line number + reason). Never a toast-only summary — the detail must stay on-screen for review. |
| Folder-delete modal | Folders, delete action | Centered modal, two explicit buttons: "Move to Unsorted" (default/primary) and "Delete cards too" (secondary, danger-styled). No checkbox — the user picks one action directly. |
| Restore-from-backup modal | Settings, restore action | Simple warning modal stating the consequence ("This will replace all current data") with Confirm/Cancel. No type-to-confirm text input. |
| Folder/list row | Folders | Rows grouped under section headers (date- or alphabet-style), hover-highlight, trailing overflow ("...") menu. Click row to open folder; click overflow for rename/delete. |
| Empty due-queue state | Review, when nothing is due | Shows current/longest streak, a calm congratulatory line, and a prominent "+ Add card" shortcut — never a bare message, never a fallthrough to Folders. |

## State Patterns

| State | Surface | Treatment |
|---|---|---|
| Due queue empty | Review | Empty due-queue state: streak + congratulatory line + "+ Add card" (see Component Patterns). |
| Import results | Import, post-commit | 3-group layout: Created / Duplicates skipped / Errors, each with counts; Errors list line number + reason per failed row. Valid rows still commit even when some rows fail (FR-6, FR-7). |
| Field-level validation error | Card create/edit | Inline, per-field — e.g. empty Term or Definition rejected with a field-level error, not a blocking modal (FR-3). |
| Folder deletion | Folders | Modal gate before any destructive action — never silently orphans or deletes cards (FR-5). |
| Restore confirmation | Settings | Modal gate before replacing existing data — restore requires explicit confirmation when the account already has data (FR-14). |
| Daily batch cap reached | Review | New-card portion of the session ends; already-due older cards remain available and are never withheld by the cap (FR-10). No blocking message — the queue simply continues with due cards only. |
| Streak broken | Stats / outside review | Current streak resets to 0 at the next calendar-day boundary with zero graded cards; no "streak frozen" or vacation-pause mechanic ships in v1 (FR-12). |

## Interaction Primitives

- **Keyboard (desktop-first, Review session):** Space reveals the answer; 1–4 or J/K/L/; submit a Grade (Again/Hard/Good/Easy respectively). No action in the review loop requires the mouse (FR-9). Reveal/grade/advance renders with no perceptible lag under rapid sequential key presses — sub-100ms perceived transition latency (PRD §6 NFR).
- **Mobile (touch, Review session):** Tap-to-flip the card (touch equivalent of click), **plus** swipe gestures — left/right/up/down mapped to the 4 grades — as an added interaction layer, alongside ordinary tap targets on the grade buttons themselves. Swipe is additive, not a replacement for tapping the grade buttons.
- **Banned in the review loop:** any affordance implying Hard produces a shorter next interval than Good/Easy at the same repetition count (misrepresents classical SM-2, FR-8); gamified feedback (confetti, badges, mascot animation) on grading.

## Accessibility Floor

Behavioral. Visual contrast lives in `DESIGN.md` (flagged there: sage-green light mode needs explicit verification against white cards/charcoal text).

- WCAG AA contrast ratios required in **both** themes (dark default and light toggle).
- Clearly visible focus-ring / `:focus-visible` state on every interactive element, sufficient for full keyboard navigation of the entire app, not just the review loop.
- Tab order follows reading order on every surface.
- **Explicitly out of scope:** deep ARIA/screen-reader optimization. This is a single-user product (the builder); accessibility work here targets the WCAG AA contrast + full-keyboard-nav floor, not comprehensive assistive-technology support.

## Key Flows

### Flow 1 — Logging a word in under 5 seconds (Luric, mid-reading, hits a word worth keeping)

1. Luric is reading something unrelated to the app and hits a word worth keeping.
2. He opens Training Sanctum and goes to Import (or the quick-add shortcut from the Empty due-queue state).
3. He pastes `term — definition` into the Paste tab (or types it into the structured Card fields directly).
4. The column-mapping/error-review step confirms the pair parsed correctly.
5. He commits.
6. **Climax:** the new Card is saved to the right folder and visible in the UI before he's lost his train of thought — realized end-to-end in under 5 seconds (PRD SM-1, FR-6), closing UJ-1.

Failure: a malformed line (missing delimiter) is reported individually with its reason, without discarding any other valid line in the same paste.

### Flow 2 — The daily review session (Luric, every day, no exceptions)

1. Luric opens the app. Due cards exist, so Review loads directly into focus mode — no sidebar, no streak badge, no nav competing for attention (FR-11).
2. The first due Scheduling Record shows its prompt side. He presses Space; the card performs its 3D flip to reveal the answer.
3. He grades with a single keystroke (1–4 or J/K/L/;). The card resets and the next due entry appears immediately — no perceptible lag (FR-9).
4. He repeats through the queue. A Card due in both directions appears as two independent, separately-gradable entries.
5. He doesn't have to clear the whole queue — grading even one card today is enough.
6. **Climax:** he grades his last card for the session (whether or not the queue is empty) and exits review. The streak indicator — invisible during the session itself — reappears outside review, now showing the day counted (FR-12), proof the habit held one more day.

Failure: he stops partway through the queue — the streak still counts for the day because at least one Scheduling Record was graded; remaining due cards simply wait for the next session.

### Flow 3 — Bulk import after a study binge (Luric, a week's worth of notes-app vocabulary)

1. Luric has accumulated roughly 30 new words in a notes app over the week.
2. He opens Import and switches to the Upload-file tab, selecting his CSV.
3. The column-mapping step appears — he maps his file's columns to the five Card fields (order doesn't need to match).
4. He commits the import.
5. The system parses all rows in one pass; a few rows with bad formatting or duplicate terms are set aside automatically.
6. **Climax:** the results screen shows three grouped outcomes at a glance — "Created (27), Duplicates skipped (2), Errors (1: line 14, missing definition)" — so he can see exactly what happened without hunting through a toast or re-checking his file row by row. Thirty manual entries became one pass and one glance.

Failure: if every row in the file is malformed, Created shows (0) and every row appears under Errors with its line number and reason — the import still completes without crashing, and nothing is silently lost.

## Responsive & Platform

| Breakpoint | Behavior |
|---|---|
| Desktop (`>1024px`) | Full sidebar (240px) + content area in browsing screens; review session centered, single-column, card capped at 640px. Keyboard-first interaction is primary. |
| Tablet (`640–1024px`) | Same structure as desktop; sidebar and content both remain visible, review session unaffected. |
| Mobile (`<640px`) | Sidebar hidden; browsing screens single-column. Review session: tap-to-flip plus swipe-to-grade, layered on top of the grade buttons' own tap targets — see Interaction Primitives for the full mapping. Grade-button row wraps when needed. |

Training Sanctum is responsive web only — no native mobile app ships in v1 (PRD §5). The mobile review experience is the one surface where interaction diverges meaningfully from desktop (swipe added as a layer), because the review loop is the product's single highest-frequency interaction and must stay fast on whichever device Luric has in hand at the moment of study.

## Inspiration & Anti-patterns

- **Lifted from Quizlet:** sidebar icon-nav structure; flashcard/review-card anatomy and 3D flip interaction; progress counter ("X / Y"); list-row + overflow-menu pattern for folder browsing.
- **Lifted from spy-family.net:** color palette (sage/charcoal/red); editorial grid rhythm; small red square bullet as a section-header marker.
- **Rejected — Quizlet's Match/Blocks/Charms games, Study-with-Friends, social Test mode:** gamified and social features are explicitly out of this product's model (PRD §2.2 Non-Users, §5 Non-Goals) — this is a solitary study tool, not a competitive or social one.
- **Rejected — Quizlet's "Ask Quizlet" AI chat bubble and promo/upsell banners:** no AI-assistant surface and no monetization chrome belong in a personal, zero-paywall tool.
- **Rejected — streak-pressure gamification (badges, confetti on grading):** PRD's counter-metric SM-C1 explicitly warns against grade distribution skewing toward "Easy"/"Good" under streak pressure; celebratory grading feedback would work against honest self-assessment.
- **Rejected — Anki-style "Hard shortens next interval" implication:** classical SM-2 (FR-8, binding) makes Hard/Good/Easy produce the same next interval at a given repetition count; any UI suggesting otherwise (e.g., unequal visual weight among the three) would misrepresent the algorithm.
