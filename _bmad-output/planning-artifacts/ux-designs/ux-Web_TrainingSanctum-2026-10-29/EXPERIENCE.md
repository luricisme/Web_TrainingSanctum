---
status: final
created: 2026-10-29
updated: 2026-11-14
sources:
  - ../../prds/prd-Web_TrainingSanctum-2026-10-29/prd.md
  - ../../briefs/brief-Web_TrainingSanctum-2026-10-29/brief.md
---

# Training Sanctum — Experience Spine

> Single-user responsive web app for flashcard-based spaced repetition. Paired with `DESIGN.md`. Protagonist throughout Key Flows is Luric, the real builder and user (QA/Test Automation Engineer) — not a generic persona, per this product's single-operator scope (PRD §2.3).

## Foundation

Responsive web, no native mobile app (PRD §5 Non-Goals: "Native mobile app (responsive web only)"). Single-user, single-tenant — one real account, though the data model is user-scoped for future-proofing (PRD FR-1).

Training Sanctum's visual identity and app structure are deliberately borrowed from two sources, reconciled in `DESIGN.md`:
- **Quizlet** contributes the app shell and component shapes — sidebar navigation, the flashcard/review-card anatomy, the progress counter, and list-row structure for class/folder/flashcard browsing, and the Manual card-entry editor (numbered term/definition rows). Explicitly *not* Quizlet's gamification, social features, or promotional surfaces.
- **spy-family.net** contributes editorial grid rhythm and the section-bullet motif. Color comes from the "Focus Indigo" palette — see `{colors.accent}` in `DESIGN.md`.

This spine describes behavior; visual specs (exact colors, type, radii, shadows) live in `DESIGN.md` and are referenced here only by `{path.to.token}`, never restated as raw values.

## Information Architecture

Content hierarchy is fixed at four levels: **Class → Folder → Flashcard → Card** (PRD FR-5). A Class holds Folders, never Flashcards or Cards directly; every Class has one built-in "Unsorted" Folder; a Folder holds Flashcards (named sets); a Flashcard holds Cards. Cards are only ever created from inside a Flashcard.

| Surface | Reached from | Purpose |
|---|---|---|
| Review | Sidebar / app open (default landing when cards are due) | Daily due-queue review of learned Cards across all Classes (focus mode); never introduces new Cards |
| Classes | Sidebar | List of Classes with Folder, Flashcard and Card counts; create / rename / delete Class (FR-5) |
| Class detail | Classes → a Class | That Class's Folders (Unsorted first); create / rename / delete Folder; "Review this class" |
| Folder detail | Class detail → a Folder | That Folder's Flashcards as rows (Card counts); create Flashcard; per-row "..." menu with Rename, Move to…, Delete; "Review this folder" |
| Flashcard detail | Folder detail → a Flashcard | Card viewer (flip, ← →) on top; **"Learn"** button below it; then that Flashcard's Cards list; "Add cards" (Manual / Import); Edit and Delete on each Card (no Move) |
| Learn | Flashcard detail → "Learn" | Graded session for one Flashcard: its unlearned directions (in the studied directions, FR-18), then its due Cards; same session screen and focus mode as Review (FR-17). An entry graded Again comes back at the end of the session until graded Hard/Good/Easy (practice repeats are not saved; the first grade sets the schedule). When it ends, "Study all cards again" runs every Card as unsaved practice (FR-17). |
| Add cards panel | Flashcard detail → "Add cards", or "+ Add card" on the Empty due-queue state | Manual mode (Quizlet-style row editor, FR-3) or Import mode (Paste / Upload file, FR-6, FR-7), always into one target Flashcard |
| Cultivation | Sidebar (replaces Stats, Sprint Change 2026-11-14) | Realm and stage with XP bar, today's Daily Quests, missed-day and breakthrough notices, then card totals, SM-2 retention-curve visualization and XP history (FR-12, FR-15, FR-19) |
| Settings | Sidebar | Theme toggle, Study directions (FR-18), export, restore, logout |

