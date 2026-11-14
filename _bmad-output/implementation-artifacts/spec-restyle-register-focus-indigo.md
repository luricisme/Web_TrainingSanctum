---
title: 'Restyle register screen to Focus Indigo + Design DNA'
type: 'feature'
created: '2026-11-08'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'c0af1fd818603bef50a25220650934703a76ce82'
context:
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/DESIGN.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/EXPERIENCE.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/history/focus-indigo/working/design-dna-profile.json'
  - '{project-root}/.claude/skills/design-dna/references/generation-guide.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `/register` was built in spec-1-2 as a deliberately unstyled functional form (generic centered rounded card, flat label stack). It does not follow DESIGN.md's "Focus Indigo" system or the Design DNA style, so the first screen a user sees reads as a generic AI template.

**Approach:** Restyle `/register` only by applying design-dna Phase 3. Tokens come from DESIGN.md and `globals.css`. Mood, composition and interaction feel come from the DNA `design_style`. Registration behavior stays unchanged.

**Decision (2026-11-08) — composition: B, editorial split.**
- **Desktop (≥1024px):** two columns inside a centered container capped at `max-content-width`.
  - The left column holds an `overline` masthead (square `section-bullet` plus "TRAINING SANCTUM"), the `heading-1` "Create your account", a thin `divider` rule, and one `body` purpose line in `text-secondary`: "Your daily vocabulary review, kept quiet." This is the only new copy, in the DNA's "quietly encouraging" voice.
  - The right column holds the form, top-aligned with the heading. It sits on a `card` surface (`rounded.lg`, 1px `divider` border, `elevation.low` at most).
  - A 1px `divider` vertical rule separates the columns.
- **Below 1024px:** the columns stack (masthead block above the form), using `spacing.4` side gutters.

## Boundaries & Constraints

**Always:**
- Keep every behavior identical: Zod validation, the `signUp.email` call, error mapping, the redirect to `/`, `noValidate`, and the field ids, names, autocomplete values and `aria-*` wiring.
- Keep the accessible names the e2e tests use: the labels "Full name", "Email" and "Password", the button "Create account", and the error ids `#name-error`, `#email-error` and `#password-error`.
- Use only token utilities (`bg-card`, `text-foreground-secondary`, `border-border`, `text-error`, `bg-accent`, `text-on-accent`, `rounded-[var(--radius-*)]`) and the DESIGN.md typography and spacing scale. Both themes must work: the `:root` dark default and `[data-theme="light"]`.
- The accent appears on exactly one element, the "Create account" button. The single exception allowed by DESIGN.md is the section-bullet marker.
- The input focus state is visible and uses the accent ring or border. Error text uses `text-error`, never the accent.
- The design follows DESIGN.md tokens and the Design DNA design_style, passes the anti-generic UI rules, and is checked against a screenshot in both dark and light themes.

