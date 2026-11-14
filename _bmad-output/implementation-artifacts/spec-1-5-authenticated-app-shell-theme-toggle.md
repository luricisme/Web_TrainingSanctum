---
title: 'Authenticated App Shell & Theme Toggle'
type: 'feature'
created: '2026-11-08'
status: 'done'
baseline_commit: '7e062fc2c0476e004f41e19a395a2c63c46aa177'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-Web_TrainingSanctum-2026-11-01/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/DESIGN.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/EXPERIENCE.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/.working/design-dna-profile.json'
  - '{project-root}/.claude/skills/design-dna/references/generation-guide.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** After login the user lands on a bare placeholder page: there is no navigation, no theme switch, no route gating, and logout is a temporary button on `/`. Story 1.5 (last of Epic 1) must make the product feel like itself before any feature exists.

**Approach:** Add an authenticated shell (240px sidebar with Review, Classes, Stats, Settings, each a placeholder page), a dark/light theme toggle in Settings that persists across reloads, redirect of unauthenticated visitors to `/login`, and move logout into Settings.

## Boundaries & Constraints

**Always:**
- Visual output conforms to DESIGN.md tokens via `globals.css` utilities (no hard-coded hex/px/shadows), the Design DNA `design_style`, and the anti-generic UI rules. Dark is the default theme; light is `:root[data-theme="light"]`, already defined in `globals.css`.
- Sidebar: fixed 240px, `card` surface, four flat icon + label items (inline SVG, no emoji, no icon library). Active item = `elevated` background + `accent` text; Classes stays active on `/classes/**`. Hidden below 640px.
- Gating is real, not cosmetic: the shell layout validates the session server-side (`auth.api.getSession`), and `proxy.ts` (Next 16's replacement for middleware) redirects cookie-less requests early.
- Theme is stored in `localStorage` and applied before first paint (blocking inline script), so there is no flash of the wrong theme.
- `/` redirects to `/review`; login and registration land on `/` and so end up on `/review`.
- No new API routes, no schema changes, no new dependencies.

**Never:**
- No Import nav item, no review focus mode, no real page content (Epic 2 and later), no theme stored in the DB, no changes to DESIGN.md tokens.
- No redirect loops: a stale session cookie must end on `/login`, never bounce between `/login` and `/review`.
- Do not gate `/api/**` in the proxy; Route Handlers keep returning `401` through `requireSession`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Gated route, logged out | `GET /classes` with no session cookie | Redirect to `/login` | N/A |
| Stale cookie | Session cookie for an expired or deleted session, `GET /settings` | Shell layout redirects to `/login` | No loop with `/login` |
| Logged-in on auth pages | Valid session, `GET /login` or `/register` | Redirect to `/review` | N/A |
| Root | Valid session, `GET /` | Redirect to `/review`; logged out ends at `/login` | N/A |
| Theme switch | Click Light in Settings, then reload | `data-theme="light"` before paint, choice kept | `localStorage` unavailable: dark default, toggle still switches for the page's lifetime |
| Mobile | Viewport under 640px | Sidebar not visible; content fills the width | N/A |
| Logout | Click "Log out" in Settings | Session ends, redirect to `/login`, `/api/me` returns 401 | Failure shows the existing alert text |

</frozen-after-approval>

## Code Map

- `apps/web/app/layout.tsx` -- root layout; add the theme init script and `suppressHydrationWarning` on `<html>`.
- `apps/web/app/globals.css` -- tokens already complete (both themes); reuse, do not edit unless a missing utility is proven.
- `apps/web/app/page.tsx` -- placeholder with the temporary `LogoutButton`; becomes `redirect("/review")`.
- `apps/web/app/components/logout-button.tsx` -- keep as is, render it from Settings.
- `apps/web/lib/session.ts` -- add a server helper (cached `auth.api.getSession` with `next/headers`) next to `requireSession`.
- `apps/web/app/login/page.tsx`, `app/register/page.tsx` -- client pages; add server `layout.tsx` beside each that redirects valid sessions to `/review`.
- `apps/web/proxy.ts` -- new; `getSessionCookie` from `better-auth/cookies`, matcher excludes `/api`, `_next`, static files, `/login`, `/register`.
- `apps/web/app/(shell)/` -- new route group: `layout.tsx` (session check, sidebar + main), `review|classes|stats|settings/page.tsx`, and a client `sidebar.tsx` using `usePathname`.
- `tests/e2e/login.spec.ts`, `session-persistence.spec.ts`, `placeholder.spec.ts` -- assumed `/` and a Log out button on it; update to `/review` and Settings.
- Patterns to mirror: `/register` editorial masthead (overline + section bullet), `DESIGN.md` `components.sidebar` and `components.mode-switcher`.

## Tasks & Acceptance

**Execution:**
- [x] `apps/web/lib/session.ts` -- add cached server-side session helper -- one real check shared by layouts
- [x] `apps/web/proxy.ts` -- redirect cookie-less requests to `/login` -- fast, optimistic gate
- [x] `apps/web/app/(shell)/layout.tsx`, `sidebar.tsx` -- shell with validated session and the four-item sidebar -- AC1, AC3
- [x] `apps/web/app/(shell)/{review,classes,stats,settings}/page.tsx` -- placeholder pages (overline, heading, one honest sentence); Settings holds Theme and Log out -- AC1
- [x] `apps/web/app/layout.tsx` + `app/components/theme-toggle.tsx` -- init script and Dark/Light switch persisting to `localStorage` -- AC2
- [x] `apps/web/app/page.tsx`, `login/layout.tsx`, `register/layout.tsx` -- redirects per the matrix -- closes the deferred 1.3 item
- [x] `tests/e2e/*` -- fix affected specs; add `tests/e2e/app-shell.spec.ts` for nav, gating, stale cookie, theme persistence, mobile hiding

**Acceptance Criteria:**
- Given a logged-in user, when they open the app, then the sidebar shows Review, Classes, Stats, Settings and each link opens its placeholder page.
- Given the theme toggle, when switched and the page reloaded, then the chosen theme still applies using the full token set.
- Given an unauthenticated visitor, when they open any shell route, then they land on `/login`; below 640px the sidebar is hidden.
- UI conforms to DESIGN.md tokens and the Design DNA design_style; passes the anti-generic UI rules; checked against a screenshot in both dark and light themes.

## Implementation Notes

Result: all tasks done. Verified against the disposable `postgres:16-alpine` on port 5433: typecheck and lint clean, Vitest 20/20, Playwright 35/35 (api + e2e). Screenshots of Settings (dark/light, desktop/mobile) were written to `test-results/screenshots/`. Review patches applied: proxy matcher escaping and boundaries, removed repeated page-header eyebrow, 1200px cap and 16-24px gutters, calmer placeholder copy, logout button no longer waits on `useSession`. Mobile navigation below 640px is deferred.

## Spec Change Log

- 2026-11-14: partly superseded by [spec-restyle-pastel-frame](./spec-restyle-pastel-frame.md). The 240px sidebar is now a top app bar inside a dark frame (`sidebar.tsx` became `app-bar.tsx`), and light is the default theme. Routes, the Main nav name and the theme toggle behavior are unchanged.

## Review Triage Log

- **low, patch** — Proxy matcher is a plain JS string, so `\.` collapses to `.` and `login|register|api|_next` has no boundary (Blind, Edge, Gap): confirmed in `proxy.ts`; fails open only for odd paths and the shell layout still validates, but the fix is a direct escape.
- **medium, patch** — "Training Sanctum" eyebrow plus accent bullet repeats on the sidebar and every page header, stacking decorative accents (Design, Blind): contradicts the DESIGN.md bullet rule and anti-generic rules; removed from PageHeader.
- **low, patch** — Shell content cap `max-w-[880px]` and `lg:px-12` stray from `max-content-width` 1200px and the 16–24px gutter (Design).
- **medium, patch** — Placeholder copy leaks sprint terms and "Nothing is due yet" reads as data (Design, Blind): violates the no-filler and brand-voice rules.
- **low, patch** — Single-child wrapper div around LogoutButton on Settings (Design, Blind).
- **low, patch** — `LogoutButton` returns null until client `useSession` resolves, so it pops in late and never shows if that call fails (implementer note; the light screenshot lacked it): the shell layout already validated the session.
- **low, patch** — Stale test title "redirects to /" in registration.spec (Gap, Edge).
- **false** — `getSessionCookie` assumes the default cookie name (Blind, Edge): it checks both the `__Secure-` and plain names with the default `better-auth` prefix, and `auth.ts` sets no custom prefix.
- **false** — `usePathname()` may be null (Edge): typed non-null in the App Router, and typecheck passes.
- **high-looking, defer** — No navigation below 640px, so Settings and Log out are unreachable on phones (Blind, Edge, Gap, Design): the spec, DESIGN.md and EXPERIENCE.md all say the sidebar is hidden there; deferred as a design decision.
- **low, rejected** — Stale cookie not cleared, duplicate login/register layouts, no return-to after login, no `loading.tsx`/`error.tsx`, `getServerSession` throw unhandled, per-page titles, skip link, `PageHeader` children in `<p>`: no demonstrated harm in everyday use and each fix adds guards or structure.
- **low, rejected** — Theme toggle: no arrow-key roving, no system preference, no cross-tab sync, one-frame wrong radio on hydration, no CSP nonce (Blind, Edge): EXPERIENCE.md scopes accessibility to contrast and keyboard reach; dark default is specified.
- **low, rejected** — Screenshot tests assert nothing, `register` helper duplicated, stale-cookie test hardcodes port and cookie name (Blind, Gap, Edge): they pin the spec's visual check and match existing spec conventions.
- **low, rejected** — Review page shows the sidebar although focus mode hides chrome (Design): focus mode is Epic 4 and excluded by the spec.
- **low, rejected** — Arbitrary type, spacing and bullet values instead of tokens (Design): already in deferred-work.md (typography tokens), not caused by this change.

## Verification

**Commands:**
- `npm run typecheck` and `npm run lint` -- expected: clean
- `npx vitest run` -- expected: all pass
- `npx playwright test` -- expected: api and e2e projects pass (needs a disposable Postgres via `DATABASE_URL`)

**Manual checks:**
- Screenshots of Settings in dark and light, desktop and under 640px.
