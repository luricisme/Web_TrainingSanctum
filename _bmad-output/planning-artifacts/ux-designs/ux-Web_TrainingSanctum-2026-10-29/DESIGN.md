---
status: final
created: 2026-10-29
updated: 2026-11-14
sources:
  - ../../prds/prd-Web_TrainingSanctum-2026-10-29/prd.md
  - ../../briefs/brief-Web_TrainingSanctum-2026-10-29/brief.md
name: Training Sanctum
description: Personal flashcard / spaced-repetition app. "Focus Indigo" palette (deep indigo neutrals, soft periwinkle accent); editorial grid rhythm from spy-family.net; app structure and component shapes from Quizlet's library and flashcard-study surfaces, without Quizlet's gamification or social layer. Dual-theme, dark-mode default.
colors:
  bg: '#101120'
  card: '#181a2e'
  elevated: '#21243c'
  text: '#e6e7f2'
  text-secondary: '#b1b3c9'
  text-tertiary: '#868aa3'
  border: '#30344f'
  divider: '#252840'
  row-hover: '#21243c'
  accent: '#959aff'
  accent-hover: '#aeb1ff'
  on-accent: '#0d0f2a'
  success: '#5ec79a'
  warning: '#e2a94b'
  error: '#ef6b6b'
  info: '#6bb6e0'
  bg-dark: '#101120'
  card-dark: '#181a2e'
  elevated-dark: '#21243c'
  text-dark: '#e6e7f2'
  text-secondary-dark: '#b1b3c9'
  text-tertiary-dark: '#868aa3'
  border-dark: '#30344f'
  divider-dark: '#252840'
  row-hover-dark: '#21243c'
  accent-dark: '#959aff'
  accent-hover-dark: '#aeb1ff'
  on-accent-dark: '#0d0f2a'
  success-dark: '#5ec79a'
  warning-dark: '#e2a94b'
  error-dark: '#ef6b6b'
  info-dark: '#6bb6e0'
  bg-light: '#f5f5fa'
  card-light: '#ffffff'
  elevated-light: '#ececf6'
  text-light: '#14152a'
  text-secondary-light: '#464a66'
  text-tertiary-light: '#686c8c'
  border-light: '#d8dae9'
  divider-light: '#e6e7f1'
  row-hover-light: '#ececf6'
  accent-light: '#4a4ed4'
  accent-hover-light: '#3a3eb8'
  on-accent-light: '#ffffff'
  success-light: '#2f7d52'
  warning-light: '#b45309'
  error-light: '#c62f3a'
  info-light: '#2a6aa0'
typography:
  display:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: 2.5rem
    fontWeight: '700'
    lineHeight: '1.15'
    letterSpacing: -0.01em
  heading-1:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: 2rem
    fontWeight: '700'
    lineHeight: '1.2'
    letterSpacing: -0.01em
  heading-2:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: 1.5rem
    fontWeight: '600'
    lineHeight: '1.25'
    letterSpacing: normal
  heading-3:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: 1.25rem
    fontWeight: '600'
    lineHeight: '1.3'
    letterSpacing: normal
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: 1rem
    fontWeight: '400'
    lineHeight: '1.5'
    letterSpacing: normal
  body-small:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: 0.875rem
    fontWeight: '400'
    lineHeight: '1.45'
    letterSpacing: normal
  caption:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: 0.75rem
    fontWeight: '500'
    lineHeight: '1.4'
    letterSpacing: 0.01em
  overline:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: 0.6875rem
    fontWeight: '600'
    lineHeight: '1.3'
    letterSpacing: 0.08em
  mono:
    fontFamily: "SFMono-Regular, Consolas, 'Liberation Mono', Menlo, monospace"
    note: 'Reserved for numeric displays — review progress counter, XP figures and quest progress, stats figures.'
rounded:
  sm: 6px
  md: 12px
  lg: 20px
  full: 999px
spacing:
  '1': 4px
  '2': 8px
  '3': 12px
  '4': 16px
  '5': 24px
  '6': 32px
  '7': 48px
  '8': 64px
  gutter: 16-24px
  max-content-width: 1200px
  review-card-max-width: 640px
  sidebar-width: 240px
