# Epic 12 Context: Shared Classes

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

An Owner invites registered users into a Class by email; the invitee accepts from a bell; from then on the Member studies the Class with their own spaced-repetition schedule while the Owner alone edits it. This reverses the earlier one-learner-per-Card model, so every Scheduling Record becomes per learner. Built before Epic 8.

## Stories

- Story 12.1: Scheduling Records per Learner
- Story 12.2: Class Membership and Access Guards
- Story 12.3: Invitations, Share Modal and the Bell
- Story 12.4: Member Experience
- Story 12.5: Export, Restore and Admin with Sharing

## Requirements & Constraints

- A Card has exactly two Scheduling Records (one per Recall Direction) per learner of its Class: the Owner plus every Member.
- Only the Owner edits a Class, its Folders, Flashcards and Cards; a Member reads and studies. A Member's grading never changes anyone else's records.
- Membership is consent-based: invitation by email to an existing account, accepted from a bell; no email is ever sent.
- Existing single-learner behaviour must stay unchanged; the whole existing unit, API and e2e suite must keep passing.
- Leaving or removal deletes that learner's progress in the Class; deleting a Class or user removes every learner's records.

## Technical Decisions

- AD-19: `SchedulingRecord.userId` required, unique `(userId, cardId, direction)`, index `(userId, nextReviewDate)`. The migration adds the column, backfills `userId = Card.userId`, then swaps the unique index. It is the one non-trivial migration: dry-run on a Neon branch with before/after row counts, and deploy to Neon together with the code (otherwise every page 500s).
- `Card.userId` stays the Owner's and is the authority for ownership checks on a Card.
- AD-9: one shared `createCardWithSchedulingRecords(cardFields, learnerIds)` in `packages/domain`, returning a Card plus two default records per learner (ease 2.5, repetitions 0, next review start of today, `first_graded_at` null). All creation paths use it.
- AD-14: learned/unlearned predicates are pure Prisma-`where` builders in `packages/domain`; they take `userId` and filter on `SchedulingRecord.userId`. Every record query filters by the caller.
- AD-11: membership transitions (accept, leave, remove, card creation fan-out, cross-Class move) are single `$transaction`s.
- Guards: `requireClassOwner` (writes: Member 403, stranger 404) and `requireClassAccess` (reads and study); pure `classAccess` / `classLearnerIds` in `packages/domain/access.ts`.
- Responses use the standard `{ data }` envelope and error envelope (AD-10); membership-affecting writes log a structured line.
- `ClassInvitation` has a partial unique `(classId, inviteeId) WHERE status = 'PENDING'`; verify `prisma migrate` keeps it.
- Export/restore use the single `backupExportSchema` (AD-10); a Member's records in Shared Classes are not exported.

## UX & Interaction Patterns

- Share modal in an owned Class's "…" menu (members with Remove, pending with Cancel, declined muted with Invite again, email field); bell with pending-invitation count, hidden in focus mode; Shared Class tile shows "{Owner}'s" in the Owner's colour, with only **Leave** in its menu; read-only pages for Members. UI follows DESIGN.md tokens in both themes.

## Cross-Story Dependencies

- Order: 12.1 → 12.2 → 12.3 → 12.4 → 12.5, then Epic 8. 12.1 passes `[ownerId]` as learners everywhere until 12.2 adds membership.
- 12.5 touches Stories 5.2, 5.3, 7.3 and 7.6 (export schema, restore, admin view, user delete).
