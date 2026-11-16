---
title: 'Story 7.3: Read-only User View'
type: 'feature'
created: '2026-11-16'
status: 'done'
baseline_commit: '3968fd895aa584ec33e777adb678a6a8c20380c3'
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

**Problem:** An admin can list users (7.2) and download a backup (5.2) but cannot look inside an account to help or check it. Each row of the Admin table already links to `/admin/users/{id}`, which 404s.

**Approach:** Build that page as a server component. It calls `buildBackupExport(id)` directly and renders the payload read-only: a "Read-only. You are viewing {email}'s data." banner, the Class → Folder → Flashcard → Card tree with both Scheduling Records per Card, and the cultivation section. It carries the existing Export download link. UI conforms to DESIGN.md tokens and the Design DNA design_style, passes the anti-generic UI rules, and is checked against a screenshot in both dark and light themes.

## Boundaries & Constraints

**Always:** The page does `notFound()` for anonymous and non-admin visitors (as `/admin` does) and for an unknown or over-long id. Data comes only from `buildBackupExport` (AD-16, one code path with export); the page makes no query of its own and no HTTP call to its own API. Realm label comes from `levelForXp(cultivation.xp)`. Grouping the flat payload into a tree is a pure function in `packages/domain` (no Prisma, AD-1). The Unsorted Folder is labelled "Unsorted". The banner is `{colors.text}` on a tint token, never the accent. Dates are UTC and date-only or date-time as in `users-table.tsx`.

**Never:** No edit, delete, move, grade, claim, restore, disable, reset or delete control (Restore and 7.4–7.6 each add their own control to this page in their own story). No password, session, role or disabled flag. No new route, no migration, no new dependency, no write of any kind. No hard-coded hex or arbitrary shadow. Do not change `buildBackupExport` or the export route.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Admin opens a user | user with Classes, Cards, both records, XP events | Banner with email; tree shows every Class, Folder, Flashcard, Card; each Card shows both directions' interval, repetitions, ease, next review, first graded; cultivation shows realm label, XP, settled-through, events | N/A |
| Empty account | no Classes, XP 0 | Banner, "No Classes yet." and XP 0; no crash | N/A |
| Never graded | record with `firstGradedAt = null` | shown as "Not graded yet" | N/A |
| Admin views self | own id | works; same read-only view | N/A |
| Disabled user | `disabled = true` | page works | N/A |
| Unknown id | id not in DB | 404 page | `notFound()` |
| Normal user / anonymous | non-admin session or none | 404 page, no data | `notFound()` |
| Isolation | two users with data | only the target's rows | N/A |

</frozen-after-approval>

## Code Map

- `apps/web/lib/backup-export.ts` -- `buildBackupExport(userId)` returns `BackupExport | null`; reuse unchanged.
- `packages/domain/src/backup.ts` -- `BackupExport` type; add the tree helper beside it and export via `packages/domain/src/index.ts`.
- `packages/domain/src/cultivation.ts` -- `levelForXp(xp)` returns `RealmSummary` with `label`; `QUEST_KINDS` names.
- `apps/web/app/(shell)/admin/page.tsx` -- admin guard pattern (`getServerSession`, `isAdminRole`, `notFound`).
- `apps/web/app/(shell)/admin/users-table.tsx` -- row link target, export href (`/api/admin/users/{id}/export`), pill and date styles to mirror.
- `apps/web/app/(shell)/page-header.tsx` and `realm-badge.tsx` (`xpText`) -- header and XP text.
- `apps/web/app/(shell)/cultivation/realm-ladder.tsx` -- prior use of `tint-*` tokens.
- `apps/web/app/globals.css` -- tokens: `bg-tint-sky`, `border-tint-sky-border`, `text-foreground*`, `bg-row-hover`, `text-overline|caption|body-sm`, `font-mono`.
- `tests/e2e/admin-users.spec.ts`, `tests/api/admin-export.spec.ts` -- registration/login, admin email, `seedUser` and prisma cleanup templates; `tests/domain/backup.test.ts` -- unit pattern.

