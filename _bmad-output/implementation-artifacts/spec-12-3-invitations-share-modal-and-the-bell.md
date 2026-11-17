---
title: 'Story 12.3: Invitations, Share Modal and the Bell'
type: 'feature'
created: '2026-11-17'
status: 'done'
route: 'dispatch'
baseline_commit: '9cc8a645bc28121715f80449ebaabce33b080c34'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-12-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/DESIGN.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/EXPERIENCE.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/.working/design-dna-profile.json'
  - '{project-root}/.claude/skills/design-dna/references/generation-guide.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Members exist only via the database. An Owner cannot invite anyone, and nobody can accept, decline, cancel or be removed.

**Approach:** Add `ClassInvitation`, the invitation/membership API, a Share modal in an owned Class's "…" menu, and a bell (invitations only) in the app bar. Consent-based: email lookup of an existing account, no email is ever sent.

## Boundaries & Constraints

**Always:** One additive hand-written migration `class_invitations (id, classId, inviterId, inviteeId, status PENDING|ACCEPTED|DECLINED, createdAt, respondedAt?)`, FKs `ON DELETE CASCADE`, index `(inviteeId, status)`, raw-SQL partial unique `(classId, inviteeId) WHERE status = 'PENDING'` (precedent: `folders_classId_isUnsorted_key`; verify `prisma migrate` keeps it); applied to the local test DB only (Neon is deployed by the human with the code). Email lookup is trimmed and case-insensitive. Routes: `GET|POST /api/classes/[id]/invitations` (owner; list all statuses / invite), `DELETE /api/classes/[id]/invitations/[invId]` (owner cancel; Member 403, stranger 404), `DELETE /api/classes/[id]/members/[userId]` (owner remove), `GET /api/invitations` (caller's pending, with owner name, class name, card count), `POST /api/invitations/[id]/accept|decline` (invitee only, else 404; non-pending 409). Invite errors are field-level `email` errors via `validationFailure` shape: unknown account, own email, already a Member, already pending. Inviting a declined invitee reuses that row, set back to PENDING (clear `respondedAt`). Accept = one `$transaction`: re-check PENDING, insert `ClassMember`, create default records (2 per Card, batched, via `createDefaultSchedulingRecords`/`reseedCardRecords` pattern, invitee's timezone), mark ACCEPTED. Remove = one `$transaction`: delete the membership and that user's records for the Class's Cards. Both log through `logOperation`. Cancel deletes the row. UI: Share modal (UX-DR31) built on `Modal`, confirm for Remove "Remove {email}? Their progress in {Class} will be deleted."; bell (UX-DR32) in `AppBar` before the Realm badge, hidden in focus mode (AppBar already is), mono count chip when > 0, anchored popover "{Owner} invited you to {Class} ({N} cards)", Accept (primary) / Decline (quiet), empty "No invitations.", keys Enter/Space open, arrows move, Enter accepts, Delete declines, Esc closes; below 640px the bell sits top-right of the content panel. Uses DESIGN.md tokens only; verified in dark and light.

**Decision (human):** Accept creates the membership and records only; the bell's Accept navigates to `/classes/[id]`. `GET /api/classes` and the Classes grid stay owner-only until 12.4, so the Class shows in the grid after 12.4.

**Never:** No email sending, no general notification feed. No Leave, "{Owner}'s" tile, read-only pages or shared Classes in Review/Learn/quests (12.4). No export/restore/admin change (12.5). No SM-2/XP change. No dependency.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Invite | Owner posts registered email | `201`, PENDING row, appears in modal at once | N/A |
| Invite bad email | unknown / own / Member / pending | nothing created | `400` `fields.email` |
| Re-invite | declined invitee | same row back to PENDING | N/A |
| Accept | invitee, Class with 3 Cards | Member + 6 records, ACCEPTED, bell count drops | N/A |
| Accept foreign | non-invitee | nothing changes | `404` |
| Accept twice | already ACCEPTED/DECLINED | nothing changes | `409` |
| Decline | invitee | DECLINED, owner sees it muted | N/A |
| Cancel | Member calls / stranger | nothing changes | `403` / `404` |
| Remove | owner removes Member | membership and their records gone | Member caller `403` |

