- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-live-deployed-application-skeleton.md`
  summary: Add a violating-import fixture test proving `packages/domain`'s AD-1 ESLint boundary (`no-restricted-imports`) actually fires.
  evidence: The rule is implemented and was manually verified once by the implementer (added then removed a violating import), but no fixture/test pins it — if the rule were deleted or mistyped, CI's lint step would stay green since no current source file in `packages/domain` violates it. Low risk today since the package holds no real domain logic yet; appropriate to add once the first real domain logic lands in a later story.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-live-deployed-application-skeleton.md`
  summary: Add an automated boot test confirming the documented `next start` vs. `next dev` behavior difference when required env vars are missing.
  evidence: `apps/web/instrumentation.ts`'s comment and `DEPLOYMENT.md`'s troubleshooting section assert that `next dev` exits the process on invalid env config while `next start` logs the error but keeps serving (returning 500s). The implementer verified this manually but no test pins it; if the claim is wrong for a future Next.js version, the DEPLOYMENT.md guidance would be misleading with no automated signal.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-user-registration.md`
  summary: Add a `DEPLOYMENT.md` callout to set `BETTER_AUTH_URL` (and consider `trustedOrigins`) explicitly in production, before go-live.
  evidence: `apps/web/lib/auth.ts` leaves `trustedOrigins` unset and `BETTER_AUTH_URL` optional; Better Auth derives the origin from the incoming request when unset and already warns about this at boot. Testing surfaced a `MISSING_OR_NULL_ORIGIN` failure mode when a request carries a session cookie but no `Origin` header (real browsers always send one, so this doesn't affect the registration/login UI) — behind a proxy/CDN in production this is a plausible but unverified risk, not a demonstrated bug.

- source_spec: `_bmad-output/implementation-artifacts/spec-restyle-register-focus-indigo.md`
  summary: Code DESIGN.md typography (overline, heading-1, body-small line-heights) and the section-bullet size as globals.css @theme tokens, so screens stop inlining arbitrary values.
  evidence: `/register` inlines `text-[0.6875rem] tracking-[0.08em]`, `text-[2rem]`, `leading-[1.45]` and `size-[7px]` copied from DESIGN.md because globals.css defines only colors, radii and fonts. Every later screen will duplicate these, and they can drift.

- source_spec: `_bmad-output/implementation-artifacts/spec-restyle-register-focus-indigo.md`
  summary: Input borders fail WCAG 1.4.11 non-text contrast (3:1) in both themes; DESIGN.md needs an input-border token or a stronger border value.
  evidence: `border` #d8dae9 on card #ffffff ≈1.3:1 (light) and #30344f on #181a2e ≈1.5:1 (dark). This is a design-token decision owned by DESIGN.md, which the register restyle spec may not change.

- source_spec: `_bmad-output/implementation-artifacts/spec-restyle-register-focus-indigo.md`
  summary: Register form accessibility follow-ups — announce form-level and async field errors (`role="alert"`/aria-live), move focus to the first invalid field on failed submit, and mark the form busy and lock inputs while submitting.
  evidence: All three behaviors were already missing before the restyle (the baseline formError `<p>` had no live region and only the button was disabled); screen-reader and keyboard users get no cue when submit fails.

- source_spec: `_bmad-output/implementation-artifacts/spec-restyle-register-focus-indigo.md`
  summary: Show the password requirements (e.g. minimum length) as a hint linked with aria-describedby before submit.
  evidence: Users only learn the Zod password rules after a failed submit ("Too small: expected string to have >=8 characters"); this existed before the restyle and needs copy per EXPERIENCE.md voice.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-3-user-login-logout.md`
  summary: Redirect already-authenticated visitors away from `/login` and `/register`, and give unauthenticated `/` a path to login (Story 1.5 route gating).
  evidence: A signed-in user can open `/login` and sign in again, creating a redundant session; a fresh visitor to the placeholder `/` sees no login link. Frozen Never excludes route gating from 1.3; Story 1.5 owns "unauthenticated visitors are redirected to login".

