---
status: final
created: 2026-10-29
updated: 2026-11-17
sources:
  - ../../prds/prd-Web_TrainingSanctum-2026-10-29/prd.md
  - ../../briefs/brief-Web_TrainingSanctum-2026-10-29/brief.md
---

# Training Sanctum — Experience Spine

> Single-user responsive web app for flashcard-based spaced repetition and, since Sprint Change 2026-11-16, a Planner (tasks, pomodoro, calendar, music) as module 2. Paired with `DESIGN.md`. Protagonist throughout Key Flows is Luric, the real builder and user (QA/Test Automation Engineer) — not a generic persona, per this product's single-operator scope (PRD §2.3).

## Foundation

Responsive web, no native mobile app (PRD §5 Non-Goals: "Native mobile app (responsive web only)"). Multi-account: each user owns their Classes and may be a Member of other users' Classes (Shared Classes, Sprint Change 2026-11-17); every schedule is per user (PRD FR-1, FR-28).

Training Sanctum's visual identity ("Pastel Frame") and app structure come from three sources, reconciled in `DESIGN.md`:
- **A language-learning app the owner supplied as reference (2026-11-14)** contributes the app shell: a dark frame with a top app bar around an inset light panel, pastel tint tiles, pill controls, a floating dock, and a quick-search palette.
- **Quizlet** contributes the flashcard/review-card anatomy, the progress counter, the Class → Folder → Flashcard browsing pattern and the Manual card-entry editor (numbered term/definition rows). Explicitly *not* Quizlet's gamification, social features, or promotional surfaces.
- **spy-family.net** contributes the section-bullet motif.

This spine describes behavior; visual specs (exact colors, type, radii, shadows) live in `DESIGN.md` and are referenced here only by `{path.to.token}`, never restated as raw values.

## Information Architecture

Content hierarchy is fixed at four levels: **Class → Folder → Flashcard → Card** (PRD FR-5). A Class holds Folders, never Flashcards or Cards directly; every Class has one built-in "Unsorted" Folder; a Folder holds Flashcards (named sets); a Flashcard holds Cards. Cards are only ever created from inside a Flashcard.

