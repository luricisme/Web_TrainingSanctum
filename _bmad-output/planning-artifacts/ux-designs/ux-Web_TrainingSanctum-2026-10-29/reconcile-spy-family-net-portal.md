# Reconcile: spy-family-net-portal.png

Source: `imports/spy-family-net-portal.png` — the official Spy x Family anime portal (spy-family.net).

## Taken

- **Color palette** — sage/olive green canvas, deep red single accent, charcoal-navy structural elements, white content cards. Measured and carried into `design-dna-profile.json` and `DESIGN.md` (`{colors.bg-light}`, `{colors.card-light}`, `{colors.accent}`).
- **Editorial grid layout** — dense, structured poster/cover-art grid rhythm, applied conceptually to folder/card-browsing surfaces (not the review session itself) as the 12-column grid + section-group structure in `DESIGN.md.Layout & Spacing`.
- **Bold black sans-serif masthead headers with small red square bullets** — the small red square bullet became the section-header marker motif (`components.section-bullet` in `DESIGN.md`), used sparingly as a structural marker only.

## Deliberately NOT taken

- **Illustration and character art** — the portal is built around Spy x Family character key-art and comic covers; none of that imagery, nor any illustration style, belongs in Training Sanctum. The app's `visual_language.imagery` is explicitly "none — no character art or illustration" (per `design-dna-profile.json`); this is a utilitarian study tool, not the promotional property it borrows color from.
- **Promotional grid density** — the portal's goods/collaboration/comics grids are dense, image-heavy, and built for browsing merchandise and news. Training Sanctum's grid borrows the *rhythm* (section grouping, structured rows) but at much lower visual density — appropriate for folder/card counts and short text rows, not thumbnail galleries.
- **Multi-section marketing layout** (News / Goods / Collaboration / Comics as parallel promotional rails) — this page structure doesn't map to an app with five functional surfaces (Review, Folders, Import, Stats, Settings); it was not adapted at all.

## Dropped idea

The portal's large hero banner area (character art + announcement banners) suggested a "hero moment" treatment for a landing/dashboard surface, but this was dropped — Training Sanctum has no marketing landing page; the equivalent entry point is the Review surface itself (or the Empty due-queue state when nothing is due), which is functional, not promotional, and carries no hero-image treatment.