- source_spec: `_bmad-output/implementation-artifacts/spec-1-5-authenticated-app-shell-theme-toggle.md`
  summary: Add a way to navigate and log out below 640px (bottom bar or menu), since the sidebar is hidden there and Settings is reachable only by URL.
  evidence: The spec, DESIGN.md and EXPERIENCE.md all hide the sidebar on mobile and name no replacement; with logout now only in Settings, a phone user has no UI path to Classes, Stats, Settings or Log out. Needs a design decision before building.

- source_spec: `_bmad-output/implementation-artifacts/spec-2-1-class-crud.md`
  summary: Redirect to `/login` when `apiFetch` receives a 401, instead of showing a generic load or mutation error.
  evidence: `apps/web/lib/api-client.ts` turns a `401 UNAUTHENTICATED` envelope into a plain `ApiError`, so a user whose session expired mid-visit sees "Could not load your classes" with no path back to login. Rare under 30-day sliding sessions, but every later screen will inherit it.

- source_spec: `_bmad-output/implementation-artifacts/spec-2-1-class-crud.md`
  summary: Verify that `prisma migrate dev` does not drop the raw-SQL partial unique index `folders_classId_isUnsorted_key` as drift (unverified, would be medium if true).
  evidence: The index enforcing one Unsorted Folder per Class exists only in `migration.sql` because Prisma cannot express a partial index in `schema.prisma`. To settle it, run `prisma migrate dev` against a shadow database and check whether the generated SQL contains `DROP INDEX "folders_classId_isUnsorted_key"`.

- source_spec: `_bmad-output/implementation-artifacts/spec-2-3-add-cards-manual-mode.md`
  summary: Cards from one batch list in id order rather than entry order.
  evidence: They share a `createdAt`, and Card has no position field; fixing needs a schema change.
- source_spec: `_bmad-output/implementation-artifacts/spec-2-3-add-cards-manual-mode.md`
  summary: The Add cards Folder picker and last-used-Folder restore are unreachable and untested.
  evidence: `AddCardsPanel` is only rendered with a `folder` prop; test it when a global Add cards entry adds a caller.
- source_spec: `_bmad-output/implementation-artifacts/spec-2-3-add-cards-manual-mode.md`
  summary: No e2e test checks that class-folders/classes counts refresh via client-side navigation after a batch save.
  evidence: The only count assertion uses `page.goto`, which refetches regardless of cache invalidation.

- source_spec: `_bmad-output/implementation-artifacts/spec-2-4-edit-a-card.md`
  summary: Add a Playwright test (via `page.route`) for the edit modal's server 404 and 400 `fields` error branches.
  evidence: The e2e test only reaches the client-side validation path; the `onError` mapping in edit-card-modal.tsx is untested in the browser.

- source_spec: `_bmad-output/implementation-artifacts/spec-2-5-delete-a-card.md`
  summary: Add an e2e check that Class and Folder card counts drop after a client-side navigation following a Card delete.
  evidence: The delete modal invalidates `["classes"]` and `["class-folders"]`, but the e2e test only asserts the Folder page count.

- source_spec: `_bmad-output/implementation-artifacts/spec-2-7-flashcard-crud-inside-a-folder.md`
  summary: Add a forced-failure rollback test for `DELETE /api/flashcards/[id]` (trigger-based, like the Folder delete rollback test).
  evidence: The delete runs in one transaction with a 500 "Nothing was changed" path, but only success and 404 cases are tested.

- source_spec: `_bmad-output/implementation-artifacts/spec-2-3-add-cards-manual-mode.md`
  summary: Build the Class -> Folder -> Flashcard picker for the Empty due-queue "+ Add card" entry (Story 2.3 last AC, UX-DR8), in Epic 4 with the empty state itself.
  evidence: Story 2.7 removed the old Folder picker and last-used storage from the Add cards panel because no screen opens the panel without a target Flashcard until the Epic 4 empty state exists.
