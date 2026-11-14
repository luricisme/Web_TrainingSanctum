---
title: 'Story 5.2: Data Export/Backup (admin-only)'
type: 'feature'
created: '2026-11-14'
status: 'done'
baseline_commit: '26fe681fefe41a4e4a803fd363f170130e176f71'
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

**Problem:** No one can take a copy of a user's study data. A lost database or a bad import would destroy months of Cards, scheduling state and cultivation history. Story 5.3 (restore) and Story 7.3 (read-only user view) both need one agreed shape for that data.

**Approach:** Add one function that builds a user's full backup payload, one shared Zod `backupExportSchema` in `packages/domain`, and an admin-only `GET /api/admin/users/[id]/export` that streams the payload as a JSON file download. Export is on demand only. Decision: until Story 7.3 builds the user page, each row of the Admin users table gets a plain "Export" download link (`<a href="/api/admin/users/{id}/export" download>`, no client JS); Story 7.3 moves it to the user page. The link follows DESIGN.md tokens, is keyboard reachable, and works at 390px.

## Boundaries & Constraints

**Always:** The route calls `requireAdmin()` first (AD-16). The payload is built by one function, `buildBackupExport(userId)`, in `apps/web/lib`, and its output is validated against `backupExportSchema` before it is sent. The file body is the bare payload (no `{ data }` envelope), so restore can read the same file. Errors use the standard error envelope (`fail`, `validationFailure`). Every query is scoped by the target `userId`. The payload carries: `version`, `exportedAt`, a `user` block (`id`, `email`, `studyDirections`, `timezone`), every Class (with `color`), Folder (with `isUnsorted`), Flashcard, Card (with its `flashcardId`), both Scheduling Records per Card (SM-2 fields and `firstGradedAt` verbatim), and a `cultivation` block (`xp`, `settledThrough`, `days` with their `quests` JSON verbatim, `xpEvents`). Ids and timestamps are exported as stored (ISO strings; `localDay` and `settledThrough` as `YYYY-MM-DD`). The route logs one structured line naming the admin and the target user. Response is `Content-Type: application/json` with `Content-Disposition: attachment` and `Cache-Control: no-store`.

**Never:** No password, session, account or auth-provider data, no `role`, no `disabled` flag, no other user's rows. No scheduled or automatic export, no Settings export control, no restore (Story 5.3), no new migration. The domain package must not import Prisma (AD-1). No change to the grade route or to any write path.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Export, admin | user with Classes, Flashcards, Cards, 2 records per Card | 200 JSON file; parses with `backupExportSchema`; counts match the database | N/A |
| Verbatim fields | record with `firstGradedAt` set and one with `null` | both exported unchanged | N/A |
| Empty account | user with no data | 200; empty arrays, `cultivation.xp = 0` | N/A |
| Cultivation | XP, settled day, day snapshots, claim and penalty events | all present in order of creation | N/A |
| Isolation | two users with data | export holds only the target's rows | N/A |
| No cookie | anonymous request | 401 `UNAUTHENTICATED` | Envelope |
| Normal user | non-admin session | 403 `FORBIDDEN`, no data | Envelope |
| Unknown user | id that does not exist | 404 `NOT_FOUND` | Envelope |
| Disabled user | `disabled = true` | export still works | N/A |

</frozen-after-approval>

## Code Map

- `packages/db/schema.prisma` -- models `User`, `Class` (`color`), `Folder`, `Flashcard`, `Card`, `SchedulingRecord` (no `userId`; scope through `Card.userId`), `CultivationDay`, `XpEvent`. No migration needed.
- `apps/web/lib/session.ts` -- `requireAdmin(request)` returns `{ session }` or `{ response }`.
- `apps/web/lib/api-response.ts` -- `fail`, `validationFailure`; `ok` does not fit a file body.
- `apps/web/app/api/admin/users/route.ts` and `apps/web/app/api/admin/me/route.ts` -- admin route pattern; `apps/web/app/api/cards/[id]/route.ts` -- async `params` (`Promise<{ id: string }>`) in Next 16.
- `apps/web/lib/admin-users.ts` -- prior art for a shared query function.
- `apps/web/lib/cultivation-settle.ts:152` and `apps/web/app/api/review/grade/route.ts:17` -- structured log line convention (`console.info(JSON.stringify({ operation, ... }))`).
- `packages/domain/src/admin-users.ts` and `packages/domain/src/index.ts` -- one schema file per feature plus barrel export; Zod 4 style.
- `apps/web/app/(shell)/admin/users-table.tsx` -- row links to `/admin/users/{id}`; possible trigger home (see Open Questions).
- `tests/api/admin-guard.spec.ts`, `tests/api/admin-users.spec.ts` -- `adminSession()` helper and API test pattern; `tests/domain/admin-users.test.ts` -- schema unit test pattern.

## Tasks & Acceptance

**Execution:**
- [x] `packages/domain/src/backup.ts` + `index.ts` -- `backupExportSchema` and `BackupExport` type -- one shared shape for export, restore and 7.3
- [x] `apps/web/lib/backup-export.ts` -- `buildBackupExport(userId)`: read the user's rows, shape them, return `null` for an unknown user -- single payload builder
- [x] `apps/web/app/api/admin/users/[id]/export/route.ts` -- guarded GET: validate `id`, build, validate against the schema, return the file with download headers, log one line -- AC route
- [x] `apps/web/app/(shell)/admin/users-table.tsx` -- per-row "Export" download link, keyboard reachable, mobile-safe -- admin trigger until 7.3
- [x] `tests/e2e/admin-users.spec.ts` -- admin sees the Export link on a row with the right href; normal user still gets 404
- [x] `tests/domain/backup.test.ts` -- accepts a full payload and an empty one, rejects missing sections and bad enums
- [x] `tests/api/admin-export.spec.ts` -- 401, 403, 404, headers, counts, verbatim `firstGradedAt`, isolation, cultivation section, no auth fields
- [x] Run typecheck, lint, vitest and API suites; if UI changed, e2e and screenshots in both themes