| Surface | Reached from | Purpose |
|---|---|---|
| Review | App bar / app open (default landing when cards are due) | Daily due-queue review of learned Cards across all Classes (focus mode); never introduces new Cards |
| Classes | App bar | Grid of Class tiles, each in its own colour, with Folder, Flashcard and Card counts; create / rename / recolour / delete Class (FR-5); an owned Class's "…" menu also has **Share**; Shared Classes appear with a "{Owner}'s" label and only a Leave action (FR-28, Sprint Change 2026-11-17) |
| Class detail | Classes → a Class | That Class's Folders (Unsorted first); create / rename / delete Folder; "Review this class". For a Member: read-only — no create / rename / delete (FR-28) |
| Folder detail | Class detail → a Folder | That Folder's Flashcards as rows (Card counts); create Flashcard; per-row "..." menu with Rename, Move to…, Delete; "Review this folder". For a Member: read-only |
| Flashcard detail | Folder detail → a Flashcard | Card viewer (flip, ← →) on top; **"Learn"** button below it; then that Flashcard's Cards list; "Add cards" (Manual / Import); Edit and Delete on each Card (no Move). For a Member: viewer and Learn only, no Add cards / Edit / Delete |
| Share modal | Classes, an owned Class's "…" → Share (Sprint Change 2026-11-17) | Members (Remove), pending Invitations (Cancel), declined (Invite again), email field (FR-27) |
| Bell | App bar, right of the nav, before the Realm badge (≥ 640px); top-right of the content panel below 640px (decision B1) | Pending Invitations only, with Accept / Decline; badge = count (FR-27) |
| Learn | Flashcard detail → "Learn" | Graded session for one Flashcard: its unlearned directions (in the studied directions, FR-18), then its due Cards; same session screen and focus mode as Review (FR-17). An entry graded Again comes back at the end of the session until graded Hard/Good/Easy (practice repeats are not saved; the first grade sets the schedule). When it ends, "Study all cards again" runs every Card as unsaved practice (FR-17). |
| Add cards panel | Flashcard detail → "Add cards", or "+ Add card" on the Empty due-queue state | Manual mode (Quizlet-style row editor, FR-3) or Import mode (Paste / Upload file, FR-6, FR-7), always into one target Flashcard |
| Cultivation | App bar (replaces Stats, Sprint Change 2026-11-14) | Realm and stage with XP bar, today's Daily Quests, missed-day and breakthrough notices, then card totals, SM-2 retention-curve visualization and XP history (FR-12, FR-15, FR-19) |
| Settings | App bar | Theme toggle (Light default), Study directions (FR-18), logout |
| Admin | App bar and dock, admin only (Sprint Change 2026-11-14d) | A table of every user (email, created, status, realm, level, XP). A user page, read-only, shows that user's data as the export payload (Class → Folder → Flashcard → Card tree, scheduling, cultivation) with Export, Restore, Disable/Enable, Reset password and Delete (FR-21) |
| Planner · Tasks | App bar / dock **Planner** (default segment; Sprint Change 2026-11-16) | One local day's Tasks with Category, estimate and logged minutes; add / edit / done / delete; "N overdue → Move all to today"; Categories modal (FR-22) |
| Planner · Calendar | Planner segment switcher | Week time grid of scheduled Tasks as plan-length blocks, unscheduled tray per day, conflicts drawn, drag to reschedule; single day below 640px (FR-25) |
| Planner · Pomodoro | Planner segment switcher, or "Start pomodoro" on a Task | The chosen Task's plan, a server-truth countdown, breaks on demand, the "Done?" card, "+1 session" (max 2), the music player (FR-23, FR-24, FR-26) |

**Five-item** flat nav (six for an admin, who also gets **Admin**) in the **app bar** (`{components.app-bar}` in `DESIGN.md`): Review, Classes, **Planner**, Cultivation, Settings — no secondary nav level. Planner's three segments are a switcher inside the page, never nav items (decision N1, Sprint Change 2026-11-16), so the dock stays at five round buttons. A running Pomodoro does **not** enter focus mode: the app bar stays, because the user leaves and returns during breaks. The **bell** (Sprint Change 2026-11-17) sits at the right end of the app bar before the Realm badge, and on mobile at the top-right of the content panel on every page; it is not a nav item and is hidden in focus mode. The brand sits at the left of the bar and the Realm badge (avatar, label, XP) at the right. Below 640px the bar is replaced by the **dock** (see the Mobile dock pattern). **There is no Import item or Import page**: import is the second mode of a Flashcard's "Add cards", so the target Flashcard is always known. Class detail, Folder detail and Flashcard detail are reached by drilling in from Classes and show a breadcrumb ("Classes / IELTS / Speaking" on a Folder, "Classes / IELTS / Speaking / Weather idioms" on a Flashcard); the Classes nav item stays active on all of them. During an active Review or Learn session, the app bar and dock are hidden entirely (focus mode, FR-11) and only the card, an Exit link and the frame remain; exiting (queue cleared, Exit, Esc, or the user navigates away) restores them. When the due queue is empty, Review shows the Empty due-queue state, with the app bar, instead of a review card.

