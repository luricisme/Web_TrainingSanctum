---
title: 'Story 8.1: Planner Shell and Navigation'
type: 'feature'
created: '2026-11-17'
status: 'done'
route: 'dispatch'
baseline_commit: '19822f465e3152b1f64430f31261d0c7883cf02c'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-8-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/DESIGN.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/EXPERIENCE.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/.working/design-dna-profile.json'
  - '{project-root}/.claude/skills/design-dna/references/generation-guide.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The app has no place for planning work: the nav ends at Review, Classes, Cultivation and Settings, so Tasks, Calendar and Pomodoro (Epics 8–10) have nowhere to live.

**Approach:** Add a fifth Main nav item, **Planner** (sixth with Admin), to the app bar and dock, landing on `/planner`. Inside it, a segment switcher (Tasks default, Calendar, Pomodoro) keeps the segment in the URL; Calendar and Pomodoro show a one-line "coming" placeholder. No data, API or migration.

## Boundaries & Constraints

**Always:** Planner is appended after Settings in `navItems` (fifth), Admin stays last. Labels and icon-only rules are unchanged (label on the active item, from 1024px otherwise; dock icon-only with `aria-label`). `isActive` keeps `/planner/*` highlighting Planner. The switcher reuses `components.mode-switcher` (accent fill on the selected option, one accent pill on screen), is keyboard-operable (Left/Right/Up/Down/Home/End move and select, roving tabindex), and the chosen segment survives reload. UI uses DESIGN.md tokens only, in both themes.

**Never:** No Prisma change, no `/api/planner/**` route, no task or category UI (Stories 8.2–8.4). The Planner never enters focus mode and must not touch `focus-mode.tsx`. No new nav behaviour beyond one extra item. No fake controls in the placeholders.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Nav, normal user | Any shell page | Main nav shows 5 links, Planner fifth; dock shows 5 buttons | N/A |
| Nav, admin | Any shell page | 6 links, Admin last | N/A |
| Open Planner | Click Planner | `/planner`, Tasks selected, Planner `aria-current="page"` | N/A |
| Choose segment | Click or arrow to Calendar / Pomodoro | URL `/planner/calendar` / `/planner/pomodoro`, placeholder "Coming with Epic 10" / "Coming with Epic 9" | N/A |
| Reload on a segment | Reload `/planner/calendar` | Same segment selected | N/A |
| Unknown segment | `/planner/nope` | 404 | Next `notFound` |
| Signed out | `/planner/**` | Redirect to `/login` | Existing proxy and shell guard |

</frozen-after-approval>

## Code Map

- `apps/web/app/(shell)/nav-items.tsx` -- `navItems` array, `adminNavItem`, `isActive`, `iconProps`; add the Planner entry (own SVG, 24 viewBox, `iconProps`)
- `apps/web/app/(shell)/app-bar.tsx`, `dock.tsx` -- map `navItems`; no change expected (verify 5/6 items fit at 390px)
- `apps/web/app/(shell)/settings/study-directions.tsx` -- reference `radiogroup` switcher: roving focus, key handling, accent classes
- `apps/web/app/(shell)/flashcards/[id]/import-source-switcher.tsx` -- neutral tablist variant (not used here)
- `apps/web/app/(shell)/page-header.tsx` -- `PageHeader` for the title
- `apps/web/app/(shell)/cultivation/page.tsx`, `settings/page.tsx` -- page structure to mirror under `(shell)`
- `apps/web/app/(shell)/layout.tsx` -- shell; the `planner` folder goes under `(shell)`, so the session guard applies
- `tests/e2e/app-shell.spec.ts` (lines ~19, ~199), `tests/e2e/admin-menu.spec.ts` -- nav assertions to update (dock `toHaveCount(4)` becomes 5)

## Tasks & Acceptance