elevation:
  low: '0 1px 2px rgba(0,0,0,0.15)'
  medium: '0 4px 12px rgba(0,0,0,0.25)'
  high: '0 8px 24px rgba(0,0,0,0.35)'
motion:
  micro: 100-120ms
  normal: 150-200ms
  macro: 250-300ms
  flip-duration: 520ms
  easing-entrance: ease-out
  easing-state: ease-in-out
components:
  button-primary:
    background: '{colors.accent}'
    foreground: '{colors.on-accent}'
    radius: '{rounded.full}'
    hover-background: '{colors.accent-hover}'
  button-secondary:
    background: transparent
    border: '{colors.border}'
    foreground: '{colors.text-secondary}'
    radius: '{rounded.full}'
  grade-button-again:
    border: '{colors.error}'
    foreground: '{colors.error}'
    radius: '{rounded.full}'
  grade-button-neutral:
    border: '{colors.border}'
    foreground: '{colors.text-secondary}'
    radius: '{rounded.full}'
  review-card:
    background: '{colors.card}'
    radius: '{rounded.lg}'
    border: '{colors.divider}'
    shadow: '{elevation.medium}'
    max-width: '{spacing.review-card-max-width}'
  card-viewer:
    card: '{components.review-card}'
    nav-button-border: '{colors.border}'
    nav-button-radius: '{rounded.full}'
    nav-button-disabled-opacity: 0.4
  folder-tile:
    background: '{colors.card}'
    radius: '{rounded.sm}'
    hover-background: '{colors.row-hover}'
  modal:
    background: '{colors.card}'
    radius: '{rounded.lg}'
    scrim: 'rgba(0,0,0,0.5)'
  sidebar:
    background: '{colors.card}'
    width: '{spacing.sidebar-width}'
    active-foreground: '{colors.accent}'
    active-background: '{colors.elevated}'
  section-bullet:
    background: '{colors.accent}'
    shape: 'square, 1px radius, 7x7px'
  add-cards-panel:
    background: '{colors.card}'
    radius: '{rounded.lg}'
    border: '{colors.divider}'
    shadow: '{elevation.high}'
    max-width: 880px
  manual-row:
    background: '{colors.elevated}'
    radius: '{rounded.md}'
    index-foreground: '{colors.text-tertiary}'
    input-underline: '{colors.border}'
    input-underline-focus: '{colors.accent}'
  mode-switcher:
    background: '{colors.elevated}'
    radius: '{rounded.full}'
    active-background: '{colors.accent}'
    active-foreground: '{colors.on-accent}'
---

