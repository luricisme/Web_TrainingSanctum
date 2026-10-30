---
status: final
created: 2026-10-29
updated: 2026-10-30
sources:
  - ../../prds/prd-Web_TrainingSanctum-2026-10-29/prd.md
  - ../../briefs/brief-Web_TrainingSanctum-2026-10-29/brief.md
name: Training Sanctum
description: Personal flashcard / spaced-repetition app. Color and editorial grid rhythm from spy-family.net; app structure and component shapes from Quizlet's library and flashcard-study surfaces, without Quizlet's gamification or social layer. Dual-theme, dark-mode default.
colors:
  bg: '#14151f'
  card: '#1f2130'
  elevated: '#262838'
  text: '#ecf1f2'
  text-soft: '#faf7f0'
  text-secondary: '#c6c9d2'
  text-tertiary: '#9b9fae'
  border: '#3a3d4d'
  divider: '#2a2c3c'
  row-hover: '#262838'
  bg-dark: '#14151f'
  card-dark: '#1f2130'
  elevated-dark: '#262838'
  text-dark: '#ecf1f2'
  text-soft-dark: '#faf7f0'
  text-secondary-dark: '#c6c9d2'
  text-tertiary-dark: '#9b9fae'
  border-dark: '#3a3d4d'
  divider-dark: '#2a2c3c'
  row-hover-dark: '#262838'
  bg-light: '#8ea89b'
  card-light: '#faf7f0'
  elevated-light: '#ecf1f2'
  text-light: '#0e0e12'
  text-soft-light: '#0e0e12'
  text-secondary-light: '#3a3d4d'
  text-tertiary-light: '#6b6f80'
  border-light: '#c6c9d2'
  divider-light: '#c6c9d2'
  row-hover-light: '#ecf1f2'
  accent: '#b74242'
  accent-hover: '#c65252'
  success: '#5c8a68'
  warning: '#c98a3a'
  error: '#b74242'
  info: '#6a8a99'
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
    note: 'Reserved for numeric displays — review progress counter, streak count, stats figures.'
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
    foreground: '{colors.text-soft}'
    radius: '{rounded.md}'
    hover-background: '{colors.accent-hover}'
  button-secondary:
    background: transparent
    border: '{colors.border}'
    foreground: '{colors.text-secondary}'
    radius: '{rounded.md}'
  grade-button-again:
    border: '{colors.accent}'
    foreground: '{colors.accent}'
    radius: '{rounded.md}'
  grade-button-neutral:
    border: '{colors.border}'
    foreground: '{colors.text-secondary}'
    radius: '{rounded.md}'
  review-card:
    background: '{colors.card}'
    radius: '{rounded.lg}'
    border: '{colors.divider}'
    shadow: '{elevation.medium}'
    max-width: '{spacing.review-card-max-width}'
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
---