**Execution:**
- [x] `apps/web/app/(shell)/nav-items.tsx` -- append `{ href: "/planner", label: "Planner", icon }` after Settings -- fifth item
- [x] `apps/web/app/(shell)/planner/layout.tsx` -- `PageHeader` "Planner" plus the segment switcher above `{children}`
- [x] `apps/web/app/(shell)/planner/planner-switcher.tsx` -- client component: `usePathname` derives the segment; options are Tasks (`/planner`), Calendar, Pomodoro; arrow keys `router.push` and focus; accent fill on selected
- [x] `apps/web/app/(shell)/planner/page.tsx`, `calendar/page.tsx`, `pomodoro/page.tsx` -- Tasks body (one quiet line: tasks arrive in the next stories), Calendar "Coming with Epic 10.", Pomodoro "Coming with Epic 9."; `planner/[...]` unknown paths 404 by default
- [x] `tests/e2e/app-shell.spec.ts`, `tests/e2e/admin-menu.spec.ts` -- nav lists include Planner; dock count 5; admin 6
- [x] `tests/e2e/planner-shell.spec.ts` -- Planner link opens `/planner` (Tasks selected); click and arrow keys change URL; reload keeps segment; placeholders show; no focus-mode chrome change; dark and light screenshots at 1280px and 390px

**Acceptance Criteria:**
- Given any signed-in user, when the app bar or dock renders, then Planner is the fifth item (sixth with Admin) linking to `/planner`, with the same label and icon-only rules as the others
- Given `/planner`, when I use click or arrow keys on the switcher, then the segment is in the URL, survives reload, and the selected option has `aria-selected`/`aria-checked` true
- Given Calendar or Pomodoro, then a single line "Coming with Epic 10." / "Coming with Epic 9." shows with no controls
- Given a Review or Learn session, then focus mode still hides the chrome as before
- UI conforms to DESIGN.md tokens and the Design DNA design_style; passes the anti-generic UI rules; checked against a screenshot in both dark and light themes

## Implementation Notes

## Spec Change Log

## Review Triage Log

| Finding | Verdict | Evidence / route |
|---|---|---|
| `startsWith` without a `/` boundary in the switcher | low | Real (`/planner/calendarx` would select Calendar), masked by the 404. Direct one-line fix: patch (done). |
| Keyboard branches other than ArrowRight and Home untested | medium | Verification-gap, pre-verified. Patch (done): ArrowLeft, ArrowUp, ArrowDown, End and both wraps added to `planner-shell.spec.ts`. |
| "Coming with Epic 9/10" names sprint epics | false | The story's acceptance criteria and the frozen matrix specify this exact text. Rejected: fixing it means editing the spec. |
| Tasks body line and subtitle are generic copy | low | Cosmetic; the story defines neither. Rejected. |
| radiogroup instead of nav links; arrows navigate each step | false | The AC asks for a switcher where arrow keys move between options, and it reuses `components.mode-switcher` like Study directions. Rejected. |
| Rapid arrow presses vs stale `selected` | maybe-false | Needs two presses before the pathname updates; the fix adds ref state. Low if real, so rejected. |
| Focus left on an unchecked radio after a failed navigation | false | Speculative: no failing navigation shown; `router.push` between static pages. Rejected. |
| No per-segment metadata / `loading.tsx` / `error.tsx` | low | Not in the story; static placeholders. Rejected. |
| No test asserts focus mode is unchanged | low | The change never touches `focus-mode.tsx`; existing review specs cover hidden chrome. Rejected. |
| Screenshot tests assert nothing; dock fit at 390px unchecked; one-accent-pill unchecked | low | Matches the repo's screenshot practice (admin-menu); the 390px screenshot was viewed. Nav uses `bg-frame-raised`, not the accent. Rejected. |
| Missing section-marker row on the stub pages | low | Stub screens; full screens come in 8.3. Rejected. |
| `design-dna-profile.json` and `mockups/key-screens.html` are missing | n/a | Pre-existing, not caused by this story. Defer (logged in `deferred-work.md`). |

## Design Notes

Use a `radiogroup`-style switcher like Study directions, but each option is a link-like navigation: selecting pushes the route, and the selected state comes from the URL, not local state, so reload and back/forward stay correct. Admin nav at 390px is six 44px buttons (about 300px), which fits.

## Verification

**Commands:**
- `npm run typecheck && npm run lint` -- expected: clean
- `npm test`, `npm run test:e2e` (PowerShell, test DB vars) -- expected: all pass

**Manual checks (if no CLI):**
- Open `/planner` at 1280px and 390px in both themes: five nav items (six for admin), one accent pill (the switcher), nothing overlapping the dock
