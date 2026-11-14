---
title: 'Visual refresh: Pastel Frame (app bar shell, tint tiles, light default)'
type: 'feature'
created: '2026-11-14'
status: 'review'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '1fc760b2d2a7770c26979753c4ea55b69de00700'
context:
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/DESIGN.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/EXPERIENCE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The product looked like a dark, sidebar-driven "Focus Indigo" tool. The owner wants a big UI update toward a reference language-learning app: a dark app frame with a top bar around a soft light panel, pastel tint cards, pill controls and a rounded geometric sans.

**Approach:** Restyle the whole authenticated shell and the existing screens. Behavior, routes, copy and accessible names stay as they are. Tokens live in `globals.css`.

**Decisions (2026-11-14):**
- **Shell:** the 240px sidebar is replaced by an app bar at the top of a near-black app frame (28px radius). The content panel (22px radius) sits inside it. Brand left, Main nav centred, Realm badge right (an XP ring, the realm label and the XP figure). Hidden below 640px and in focus mode, as the sidebar was.
- **Theme:** light is the default (server-rendered `data-theme="light"`); a stored "dark" removes it.
- **Accent:** monochrome, ink on light and paper on dark. Colour comes from five pastel tint surfaces.
- **Lists:** Classes, Folders and Flashcards become grids of tint tiles, cycling the tint by position (no meaning).
- **Grade buttons:** pastel pills, Again rose, Hard butter, Good mint, Easy sky.
- **Type:** Plus Jakarta Sans via `next/font` (latin, vietnamese); weights 800 for display and heading-1, 700 for heading-2 and heading-3.
- **Out of scope (not built):** the reference's floating dock, quick-search palette and vocabulary or kana screens. These are new features, not a restyle.

## Boundaries & Constraints

**Always:**
- Keep behavior, routes, API calls and visible copy identical.
- Keep the accessible contracts the e2e suite uses: the Main nav (`aria-label="Main"`, `aria-current="page"`), the Realm badge link name and its `progressbar` (`aria-valuemin/max/now`, `aria-valuetext`), the `Breadcrumb` navs, the theme and study-direction radios.
- Keep focus mode working: `[data-focus-session]` hides `[data-app-bar]` from first paint, with and without JS.
- Both themes work. Text on a tint is `foreground` or `foreground-secondary`; text on an accent fill is `on-accent`.
- The accent stays the one actionable thing per screen (tests count `bg-accent` elements).

**Never:**
- Change `packages/domain`, `packages/db`, API routes or the data model.
- Add dependencies beyond `next/font/google`.
- Introduce a mobile navigation here; below 640px there is still none (existing deferred item).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Desktop shell | viewport ≥ 640px | dark frame with app bar; nav labels show from 1024px, icons only below it (active item always labelled) | N/A |
| Mobile | viewport < 640px | no app bar; the panel fills the screen | N/A |
| Focus mode | Review or Learn session running | app bar absent, even before hydration | N/A |
| Realm load fails | `/api/cultivation` 500 | badge not rendered; nav works | N/A |
| First visit | no stored theme | light theme | N/A |
| Stored dark | `localStorage.theme = "dark"` | `data-theme` removed before first paint | storage unavailable: light |

</frozen-after-approval>

## Code Map

- `apps/web/app/globals.css` -- token layer: `backdrop`, `frame*`, `on-frame*`, five `tint-*` pairs, radii, shadows, `focus-ring-frame`, font variable. Both themes.
- `apps/web/app/layout.tsx` -- Plus Jakarta Sans, default `data-theme="light"`, theme init script (only "dark" is applied).
- `apps/web/app/(shell)/layout.tsx` -- frame and panel.
- `apps/web/app/(shell)/app-bar.tsx` -- replaces `sidebar.tsx`; carries `data-app-bar`.
- `apps/web/app/(shell)/realm-badge.tsx` -- badge as XP ring. `XpBar` is unchanged (still used by the Empty due-queue state).
- `apps/web/app/components/ui.ts` -- buttons, inputs, tint helpers (`tintAt`, `tileClass`, `tileGridClass`, `tileIconClass`, `tileSkeletonClass`).
- `apps/web/app/(shell)/classes/*`, `folders/[id]`, `flashcards/[id]` -- tile lists, breadcrumbs, row menu, modal.
- `apps/web/app/(shell)/review/*`, `settings/page.tsx`, `login`, `register` -- restyled surfaces.
- `tests/e2e/app-shell.spec.ts`, `tests/e2e/review.spec.ts` -- selector and default-theme updates only.

## Tasks & Acceptance

**Execution:**
- [x] Token layer and font -- `globals.css`, `layout.tsx`.
- [x] App frame, app bar, Realm badge ring -- `(shell)/layout.tsx`, `app-bar.tsx`, `realm-badge.tsx`.
- [x] Shared UI classes and tint tiles -- `components/ui.ts`, `classes/ui.ts`.
- [x] Tile lists for Classes, Folders, Flashcards; card rows, row menu, modal.
- [x] Review grade pills, card viewer nav, Empty due-queue list, Settings cards, Login and Register.
- [x] E2E: `aside[data-sidebar]` -> `[data-app-bar]`; theme test inverted for the light default.
- [x] DESIGN.md: "Visual refresh 2026-11-14" section, marked as superseding the older tokens.

**Acceptance Criteria:**
- Given any shell route at ≥ 640px, when it loads, then the dark frame, app bar and inset panel show, and the current nav item is a raised pill.
- Given a Review or Learn session, when it runs, then no app bar is rendered, including with JavaScript disabled.
- Given a first visit, when the app loads, then the theme is light; given a stored dark theme, then it loads dark with no flash.
- Given the Classes, Folder and Class pages, when populated, then items render as tint tiles in a 1, 2 or 3 column grid.
- Given the full e2e suite, when it runs, then all specs pass.

## Implementation Notes

- **Verification run (2026-11-14):** typecheck and lint clean; `playwright test --project=e2e` 138/138. Screenshots for both themes at 1280px and 390px were reviewed (Settings, Classes, Class detail, Flashcard detail, Review, Move modal, Login). The last tweak, the XP ring track colour in `realm-badge.tsx`, was checked by typecheck and lint only, not by a re-run or a new screenshot.
- **Not committed:** the change is in the working tree on `main`.
- **No mobile nav** (see Boundaries); Settings and Log out remain unreachable below 640px, as before.
- **Superseded parts of earlier specs:** spec-1-5 (240px sidebar, dark default), spec-5-1 (badge at the sidebar bottom, 4px bar), spec-4-5 (the sidebar is the app bar), and the older tokens in DESIGN.md (Focus Indigo, 6/12/20px radii, system font stack). Each carries a pointer to this spec.
- **Open design checks:** contrast of text on the dark-theme tints and of the XP ring track on the frame has not been measured. Token pairs were chosen by eye.

## Spec Change Log

## Review Triage Log

Not yet reviewed.

## Verification

**Commands:**
- `npm run typecheck`, `npm run lint` -- expected: no errors
- `playwright test --project=e2e` (PowerShell, with `DATABASE_URL` and `BETTER_AUTH_URL` set) -- expected: all pass

**Manual checks:**
- Screenshots in `test-results/screenshots/` for both themes at 1280px and 390px. Compare the frame, tile colours and pill controls against the reference images.