> Design DNA source: `.working/design-dna-profile.json` (measured color extraction + synthesized tokens). Live interactive reference: [`mockups/key-screens.html`](./mockups/key-screens.html). Original visual references: [`imports/spy-family-net-portal.png`](./imports/spy-family-net-portal.png), [`imports/quizlet-library-view.png`](./imports/quizlet-library-view.png), [`imports/quizlet-flashcard-view.png`](./imports/quizlet-flashcard-view.png) — note: on any conflict between this spec and those source images, **this DESIGN.md wins** (per this workflow's spines-win rule).

## Brand & Style

Training Sanctum is a personal spaced-repetition tool for advanced English vocabulary, built for one daily user. Its aesthetic deliberately pivots away from the PRD's original Linear/Raycast dark-minimalist-only direction (PRD §7) toward a two-source blend: **spy-family.net** (the official Spy x Family anime portal) contributes the **color palette and editorial grid layout** — sage/olive canvas, deep red single accent, charcoal-navy structure, bold black sans-serif headers, small red square section markers. **Quizlet** contributes **app structure only** — sidebar nav, flashcard component shape, progress counter, list-row pattern — explicitly *not* Quizlet's gamification (no Match/Blocks/Charms games, no social Study-with-Friends mode, no AI chat bubble) or its promotional density.

The result reads as a well-kept study journal crossed with a focused reading app: calm, disciplined, quietly confident — not a gamified habit app. A single accent color marks the one actionable thing per screen; everything else recedes. No illustration, no character art, no decorative pattern — this is a utilitarian tool that borrows color from a promotional portal, not its visual richness.

Dark mode is the default surface (near-black charcoal-navy), consistent with the PRD's original dark-first direction even after the aesthetic pivot. Light mode is a toggle, not an equal first-class default.

## Colors

- **Background — dark `{colors.bg}` (#14151f) / light `{colors.bg-light}` (#8ea89b, sage, measured from spy-family.net).** Dark is the default app canvas (near-black charcoal-navy, Quizlet-like). Light recreates spy-family.net's sage canvas close to as-is. The two themes are not merely inverted — sage is intentionally near-absent in dark mode (only as a muted structural tint), while dark navy is absent in light mode. Each theme fully commits to its own source.
- **Card surface — dark `{colors.card}` (#1f2130) / light `{colors.card-light}` (#faf7f0, white, measured from spy-family.net).** Used for the review card, folder tiles, sidebar, modals.
- **Elevated surface — dark `{colors.elevated}` (#262838) / light `{colors.elevated-light}` (#ecf1f2).** One step up from card, used for hover/active states and icon chips.
- **Text — dark `{colors.text}` (#ecf1f2) / light `{colors.text-light}` (#0e0e12, ink, measured).** Primary reading color in each theme; `{colors.text-soft}` (#faf7f0) is used for text on the accent fill (e.g. primary button label) in both themes.
- **Accent — `{colors.accent}` (#b74242, red, measured from spy-family.net) — identical in both themes.** The single saturated color the UI relies on: primary buttons, the "Again" grade state, section-marker bullets, active nav item. Never used decoratively or spread evenly across multiple elements on one screen — it marks the one actionable thing.
- **Semantic colors** — `{colors.success}` (#5c8a68), `{colors.warning}` (#c98a3a), `{colors.error}` (#b74242, same as accent), `{colors.info}` (#6a8a99) — all deliberately desaturated relative to the accent, so accent red stays the only color competing for attention.
- **Borders/dividers** — `{colors.border}` / `{colors.divider}` — subtle 1px hairlines; most surface separation comes from color-layering (surface vs. background), not borders or heavy shadow.

**Accessibility note:** WCAG AA contrast is required in both themes. The sage-green light-mode background against white cards and charcoal-ink text is explicitly flagged as needing verification before build — it is the one combination not already proven by an existing, widely-used product (unlike the dark theme's Quizlet-derived navy/white-text pairing). `[ASSUMPTION]` Exact light-mode contrast ratios were not measured as part of this design pass; implementation must verify `{colors.text-light}` on `{colors.bg-light}` and `{colors.card-light}` meet 4.5:1 before shipping.

## Typography

System font stack only, no custom webfonts (`{typography.body.fontFamily}` = `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`) — deliberate restraint matching the Linear/Raycast/Quizlet-app register the product still draws interaction conventions from, even after the visual pivot.

- `{typography.display}` (2.5rem/700) — the review card's prompt/term text; the single largest text on any screen, reserved for that one moment.
- `{typography.heading-1}` / `{typography.heading-2}` / `{typography.heading-3}` — page titles, section titles, modal titles, in descending weight.
- `{typography.body}` / `{typography.body-small}` — all reading text and UI labels.
- `{typography.caption}` — folder card counts, hints, secondary metadata.
- `{typography.overline}` (0.6875rem, 600 weight, 0.08em tracking, uppercase) — section-group eyebrows (e.g. "RECENTLY STUDIED"), sidebar section title, card context line (e.g. "English Idioms · Term → Definition"). Echoes spy-family.net's bold masthead confidence at small scale.
- `{typography.mono}` — reserved strictly for numeric displays: the review progress counter ("7 / 20"), streak day-count, and stats-view figures. Never used for prose.

Headers lean bold/black-weight; body stays regular-weight for readability across long review sessions.

## Layout & Spacing

Base unit 4px, scale `{spacing.1}`–`{spacing.8}` (4/8/12/16/24/32/48/64). Generous gaps (`{spacing.6}`–`{spacing.7}`, 32–48px) separate major page sections and surround the review card; tighter, list-like rhythm (`{spacing.2}`–`{spacing.3}`, 8–12px) governs rows within folder/library browsing screens, matching Quizlet's library density.

Two layout modes coexist by screen type:
- **Browsing screens** (Folders, Import, Stats, Settings): 12-column responsive grid, fixed `{spacing.sidebar-width}` (240px) sidebar + fluid content area on desktop, `{spacing.max-content-width}` (1200px) content cap, `{spacing.gutter}` (16–24px) gutters.
- **Review session**: single-column, centered focal layout; the card is constrained to `{spacing.review-card-max-width}` (640px) regardless of viewport, and all chrome (sidebar, nav) is hidden entirely (focus mode, PRD FR-11) — negative space itself is what signals focus mode, not a minimized version of chrome.

Breakpoints: mobile <640px, tablet 640–1024px, desktop >1024px. Below 640px the sidebar is hidden (see `mockups/key-screens.html`'s `@media (max-width: 640px)` rule) and the grade-button row wraps.

## Elevation & Depth

Soft, diffused, low elevation only — `{elevation.low}`, `{elevation.medium}`, `{elevation.high}`. Depth comes primarily from surface-color layering (card is a lighter step than background) rather than heavy shadow; `{elevation.medium}` is the review card's resting shadow, the heaviest elevation used anywhere in the product. No glassmorphism, no neumorphism, no gradient surfaces.

## Shapes

Soft, generous corner radius throughout — Quizlet-like friendliness, not sharp/editorial, despite the editorial-grid layout influence:

- `{rounded.sm}` (6px) — inputs, list rows, nav items, folder icon chips.
- `{rounded.md}` (12px) — primary/secondary buttons, grade buttons, cards within browsing grids. Deliberately less pill-extreme than Quizlet's fully-rounded buttons.
- `{rounded.lg}` (20px) — the review card itself, modals.
- `{rounded.full}` (999px) — pill-style elements only: tab switchers, tag chips, screen-selector pills.

Subtle 1px borders (`{colors.border}` / `{colors.divider}`) outline inputs and card edges; most separation still relies on surface-color contrast.

## Components

Live interactive reference for all components below: [`mockups/key-screens.html`](./mockups/key-screens.html) (Review Session with working 3D flip, Folders/Library view, Empty due-queue state, theme toggle).

- **Review card (`components.review-card`)** — Large, soft-rounded (`{rounded.lg}`) surface, center-aligned content, fixed bounds that never resize between prompt and revealed states. Clicking/tapping the card (or pressing Space) triggers a Quizlet-style 3D Y-axis flip (520ms, ease-out) revealing the answer on the back face — not a content swap. Small icon row (pin / audio / star) sits top-right, inert until explicitly tapped.
- **Grade buttons (`components.grade-button-again` / `grade-button-neutral`)** — Live **outside** the card, below it, appearing only after flip. Four buttons: Again / Hard / Good / Easy, each labeled with its keyboard shortcut. Flat/outline style, `{rounded.md}`. Again is styled toward the accent/danger color (`{colors.accent}` border+text); Hard/Good/Easy are neutral/outline with equal weight to each other — deliberately non-symmetric with Again, since classical SM-2 (PRD FR-8) makes Hard/Good/Easy produce the same next interval, so the UI must not visually imply Hard is "between" Again and Good in severity.
- **Sidebar nav (`components.sidebar`)** — Fixed 240px, five flat icon+label items: Review, Folders, Import, Stats, Settings. Active item gets `{colors.elevated}` background + `{colors.accent}` text. Hidden entirely during review (focus mode) and on mobile (<640px).
- **List row / folder row (`components.folder-tile`)** — Rows grouped under section headers (e.g. "Recently studied", "All folders"), each header preceded by a small red square bullet (`components.section-bullet`, lifted from spy-family.net's marker motif). Hover lightens to `{colors.row-hover}`; trailing "..." overflow menu per row.
- **Progress counter** — Mono-font "X / Y" display beneath the review card; streak indicator (flame icon + day count) alongside it, visible outside review only per FR-11/FR-12.
- **Modal (`components.modal`)** — Centered, `{rounded.lg}`, scrim overlay, used sparingly: folder-delete confirmation (two explicit buttons — "Move to Unsorted" primary, "Delete cards too" secondary/danger-styled, no checkbox) and restore-from-backup confirmation (consequence statement + Confirm/Cancel, no type-to-confirm).
- **Empty due-queue state** — Centered, shows streak count prominently (mono display size), a calm congratulatory line, and a primary "+ Add card" button (`components.button-primary`) — never a bare "nothing to do" message.
- **Import screen tabs** — Pill-style tab switcher (Paste / Upload file), `{rounded.full}`, both feeding the same column-mapping/error-review step.

## Do's and Don'ts

| Do | Don't |
|---|---|
| Use `{colors.accent}` for exactly one actionable thing per screen | Spread the accent across multiple simultaneous elements |
| Keep Hard/Good/Easy visually equal to each other, distinct only from Again | Give Hard a "lesser" visual weight implying a shorter next interval |
| Keep the review card's bounds fixed before and after flip | Resize or reflow the card on reveal |
| Hide all chrome during review (focus mode) | Minimize chrome to a thin bar during review |
| Use the small red square bullet only as a section-header marker | Use it as decoration or repeat it within a row |
| Keep light mode's cards white/near-white even on the sage background | Let sage bleed into card surfaces |
| Use system fonts only | Introduce a custom/webfont for any role, including display |
| Reserve mono type for numeric displays only | Use mono for prose or labels |
