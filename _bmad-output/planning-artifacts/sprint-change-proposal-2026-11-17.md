# Sprint Change Proposal — Shared Classes: invite, accept, study (new Epic 12, built before the Planner)

- **Date:** 2026-11-17
- **Project:** Web_TrainingSanctum
- **Requested by:** Luric (product owner)
- **Workflow:** bmad-correct-course (incremental mode)
- **Status:** Approved by Luric, proposal by proposal (6 of 6). Applied 2026-11-17.
- **Scope:** **Major.** It reverses the PRD non-goal "no sharing or collaboration", changes the ownership of the product's hottest table (`SchedulingRecord`), adds an authorization layer on every class-scoped route, and inserts an epic ahead of the one planned yesterday.

---

## 1. Issue Summary

The owner wants to add another registered user to one of their Classes so that person can study its flashcards. The PRD (§2.2, §5) and the architecture (Deferred) explicitly keep sharing out of scope, and the data model assumes the person who owns a Card is the only person who studies it: a `SchedulingRecord` hangs off a `Card` with no `userId`. Sharing therefore cannot be bolted on; the schedule has to become per learner first.

## 2. Decisions made with the product owner

1. **Members study only.** Viewer, Learn, Review. No create, edit, move, rename, recolour, share, import or delete — routes refuse with `403`, the UI does not render the controls.
2. **Invite by the email of an existing account.** No invite links, no email sent.
3. **Accept before joining.** The invitee sees a **bell** in the app bar (B1: right end before the Realm badge; top-right of the content panel below 640px) and accepts or declines. Records are created only on accept.
4. **The bell carries invitations only** — no general notification feed in v1.
5. **Invitations never expire;** after a decline the Owner can invite again; one pending invitation per user per Class.
6. **Shared Class in the Member's Classes grid**, labelled "{Owner}'s", in the Owner's colour; its due cards join the Member's daily Review and quests.
7. **Cascade on the Owner's deletes;** confirmations say "N members are studying this". A Member can **Leave**; leaving or being removed deletes their records in that Class.
8. **Export** covers owned Classes (with member emails) and the user's own records; shared memberships are listed by name only and not restored.
9. **Epic 12 is built before Epic 8** (Planner), because it changes `createCardWithSchedulingRecords`, the grade/queue/learn routes and `backupExportSchema`, which Story 9.4 then builds on.

## 3. Impact Analysis

### Epics
- **New:** Epic 12 Shared Classes — 12.1 Scheduling Records per Learner · 12.2 Class Membership and Access Guards · 12.3 Invitations, Share Modal and the Bell · 12.4 Member Experience · 12.5 Export, Restore and Admin with Sharing.
- **Built stories (not re-opened, amendment notes added):** 2.3, 3.1, 3.2 (card creation fans out to learners); 4.2, 4.3, 4.6, 4.8, 4.9 (records filtered by `userId`); 5.2, 5.3, 7.3, 7.6 (export scope, admin view, delete cascade). 5.5 audits the new surfaces.
- **Epics 8–11:** unchanged except that Story 9.4 builds on the schema Epic 12 leaves.

### Artifacts
- **PRD:** §2.2, glossary (Owner, Member, Learner, Invitation, Shared Class), FR-5, FR-9, FR-17, FR-19, FR-13/14, new §4.11 with FR-27 … FR-29, §5, §6, §8.1.
- **Architecture:** AD-4, AD-9, AD-14 reworded; new **AD-19** (class access, membership transitions, invitations, bell); AD-10, AD-16; conventions; seed; ERD; capability map; Deferred.
- **UX:** Share modal, bell + invitations panel, Shared Class tile, Leave confirm, member-count line in delete confirmations, read-only member pages; Flow 6.
- **Tracking:** sprint-status gains Epic 12 and the new build order.

### Technical
- **The one risky migration in the product:** add `SchedulingRecord.userId`, backfill from `Card.userId`, replace unique `(cardId, direction)` with `(userId, cardId, direction)`, add index `(userId, nextReviewDate)`; plus `ClassMember` and `ClassInvitation` (partial unique on `PENDING`). Dry-run on a Neon branch with row counts before deploying with the code.
- Two guards (`requireClassOwner`, `requireClassAccess`) on every class-scoped route (AD-19); no route writes its own check.
- Membership transitions (accept, leave, remove, card creation, cross-class flashcard move, owner deletes) are single transactions.
- No email, no notification table, no cron.

## 4. Recommended Approach

**Direct Adjustment** with a new epic inserted before Epic 8. Rollback is not applicable; the MVP is unchanged (Shared Classes is Phase 1a).

- **Effort:** High (5 stories; 12.1 touches every study route). **Risk:** High for 12.1, medium after — mitigated by the dry run and by the requirement that the entire existing suite passes with a single learner after 12.1.
- **Build order:** **12.1 → 12.2 → 12.3 → 12.4 → 12.5 → 8.1 → … → 11.3 → 5.5.**

## 5. Detailed Change Proposals (all approved)