Four-item flat sidebar nav (`{components.sidebar}` in `DESIGN.md`): Review, Classes, Cultivation, Settings — no secondary nav level. The Realm badge sits at the bottom of the sidebar. **There is no Import item or Import page**: import is the second mode of a Flashcard's "Add cards", so the target Flashcard is always known. Class detail, Folder detail and Flashcard detail are reached by drilling in from Classes and show a breadcrumb ("Classes / IELTS / Speaking" on a Folder, "Classes / IELTS / Speaking / Weather idioms" on a Flashcard); the Classes sidebar item stays active on all of them. During an active Review Session, the sidebar and all other chrome are hidden entirely (focus mode, FR-11); exiting review (queue cleared or user navigates away) restores it. When the due queue is empty, Review shows the Empty due-queue state instead of the sidebar-less review card.

→ Composition reference: [`mockups/key-screens.html`](./mockups/key-screens.html) (Review Session, Classes, Folder detail, Flashcard detail with Add cards, Empty Queue, theme toggle, all live/interactive). Spine wins on conflict with the mockup.

## Voice and Tone

Microcopy. Brand voice and aesthetic posture live in `DESIGN.md`.

| Do | Don't |
|---|---|
| "+ Add card" | "Let's log a new word! ✨" |
| "You're all caught up — nothing is due for review right now." | "Great job! You crushed it today! 🎉" |
| "Trúc Cơ · Trung kỳ — 40 / 100 XP" | "⚡ BREAKTHROUGH!! You are now a TRÚC CƠ master!!" |
| "Nov 12: 2 quests missed, −40 XP. Now Ngưng Khí · Tầng 9." | "💀 You failed your cultivation! Shame!" |
| "Created (24) · Duplicates skipped (3) · Errors (2)" | "Import successful!" (toast-only, no detail) |
| "Add cards to Weather idioms" | "Import" with no target named |
| "This will replace all current data." (restore warning) | "⚠️ WARNING: Are you REALLY sure?!" |
| Direct imperative, short labels: "Add card", "Import", "Grade" | Cheerleading, exclamation marks, mascot voice |

## Component Patterns

Behavioral. Visual specs live in `DESIGN.md.components`.