→ Composition reference: there are no mockups of Pastel Frame; current screenshots are produced by the e2e suite in `test-results/screenshots/`. The earlier Focus Indigo / sidebar design is kept in [`history/focus-indigo/`](./history/focus-indigo/README.md) for reference only. This spine and `DESIGN.md` win over it.

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
| "This will replace all of {email}'s current data." (restore warning) | "⚠️ WARNING: Are you REALLY sure?!" |
| Direct imperative, short labels: "Add card", "Import", "Grade" | Cheerleading, exclamation marks, mascot voice |
| "Done?" · "Not yet" · "+1 session (1 of 2 left)" | "Great session! Keep the streak going! 🔥" |
| "3 overdue — Move all to today" | "You have unfinished business…" |
| "Music unavailable — the timer continues." | "Oops! Something went wrong with your vibes" |
| "Edit the estimate to continue." | "You're out of extensions!" |
| "Luric invited you to IELTS (312 cards)." | "🎉 You've been invited! Join now!" |
| "3 members are studying this." | "Warning: other people will be affected!!" |
| "Leave IELTS? Your progress in it will be deleted." | "Are you sure you want to abandon your friends?" |
| "No account with that email." | "User not found 😕" |

## Component Patterns

Behavioral. Visual specs live in `DESIGN.md.components`.

