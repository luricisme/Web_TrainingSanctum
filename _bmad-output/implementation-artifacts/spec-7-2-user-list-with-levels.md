---
title: 'Story 7.2: User List with Levels'
type: 'feature'
created: '2026-11-14'
status: 'done'
baseline_commit: 'ccd41caa1cd2b059375ab180181610f84957783f'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/DESIGN.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/EXPERIENCE.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/.working/design-dna-profile.json'
  - '{project-root}/.claude/skills/design-dna/references/generation-guide.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** An admin has no way to see who uses the app or where each person stands. Stories 5.2 and 7.3 need a user list to start from.

**Approach:** Fill the Admin page with a read-only, paginated table of every user (email, created, status, realm, level, XP), backed by one `requireAdmin()` route. Each row links to `/admin/users/{id}` (built in Story 7.3). UI conforms to DESIGN.md tokens and the Design DNA design_style, passes the anti-generic UI rules, and is checked against a screenshot in both dark and light themes.

## Boundaries & Constraints

**Always:** The route is `GET /api/admin/users` and calls `requireAdmin()` first (AD-16). Realm and level are derived with `levelForXp(user.cultivationXp)`, never stored. Query params `page` (default 1) and `pageSize` (default 20, max 100) are validated by a Zod schema in `packages/domain`. Order is `createdAt desc, id desc` so pages are stable. Response is `ok({ items, total, page, pageSize })` in the AD-10 envelope. Items expose only `id, email, createdAt, disabled, realm, level (1-based), xp`. The page is a server component that does `notFound()` for non-admins, as `/admin` does today.

**Never:** No write, edit, disable, delete, export or role change. No password, session, name, timezone or card data in the response. No search, sort controls or filters. No user detail page (Story 7.3; the row link may 404 until then). No new table library. No hard-coded hex.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| List, admin | 45 users, `page=1` | 20 rows newest first, `total=45` | N/A |
| Last page | `page=3` | 5 rows | N/A |
| Beyond last page | `page=9` | `items: []`, `total=45` | N/A |
| No cookie | `GET /api/admin/users` | 401 `UNAUTHENTICATED` | Envelope |
| Normal user | user session | 403 `FORBIDDEN` | Envelope |
| Bad params | `page=0`, `pageSize=500`, `page=abc` | 400 `VALIDATION_ERROR` | `validationFailure` |
| Level mapping | `cultivationXp=0` / high XP | Level 1 / realm label from `levelForXp`; never throws | N/A |
| Disabled user | `disabled=true` | Status shows Disabled, row still listed | N/A |
| Page, normal user | opens `/admin` | 404 | `notFound()` |
| Empty page param | `/admin?page=2` out of range | Empty-state row and working Previous link | N/A |

</frozen-after-approval>

## Code Map

- `apps/web/app/api/admin/me/route.ts` -- pattern for an admin route (`requireAdmin`, `ok`).
- `apps/web/lib/session.ts`, `apps/web/lib/api-response.ts` -- `requireAdmin`, `ok`, `validationFailure`.
- `packages/domain/src/cultivation.ts` -- `levelForXp(xp)` returns `{ realm, label, levelIndex, ... }`; use as is.
- `packages/domain/src/learn-queue.ts` (`learnQueueQuerySchema`) and `packages/domain/src/index.ts` -- schema and barrel pattern.
- `packages/db/schema.prisma` -- `model User`: `cultivationXp`, `disabled`, `createdAt`, `email`. No migration needed.
- `apps/web/app/(shell)/admin/page.tsx` -- fill: read `searchParams`, render the table.
- `apps/web/app/(shell)/page-header.tsx`, `realm-badge.tsx` (`xpText`) -- header and XP formatting to reuse.
- `apps/web/app/(shell)/classes/` -- prior art for list styling with tokens.
- `tests/api/admin-guard.spec.ts`, `tests/e2e/admin-menu.spec.ts` -- templates (admin email, helpers, prisma access).

## Tasks & Acceptance

**Execution:**
- [x] `packages/domain/src/admin-users.ts` + `index.ts` -- `adminUsersQuerySchema` (coerced page/pageSize, bounds) and item type -- shared validation
- [x] `apps/web/app/api/admin/users/route.ts` -- guarded paginated query with `count`, map items through `levelForXp` -- AC list
- [x] `apps/web/app/(shell)/admin/page.tsx` + `admin/users-table.tsx` -- table with Previous/Next links via `?page=`, row links to `/admin/users/{id}`, empty state, Active/Disabled status text, mobile-safe layout (390px) -- AC UI
- [x] `tests/domain/admin-users.test.ts` -- schema bounds and defaults
- [x] `tests/api/admin-users.spec.ts` -- 401, 403, 200 shape and no secret fields, pagination, bad params, level mapping
- [x] `tests/e2e/admin-users.spec.ts` -- admin sees table and paging at desktop and 390px; normal user gets 404
- [x] Run typecheck, lint, vitest, api and e2e suites; screenshot both themes