### 5.1 PRD
| § | Change |
|---|---|
| §2.2 | Non-users reworded: no social features; an Owner may invite a registered user to study a Class. |
| §3 | + Owner, Member, Learner, Invitation, Shared Class. |
| FR-5 | + Only the Owner changes a Class's content; a Member's writes are `403`. |
| FR-9 / FR-17 / FR-19 | "Classes the user owns or is a Member of"; a Member's Learn grades only their records; quests count Shared Classes. |
| FR-13 / FR-14 | Export = owned Classes (content, own records, member emails) + `sharedClasses` by name; restore re-attaches resolvable members, ignores the shared list. |
| **new §4.11** | **FR-27** Invitations and the bell · **FR-28** Member study · **FR-29** Content changes and membership lifecycle. |
| §5 | Remove the sharing non-goal; add: no public sets / links / collaborative editing; no ownership transfer, nested sharing or sharing a Folder/Flashcard; no email/push; no shared progress or leaderboards. |
| §6 | + **Per-learner isolation.** |
| §8.1 | + Phase 1a: Shared Classes, before the Planner. |

### 5.2 Architecture
| Section | Change |
|---|---|
| AD-4 | grade loads the record where `userId = caller`, `404` otherwise. |
| AD-9 | `createCardWithSchedulingRecords(cardFields, learnerIds)` → two records **per learner**; adding a Member reuses the default-record function. |
| AD-14 | every predicate takes the viewer's `userId`. |
| **AD-19** | ownership and membership (`classAccess`, `classLearnerIds`); two guards; `SchedulingRecord.userId` + unique swap + backfill; transitions as single transactions; `ClassInvitation` with partial unique on PENDING; `GET /api/invitations` as the bell; quests/stats unchanged in rule. |
| AD-10 | export scope (`members[]`, `sharedClasses[]`, own records only). |
| AD-16 | user delete removes memberships, invitations, records in Shared Classes; owned Classes go for everyone. |
| Conventions | Observability + accept / leave / remove / cross-class move; Auth + the two guards. |
| Seed / ERD / map / Deferred | `api/classes/[id]/members`, `api/classes/[id]/invitations`, `api/invitations`, `packages/domain/access.ts`; ERD rows; FR-27…29 rows; Deferred reworded. |

### 5.3 Epics
Requirements inventory (FR-27…29, NFR-10, UX-DR31…34, amendments), Epic 12 in the list, amendment notes on built stories, Stories 12.1–12.5 with full ACs, build-order note.

### 5.4 UX
EXPERIENCE.md: Foundation sentence; IA rows (Classes label, read-only detail pages, Share modal, Bell); nav paragraph (bell placement B1); four voice rows; component patterns (Share modal, Bell + panel, Shared Class tile, Leave confirm, delete-confirmation line, read-only content); state rows; bell keys; Flow 6. DESIGN.md: `components.bell`, `components.shared-label`; component paragraphs; three Do/Don't rows; contrast note (no new pair).

### 5.5 Tracking
`epic-12` and 12-1…12-5 as `backlog` with migration/guard comments; 5-5 annotated; build order comments updated under Epics 7 and 12.

### 5.6 Secondary
`deferred-work.md`: Neon-branch dry run + partial-index verification; open-registration + invitation-by-email risk. `sprint-change-proposal-2026-11-16.md`: ordering superseded note.

## 6. Implementation Handoff

- **Scope:** Major. **PM** owns the PRD reversal (done here). **Architect** reviews the 12.1 migration plan and AD-19 guards before 12.1 starts. **Developer agent** (`bmad-build`) takes 12.1 → 12.5, then Epic 8.
- **Success criteria:**
  - After 12.1 the whole existing suite passes; `scheduling_records` row count is unchanged by the migration and every row has a `userId`.
  - Two learners grading the same Card change two different rows; a Member's grade on the Owner's record is `404`.
  - A Member's `POST`/`PATCH`/`DELETE` on any class-scoped write route is `403`; a stranger's read is `404`.
  - Accepting an invitation creates exactly `2 × cards` records in one transaction; declining creates none; a second pending invitation for the same user and Class is impossible.
  - The Owner adding a Card creates records for every learner; removing a Member or leaving deletes only that user's records.
  - Export → restore of a Class with one Member round-trips; a user delete leaves no memberships, invitations or foreign records.
  - The bell shows only invitations; five nav items remain; the bell is hidden in focus mode.

## 7. Open risks (not decided here)

1. **Migration on live data.** 12.1 rewrites the unique index on the hottest table. The dry run is mandatory; a failed backfill must leave the old index in place.
2. **Open registration + invite by email.** Whoever registers an address first receives its invitations. Email verification is the eventual fix (see `deferred-work.md`).
3. **Record fan-out.** A Class with 2 000 cards and 10 members creates 40 000 records; acceptable for a personal app, but 12.3 should batch the insert.
4. **Cross-class Flashcard move** silently drops members' progress on those cards when the target Class has different learners; the confirmation line is the only safeguard.
5. **No ownership transfer.** If the Owner deletes their account, members lose the Class.
6. **Workload:** 20 stories remain (12.1–12.5, 8.1–11.3, 5.5) instead of 15.