| Component | Use | Behavioral rules |
|---|---|---|
| Flip-card | Review, Learn, Card viewer | Click/tap anywhere on the card, or press Space, flips it either way (Quizlet-style 3D Y-axis). Card bounds stay fixed before and after flip — no resize, no content-swap-without-motion. Grading (Review/Learn) or ← → (Card viewer) shows the next Card on its unflipped prompt side. |
| Grade buttons | Review and Learn; appear after the first flip and stay while the user flips back, until the entry is graded | Again / Hard / Good / Easy, keyboard-mapped 1–4 (or J/K/L/; per PRD FR-9). Again is visually distinct (error-toned, never the accent); Hard/Good/Easy are equal in weight to each other — this is intentional, since classical SM-2 (FR-8) makes Hard/Good/Easy produce an identical next interval; a UI implying otherwise would misrepresent the algorithm. |
| Add cards panel | Flashcard detail → "Add cards" | Opens over the Flashcard with the target Flashcard named in its header ("Add cards to Weather idioms") and a two-option pill switcher: **Manual** (default) and **Import**. Switching modes keeps the target Flashcard. Closing with unsaved Manual rows asks before discarding them. |
| Manual mode | Add cards panel | Quizlet-style editor: numbered rows, each with Term and Definition side by side; a "More fields" toggle per row reveals Example Sentence, Context/Collocation, Part of Speech. Starts with 3 empty rows. Tab moves field to field; Enter in the last field of the last row adds a row; "+ Add row" button below. One "Save" creates every row with Term + Definition filled; fully empty rows are ignored; half-filled rows get inline field errors and are not created, while valid rows still save. |
| Import mode | Add cards panel | Paste / Upload-file sub-tabs. Paste: delimiter picker + text box + "Preview" (no column mapping). Upload: file → column-mapping step → "Preview". Both end in the import review editor — no divergent flows per source type, and nothing is saved before Save (FR-6, FR-7). |
| Import review editor | Add cards panel, after Preview | The Manual-mode row editor, prefilled with the parsed rows. Each row shows its source line number ("line 14") instead of a plain index, a remove (×) button, and any problem inline: malformed rows show the reason under the field ("No delimiter found"); duplicates show "Already in Weather idioms — will be skipped", which clears once the Term is edited. A summary strip above the rows ("30 rows · 2 need fixing · 1 duplicate") jumps to the first problem row on click. "+ Add row" still works here. "Back" returns to the paste box / mapping with the edits discarded after a confirm. The footer button reads "Save 27 cards" (count of rows that will be created). |
| Import results | Add cards panel, after Save in the review editor | Single results view grouped into exactly 3 sections: Created (N), Duplicates skipped (N), Errors (N, each with line number + reason). Never a toast-only summary — the detail must stay on-screen for review. "Done" returns to the Flashcard, now showing the new Cards. |
| Folder-delete modal | Class detail, Folder "..." → Delete | Centered modal, two explicit buttons: "Move flashcards to Unsorted" (default/primary — the same Class's Unsorted) and "Delete flashcards too" (secondary, danger-styled; also deletes their Cards). No checkbox — the user picks one action directly. Not offered for the Unsorted Folder. |
| Flashcard-delete modal | Folder detail, Flashcard "..." → Delete | Centered modal naming the Flashcard and its Card count ("Delete Weather idioms and its 24 cards?"), with Cancel and a danger-styled "Delete flashcard". |
| Move-flashcard modal | Folder detail, Flashcard "..." → Move to… | Class → Folder picker (any Folder in any Class); a name clash in the target Folder is resolved by adding " (2)", " (3)" to the moved Flashcard's name. |
| Class-delete modal | Classes, Class "..." → Delete | States what the Class contains ("3 folders · 9 flashcards · 84 cards"). Primary: "Move folders to…" with a Class picker; Unsorted Flashcards merge into the target's Unsorted, clashing Folder and Flashcard names get " (2)". Secondary, danger-styled: "Delete class and everything in it", enabled only after typing the Class name. If no other Class exists, only the delete option is shown. |
| Restore-from-backup modal | Settings, restore action | Simple warning modal stating the consequence ("This will replace all current data") with Confirm/Cancel. No type-to-confirm text input. |
| Class/Folder/Flashcard list row | Classes, Class detail, Folder detail | Rows grouped under section headers (e.g. "Recently studied", "All folders", "All flashcards"), hover-highlight, trailing overflow ("...") menu. Click a row to drill in; overflow holds rename/delete (Unsorted shows neither); Flashcard rows hold Rename, Move to…, Delete. Class rows show Folder, Flashcard and Card counts; Folder rows show Flashcard + Card counts; Flashcard rows show Card count. |
| Card row | Flashcard detail | Term and Definition, hover-highlight, overflow menu with Edit and Delete only — no Move (Cards are moved only by moving their Flashcard). |
| Empty due-queue state | Review, when nothing is due | Shows the realm and stage with its XP bar, "Today's quests 1 / 2" linking to Cultivation, a calm line, and — when any Flashcard still has Unlearned Cards — a short list of up to 3 such Flashcards ("Weather idioms · 12 new") linking to their page; otherwise a prominent "+ Add card" shortcut that opens Manual mode for the last-used Flashcard (with a Flashcard picker to change it). Never a bare message, never a fallthrough to Classes. |
| Card viewer | Flashcard detail, top | One flip-card (Term side first; Definition side first when only Definition → Term is studied, FR-18) over all of the Flashcard's Cards in list order; ← → buttons flanking a mono "X / N" counter beneath it; ← disabled on the first Card, → on the last; no grading, no shuffle, no autoplay; viewing never changes scheduling (FR-16). Hidden when the Flashcard is empty (its empty state shows instead). |
| Learn button | Flashcard detail, directly under the Card viewer | The page's one primary (accent) action. Label carries what is waiting: "Learn · 12 new · 3 due"; just "Learn" when nothing waits (FR-17). "Add cards" becomes secondary while the viewer is shown. |
| Study directions | Settings, its own section below Theme | One choice of three: "Both directions" (default), "Term → Definition", "Definition → Term" (FR-18). Saves on change, no Save button; a quiet "Saved" status confirms it and an inline error rolls the choice back. Helper line: "Which way cards are asked in Learn and Review. Turning a direction off keeps its progress." Keyboard: arrow keys move between the three options (radio group). |
| Daily quest list | Cultivation page, top | Two checkbox rows, Learn Flashcards and Clear Review (FR-19), sized by the user's Bộ. Each row: label ("Learn 1 Flashcard", "Clear Review"), mono progress ("0 / 1 Flashcards", "12 due left"), and "+10 XP" on the right. **Locked** (condition not met): checkbox disabled, the reason as helper text. **Done, not ticked:** checkbox enabled, helper "Done. Tick to claim before the day ends." (an unticked quest is penalized at day end). **Skipped:** greyed out, "Nothing to do today.", no checkbox. **Claimed:** checked, not interactive. Ticking claims at once (no confirm); on failure the tick rolls back with an inline error. Space toggles a focused checkbox. |
| Realm badge | Sidebar bottom; outside review only | Text "{realm} · {stage}" (realm names in Vietnamese) above a thin XP bar with mono "40 / 100 XP". Links to Cultivation. Hidden during focus mode (FR-11) and with the sidebar on mobile. |

## State Patterns

| State | Surface | Treatment |
|---|---|---|
| Due queue empty | Review | Empty due-queue state: realm + today's quest count + calm line + Flashcards with Unlearned Cards, or "+ Add card" (see Component Patterns). |
| Learn complete | Learn | Calm line ("Nothing left to learn in Weather idioms right now.") plus a link back to the Flashcard; no confetti. |
| Import needs fixing | Import review editor | Problem rows are flagged inline, never blocking: Save is always enabled and saves every valid row; unfixed problems are reported afterwards (FR-6, FR-7). |
| Import results | Add cards panel, after Save | 3-group layout: Created / Duplicates skipped / Errors, each with counts; Errors list line number + reason per row that was still invalid at Save. |
| Field-level validation error | Manual mode / card edit | Inline, per-field, per row — e.g. empty Term or Definition rejected with a field-level error on that row, not a blocking modal; other valid rows still save (FR-3). |
| Folder / Flashcard / Class deletion | Class detail / Folder detail / Classes | Modal gate before any destructive action — never silently orphans or deletes flashcards or cards (FR-5). Class "delete everything" additionally needs the typed Class name. |
| No Classes yet | Classes | Empty state: one line ("Create a class to start adding cards.") and a primary "Create class" button. |
| Empty Folder | Folder detail | Empty state with one line ("Create a flashcard to start adding cards.") and a primary "Create flashcard" button. |
| Empty Flashcard | Flashcard detail | Empty state with a primary "Add cards" button that opens Manual mode. |
| Scoped review | Review | "Review this class" / "Review this folder" runs the same session limited to that scope's learned Cards; the session header names the scope. A Flashcard's graded entry point is Learn. If the scope has nothing due, the Empty due-queue state shows with the scope named. |
| Restore confirmation | Settings | Modal gate before replacing existing data — restore requires explicit confirmation when the account already has data (FR-14). |
| Quests missed | Cultivation | At the first visit after settlement charged XP, one quiet notice per settled range: "Nov 12: 2 quests missed, −40 XP. Now Ngưng Khí · Tầng 9." Dismissible; no modal. No vacation pause in v1 (FR-19). |
| Breakthrough | Cultivation | After a claim moves the user up a stage, a quiet inline notice "Breakthrough: Trúc Cơ · Sơ kỳ." and the XP bar refills. No modal, confetti, sound or animation beyond the bar fill. |
| Demotion | Cultivation, Realm badge | The realm simply shows its new lower stage; the missed-quests notice names it. No warning colors beyond the notice. |

## Interaction Primitives

- **Keyboard (desktop-first, Review and Learn sessions):** Space flips the card either way; 1–4 or J/K/L/; submit a Grade (Again/Hard/Good/Easy respectively) once the answer has been shown. **Card viewer:** Space flips, ← / → move between Cards. Keys are ignored while focus is in a field or a panel/modal is open; Space never scrolls the page. No action in the review loop requires the mouse (FR-9). Reveal/grade/advance renders with no perceptible lag under rapid sequential key presses — sub-100ms perceived transition latency (PRD §6 NFR).
- **Mobile (touch, Review session):** Tap-to-flip the card (touch equivalent of click), **plus** swipe gestures — left/right/up/down mapped to the 4 grades — as an added interaction layer, alongside ordinary tap targets on the grade buttons themselves. Swipe is additive, not a replacement for tapping the grade buttons. **Card viewer:** tap flips; a horizontal swipe moves ← / → (no grading).
- **Banned in the review loop:** any affordance implying Hard produces a shorter next interval than Good/Easy at the same repetition count (misrepresents classical SM-2, FR-8); gamified feedback (confetti, badges, mascot animation) on grading.

## Accessibility Floor

Behavioral. Visual contrast lives in `DESIGN.md` ("Focus Indigo" palette; measured AA ratios for both themes are recorded there).

- WCAG AA contrast ratios required in **both** themes (dark default and light toggle).
- Clearly visible focus-ring / `:focus-visible` state on every interactive element, sufficient for full keyboard navigation of the entire app, not just the review loop.
- Tab order follows reading order on every surface.
- **Explicitly out of scope:** deep ARIA/screen-reader optimization. This is a single-user product (the builder); accessibility work here targets the WCAG AA contrast + full-keyboard-nav floor, not comprehensive assistive-technology support.

## Key Flows

### Flow 1 — Logging a word in under 5 seconds (Luric, mid-reading, hits a word worth keeping)

1. Luric is reading something unrelated to the app and hits a word worth keeping.
2. He opens Training Sanctum. Either he drills into the right Flashcard (Classes → IELTS → Speaking → Weather idioms) and presses "Add cards", or he uses "+ Add card" from the Empty due-queue state, which targets the last-used Flashcard.
3. The Add cards panel opens in Manual mode with the cursor in row 1's Term field.
4. He types the term, presses Tab, types the definition, and presses Save.
5. **Climax:** the new Card appears in that Flashcard before he's lost his train of thought — under 5 seconds end-to-end (PRD SM-1, FR-3), closing UJ-1.

Failure: he saves with the Definition empty — that row shows an inline field error and is not created; nothing else he typed is lost.

### Flow 2 — The daily review session (Luric, every day, no exceptions)

1. Luric opens the app. Due cards exist, so Review loads directly into focus mode — no sidebar, no realm badge, no nav competing for attention (FR-11).
2. The first due Scheduling Record shows its prompt side. He presses Space; the card performs its 3D flip to reveal the answer. Only learned Cards appear; new Cards wait in their Flashcard (Flow 4).
3. He grades with a single keystroke (1–4 or J/K/L/;). The card resets and the next due entry appears immediately — no perceptible lag (FR-9).
4. He repeats through the queue. A Card due in both directions appears as two independent, separately-gradable entries.
5. He works through to the end: an empty due queue is what completes today's Clear Review quest (FR-19).
6. **Climax:** he grades the last due card and the Empty due-queue state appears, showing his realm and "Today's quests 1 / 2". He opens Cultivation, ticks Clear Review, and the XP bar fills by 10 (FR-12, FR-19).

Failure: he stops partway through the queue — Clear Review stays locked; if the queue isn't cleared and ticked before local midnight, the next visit shows the quest missed and −20 XP.

### Flow 3 — Bulk import after a study binge (Luric, a week's worth of notes-app vocabulary)

1. Luric has accumulated roughly 30 new words in a notes app over the week.
2. He opens Classes → IELTS → Vocabulary → "New words" Flashcard, presses "Add cards", switches the panel to Import, and picks Upload file, selecting his CSV.
3. The column-mapping step appears — he maps his file's columns to the five Card fields (order doesn't need to match) and presses Preview.
4. All 30 rows open in the same editor he uses for manual entry. The strip above reads "30 rows · 2 need fixing · 2 duplicates". He jumps to line 9, fixes a typo in the term, and adds the missing definition on line 14; he leaves line 22 empty-defined on purpose.
5. He presses "Save 27 cards".
6. **Climax:** the results view shows three grouped outcomes at a glance — "Created (27), Duplicates skipped (2), Errors (1: line 22, missing definition)" — so he can see exactly what happened without hunting through a toast or re-checking his file row by row. Thirty manual entries became one pass and one glance, and "Done" lands him back in the Flashcard with the 27 new Cards listed.