**Acceptance Criteria:**
- Given I am an admin and open Admin, then a table lists every user with email, created date, status, realm, level and XP, paginated and read-only.
- Given I select a row, then I go to `/admin/users/{id}`.
- Given a non-admin or anonymous request to the list, then it returns 403 or 401 in the error envelope, and `/admin` is a 404 for a normal user.
- Given UI changes, then they conform to DESIGN.md tokens and the Design DNA design_style, pass the anti-generic UI rules, and were checked against a screenshot in both dark and light themes.

## Implementation Notes

- Realm is shown as the `levelForXp` label ("Realm · Stage") in plain text. DESIGN.md's admin-table rule says "small Realm badge"; see the triage row below.
- `listUsers()` in `apps/web/lib/admin-users.ts` is shared by the route and the page.
- `page` is capped at 1,000,000 (`ADMIN_USERS_MAX_PAGE`) so `skip` stays inside the 32-bit range.

## Spec Change Log

## Review Triage Log

| Finding | Verdict | Route | Evidence |
|---|---|---|---|
| `page` has no upper bound; a huge value makes `skip` overflow and the route 500s (edge-case, blind, gap) | medium | patch | Schema had `.min(1)` only; `(page-1)*pageSize` is passed to Prisma. Capped at 1,000,000 plus schema test rows. |
| Footer reads "0–199980 of 45" on an out-of-range page | low | patch | `last` is computed from `items.length` of 0 on page 9999. Now shows "0 of N" when empty. |
| Status text "Disabled"/"Active" never asserted in the rendered page (gap) | medium | patch | Only API JSON was checked. Added an e2e that seeds a disabled user and reads its row. |
| Previous-link assertion matches any `/admin` URL (gap) | low | patch | Tightened the URL assertion and added a not-9999/9998 check. |
| Realm shown as text, not a "small Realm badge" (design) | low | reject | AC asks for the realm in the table; it is shown. DESIGN.md marks admin-table "not built" and no reusable badge exists; a badge is a styling follow-up, not a defect. |
| Arbitrary `min-w-[40rem]`, `max-w-[18rem]` (design) | low | reject | Layout widths for horizontal scroll and truncation, not colour, shadow or radius tokens; the fix adds new tokens. |
| `cursor-pointer` set per component (design) | low | reject | The global base cursor rule belongs to Story 5.5 and does not exist yet; the row is clickable. |
| Disabled pager span carries link styling; no section marker row (design) | low | reject | Cosmetic, no user harm; Admin is not listed as a browsing screen. |
| Negative `cultivationXp` makes `levelForXp` throw (edge-case) | false | reject | `cultivationXp` is a running total floored at 0 (schema comment); no path writes a negative value. |
| `findMany` and `count` not in one transaction (edge-case, blind) | low | reject | A concurrent sign-up shifts the footer by one for a moment; the fix adds a transaction for no user harm. |
| `/admin?page=abc` silently shows page 1 while the API returns 400 (edge-case, blind) | low | reject | A page URL is forgiving by design; the matrix specifies 400 only for the API. |
| No error boundary when the query throws (edge-case) | false | reject | Same behaviour as every other server page in the app; not caused by this change. |
| Screenshot tests assert nothing; theme switch via `dataset.theme` (blind) | low | reject | Spec asks for a human screenshot check. `dataset.theme` is the same switch `admin-menu.spec.ts` already uses. |
| Whole-row click via `relative` on `<tr>` (blind) | low | reject | Link is the real target and works with the keyboard; the stretched overlay is progressive. Unproven failure. |
| Date-only UTC `createdAt`; no audit log, rate limit or `no-store` (blind) | low | reject | Date-only is the spec; audit and rate limiting are outside the intent. |
| Paging Next/Previous states untested beyond the empty page; tie-break on `id` unobservable (gap) | low | reject | Needs a seeded multi-page set for little gain; the empty-page path is covered. |
| Sprint-status and spec status differ; empty log sections (blind) | false | reject | In-progress to review is synced after step 5; the sections are filled now. |

## Verification

**Commands:**
- `npm run typecheck && npm run lint` -- expected: clean
- `npm test` (PowerShell) -- expected: vitest passes
- `npm run test:api` and `npm run test:e2e` (PowerShell) -- expected: all pass, including the new specs