| Component | Use | Behavioral rules |
|---|---|---|
| Flip-card | Review, Learn, Card viewer | Click/tap anywhere on the card, or press Space, flips it either way (Quizlet-style 3D Y-axis). Card bounds stay fixed before and after flip — no resize, no content-swap-without-motion. Grading (Review/Learn) or ← → (Card viewer) shows the next Card on its unflipped prompt side. |
| Grade buttons | Review and Learn; appear after the first flip and stay while the user flips back, until the entry is graded | Again / Hard / Good / Easy, keyboard-mapped 1–4 (or J/K/L/; per PRD FR-9), each a pastel pill (rose, butter, mint, sky). All four are equal in size and weight. Classical SM-2 (FR-8) makes Hard/Good/Easy produce an identical next interval, so the UI must not imply otherwise. The pastel colour order (rose, butter, mint, sky) can read as a severity scale; the owner accepted that on 2026-11-14 (see DESIGN.md). |
| Add cards panel | Flashcard detail → "Add cards" | Opens over the Flashcard with the target Flashcard named in its header ("Add cards to Weather idioms") and a two-option pill switcher: **Manual** (default) and **Import**. Switching modes keeps the target Flashcard. Closing with unsaved Manual rows asks before discarding them. |
| Manual mode | Add cards panel | Quizlet-style editor: numbered rows, each with Term and Definition side by side; a "More fields" toggle per row reveals Example Sentence, Context/Collocation, Part of Speech. Starts with 3 empty rows. Tab moves field to field; Enter in the last field of the last row adds a row; "+ Add row" button below. One "Save" creates every row with Term + Definition filled; fully empty rows are ignored; half-filled rows get inline field errors and are not created, while valid rows still save. |
| Import mode | Add cards panel | Paste / Upload-file sub-tabs. Paste: delimiter picker + text box + "Preview" (no column mapping). Upload: file → column-mapping step → "Preview". Both end in the import review editor — no divergent flows per source type, and nothing is saved before Save (FR-6, FR-7). |
| Import review editor | Add cards panel, after Preview | The Manual-mode row editor, prefilled with the parsed rows. Each row shows its source line number ("line 14") instead of a plain index, a remove (×) button, and any problem inline: malformed rows show the reason under the field ("No delimiter found"); duplicates show "Already in Weather idioms — will be skipped", which clears once the Term is edited. A summary strip above the rows ("30 rows · 2 need fixing · 1 duplicate") jumps to the first problem row on click. "+ Add row" still works here. "Back" returns to the paste box / mapping with the edits discarded after a confirm. The footer button reads "Save 27 cards" (count of rows that will be created). |
| Import results | Add cards panel, after Save in the review editor | Single results view grouped into exactly 3 sections: Created (N), Duplicates skipped (N), Errors (N, each with line number + reason). Never a toast-only summary — the detail must stay on-screen for review. "Done" returns to the Flashcard, now showing the new Cards. |
| Folder-delete modal | Class detail, Folder "..." → Delete | Centered modal, two explicit buttons: "Move flashcards to Unsorted" (default/primary — the same Class's Unsorted) and "Delete flashcards too" (secondary, danger-styled; also deletes their Cards). No checkbox — the user picks one action directly. Not offered for the Unsorted Folder. |
| Flashcard-delete modal | Folder detail, Flashcard "..." → Delete | Centered modal naming the Flashcard and its Card count ("Delete Weather idioms and its 24 cards?"), with Cancel and a danger-styled "Delete flashcard". |
| Move-flashcard modal | Folder detail, Flashcard "..." → Move to… | Class → Folder picker (any Folder in any Class); a name clash in the target Folder is resolved by adding " (2)", " (3)" to the moved Flashcard's name. |
| Class-delete modal | Classes, Class "..." → Delete | States what the Class contains ("3 folders · 9 flashcards · 84 cards"). Primary: "Move folders to…" with a Class picker; Unsorted Flashcards merge into the target's Unsorted, clashing Folder and Flashcard names get " (2)". Secondary, danger-styled: "Delete class and everything in it", enabled only after typing the Class name. If no other Class exists, only the delete option is shown. |
| Restore-from-backup modal | Admin, user page, restore action; names the target user | Simple warning modal stating the consequence ("This will replace all current data") with Confirm/Cancel. No type-to-confirm text input. |
| Delete-user dialog | Admin, user page, Delete action | Modal stating the consequence ("Delete {email}? This removes the account and all its data. This cannot be undone."). The Delete button stays disabled until the admin retypes the user's email. |
| Read-only banner | Top of the Admin user page | A fixed strip: "Read-only. You are viewing {email}'s data." The page has no edit, grade or claim control. |
| Class/Folder/Flashcard tile | Classes, Class detail, Folder detail | Tiles in a grid (1 column on mobile, 2 on tablet, 3 on desktop) under a section header ("All classes", "All folders", "All flashcards"), with a trailing overflow ("...") menu. The tile's tint is its Class's colour; Folders and Flashcards inherit it. Click the name to drill in; hover and keyboard focus draw a darker border. Overflow holds Rename and Delete (Unsorted shows neither); Class tiles hold Rename, Colour and Delete; Flashcard tiles hold Rename, Move to…, Delete. Class tiles show Folder, Flashcard and Card counts; Folder tiles show Flashcard + Card counts; Flashcard tiles show Card count. |
| Class colour | Class create and rename modals; Class "..." → Colour (built, Story 6.4; stored on `Class.color`) | Five swatches as a radio group, each with its colour name (lavender, sky, mint, butter, rose); the selected one is ink-bordered and ticked. A new Class defaults to the next tint in order. Changing it recolours that Class's Folders and Flashcards at once. Colour is never the only cue: the name and breadcrumb always say where you are. |
| Card row | Flashcard detail | Term and Definition, hover-highlight, overflow menu with Edit and Delete only — no Move (Cards are moved only by moving their Flashcard). |
| Empty due-queue state | Review, when nothing is due | Shows the realm and stage with its XP bar, "Today's quests 1 / 2" linking to Cultivation, a calm line, and — when any Flashcard still has Unlearned Cards — a short list of up to 3 such Flashcards ("Weather idioms · 12 new") linking to their page; otherwise a prominent "+ Add card" shortcut that opens Manual mode for the last-used Flashcard (with a Flashcard picker to change it). Never a bare message, never a fallthrough to Classes. |
| Card viewer | Flashcard detail, top | One flip-card (Term side first; Definition side first when only Definition → Term is studied, FR-18) over all of the Flashcard's Cards in list order; ← → buttons flanking a mono "X / N" counter beneath it; ← disabled on the first Card, → on the last; no grading, no shuffle, no autoplay; viewing never changes scheduling (FR-16). Hidden when the Flashcard is empty (its empty state shows instead). |
| Learn button | Flashcard detail, directly under the Card viewer | The page's one primary (accent) action. Label carries what is waiting: "Learn · 12 new · 3 due"; just "Learn" when nothing waits (FR-17). "Add cards" becomes secondary while the viewer is shown. |
| Study directions | Settings, its own card below Theme | One choice of three: "Both directions" (default), "Term → Definition", "Definition → Term" (FR-18). Saves on change, no Save button; a quiet "Saved" status confirms it and an inline error rolls the choice back. Helper line: "Which way cards are asked in Learn and Review. Turning a direction off keeps its progress." Keyboard: arrow keys move between the three options (radio group). |
| Daily quest list | Cultivation page, top | Two checkbox rows, Learn Flashcards and Clear Review (FR-19), sized by the user's Bộ. Each row: label ("Learn 1 Flashcard", "Clear Review"), mono progress ("0 / 1 Flashcards", "12 due left"), and "+10 XP" on the right. **Locked** (condition not met): checkbox disabled, the reason as helper text. **Done, not ticked:** checkbox enabled, helper "Done. Tick to claim before the day ends." (an unticked quest is penalized at day end). **Skipped:** greyed out, "Nothing to do today.", no checkbox. **Claimed:** checked, not interactive. Ticking claims at once (no confirm); on failure the tick rolls back with an inline error. Space toggles a focused checkbox. |
| Realm badge | App bar, right end; outside review only | The realm avatar inside a ring that fills with the stage's XP, then "{realm} · {stage}" (realm names in Vietnamese) over mono "40 / 100 XP". Links to Cultivation. Hidden during focus mode (FR-11) and below 640px. Renders nothing until the realm loads, and on error. |
| Realm avatar | Realm badge | A cultivator illustration with one look per realm (19), more striking at higher realms (see `DESIGN.md`). Changes when the user enters a new realm, not on every stage. Decorative: never the only carrier of the realm, which is always also written out. No animation except the slow ray turn at Bộ 3 and up, which stops under reduced motion. |
| Mobile dock | Below 640px, every screen except focus mode — *built (Story 6.3)* | A floating pill at the bottom with Review, Classes, Cultivation and Settings (and Admin for an admin); the current destination is raised. Replaces the app bar so Settings and Log out are reachable on a phone. The Realm badge is not shown on mobile; Cultivation is one tap away. Stays clear of the device's bottom safe area. |
| Segment switcher | Planner, top (Sprint Change 2026-11-16) | `components.mode-switcher` with Tasks / Calendar / Pomodoro; the segment is in the URL; arrow keys move between options. |
| Task row | Planner · Tasks | Category chip (tint + name), title, optional "19:00", mono "50 / 90 min" (turns `warning` when logged > estimate), checkbox to mark done (immediate, no confirm; reopen from the "…" menu), "…" menu: Edit, Start pomodoro, Delete. Done rows are muted and sorted last. |
| Overdue strip | Planner · Tasks, above the list, only when N > 0 | `elevated` strip: "3 overdue" and one secondary button "Move all to today". No per-task prompt, no auto-move, ever. |
| Category modal | Planner · Tasks → "Categories" | Rows of name + tint swatch radio (reuses the Class-colour picker) + Music field (Epic 11); delete asks "Move tasks to…" (default) / "Delete tasks too" (danger). |
| Plan strip | Planner · Pomodoro | A row of pills, one per session: focus pills in the Task's tint with "25", break pills neutral with "5"; the current one ink-bordered, done ones ticked, overrun ones marked "+". Read-only; the countdown below is `{typography.display}` in mono. |
| Done card | Planner · Pomodoro, after the last session | Inline card (not a modal): "Done?" with primary **Done** and secondary **Not yet**; after Not yet it shows "+1 session (n of 2 left)" or "Edit the estimate to continue." with an Edit link. Never a countdown to auto-answer. |
| Calendar block | Planner · Calendar | Category tint fill, title and "90 min"; length = plan incl. breaks; muted when done; conflict = `error` 2px border + "Conflict" caption on both blocks, drawn side by side; a running session shows a progress fill in the accent. The whole block is the drag handle; keyboard: select, then arrows. |
| Unscheduled tray | Planner · Calendar, above each day column | Compact chips of that day's timeless Tasks; drag onto the grid to schedule, drag a block back to clear its time. |
| Music player | Planner · Pomodoro, below the countdown | Title · artist · licence link, pause, volume slider. Fades in / out with the focus session, silent on breaks. One quiet line when unavailable; no artwork, no playlist. |
| Share modal | Owner's Class "…" → Share (Sprint Change 2026-11-17) | Email field + "Invite"; three lists: Members (name/email, **Remove** → confirm "Remove {email}? Their progress in {Class} will be deleted."), Pending (**Cancel**), Declined (muted, **Invite again**). Field-level errors: no account with that email, your own email, already a member, already invited. |
| Bell + Invitations panel | App bar right / panel top-right | Round icon button with a mono count badge when > 0; opens a popover list of pending Invitations, each "{Owner} invited you to {Class} ({N} cards)" with **Accept** (primary; navigates to the Class) and **Decline** (quiet). Empty: "No invitations." Esc closes. Nothing else ever appears here. |
| Shared Class tile | Classes grid | The Owner's tint; "{Owner}'s" in `caption` under the name; the "…" menu holds only **Leave**. |
| Leave confirm | Shared Class "…" → Leave | Modal: "Leave {Class}? Your progress in it will be deleted." Cancel / danger **Leave**. |
| Member-count line | Class-, Folder-, Flashcard- and Card-delete modals; move-flashcard modal when the target is another Class | One added line when the Class has Members: "{N} members are studying this." (delete) or "{N} members will lose it." (move). No extra step. |
| Read-only content (Member) | Class / Folder / Flashcard detail | Write controls are not rendered (no disabled ghosts); the header shows "{Owner}'s class" beside the breadcrumb; viewer, Learn and Review work on the Member's own records. |

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
| Restore confirmation | Admin, user page | Modal gate before replacing existing data — restore requires explicit confirmation when the account already has data (FR-14). |
| Quests missed | Cultivation | At the first visit after settlement charged XP, one quiet notice per settled range: "Nov 12: 2 quests missed, −40 XP. Now Ngưng Khí · Tầng 9." Dismissible; no modal. No vacation pause in v1 (FR-19). |
| Breakthrough | Cultivation | After a claim moves the user up a stage, a quiet inline notice "Breakthrough: Trúc Cơ · Sơ kỳ." and the XP bar refills. No modal, confetti, sound or animation beyond the bar fill. |
| Demotion | Cultivation, Realm badge | The realm simply shows its new lower stage; the missed-quests notice names it. No warning colors beyond the notice. |
| No Tasks today | Planner · Tasks | One line "Nothing planned for {day}." and the primary "+ Add task". *(Sprint Change 2026-11-16.)* |
| Overdue | Planner · Tasks | The Overdue strip; nothing else changes. |
| Session running elsewhere | Planner · Pomodoro | "A session is running on {Task} — {m:ss} left." with a link; Start on another Task is disabled. |
| Over estimate | Task row, Pomodoro | The mono figure turns `warning`; nothing else changes. |
| Overrun exhausted | Done card | "Edit the estimate to continue." + an Edit link; "+1 session" is gone. |
| Music unavailable | Music player | One quiet line; the timer is unaffected. |
| Calendar conflict | Planner · Calendar | Both blocks `error`-bordered with a "Conflict" caption, side by side; no modal, nothing moves. |
| Invitation pending (invitee) | Bell | Badge count; a row in the panel. *(Sprint Change 2026-11-17.)* |
| Invitation pending / declined (Owner) | Share modal | Listed under Pending / Declined. |
| Shared Class, Member view | Classes, detail pages | "{Owner}'s" label; write controls absent. |
| No invitations | Bell panel | "No invitations." |

## Interaction Primitives

- **Keyboard (desktop-first, Review and Learn sessions):** Space flips the card either way; 1–4 or J/K/L/; submit a Grade (Again/Hard/Good/Easy respectively) once the answer has been shown. **Card viewer:** Space flips, ← / → move between Cards. Keys are ignored while focus is in a field or a panel/modal is open; Space never scrolls the page. No action in the review loop requires the mouse (FR-9). Reveal/grade/advance renders with no perceptible lag under rapid sequential key presses — sub-100ms perceived transition latency (PRD §6 NFR).
- **Mobile (touch, Review session):** Tap-to-flip the card (touch equivalent of click), **plus** swipe gestures — left/right/up/down mapped to the 4 grades — as an added interaction layer, alongside ordinary tap targets on the grade buttons themselves. Swipe is additive, not a replacement for tapping the grade buttons. **Card viewer:** tap flips; a horizontal swipe moves ← / → (no grading).
- **Banned in the review loop:** any affordance implying Hard produces a shorter next interval than Good/Easy at the same repetition count (misrepresents classical SM-2, FR-8); gamified feedback (confetti, badges, mascot animation) on grading.
- **Pomodoro keys (Sprint Change 2026-11-16):** Space starts / stops the current session when nothing else has focus; Esc closes the Done card. The countdown is derived from the server's `startedAt` and re-synced on focus and visibility change — the client never keeps its own elapsed time.
- **Calendar keys:** Tab to a block or tray chip, arrows move it 15 min / one day, Enter commits, Esc cancels.
- **Bell (Sprint Change 2026-11-17):** Enter/Space opens, arrows move between invitations, Enter on a row accepts, Delete declines, Esc closes.

## Accessibility Floor

Behavioral. Visual contrast lives in `DESIGN.md` (Pastel Frame; ratios measured 2026-11-14 for both themes are recorded there, including the known gap: input borders and the XP ring track are under 3:1).

- WCAG AA contrast ratios required in **both** themes (light default and dark toggle).
- Clearly visible focus-ring / `:focus-visible` state on every interactive element, sufficient for full keyboard navigation of the entire app, not just the review loop. On the dark frame the ring is white (`{colors.on-frame}`); elsewhere it is the accent.
- Colour is never the only cue: a tile's tint, a grade's tint and the realm avatar each have a text equivalent beside them.
- Motion respects `prefers-reduced-motion`.
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

1. Luric opens the app. Due cards exist, so Review loads directly into focus mode — no app bar, no realm badge, no nav competing for attention, only the card inside the frame (FR-11).
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

### Flow 5 — Planning and running a study evening (Luric, Sunday night, then Tuesday; Sprint Change 2026-11-16)

1. Sunday evening Luric opens Planner → Calendar for the week ahead. He drops "Read chapter 3 · 90 min" on Tuesday 19:00 and "Mock test · 60 min" on Thursday 20:00. Each block is as long as its whole plan (105 and 70 minutes), so he can see they don't overlap anything.
2. Tuesday he gets home late. At 19:40 he opens the Task and presses Start. The block slides to 19:40 — the calendar now says what happened, not what he hoped — and the category's lo-fi track fades in.
3. The Plan strip shows 25 · 5 · 25 · 5 · 25 · 5 · 15. He works the first session; the countdown is the server's clock, so switching to his phone during the break shows the same figure. Each break waits for him to press Start.
4. After the 15-minute session the Done card asks "Done?". He isn't. He presses "+1 session (1 of 2 left)" and works 25 more minutes.
5. **Climax:** he marks the Task done. The row reads "140 / 90 min" in `warning`, the task-done XP lands on the Realm badge, and the calendar block is 155 minutes long — exactly what the evening took. Next time he'll estimate 120.

Failure: he answers Not yet twice and the third time sees "Edit the estimate to continue." — the budget held; he edits the estimate to 150 and continues from the remainder.

### Flow 6 — Sharing a Class (Luric invites a friend; Sprint Change 2026-11-17)

1. Luric opens Classes, picks "IELTS" → "…" → **Share**, types his friend's email and presses Invite. The modal lists it under Pending.
2. The friend opens the app and sees the bell with "1". The panel reads "Luric invited you to IELTS (312 cards)". She presses Accept; the Class appears in her Classes as "Luric's", in his colour.
3. She opens Speaking → "Weather idioms" and presses "Learn · 12 new". Her grades write her own records; Luric's "3 due" on the same Flashcard doesn't change.
4. Next week Luric adds 10 cards. Her Flashcard now says "Learn · 10 new"; his says the same, each from their own records.
5. **Climax:** the same evening both clear Review on IELTS — two different queues, two different Clear Review quests, one set of cards. She never sees an Add cards button; he never sees her progress.

Failure: she declines — Luric sees it under Declined and can Invite again; nothing was created on her side.

## Responsive & Platform

| Breakpoint | Behavior |
|---|---|
| Desktop (`>1024px`) | Frame, app bar with labelled nav items, and a 3-column tile grid; review session centred, single-column, card capped at 640px. Keyboard-first interaction is primary. Planner: 7-day calendar grid; the Pomodoro countdown and player centred. |
| Tablet (`640–1024px`) | Same structure; the nav items collapse to icons (the current one keeps its label) and tiles use 2 columns. Review session unaffected. Planner: 7-day grid, narrower columns. |
| Mobile (`<640px`) | No frame rim; the panel fills the screen. The app bar is replaced by the dock (built, Story 6.3). Browsing screens use a single-column tile list. Review session: tap-to-flip plus swipe-to-grade, layered on top of the grade buttons' own tap targets — see Interaction Primitives for the full mapping. Grade-button row wraps when needed. Planner: Calendar shows a single day with ← / →, the tray as a horizontal chip row; the countdown is full-width. |

Training Sanctum is responsive web only — no native mobile app ships in v1 (PRD §5). The mobile review experience is the one surface where interaction diverges meaningfully from desktop (swipe added as a layer), because the review loop is the product's single highest-frequency interaction and must stay fast on whichever device Luric has in hand at the moment of study.

## Inspiration & Anti-patterns

- **Lifted from the owner's reference app (2026-11-14):** the dark frame with top app bar and inset panel; pastel tint tiles; pill controls; the floating dock and the quick-search palette. Its language-specific screens (kana and kanji tables, a roadmap) are not part of this product.
- **Lifted from Quizlet:** flashcard/review-card anatomy and 3D flip interaction; progress counter ("X / Y"); list-row + overflow-menu pattern for class/folder/flashcard browsing; the numbered-row Manual card editor.
- **Lifted from spy-family.net:** editorial grid rhythm; the section-header marker, now a dot. Its palette is no longer used.
- **Rejected — Quizlet's Match/Blocks/Charms games, Study-with-Friends, social Test mode:** gamified and social features are explicitly out of this product's model (PRD §2.2 Non-Users, §5 Non-Goals) — this is a solitary study tool, not a competitive or social one.
- **Rejected — Quizlet's "Ask Quizlet" AI chat bubble and promo/upsell banners:** no AI-assistant surface and no monetization chrome belong in a personal, zero-paywall tool.
- **Rejected — grading-tied gamification (badges, confetti on grading, accuracy quests):** PRD's counter-metric SM-C1 warns against grade distribution skewing toward "Easy"/"Good" under progression pressure. The cultivation system (FR-12, FR-19) is the one accepted progression mechanic (Sprint Change 2026-11-14): its quests read only whether work was done, never grade values, and it stays visually quiet.
- **Rejected — Anki-style "Hard shortens next interval" implication:** classical SM-2 (FR-8, binding) makes Hard/Good/Easy produce the same next interval at a given repetition count; any UI suggesting otherwise (e.g., unequal visual weight among the three) would misrepresent the algorithm.