Failure: if every row in the file is malformed and he saves without fixing any, Created shows (0) and every row appears under Errors with its line number and reason — the import still completes without crashing, and nothing is silently lost.

### Flow 4 — Learning a Flashcard (Luric, after adding a batch of new words)

1. Luric opens Classes → IELTS → Speaking → "Weather idioms". The Card viewer shows the first Card, Term side up, "1 / 12".
2. He presses Space to flip, → to move on, and skims all 12 Cards — nothing is graded, nothing is scheduled (FR-16).
3. He presses "Learn · 12 new". The session runs in focus mode: each Card appears in both directions (his Study directions setting is the default, Both), and he grades each one (FR-17). The two he misses (Again) come back at the end of the session until he gets them.
4. **Climax:** the last grade lands on "Nothing left to learn in Weather idioms right now." The Flashcard is now fully learned, which unlocks today's Learn quest on Cultivation; he ticks it for +10 XP. From tomorrow, those Cards come back on their own in the daily Review (Flow 2).

Failure: he stops halfway — every direction he graded is learned and comes back in Review on its due date; the Cards with an ungraded direction stay in "Learn · 5 new" for next time.

## Responsive & Platform

| Breakpoint | Behavior |
|---|---|
| Desktop (`>1024px`) | Full sidebar (240px) + content area in browsing screens; review session centered, single-column, card capped at 640px. Keyboard-first interaction is primary. |
| Tablet (`640–1024px`) | Same structure as desktop; sidebar and content both remain visible, review session unaffected. |
| Mobile (`<640px`) | Sidebar hidden; browsing screens single-column. Review session: tap-to-flip plus swipe-to-grade, layered on top of the grade buttons' own tap targets — see Interaction Primitives for the full mapping. Grade-button row wraps when needed. |

