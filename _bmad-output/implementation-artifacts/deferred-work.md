- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-live-deployed-application-skeleton.md`
  summary: Add a violating-import fixture test proving `packages/domain`'s AD-1 ESLint boundary (`no-restricted-imports`) actually fires.
  evidence: The rule is implemented and was manually verified once by the implementer (added then removed a violating import), but no fixture/test pins it — if the rule were deleted or mistyped, CI's lint step would stay green since no current source file in `packages/domain` violates it. Low risk today since the package holds no real domain logic yet; appropriate to add once the first real domain logic lands in a later story.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-live-deployed-application-skeleton.md`
  summary: Add an automated boot test confirming the documented `next start` vs. `next dev` behavior difference when required env vars are missing.
  evidence: `apps/web/instrumentation.ts`'s comment and `DEPLOYMENT.md`'s troubleshooting section assert that `next dev` exits the process on invalid env config while `next start` logs the error but keeps serving (returning 500s). The implementer verified this manually but no test pins it; if the claim is wrong for a future Next.js version, the DEPLOYMENT.md guidance would be misleading with no automated signal.