**Acceptance Criteria:**
- Given I am an admin, when I request `GET /api/admin/users/{id}/export`, then I receive a JSON file with every Class, Folder, Flashcard, Card, both Scheduling Records per Card, `studyDirections` and the cultivation section, and it validates against `backupExportSchema`.
- Given a non-admin or anonymous request, then it returns 403 or 401 in the error envelope and no data.
- Given export runs, then nothing is written and there is no scheduled export job.
- Given I am an admin on the Admin users table, when I select a row's Export link, then the browser downloads that user's backup file.
- Given the UI change, then it conforms to DESIGN.md tokens and the Design DNA design_style, passes the anti-generic UI rules, and was checked against a screenshot in both dark and light themes.

## Implementation Notes

## Spec Change Log

## Review Triage Log

| Finding | Verdict | Route | Evidence |
|---|---|---|---|
| Array `$transaction` runs at the default READ COMMITTED, so the "consistent snapshot" claim is false (blind, edge, claim) | medium | patch | Seven reads can straddle a grade or claim write; Postgres default isolation gives each statement a fresh snapshot. Add `isolationLevel: "RepeatableRead"`. |
| Verbatim test pins only some fields; swapping `term`/`definition`, dropping `repetitions` or `delta` still passes (gap) | medium | patch | Test reads `admin-export.spec.ts:465-525`: no assertion on card text, names, `repetitions`, `nextReviewDate`, `delta`, `questKind`; schema only checks types. |
| Export link click and download are untested; href-only assertion (gap) | medium | patch | Removing `relative z-10` keeps the e2e green while the stretched row link would swallow the click. Add a download-event check. |
| Isolation check only looks for the other user's id and card id (claim) | low | patch | Other user's Class, Folder, Flashcard, XpEvent ids are not checked. Folded into the verbatim-test patch. |
| Invalid-payload log omits the Zod issues (blind, edge) | low | patch | A persistent `EXPORT_INVALID` cannot be diagnosed. Add up to 5 issue paths and messages, no values. |
| Export pill is `h-9`, pager pills are `h-10` (design) | low | patch | Two pill heights on one screen; one-token correction to `h-10`. |
| `userId` unsanitised in `Content-Disposition` (blind, edge) | false | reject | The filename is built only after `buildBackupExport` found the user, so the id is a real DB id (cuid/uuid); an odd id returns 404 first. |
| No try/catch around `buildBackupExport` (edge) | low | reject | Same behaviour as every other route in the app; Next returns a 500. |
| `download` saves an error JSON on 401/403/500 (blind, edge) | low | reject | Needs a client fetch handler; the spec chose a plain link. Admin sessions are checked on page load. |
| Date outside year 0-9999 fails `z.iso.datetime` (edge) | false | reject | No path writes such a date. |
| `quests` null makes the schema reject (edge) | false | reject | `CultivationDay.quests` is a required Json column; `json` accepts a JSON null. |
| Whole backup in memory, pretty-printed, no cap (blind, edge) | low | reject | Per-user study data is a few MB; no scale was shown. Spec chose on-demand, simple. |
| Audit is only a log line (blind) | low | reject | The spec asks for one structured log line naming admin and target. |
| Schema is loose: offsets, ranges, referential integrity (blind) | low | reject | Tightening belongs to the restore story, which validates before writing. |
| Cleanup skipped if `seedUser` throws (edge) | low | reject | Test hygiene only; unlikely and the fix adds structure. |
| Task says "normal user still gets 404" but the diff has no such assertion (edge, claim) | false | reject | That assertion already exists in `admin-users.spec.ts` from story 7.2; this story adds only the link check. |
| Missing tests: 400 on a 65-char id, 500 `EXPORT_INVALID`, disabled admin, `exportedAt` (blind, gap) | low | reject | Defensive paths that are hard to reach; the gap layer itself suggested deferring. |
| `min-w-[46rem]` is arbitrary (design) | low | reject | Same exception accepted in 7.2 (`40rem`): a layout width, not a colour, shadow or radius token. |
| Backup column not in DESIGN.md `admin-table` (design) | low | reject | Temporary trigger until 7.3 moves it to the user page; fix would edit a planning doc. |
| Bordered pill on every row vs the Quiet variant (design) | low | reject | Spec decision is a plain secondary-style link; a judgement call, not a token violation. |
| Header "Backup" vs button "Export" (design) | low | reject | Header names the column, button names the action; no harm. |

## Design Notes

`buildBackupExport` returns plain data (no Prisma types, dates already serialized) so Story 7.3 can render the same object and Story 5.3 can parse a file with the same schema. Keep it one function: reads in a single `$transaction` so the file is a consistent snapshot.

## Verification

**Commands:**
- `npm run typecheck && npm run lint` -- expected: clean
- `npm test` (PowerShell) -- expected: vitest passes
- `npm run test:api` (PowerShell) -- expected: all pass, including `admin-export.spec.ts`