Training Sanctum is responsive web only — no native mobile app ships in v1 (PRD §5). The mobile review experience is the one surface where interaction diverges meaningfully from desktop (swipe added as a layer), because the review loop is the product's single highest-frequency interaction and must stay fast on whichever device Luric has in hand at the moment of study.

## Inspiration & Anti-patterns

- **Lifted from Quizlet:** sidebar icon-nav structure; flashcard/review-card anatomy and 3D flip interaction; progress counter ("X / Y"); list-row + overflow-menu pattern for class/folder/flashcard browsing; the numbered-row Manual card editor.
- **Lifted from spy-family.net:** editorial grid rhythm; small square bullet as a section-header marker (now accent-colored). Its sage/charcoal/red palette was replaced by "Focus Indigo" on 2026-11-08.
- **Rejected — Quizlet's Match/Blocks/Charms games, Study-with-Friends, social Test mode:** gamified and social features are explicitly out of this product's model (PRD §2.2 Non-Users, §5 Non-Goals) — this is a solitary study tool, not a competitive or social one.
- **Rejected — Quizlet's "Ask Quizlet" AI chat bubble and promo/upsell banners:** no AI-assistant surface and no monetization chrome belong in a personal, zero-paywall tool.
- **Rejected — grading-tied gamification (badges, confetti on grading, accuracy quests):** PRD's counter-metric SM-C1 warns against grade distribution skewing toward "Easy"/"Good" under progression pressure. The cultivation system (FR-12, FR-19) is the one accepted progression mechanic (Sprint Change 2026-11-14): its quests read only whether work was done, never grade values, and it stays visually quiet.
- **Rejected — Anki-style "Hard shortens next interval" implication:** classical SM-2 (FR-8, binding) makes Hard/Good/Easy produce the same next interval at a given repetition count; any UI suggesting otherwise (e.g., unequal visual weight among the three) would misrepresent the algorithm.