## Tasks & Acceptance

**Execution:**
- [x] `packages/domain/src/backup-tree.ts` + `index.ts` -- `buildBackupTree(payload)` groups folders under classes, flashcards under folders, cards under flashcards, keeping payload order -- pure, testable
- [x] `apps/web/app/(shell)/admin/users/[id]/page.tsx` -- guarded server page: validate id, build payload, `notFound()` on null, render header, banner, tree, cultivation, Export link, back link to Admin
- [x] `apps/web/app/(shell)/admin/users/[id]/read-only-banner.tsx`, `backup-tree-view.tsx`, `cultivation-summary.tsx` -- presentational pieces; native `<details>` for Class, Folder and Flashcard (collapsed by default) so a large account stays scannable and keyboard-accessible; mobile-safe at 390px with no page-level horizontal scroll
- [x] `tests/domain/backup-tree.test.ts` -- grouping, order, empty payload, Unsorted folder
- [x] `tests/e2e/admin-user-view.spec.ts` -- admin opens a seeded user from the table, sees banner text, tree, both records, cultivation, Export download; no button other than Export and summary toggles; normal user and unknown id get 404; 390px no overflow; screenshots in both themes
- [ ] Run typecheck, lint, vitest, api and e2e suites

**Acceptance Criteria:**
- Given I open a user's page as an admin, then it shows that user's `backupExportSchema` payload built by `buildBackupExport`: the Class → Folder → Flashcard → Card tree, Scheduling Records and cultivation.
- Given the page, then a banner states "Read-only. You are viewing {email}'s data." and there is no control to edit a Card, grade or claim a quest.
- Given the page, then it offers Export; Restore and the 7.4–7.6 actions are added by those stories.
- Given a non-admin or anonymous visitor, then the page is a 404 and no user data is read.
- Given UI changes, then they conform to DESIGN.md tokens and the Design DNA design_style, pass the anti-generic UI rules, and were checked against a screenshot in both dark and light themes.

## Implementation Notes

- Anonymous visitors never reach the page: `apps/web/proxy.ts` redirects cookie-less requests to `/login` (app-wide gate, spec-1-5), so the matrix's "none" case is a redirect with no data, not a 404. The page's own `notFound()` still covers a signed-in non-admin.
- `.working/design-dna-profile.json` named in `context:` does not exist; the copy lives under `history/focus-indigo/working/`. The implementer relied on DESIGN.md and existing screens.
- Added `apps/web/app/(shell)/admin/users/[id]/format.ts` (shared date and number formatters) beyond the listed files.

## Spec Change Log

## Review Triage Log