> Design DNA source: `.working/design-dna-profile.json` (measured color extraction + synthesized tokens). Live interactive reference: [`mockups/key-screens.html`](./mockups/key-screens.html). Original visual references: [`imports/spy-family-net-portal.png`](./imports/spy-family-net-portal.png), [`imports/quizlet-library-view.png`](./imports/quizlet-library-view.png), [`imports/quizlet-flashcard-view.png`](./imports/quizlet-flashcard-view.png) — note: on any conflict between this spec and those source images, **this DESIGN.md wins** (per this workflow's spines-win rule).

## Brand & Style

Training Sanctum is a personal spaced-repetition tool for advanced English vocabulary, built for one daily user. Its aesthetic deliberately pivots away from the PRD's original Linear/Raycast dark-minimalist-only direction (PRD §7) toward a two-source blend: **spy-family.net** (the official Spy x Family anime portal) contributes the **editorial grid layout** — bold sans-serif headers and small square section markers. Its sage/red color palette was the original source but was replaced on 2026-11-08 by the **"Focus Indigo"** palette (deep indigo neutrals, soft periwinkle accent), because the brick-red accent doubled as the error color and failed AA contrast on the dark card, and the sage light canvas read as drab. The indigo palette brings the color back toward the PRD's Linear/Raycast register. **Quizlet** contributes **app structure only** — sidebar nav, flashcard component shape, progress counter, list-row pattern — explicitly *not* Quizlet's gamification (no Match/Blocks/Charms games, no social Study-with-Friends mode, no AI chat bubble) or its promotional density.

The result reads as a well-kept study journal crossed with a focused reading app: calm, disciplined, quietly confident — not a gamified habit app. A single accent color marks the one actionable thing per screen; everything else recedes. No illustration, no character art, no decorative pattern — this is a utilitarian tool that borrows layout rhythm from a promotional portal, not its visual richness.

Dark mode is the default surface (near-black deep indigo), consistent with the PRD's original dark-first direction even after the aesthetic pivot. Light mode is a toggle, not an equal first-class default.

## Colors

Palette: **"Focus Indigo"** (chosen 2026-11-08 from the comparison in [`mockups/palette-lab.html`](./mockups/palette-lab.html)). Both themes share one hue family — indigo-tinted neutrals with a periwinkle/indigo accent — so light mode reads as the same product, not an inversion. All neutrals carry a slight blue-violet bias toward the accent; there is no pure grey anywhere.

- **Background — dark `{colors.bg}` (#101120) / light `{colors.bg-light}` (#f5f5fa).** Dark is the default app canvas: near-black deep indigo. Light is a cool, faintly violet paper white.
- **Card surface — dark `{colors.card}` (#181a2e) / light `{colors.card-light}` (#ffffff).** Used for the review card, folder tiles, sidebar, modals. One clear step lighter than the background in dark mode; pure white on paper in light mode.
- **Elevated surface — dark `{colors.elevated}` (#21243c) / light `{colors.elevated-light}` (#ececf6).** One step up from card, used for hover/active states, icon chips and `{colors.row-hover}`.
- **Text — dark `{colors.text}` (#e6e7f2) / light `{colors.text-light}` (#14152a).** Primary reading color. `{colors.text-secondary}` (#b1b3c9 / #464a66) for supporting copy, `{colors.text-tertiary}` (#868aa3 / #686c8c) for metadata and hints — both still meet 4.5:1 on the card.
- **Accent — dark `{colors.accent}` (#959aff, soft periwinkle) / light `{colors.accent-light}` (#4a4ed4, indigo).** The accent shifts between themes so it keeps AA contrast as text on each card surface. Hover: `{colors.accent-hover}` (#aeb1ff / #3a3eb8). Used for primary buttons, the active nav item, section-marker bullets and the progress bar. Never used decoratively or spread evenly across multiple elements on one screen — it marks the one actionable thing.
- **On-accent — dark `{colors.on-accent}` (#0d0f2a) / light `{colors.on-accent-light}` (#ffffff).** Text and icons on an accent fill. Dark mode needs dark text because the periwinkle fill is light; never put white text on the dark-mode accent.
- **Semantic colors** — success (#5ec79a / #2f7d52), warning (#e2a94b / #b45309), error (#ef6b6b / #c62f3a), info (#6bb6e0 / #2a6aa0), dark / light. Error is a distinct red hue, **separate from the accent** — the "Again" grade button and danger actions use `{colors.error}`, never the accent. Semantic colors are status signals, not a second accent; use them only on the element whose state they describe.
- **Borders/dividers** — `{colors.border}` (#30344f / #d8dae9) / `{colors.divider}` (#252840 / #e6e7f1) — subtle 1px hairlines; most surface separation comes from color-layering (surface vs. background), not borders or heavy shadow.

**Accessibility (measured 2026-11-08, WCAG 2.x):** every text pair meets AA (4.5:1) in both themes. Dark: text/bg 15.2, text-secondary/card 8.3, text-tertiary/card 5.0, accent/card 6.8, on-accent/accent 7.5, error/card 5.7. Light: text/bg 16.5, text-secondary/card 8.6, text-tertiary/card 5.1, accent/card 6.3, on-accent/accent 6.3, error/card 5.4. Any new token must be checked against `{colors.card}` and `{colors.bg}` before it ships.

## Typography

System font stack only, no custom webfonts (`{typography.body.fontFamily}` = `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`) — deliberate restraint matching the Linear/Raycast/Quizlet-app register the product still draws interaction conventions from, even after the visual pivot.

- `{typography.display}` (2.5rem/700) — the review card's prompt/term text; the single largest text on any screen, reserved for that one moment.
- `{typography.heading-1}` / `{typography.heading-2}` / `{typography.heading-3}` — page titles, section titles, modal titles, in descending weight.
- `{typography.body}` / `{typography.body-small}` — all reading text and UI labels.
- `{typography.caption}` — folder card counts, hints, secondary metadata.
- `{typography.overline}` (0.6875rem, 600 weight, 0.08em tracking, uppercase) — section-group eyebrows (e.g. "RECENTLY STUDIED"), sidebar section title, card context line (e.g. "English Idioms · Term → Definition"). Echoes spy-family.net's bold masthead confidence at small scale.
- `{typography.mono}` — reserved strictly for numeric displays: the review progress counter ("7 / 20"), XP figures and quest progress ("40 / 100 XP", "0 / 1 Flashcards"), and stats-view figures. Never used for prose.

Headers lean bold/black-weight; body stays regular-weight for readability across long review sessions.

## Layout & Spacing

Base unit 4px, scale `{spacing.1}`–`{spacing.8}` (4/8/12/16/24/32/48/64). Generous gaps (`{spacing.6}`–`{spacing.7}`, 32–48px) separate major page sections and surround the review card; tighter, list-like rhythm (`{spacing.2}`–`{spacing.3}`, 8–12px) governs rows within folder/library browsing screens, matching Quizlet's library density.

Two layout modes coexist by screen type:
- **Browsing screens** (Classes, Class detail, Folder detail, Flashcard detail, Cultivation, Settings): 12-column responsive grid, fixed `{spacing.sidebar-width}` (240px) sidebar + fluid content area on desktop, `{spacing.max-content-width}` (1200px) content cap, `{spacing.gutter}` (16–24px) gutters.
- **Review session**: single-column, centered focal layout; the card is constrained to `{spacing.review-card-max-width}` (640px) regardless of viewport, and all chrome (sidebar, nav) is hidden entirely (focus mode, PRD FR-11) — negative space itself is what signals focus mode, not a minimized version of chrome.

Breakpoints: mobile <640px, tablet 640–1024px, desktop >1024px. Below 640px the sidebar is hidden (see `mockups/key-screens.html`'s `@media (max-width: 640px)` rule) and the grade-button row wraps.

## Elevation & Depth

Soft, diffused, low elevation only — `{elevation.low}`, `{elevation.medium}`, `{elevation.high}`. Depth comes primarily from surface-color layering (card is a lighter step than background) rather than heavy shadow; `{elevation.medium}` is the review card's resting shadow, the heaviest elevation used anywhere in the product. No glassmorphism, no neumorphism, no gradient surfaces.

## Shapes

Soft, generous corner radius throughout — Quizlet-like friendliness, not sharp/editorial, despite the editorial-grid layout influence:

- `{rounded.sm}` (6px) — inputs, list rows, nav items, folder icon chips.
- `{rounded.md}` (12px) — cards within browsing grids, manual rows, summary strips, popup menus.
- `{rounded.lg}` (20px) — the review card itself, modals.
- `{rounded.full}` (999px) — all buttons (primary, secondary, danger, grade; revised 2026-11-08 after 12px and then 20px still read as hard against the soft indigo surfaces), plus tab switchers, tag chips and screen-selector pills. Buttons and switchers are told apart by role and fill (a switcher is a grouped track, a button stands alone), not by radius.

Subtle 1px borders (`{colors.border}` / `{colors.divider}`) outline inputs and card edges; most separation still relies on surface-color contrast.

## Components

Live interactive reference for all components below: [`mockups/key-screens.html`](./mockups/key-screens.html) (Review Session with working 3D flip, Classes list, Folder detail listing Flashcards, Flashcard detail with the Add cards panel in Manual and Import modes, Empty due-queue state, theme toggle).

- **Review card (`components.review-card`)** — Large, soft-rounded (`{rounded.lg}`) surface, center-aligned content, fixed bounds that never resize between prompt and revealed states. Used by Review, Learn and the Card viewer. Clicking/tapping the card (or pressing Space) triggers a Quizlet-style 3D Y-axis flip (520ms, ease-out) either way between prompt and answer — not a content swap. No icon row in v1 (none of pin/audio/star has a feature behind it; audio is a PRD §5 non-goal).
- **Grade buttons (`components.grade-button-again` / `grade-button-neutral`)** — Live **outside** the card, below it, appearing after the first flip and staying while the card is flipped back, until the entry is graded. Used by Review and Learn. Four buttons: Again / Hard / Good / Easy, each labeled with its keyboard shortcut. Flat/outline style, `{rounded.full}`. Again is styled with the error color (`{colors.error}` border+text), not the accent; Hard/Good/Easy are neutral/outline with equal weight to each other — deliberately non-symmetric with Again, since classical SM-2 (PRD FR-8) makes Hard/Good/Easy produce the same next interval, so the UI must not visually imply Hard is "between" Again and Good in severity.
- **Sidebar nav (`components.sidebar`)** — Fixed 240px, four flat icon+label items: Review, Classes, Cultivation, Settings (Cultivation replaced Stats, Sprint Change 2026-11-14), with the Realm badge pinned to the sidebar bottom. No Import item — import is a mode of a Flashcard's Add cards panel. Classes stays active while drilled into a Class, Folder or Flashcard. Active item gets `{colors.elevated}` background + `{colors.accent}` text. Hidden entirely during review (focus mode) and on mobile (<640px).
- **List row — class, folder, flashcard, card (`components.folder-tile`)** — Used for Class rows (Folder, Flashcard + Card counts), Folder rows (Flashcard + Card counts; the Unsorted Folder is pinned first and has no rename/delete), Flashcard rows (Card count; "..." menu with Rename, Move to…, Delete) and Card rows (term + definition; "..." menu with Edit and Delete only, no Move). Rows grouped under section headers (e.g. "Recently studied", "All folders", "All flashcards"), each header preceded by a small accent-colored square bullet (`components.section-bullet`, lifted from spy-family.net's marker motif). Hover lightens to `{colors.row-hover}`; trailing "..." overflow menu per row.
- **Progress counter** — Mono-font "X / Y" display beneath the review card.
- **Realm badge** — Sidebar bottom, outside review only (FR-11/FR-12). Realm · stage in `{typography.body-small}` 600 weight, `{colors.text}` (realm names in Vietnamese), above a 4px `{rounded.full}` XP bar: track `{colors.elevated}`, fill `{colors.accent}`, with mono "40 / 100 XP" in `{typography.caption}`, `{colors.text-tertiary}`. No icon, no flame, no glow. *(Sprint Change 2026-11-14.)*
- **Modal (`components.modal`)** — Centered, `{rounded.lg}`, scrim overlay, used sparingly: folder-delete confirmation (two explicit buttons — "Move flashcards to Unsorted" primary, "Delete flashcards too" secondary/danger-styled, no checkbox), flashcard-delete confirmation (names the Flashcard and its Card count; danger-styled confirm), move-flashcard picker (Class → Folder), class-delete confirmation ("Move folders to…" with a Class picker as primary; "Delete class and everything in it" danger-styled, enabled only after typing the Class name) and restore-from-backup confirmation (consequence statement + Confirm/Cancel, no type-to-confirm).
- **Empty due-queue state** — Centered, shows the realm · stage prominently (`{typography.heading-1}`) with its XP bar beneath and "Today's quests 1 / 2" (mono) linking to Cultivation, a calm line, then either a short list of Flashcards with Unlearned Cards (list rows, "Weather idioms · 12 new") or, when none exist, a primary "+ Add card" button (`components.button-primary`) — never a bare "nothing to do" message.
- **Card viewer (`components.card-viewer`)** — Top of Flashcard detail, below the page title. One `components.review-card` (same 640px max-width, `{rounded.lg}`, `{elevation.medium}`, 520ms Y-axis flip, no icon row), Term side first. Beneath it a centered control row: outline circular ← and → buttons (`{rounded.full}`, `{colors.border}`, neutral, never the accent) flanking the mono "X / N" counter; a disabled arrow drops to 0.4 opacity. Directly below that row, the primary "Learn" button (`components.button-primary`) — the one accent element on the page while the viewer is shown.
- **Breadcrumb** — On Class detail, Folder detail and Flashcard detail, above the page title: "Classes / IELTS / Speaking / Weather idioms" in `{typography.body-small}`, `{colors.text-secondary}`, each ancestor a link.
- **Add cards panel (`components.add-cards-panel`)** — Opens from a Flashcard's "Add cards" button — primary on an empty Flashcard, secondary (`components.button-secondary`) once the Card viewer and its "Learn" button are shown. Large centered panel, `{rounded.lg}`, `{elevation.high}`, max 880px wide; full-screen sheet below 640px. Header: "Add cards to {Flashcard}" plus the `components.mode-switcher` pill (Manual | Import, `{rounded.full}`); the active option is the accent fill with `{colors.on-accent}` text. Footer: secondary "Cancel", primary "Save" (Manual) or "Import" (Import).
- **Study directions control (`components.mode-switcher`, reused)** — On Settings (FR-18), the same pill segmented control as Add cards' Manual | Import, `{rounded.full}`, with three options: "Both directions", "Term → Definition", "Definition → Term". The selected option is the accent fill with `{colors.on-accent}` text — the one accent element on Settings. Below 640px the three options stack vertically, full width. Helper text in `{typography.body-small}`, `{colors.text-secondary}`. *(Sprint Change 2026-11-13b.)*
- **Quest row (Cultivation page, reuses `components.folder-tile` row geometry)** — Checkbox, label, mono progress, and a right-aligned "+10 XP" in `{typography.caption}`. Locked: checkbox at 0.4 opacity, helper text `{colors.text-tertiary}`. Done-not-ticked: enabled checkbox with `{colors.border}` outline, helper "Done. Tick to claim before the day ends." in `{colors.text-secondary}`. Claimed: checkbox filled `{colors.accent}` with `{colors.on-accent}` check — the accent element on the page while a quest is claimed. Skipped: whole row `{colors.text-tertiary}`, no checkbox. Missed-quests and breakthrough notices are a `{colors.elevated}`, `{rounded.md}` strip above the quest list, `{typography.body-small}`; the missed-quests strip uses a 2px `{colors.warning}` left border, never the error color. Checkbox and notice contrast must be verified in both themes (UX-DR13). *(Sprint Change 2026-11-14.)*
- **Manual rows (`components.manual-row`)** — Quizlet-style: each row is an `{colors.elevated}` block, `{rounded.md}`, with a `{typography.mono}` row number in `{colors.text-tertiary}`, then Term and Definition inputs side by side (stacked below 640px) styled as underlined fields with tiny overline labels ("TERM", "DEFINITION"); the underline turns `{colors.accent}` on focus. A "More fields" text toggle per row reveals Example Sentence, Context/Collocation and Part of Speech. A full-width dashed "+ Add row" button closes the list. Row errors show inline in `{colors.error}` under the offending field.
- **Import mode** — Inside the same panel: Paste / Upload file sub-tabs as a smaller pill switcher (`{rounded.full}`, neutral, not accent-filled, so only one accent pill shows), Paste shows a delimiter select + monospace text box; Upload shows a dashed drop zone, then the column-mapping step. Both end in the **import review editor**: the same `components.manual-row` list, with the row index replaced by the source line number ("L14", `{typography.mono}`), a remove (×) icon button at the row's right edge, and problem rows marked by a 2px left border plus inline message — `{colors.error}` for malformed rows, `{colors.warning}` for duplicates ("Already in Weather idioms — will be skipped"). A summary strip above the rows (`{colors.elevated}`, `{rounded.md}`, `{typography.body-small}`) counts rows / need fixing / duplicates. After Save, the 3-group results view.

## Do's and Don'ts

| Do | Don't |
|---|---|
| Use `{colors.accent}` for exactly one actionable thing per screen | Spread the accent across multiple simultaneous elements |
| Keep Hard/Good/Easy visually equal to each other, distinct only from Again | Give Hard a "lesser" visual weight implying a shorter next interval |
| Keep the review card's bounds fixed before and after flip | Resize or reflow the card on reveal |
| Hide all chrome during review (focus mode) | Minimize chrome to a thin bar during review |
| Use the small accent square bullet only as a section-header marker | Use it as decoration or repeat it within a row |
| Reach import only through a Flashcard's Add cards panel, with the target Flashcard named | Add a standalone Import page or sidebar item |
| Keep the hierarchy at Class → Folder → Flashcard → Card | Add sub-folders, sub-classes, or Cards directly in a Class or Folder |
| Use `{colors.error}` for Again and danger actions | Reuse the accent for errors or destructive states |
| Use `{colors.on-accent}` for text on any accent fill | Put white text on the dark-mode periwinkle accent |
| Use system fonts only | Introduce a custom/webfont for any role, including display |
| Reserve mono type for numeric displays only | Use mono for prose or labels |