</frozen-after-approval>

## Code Map

- `packages/db/schema.prisma` (Class ~131, ClassMember ~149) -- add `ClassInvitation`, `InvitationStatus`, relations; migration `20261117020000_add_class_invitations` (partial unique as raw SQL, comment in schema like ~L125).
- `packages/domain/src/invitations.ts` (new), `index.ts` -- zod `inviteSchema`, `InvitationSummary` / `ShareState` types, email normaliser; tests in `tests/domain/invitations.test.ts`.
- `apps/web/lib/class-access.ts` -- `requireClassOwner`, `reseedCardRecords` pattern to reuse; `lib/api-response.ts` (`fail`, `validationFailure`, `HttpError`), `lib/session.ts`, `lib/log.ts`.
- `apps/web/app/api/classes/[id]/invitations/route.ts`, `.../invitations/[invId]/route.ts`, `.../members/[userId]/route.ts`, `api/invitations/route.ts`, `api/invitations/[id]/accept|decline/route.ts` (new).
- `apps/web/app/(shell)/app-bar.tsx` (right cell before `RealmBadge`), new `invitations-bell.tsx`; `layout.tsx` for the sub-640px placement; `focus-mode.tsx` untouched.
- `apps/web/app/(shell)/classes/`: `classes-view.tsx` (dialog union gets `share`), `class-row.tsx` (menu item), new `share-class-modal.tsx`; reuse `modal.tsx`, `row-menu.tsx`, `ui.ts`, `delete-class-modal.tsx` confirm pattern, `lib/api-client.ts`, TanStack keys `["classes"]`, new `["invitations"]`, `["share", classId]`.
- Tests: `tests/api/invitations.spec.ts` (pattern `tests/api/class-access.spec.ts`), `tests/e2e/invitations.spec.ts` (pattern `tests/e2e/classes.spec.ts`).
- Do not touch: backup/export, `api/admin/**`, review/learn routes.

## Tasks & Acceptance

**Execution:**
- [x] `schema.prisma` + migration -- `ClassInvitation` with partial unique; regenerate client; apply to test DB; assert the index survives a fresh `migrate deploy`
- [x] `packages/domain/src/invitations.ts` + unit tests -- schema, normalisation, invite-error classification
- [ ] invitation, member and `api/invitations` routes -- per the Always block, in transactions, with logging
- [x] `invitations-bell.tsx`, `app-bar.tsx`, `layout.tsx` -- bell, count chip, popover, keyboard, Accept navigation, mobile placement
- [x] `share-class-modal.tsx`, `classes-view.tsx`, `class-row.tsx` -- Share item, three lists, field errors, Remove confirm
- [x] `tests/api/invitations.spec.ts`, `tests/e2e/invitations.spec.ts` -- the I/O matrix, one-pending uniqueness at DB level, accept seeds 2 records per Card, remove drops them, bell hidden in focus mode, full flow owner→invitee
- [x] run typecheck, lint, vitest, api, e2e (PowerShell, test DB vars)

**Acceptance Criteria:**
- Given the migration, then `class_invitations` exists with the partial unique index and row counts of other tables are unchanged.
- Given any single-learner scenario, then the existing unit, API and e2e suites pass unchanged.
- Given the UI, then it conforms to DESIGN.md tokens and the Design DNA design_style, passes the anti-generic UI rules, and was checked against a screenshot in both dark and light themes.

## Implementation Notes

- Migration `20261117020000_add_class_invitations` applied to the local test DB only; Neon needs `npm run db:migrate:deploy` together with the code, otherwise every page 500s.
- Beyond the spec: Cancel on an ACCEPTED invitation returns 409; re-inviting reuses the latest row for any status (declined, or accepted then removed). Share sits last in the "..." menu (an existing keyboard test expects Rename, Colour, Delete order). Remove confirm swaps inside the Share dialog. The mobile bell sits in a wrapper around `<main>` (inside it broke the admin view test).
- Known: the Classes grid stays owner-only until 12.4, so a Member reaches the Class through the bell's Accept (decision). Fan-out vs accept racing on the same instant is not locked (rejected as low).
- Verification: typecheck, lint, vitest (329), API (245, `--workers=1`) and e2e (205) pass.

