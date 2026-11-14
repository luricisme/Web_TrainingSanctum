# Epic 7 Context: Administration

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Introduce a single admin role so one owner can see every user and their level, open a read-only view of any user's data, export and restore it, and disable, reset the password of, or delete a user. This reverses the earlier single-user stance; admin features must be protected in exactly one place.

## Stories

- Story 7.1: Roles, Admin Seed and Guard
- Story 7.2: User List with Levels
- Story 7.3: Read-only User View
- Story 7.4: Disable / Enable User
- Story 7.5: Reset User Password
- Story 7.6: Delete User

## Requirements & Constraints

- Admin accounts exist only through a server-side seed from the `ADMIN_EMAILS` env var; no route or screen ever changes a role.
- An admin also uses every normal feature, plus an **Admin** menu entry (app bar and dock) invisible to normal users.
- Export/restore (Stories 5.2/5.3) are admin-only and act on one selected user's data.
- The admin's user view is read-only and shows the same payload as the export, so viewing and exporting share one code path.
- An admin cannot disable or delete themselves; the last admin can never be disabled or removed.
- An admin never reads a password; reset stores a new hashed password and deletes the user's sessions.

## Technical Decisions

- AD-16: `User.role` (`user` | `admin`, default `user`) and a disabled flag, via an additive migration that must be deployed to Neon together with the code (otherwise every page 500s).
- Every `/api/admin/**` Route Handler calls one helper, `requireAdmin()`, in the auth layer: no session → `401`, non-admin → `403`, both in the standard error envelope. No route writes its own role check.
- `ADMIN_EMAILS` is validated by the Config Zod schema, which fails fast at process start.
- Disabling deletes the user's sessions and refuses login; deleting runs in one `$transaction` removing the user and everything scoped to them.
- Story 7.1 must record whether Better Auth's `admin` plugin fits the installed `better-auth` 1.7.x with the Prisma adapter; use it if it fits, otherwise write routes against the same Prisma client.
- Routes live under `app/api/admin/**`, screens under `app/(shell)/admin/**`.

## UX & Interaction Patterns

- Admin navigation, user table (email, created, status, realm, level, XP; paginated), read-only user page with a banner "Read-only. You are viewing {email}'s data.", and a delete dialog requiring the email to be retyped.

## Cross-Story Dependencies

- 7.1 first: 5.2 and 5.3 need the guard. Build order: 7.1 → 7.2 → 5.2 → 7.3 → 5.3 → 7.4 → 7.5 → 7.6 → 5.5.
- 7.3 reuses the payload builder from Story 5.2.