| Finding | Verdict | Route | Evidence |
|---|---|---|---|
| Realm label, XP, settled-through, event order and penalty sign unasserted (gap) | medium | patch | Removing `.reverse()` or swapping labels kept e2e green. Seeded a PENALTY event and asserted realm, XP, date, order, "Missed day", "-20 XP". |
| Interval, next-review, first-graded, counts and header only partly asserted (gap) | low | patch | Folded into the same e2e: "6 d", dates, "UTC" suffix, "1 Folder", "1 Card", timezone line. |
| Empty-account test never asserts XP 0 or realm (claim) | low | patch | Added "Not settled yet", `levelForXp(0).label` and XP assertions. |
| Heading outline skips h3 (h2 -> h4 -> h5) (blind) | low | patch | Real a11y outline gap; renamed card term to h3 and record title to h4. |
| Banner comment says "fixed strip at the top" but it sits below the title (blind, claim, design) | low | patch | EXPERIENCE.md places it at the top; moved it above the Back link and fixed the comment. Sticky positioning not added: the spec asks for a banner, not a pinned one. |
| First graded time shown without a zone (blind) | low | patch | Appended " UTC" to the date-time value. |
| Isolation test seeds users before its `try`, leaking rows on failure (blind, edge) | low | patch | Moved both seeds inside the `try` and cleaned up by collected ids. |
| Off-scale `py-2.5` and `mt-0.5` (design) | low | patch | Direct swap to `py-3` and `mt-1`. |
| Summary rows have no hover cue (design) | low | patch | Added `transition-state hover:bg-row-hover`. |
| Events list lacks `shadow-low` unlike the stats card (design) | low | patch | One-token consistency fix. |
| Unbounded payload, no pagination (blind, edge) | low | reject | Spec Design Notes accept it; the 5.2 triage accepted the same per-user size assumption. |
| No audit log for viewing (blind) | low | reject | Not in the intent; adds a logging surface. |
| No page title, loading or error boundary (blind) | low | reject | Same behaviour as every other server page; unproven harm. |
| `xpEvents` order assumed ascending (blind, edge) | low | reject | `buildBackupExport` orders by createdAt then id; the new e2e now pins the order. |
| Unmapped enum values render "undefined" (blind, edge) | false | reject | The label maps are exhaustive `Record` types over Prisma enums; a new value fails typecheck. |
| Invalid dates throw RangeError (edge) | false | reject | Values come from `toISOString()` of DB dates, validated by the 5.2 schema. |
| Negative XP breaks `levelForXp` (edge) | false | reject | `cultivationXp` is floored at 0; same refusal as the 7.2 triage. |
| `tintFor` has no fallback for an unknown colour (edge) | false | reject | `color` is a closed enum in the schema. |
| Disabled or demoted admin with a live session still views data (edge, blind) | false | reject | Same guard as `/admin` and `requireAdmin`; session role handling is Story 7.1 behaviour, not this change. |
| Malformed id (for example `%00`) may 500 instead of 404 (edge) | low | reject | Admin-only and unlikely; the fix adds a guard for no user harm. |
| Orphan rows silently dropped by `buildBackupTree` (blind, edge) | low | reject | Foreign keys with cascade prevent orphans; no reachable path. |
| Page omits disabled flag, role, created date (blind) | low | reject | The frozen intent says Never expose role or disabled flag. |
| UTC dates unlabelled versus the user's timezone (blind) | low | reject | Date-only values match the 7.2 table; only the time got a suffix. |
| "Back to Admin" resets the list page (blind) | low | reject | Carrying page state needs a new param for little gain. |
| Fragile e2e selectors, shared admin account race, screenshots unasserted (blind, edge) | low | reject | Same patterns as the existing admin specs; all passed. |
| Missing tests for view helpers, non-admin export link, demoted admin (blind) | low | reject | Export auth is covered by the 5.2 API spec; helpers are trivial. |
| `cursor-pointer` set per component (design) | low | reject | Rejected in 7.2; the global rule belongs to Story 5.5. |
| Four nested bordered boxes, `bg-background` inside `bg-card`, `rounded-md` containers (design) | low | reject | Subjective; the screenshots read clearly and the fix is a redesign, not a correction. |
| Tint on a non-tile, Class name at 600 not 700, italic example text (design) | low | reject | Not a tint tile; no italic rule exists; no user harm. |
| `font-mono` on dates, no Realm badge, `tint-sky` banner (design) | low | reject | Spec asks for a tint banner and the realm as text; 7.2 rejected the badge. |

## Design Notes

Whole payload renders server-side; collapsed `<details>` keep it scannable but cards stay in the DOM. Per-user study data is a few MB at most (same assumption the 5.2 triage accepted), so no pagination.

## Verification

**Commands:**
- `npm run typecheck && npm run lint` -- expected: clean
- `npm test` (PowerShell) -- expected: vitest passes, including `backup-tree.test.ts`
- `npm run test:api` and `npm run test:e2e` (PowerShell) -- expected: all pass, including `admin-user-view.spec.ts`
