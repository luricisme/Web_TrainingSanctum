---
title: 'Story 12.4: Member Experience'
type: 'feature'
created: '2026-11-17'
status: 'done'
route: 'dispatch'
baseline_commit: '993cc8d2ee39a81cdfa48d0bc363056ab3e080a6'
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

**Problem:** A Member who accepted an invitation cannot see the Class in their grid, cannot leave it, sees owner-only controls on its pages, and Cultivation ignores their shared cards.

**Approach:** List Shared Classes in the grid ("{Owner}'s", Owner's colour, Leave only), render Class/Folder/Flashcard pages read-only for Members, add `POST /api/classes/[id]/members/leave`, count shared cards in stats and quests, and add the member-count line (UX-DR34) to the Owner's delete and move confirmations.

## Boundaries & Constraints

**Always:** No migration. Authority stays with the existing guards: `requireClassAccess` for reads and study, `requireClassOwner` for writes (a Member's write attempt stays 403; hiding UI is not the protection). Write controls are not rendered for a Member (no disabled ghosts). `ClassSummary` gains `ownerName` and `isOwner`; `ClassFoldersResponse` and the folder and flashcard GET payloads gain `isOwner`, `ownerName` and `memberCount` (from `guard.access`, no extra query). `GET /api/classes` lists `OR [owned, member]`, counts folders by `classId` (not `Folder.userId`), `memberCount` excludes the Owner. Leave = one `$transaction` deleting that user's `ClassMember` and their `SchedulingRecord`s for the Class's Cards, logged via `logOperation`; Owner calling it gets 403, stranger 404. Confirm: "Leave {Class}? Your progress in it will be deleted." Cultivation: `app/api/stats/route.ts` `card.count` and the two `flashcard` queries in `lib/cultivation-day.ts` drop the owner-side `userId` and rely on `learnedCardWhere/unlearnedCardWhere(userId, dirs)`; unscoped `app/api/review/unlearned/route.ts` stops forcing `{ userId }` on Cards. Delete confirmations for Class, Folder, Flashcard, Card and the cross-Class Flashcard move modal show "{N} members are studying this." (move: "…will lose it.") only when N > 0. UI uses DESIGN.md tokens only, checked in dark and light.

**Never:** No change to SM-2, XP rules, invitations, export/restore/admin (12.5). A Member's grading never touches another learner's records. No new dependency, no email.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Grid | Member of 1 Class, owns 1 | Both tiles; shared tile shows "{Owner}'s", Owner's tint, menu = Leave only | N/A |
| Browse | Member opens Class/Folder/Flashcard | No create/edit/move/rename/recolour/share/import/delete controls; header "{Owner}'s class"; counts are theirs; Review and Learn present | Write API call → `403` |
| Study | Owner and Member grade the same Card | Only the caller's records change | N/A |
| New Card | Owner adds a Card | Member's Learn count rises by 1 | N/A |
| Cultivation | Member learns a shared Flashcard / clears Review | Quests and stats count it | N/A |
| Leave | Member confirms | Membership and own records gone; tile gone; Owner's records unchanged | Owner `403`, stranger `404`, repeat `404` |
| Member count | Owner deletes a Class with 2 Members | Confirm carries "2 members are studying this." | N=0: no line |

</frozen-after-approval>

## Code Map

- `packages/domain/src/classes.ts` (~L83 `ClassSummary`) -- add `ownerName`, `isOwner`; update fixtures/tests.
- `apps/web/app/api/classes/route.ts` (GET ~L12-60, POST returns summary), `app/api/classes/[id]/route.ts` (PATCH rebuilds the summary inline) -- OR-query, counts by `classId`, new fields.
- `apps/web/lib/class-access.ts` -- `requireClassAccess` returns `access` (role, members, `cls`); owner name needs a `User.name` lookup by `cls.userId`. Reuse `requireClassOwner`, `reseedCardRecords` untouched.
- `app/api/classes/[id]/members/leave/route.ts` (new; static segment beside `[userId]/route.ts`, which stays) -- Leave.
- `app/api/classes/[id]/folders/route.ts`, `app/api/folders/[id]/route.ts`, `app/api/flashcards/[id]/route.ts` (GET) -- add `isOwner`, `ownerName`, `memberCount`.
- `app/api/stats/route.ts` (~L38-39), `lib/cultivation-day.ts` (~L71, ~L97), `app/api/review/unlearned/route.ts` (~L32) -- drop owner `userId`. Already correct, do not touch: grade route, review queue, `lib/learn-queue.ts`, `packages/domain/src/learned.ts`, `cultivation-settle.ts`.
- `app/(shell)/classes/`: `class-row.tsx` (caption ~L48, `RowMenu` ~L57), `classes-view.tsx` (dialog union gets `leave`), new `leave-class-modal.tsx` (pattern `delete-class-modal.tsx`), `delete-class-modal.tsx`.
- `app/(shell)/classes/[id]/class-detail-view.tsx` (+ New folder ~L125, folder menu, `delete-folder-modal.tsx`), `app/(shell)/folders/[id]/folder-detail-view.tsx` (+ `delete-flashcard-modal.tsx`, `move-flashcard-modal.tsx`), `app/(shell)/flashcards/[id]/flashcard-detail-view.tsx` (`add-cards-panel.tsx`, `edit-card-modal.tsx`, `delete-card-modal.tsx`). Keep `card-viewer.tsx` and `learn/`.
- Tests: `tests/api/class-access.spec.ts` (two-user `setup()`), `tests/api/invitations.spec.ts`, `tests/e2e/invitations.spec.ts` (`second(browser, name)`), `tests/api/stats.spec.ts`, `cultivation.spec.ts`, `review-learn.spec.ts`.

## Tasks & Acceptance

**Execution:**
- [x] `classes.ts` + `GET|POST /api/classes`, `PATCH /api/classes/[id]` -- shared listing and new summary fields
- [x] folders / folder / flashcard GET routes -- add `isOwner`, `ownerName`, `memberCount`
- [x] `members/leave/route.ts` -- transactional Leave with guards and logging
- [x] `stats`, `cultivation-day`, `review/unlearned` -- count shared cards per viewer
- [x] `class-row.tsx`, `classes-view.tsx`, `leave-class-modal.tsx` -- Shared tile, Leave-only menu, confirm
- [x] Class, Folder, Flashcard detail views -- read-only mode for Members, "{Owner}'s class" header
- [x] delete-class/folder/flashcard/card and move modals -- member-count line when N > 0
- [x] API tests (two learners grading, Leave, 403s, stats/quests) and e2e (owner→member grid, read-only pages, Leave, new Card in Learn count)
- [x] typecheck, lint, vitest, api, e2e (PowerShell, test DB vars)

**Acceptance Criteria:**
- Given any single-learner scenario, then the existing unit, API and e2e suites pass unchanged.
- Given the UI, then it conforms to DESIGN.md tokens and the Design DNA design_style, passes the anti-generic UI rules, and was checked against a screenshot in both dark and light themes.

## Implementation Notes

- No migration. `loadClassAccess` now returns `ownerName` via a relation include (no extra query). `membersStudying` / `membersWillLose` helpers in `classes/ui.ts` use singular for N = 1 (spec gives plural only).
- Beyond the spec: the move-Flashcard Class picker and the delete-Class "move folders to" picker list owned Classes only; the move line shows only when the picked Class differs. The "{Owner}'s class" caption sits right-aligned in the breadcrumb row.
- Added after the diff audit: API test for the Learn Flashcards quest (`lib/cultivation-day.ts` change was otherwise untested).
- Verification (implementer): typecheck, lint, vitest (329), API (251), e2e (208) pass; audit re-ran `member-experience.spec.ts` API (7 pass).
- Known: `design-dna-profile.json` named in `context:` is missing under `.working/` (copy in `history/focus-indigo/working/`); `mockups/key-screens.html` no longer exists. Screenshots compared with DESIGN.md only.

## Spec Change Log

## Review Triage Log

| Finding | Verdict | Evidence / route |
|---|---|---|
| Folder and Card delete member-count line untested | medium | Only Class, Flashcard and move were asserted. patch: e2e now opens Folder and Card delete (passes). |
| Move and Delete-class pickers filter `isOwner`, untested | low | One-line filters, no scenario in e2e with an Owner who is also a Member. Rejected: test needs a second invitation flow. |
| POST/PATCH `/api/classes` `isOwner`/`ownerName` unasserted | low | Hard-coded `isOwner: true`; client effect not shown. defer. |
| `ownCards` left in unlearned `newestCard` and add-card target | false | Intended: only an Owner can add Cards, so the target stays the caller's own; the comment says so. |
| Stats/quests rely on predicates without `userId` (cards of a left Class, no-record Cards) | false | `learnedCardWhere`/`unlearnedCardWhere` anchor every clause on `SchedulingRecord.userId` (`learned.ts`); Leave deletes the records; fan-out (AD-9) seeds records for new Cards. Quest path now has an API test. |
| Member-count line misleading in folder "move" mode | false | The modal shows both choices at once; the line is a heads-up before choosing, not tied to a mode. |
| Leave modal 404 leaves stale tile and error | low | Needs Owner removing the Member mid-dialog; fix adds a branch. Rejected. |
| Leave leaves other per-user data (XP, events) | false | XP and quest rows are earned history, not per-Class progress; spec says records only. |
| Leave inside transaction throws `HttpError`/race 404 | false | Throw rolls the transaction back and maps to 404, as specified for repeat calls. |
| "{Owner}'s class" header placement and wording | false | Epic AC: header shows "{Owner}'s class" beside the breadcrumb (UX-DR33). |
| Member-count line is `font-semibold` | low | Token-valid, consistent across five modals; cosmetic. Rejected. |
| Breadcrumb wrapper copy-pasted three times, `nav` not re-indented | low | Each view already has its own `Breadcrumb`; extraction is a refactor. Rejected. |
| No Leave on Class/Folder/Flashcard pages | false | Spec and UX-DR33 put Leave in the tile menu only. |
| `LeaveClassModal` invalidates every query | low | Only active queries refetch, user is on the grid. Rejected. |
| Screenshot tests assert nothing | low | Spec requires screenshots for comparison, not regression assertions. Rejected. |
| Member write attempts on other routes, partial-graded Leave, stats after Leave untested | false | Write guards are covered by `class-access.spec.ts` (12.2); Leave test asserts record counts. |
| Blank `ownerName`; move picker `Loading...` fallback; `deleting` modal without `isOwner` guard; existing fixtures not updated; residual owner controls | false | `User.name` is required; owner always in own list; Delete only reachable from owner-only buttons; typecheck passes with new required fields; the Flashcard page has no other write controls. |
| Move warning accuracy vs server records | false | Cross-Class move reseeding is Story 12.2's transaction, not changed here. |

## Verification

**Commands:**
- `npm run typecheck && npm run lint` -- expected: clean
- `npm test`, `npm run test:api -- --workers=1`, `npm run test:e2e` (PowerShell, test DB vars) -- expected: all pass
