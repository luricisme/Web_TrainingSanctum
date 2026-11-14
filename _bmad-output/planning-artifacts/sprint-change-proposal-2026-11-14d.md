# Sprint Change Proposal — Admin role, admin-only export/restore, user management (new Epic 7)

- **Date:** 2026-11-14
- **Project:** Web_TrainingSanctum
- **Requested by:** Luric (product owner)
- **Workflow:** bmad-correct-course (incremental mode)
- **Status:** Approved by Luric, proposal by proposal (5 of 5). Applied 2026-11-14.
- **Scope:** **Major.** It reverses a PRD non-goal ("no multi-user"), adds a migration and an authorization layer, and adds an epic.

---

## 1. Issue Summary

Export and restore should not be available to every user. The product owner asked for an **admin role** that uses these features and manages the other users, including seeing each user's level. During the change the scope was widened: the admin can see all of a user's data, read-only, including the content of the export.

The app was single-user by design (PRD §2.2, §2.3, §5; architecture Deferred) and had no role field.

## 2. Decisions made with the product owner

1. Admin accounts exist only through a server-side seed (`ADMIN_EMAILS`); no UI changes a role.
2. An admin also uses every normal feature, plus an **Admin** menu item.
3. Export and restore act on **one selected user's** data.
4. The admin's view is **read-only** and shows the same payload as the export (`backupExportSchema`), so viewing and exporting share one code path.
5. Admin actions: list users with realm, level and XP; disable or enable; reset password; delete user.

## 3. Impact Analysis

- **Epics:** new Epic 7 (6 stories). Stories 5.2 and 5.3 become admin-only and per user. Story 5.5 audits the Admin screens too.
- **PRD:** FR-1, FR-13, FR-14 amended; FR-21 and §4.9 added; §2.2, §4.1, §5 and §8.1 reworded.
- **Architecture:** AD-16 added; Auth, Observability and Config conventions, the structural seed, the capability map and two Deferred items updated.
- **UX:** Admin navigation, user list, read-only user page, delete-user dialog; export and restore leave Settings.
- **Code:** none yet. Story 7.1 adds a migration (`User.role`, disabled flag), `ADMIN_EMAILS`, and `requireAdmin()`.

## 4. Recommended Approach

Direct Adjustment inside the existing plan, with a new epic. Effort rises from 3 remaining stories to **9** (7.1–7.6, 5.2, 5.3, 5.5).

Build order: **7.1 → 7.2 → 5.2 → 7.3 → 5.3 → 7.4 → 7.5 → 7.6 → 5.5**. 7.1 comes first because 5.2 and 5.3 need the guard; 5.2 comes before 7.3 because the payload builder lives there.

## 5. Changes Applied

| Artifact | Change |
|---|---|
| `prd.md` | §2.2, §4.1 and FR-1 (roles, 403, disabled accounts); FR-13 and FR-14 admin-only per user; new §4.9 and FR-21; §5 Non-Goals and §8.1 Phase 1 updated. |
| `ARCHITECTURE-SPINE.md` | New AD-16 (roles, `requireAdmin()`, seed, shared payload builder, transactional delete, last-admin rule, Better Auth `admin` plugin to verify). Auth, Observability, Config conventions; `app/api/admin/**` in the seed; capability map; Deferred items reworded. |
| `epics.md` | FR-1, FR-13, FR-14 amended; FR-21 and map entry; Epic 7 in the list and as stories 7.1–7.6; Stories 5.2 and 5.3 rewritten as admin-only; Story 5.5 pointer-cursor AC covers Admin screens; Epic 6 "FRs covered" corrected; build-order note updated. |
| `EXPERIENCE.md` | Admin screen, five-item nav for admins, dock note, delete-user dialog, read-only banner, restore confirmation moved to the Admin user page. |
| `DESIGN.md` | Admin table and read-only banner components; modal note; a Do/Don't row. |
| `sprint-status.yaml` | `epic-7` and 7-1 to 7-6 as `backlog`; 5-2 and 5-3 annotated; build order added. |

## 6. Implementation Handoff

- **Scope:** Major. PM reviews the PRD change, since it reverses a non-goal; Architect verifies AD-16 and the Better Auth `admin` plugin in Story 7.1; then the Developer agent builds in the order above.
- **Success criteria:** a non-admin gets `403` on every `/api/admin/**` route; no admin can disable or delete themselves or remove the last admin; the user page has no edit control; the Neon migration is deployed with the code.

## 7. Open risks (not decided here)

1. **Registration stays open to anyone.** With an admin who can read all content, who may create an account now matters. Consider limiting sign-up to known users.
2. **Privacy.** The admin sees users' study content. The PRD says users should be told at registration, but no screen for that is planned.
3. **Password reset** does not force a change at next login.
4. **Workload:** 9 stories remain instead of 3.
5. **Story 7.1** must deploy its migration to Neon with the code, or every page returns 500.