## Spec Change Log

## Review Triage Log

| Finding | Verdict | Evidence / route |
|---|---|---|
| Cancel of an ACCEPTED invitation (409) untested | medium | Guard exists in `invitations/[invId]/route.ts`; no test removes it. patch: add test. |
| Re-invite after Remove (ACCEPTED row reused) and second accept untested | medium | Reuse path in `invitations/route.ts` has only a DECLINED test. patch: add test. |
| Bell keys (ArrowDown/Up, Delete declines) not asserted | medium | Spec lists the keys; e2e only clicks Decline. patch: add e2e step. |
| Arrow keys use `rows.indexOf(activeElement)`, -1 when focus is on a row button | low | `invitations-bell.tsx` L113: focus on Accept/Decline jumps to first/last row. patch: use `row.contains`. |
| Accept pushes `/classes/${classId}` with `classId` typed optional | low | `invitations-bell.tsx` L84; route always returns it, but the type allows `/classes/undefined`. patch: guard. |
| Bell rows drop the focus ring (`focus-visible:outline-none`) | medium | Contradicts shared `focus-ring` and DESIGN.md focus rule. patch: use `focus-ring`. |
| App-bar count chip uses `bg-on-frame text-frame`, DESIGN.md says on-frame text on frame-raised | low | Measured 7.7:1 pair is frame-raised. patch: swap colours. |
| List-row Remove not danger-styled | low | DESIGN.md: Share modal has a danger-styled Remove. patch: danger text on the row button. |
| `GET /api/invitations` counts cards per invitation (N+1) | low | One `card.count` per row, polled every 60 s; fix is a direct groupBy. patch. |
| Accept transaction has default 5 s timeout, one createMany of 2 records per Card | medium | Large Classes could time out and return 500, invitation stays pending. patch: set explicit `timeout`. |
| Stray blank lines in `packages/domain/src/invitations.ts` | low | Cosmetic, direct deletion. patch. |
| Spec last task checkbox unticked | low | Ticked after full verification, below. patch. |
| Accept goes to a page a Member cannot open | false | `/classes/[id]` page fetches through guarded GET routes; Members have read access (12.2). |
| "Accept" accent on several invitations | false | UX-DR32 and the spec require Accept as primary. |
| `!px-4 !py-2` overrides on `buttonPrimary` | low | Cosmetic; rejected, fix adds a new variant. |
| Popover width arbitrary value, chip size, `text-overline` | low | No popover token exists; rejected. |
| Email probing via field errors, no rate limit | false | Field-level errors for unknown accounts are specified in the frozen block. |
| Declined row cannot be cleared in the UI | false | Spec: declined rows show Invite again only. |
| Fresh `migrate deploy` keeps the partial index (claim unmet) | false | `migrate diff` showed no drift and the API spec asserts the index in `pg_indexes`. |
| Fan-out vs accept race misses a Card's records | low | Needs the Owner adding Cards in the same instant as Accept; fix needs row locks. Rejected. |
| Reuse update without status guard; case-differing duplicate emails; cancel 409 when row vanished | low | Narrow races or data states not shown reachable; fixes add guards. Rejected. |
| Popover stays open on Tab away; role=dialog without focus trap; Invite-again error placement; remove-confirm remount | low | Cosmetic or minor; rejected. |
| Bell may overlap page header below 640px | low | Maybe-false, reviewer could not verify; `pt-10` header reserved. Rejected. |
| Share item after danger Delete | low | Existing keyboard test expects Rename, Colour, Delete order; rejected. |
| Bell mounted twice polls twice | false | Both share TanStack key `["invitations"]`; requests are deduped. |
| No CHECK on inviter != invitee; createdAt overwritten on re-invite; Member not notified; Remove keeps other data | false | App-level guard is specified; notifications are out of scope; records are the only per-Class learner data. |

## Verification

**Commands:**
- `npm run db:generate && npm run db:migrate:deploy` (test DB, PowerShell) -- expected: migration applies
- `npm run typecheck && npm run lint` -- expected: clean
- `npm test`, `npm run test:api`, `npm run test:e2e` (PowerShell, test DB vars) -- expected: all pass