**Never:**
- Change `globals.css` tokens, `packages/domain`, the auth client or API routes, or the e2e/unit tests.
- Add new dependencies or webfonts, gradients, glows, glassmorphism, illustration, emoji, or shadows heavier than `elevation.low` (DESIGN.md: medium is reserved for the review card).
- Add a sign-in link (no login route exists yet), a theme toggle, or marketing or filler copy.
- Use Canvas, WebGL or 3D effects (DNA `effect_intensity: none`).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Happy path | valid name, email and password | button shows "Creating account..." and is disabled; redirect to `/` | N/A |
| Field errors | invalid email, short password | inline `text-error` message under each field; the input border switches to the error color; focus ring still visible | stays on `/register` |
| Duplicate email | existing email | email field error | inline under email |
| Form error | network failure or timezone failure | form-level message styled as an error notice (error-colored text with a 2px left border, per DESIGN.md's problem-row motif) | stays on `/register` |
| Mobile / tablet | viewport < 1024px | masthead block stacked above the form, `spacing.4` side gutters, no horizontal scroll | N/A |

</frozen-after-approval>

## Code Map

- `apps/web/app/register/page.tsx` -- the only file to change. Restyle the JSX in lines 111–197 only. Keep lines 1–109 (logic) untouched, except for updating the stale header comment at lines 12–14 ("no design spec exists").
- `apps/web/app/globals.css` -- read-only token source. The Tailwind names are `background`, `card`, `elevated`, `foreground(-secondary|-tertiary)`, `border`, `divider`, `accent(-hover)`, `on-accent`, `error`, and radius vars `--radius-sm|md|lg|full`.
- `apps/web/app/layout.tsx` -- read-only. No theme provider exists; light theme is enabled by setting `data-theme="light"` on `<html>` (for screenshots, set it via devtools or Playwright).
- `tests/e2e/registration.spec.ts` -- read-only contract. Relies on `getByLabel`, `getByRole("button", {name: "Create account"})` and the `#*-error` ids.
- DESIGN.md mappings: typography `overline` = 0.6875rem / 600 / tracking 0.08em uppercase; `heading-1` = 2rem / 700; `body-small` = 0.875rem; `caption` = 0.75rem. Inputs use `rounded.sm` (6px), buttons `rounded.md` (12px), panels `rounded.lg` (20px). `section-bullet` is a 7×7 accent square with 1px radius. Motion is 100–200ms with `ease-in-out` for state changes.

## Tasks & Acceptance

**Execution:**
- [x] `apps/web/app/register/page.tsx` -- restyle the markup per the Decision (editorial split) and the Boundaries. Update the header comment to cite DESIGN.md and the DNA. -- Bring the first-run screen onto the design system.

**Acceptance Criteria:**
- Given the dark default theme, when `/register` loads, then all colors, radii and type sizes map to DESIGN.md tokens, and grep finds no `#hex` and no arbitrary `text-[Npx]` in the file.
- Given `data-theme="light"`, when the page renders, then every surface and text pair uses the light tokens and stays readable.
- Given any screen, when inspected, then only the submit button (and at most the section bullet) uses the accent.
- Given the existing e2e suite, when it runs, then all registration specs pass unchanged.

## Implementation Notes

- **Files touched:** `apps/web/app/register/page.tsx` only.
- **Logic:** lines 1–109 are unchanged apart from the header comment.
- **Class constants:** the shared class strings are module constants placed after the component.
- **Inlined values:** the type-scale values and the bullet size are inlined from DESIGN.md, because globals.css has no typography tokens (deferred).
- **Verification:**
  - Typecheck and lint are clean.
  - Screenshots were taken in dark and light themes, at 1280px and 375px, in the default, field-error and form-error states.
  - After the review patches: the card top and the masthead top align on desktop, the header and card are both 448px wide and aligned at 800px, and there is no horizontal scroll at 375px.
- **E2E:** the field-error and empty-name specs pass. "registering redirects to /" and "duplicate email" fail for an environmental reason: the `.env.local` Neon DB has no migrations applied (Prisma P2021, `public.users` missing). The registration logic is unchanged.
  - Running `npm run db:migrate:deploy` against a safe DB would satisfy the "all registration specs pass" acceptance criterion. It was not run because that DB may be shared or production.

## Spec Change Log

## Review Triage Log

Pass 1 (2026-11-08). Layers: blind-hunter, edge-case-hunter, verification-gap, design-fidelity.

| # | Layer | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|---|
| 1 | edge-case | `focus:outline-none` + ring leaves no focus indicator in forced-colors mode | low | Tailwind v4 `outline-none` sets outline-style none, and forced-colors mode drops box-shadow rings | patch (focus group) |
| 2 | edge-case | long unbroken error text overflows at 375px | low | error `<p>`s have no wrapping; the envelope message comes from the server | patch |
| 3 | edge-case | form not top-aligned with masthead on desktop | low | header `lg:pt-8` pushes the masthead below the card top (screenshot shows card top ~200px, overline ~238px) | patch |
| 4 | verification-gap | no gaps | — | the e2e contract (labels, button, error ids) is unchanged | — |
| 5 | blind | header comment claims "token utilities only" while type values are inline arbitrary values | low | arbitrary `text-[0.6875rem]`, `leading-[…]`, `size-[7px]` exist | patch (comment); token coding deferred |
| 6 | blind | form-level and async errors are not announced (no `role="alert"`) | medium | pre-existing: the baseline formError `<p>` had no live region either | defer |
| 7 | blind | no focus moved to the first invalid field | low | pre-existing behavior, not introduced by the restyle | defer |
| 8 | blind | input border contrast below WCAG 1.4.11 3:1 | medium | `border` token #d8dae9 on #fff ≈1.3:1; the token is set by DESIGN.md, which this spec may not change | defer |
| 9 | blind | thin input focus indicator, inconsistent with the button | low | 1px ring vs the button's 2px offset outline | patch (focus group) |
| 10 | blind | card has no max width below lg | low | `lg:max-w-[26rem]` only applies at lg; the header is `max-w-md` | patch |
| 11 | blind | decorative `<hr>` exposed to assistive tech | low | the `<hr>` lacks aria-hidden while the vertical divider has it | patch |
| 12 | blind | tagline has no traceable source | false | the copy is fixed in the frozen Decision approved by the human | reject |
| 13 | blind | no password requirement hint | low | pre-existing UX gap, not caused by the restyle | defer |
| 14 | blind | inputs editable while submitting, no aria-busy | low | pre-existing: the baseline also disabled only the button | defer |
| 15 | blind | header comment cites an untracked spec | false | the spec is committed with this change | reject |
| 16 | blind | no visual tests for the restyle | false | the spec's Verification uses manual screenshots (12 taken); verification-gap found no behavior gap | reject |
| 17 | blind | invalid-field ring-offset logic overcomplicated | low | `aria-[invalid=true]:focus:ring-offset-*` makes valid and invalid fields focus differently | patch (focus group) |
| 18 | design | overline/heading/line-height values inlined as arbitrary values | low | same root as #5: DESIGN.md typography is not coded in globals.css | patch (comment); defer tokens |
| 19 | design | `rounded-[var(--radius-*)]` bypasses the `rounded-sm/md/lg` theme utilities | low | globals.css @theme exposes `--radius-sm/md/lg` | patch |
| 20 | design | `gap-5` (20px) and `py-2.5` (10px) are off the spacing scale | low | DESIGN.md scale is 4/8/12/16/24/32/48/64 | patch |
| 21 | design | `hover:border-foreground-tertiary` uses a text token as a border | low | DESIGN.md hairlines are border/divider only; DNA hover = background step | patch |
| 22 | design | `font-medium` labels contradict body-small weight 400 | low | DESIGN.md typography.body-small fontWeight 400 | patch |
| 23 | design | section bullet beside the brand, so two accents are visible | false | the frozen Decision and Boundaries explicitly allow the section bullet next to "TRAINING SANCTUM" | reject |
| 24 | design | accent focus ring on invalid field | false | Boundaries require the input focus to use the accent ring or border | reject |
| 25 | design | editorial split reads as a marketing-hero layout | false | composition B was chosen by the human in the frozen Decision | reject |
| 26 | design | tagline is filler copy | false | the copy is fixed in the frozen Decision | reject |
| 27 | design | three separators (hr, vertical rule, card border) | false | all three are specified in the frozen Decision | reject |
| 28 | design | overline used as a brand masthead | false | the frozen Decision specifies the overline masthead | reject |
| 29 | design | `max-w-[1200px]` and `lg:max-w-[26rem]` arbitrary widths | low | 1200px equals the `max-content-width` token value; 26rem is replaced by the #10 patch | patch (via #10) |

## Verification

**Commands:**
- `npm run typecheck` -- expected: no errors
- `npm run lint` -- expected: no errors
- `npm run test:e2e -- registration` -- expected: all pass (needs a DB in `.env.local`; if one is unavailable, report that explicitly)

**Manual checks:**
- Screenshot `/register` in dark and light themes at 1280px and 375px wide, including the error state. Compare with DESIGN.md and `history/focus-indigo/mockups/key-screens.html` (surface layering, accent restraint, typography scale).
