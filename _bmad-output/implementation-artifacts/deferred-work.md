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
