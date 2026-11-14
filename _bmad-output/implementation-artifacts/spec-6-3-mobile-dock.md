---
title: 'Story 6.3: Mobile Dock'
type: 'feature'
created: '2026-11-14'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
baseline_commit: '81ace35253af82133f051bc3d4dec776857ba7a5'
context:
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/DESIGN.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/EXPERIENCE.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/.working/design-dna-profile.json'
  - '{project-root}/.claude/skills/design-dna/references/generation-guide.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Below 640px the app bar is hidden and nothing replaces it, so a phone user cannot reach Settings (and Log out, which lives there) or Cultivation.

**Approach:** Add a floating, pill-shaped dock (UX-DR20) shown only below 640px outside focus mode: Review, Classes, Cultivation and Settings as round icon buttons on the frame colour, current destination raised. No Search button until Story 6.5. UI conforms to DESIGN.md tokens and the Design DNA design_style, passes the anti-generic UI rules, and is checked against a screenshot in both dark and light themes.

</frozen-after-approval>

## Implementation Notes

- New `apps/web/app/(shell)/dock.tsx`; share the four nav items with `app-bar.tsx` (extract to one module, no duplicated icons).
- `nav aria-label="Main"` must stay unique per viewport: the app bar is `display:none` below 640px and the dock `display:none` from 640px, so only one is in the accessibility tree.
- Hide in focus mode like the app bar: `useIsFocused()` plus a `[data-dock]` rule next to the `[data-app-bar]` one in `globals.css` (first paint, no JS).
- Safe area: `viewport-fit=cover` in `layout.tsx` and `env(safe-area-inset-bottom)` in the dock offset; `main` gets bottom padding below 640px so the dock never covers the end of the page.
- Keyboard: every item a link with `focus-ring-frame`, `aria-current="page"` on the current one; icon-only items keep an accessible name (visible or `sr-only` label).
- Realm badge is not shown on mobile (EXPERIENCE.md); Cultivation is one tap away.
- Update DESIGN.md dock status `not built` -> built, and EXPERIENCE.md "no navigation below 640px" lines.
- E2E in `tests/e2e/app-shell.spec.ts`: dock visible at 390px with the four items and `aria-current`, absent at 1280px, absent in a Review session.

**Done (2026-11-14):** files `(shell)/nav-items.tsx` (new, shared items and icon props), `(shell)/dock.tsx` (new), `(shell)/app-bar.tsx`, `(shell)/layout.tsx` (Dock, `pb-28` below 640px), `globals.css` (`[data-dock]` hidden with `[data-app-bar]`), `app/layout.tsx` (`viewportFit: "cover"`), DESIGN.md and EXPERIENCE.md status lines, `app-shell.spec.ts` (old "sidebar is hidden below 640px" test replaced by a dock test: four links, `aria-current`, Settings reachable with Log out, content not covered, dock gone at 1280px), `review.spec.ts` (no-JS session: dock in DOM but hidden at 390px). Verified: typecheck and lint clean; app-shell, review (34/34) and settings screenshot specs pass; screenshots at 390px reviewed in light and dark. Note: in dark the dock's frame colour sits close to the dark panel, readable thanks to the shadow and raised pill; contrast not measured (Story 5.5 covers non-text 3:1).

## Review Triage Log

- Duplicated active-route check (medium-low): real; fixed with a shared `isActive` in `nav-items.tsx`.
- Safe-area left/right and magic `pb-28` (low): rejected; the app bar and panel already ship at >= 640px, landscape-notch padding is a pre-existing gap, and the fix is wider than a simple correction.
- Dock z-index vs overlays and keyboard (maybe-false): modals are `<dialog>` (top layer) and the only other z-index is the row menu's `z-10`, so no overlap found; keyboard behaviour on a real device not verified.
- Icon-only links without visible label or `title` (low): rejected; DESIGN.md specifies round icon buttons, `aria-label` gives the accessible name.
- Thin e2e coverage (low): rejected; boundary test at 600/1280, no-JS first-paint path and keyboard/safe-area not tested; acceptable for this change.
- `iconProps` export unused (false): app-bar's brand icon uses it.
