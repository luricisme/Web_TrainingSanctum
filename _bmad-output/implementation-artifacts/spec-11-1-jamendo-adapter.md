---
title: 'Jamendo adapter (story 11.1)'
type: 'feature'
created: '2026-11-18'
status: 'done'
baseline_commit: '9c90bf7367e41b3d781c743e297ff31466d93799'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-11-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-Web_TrainingSanctum-2026-11-01/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Epic 11 needs background music, but the product has no outbound HTTP and no music source. Jamendo was chosen on research alone (terms page dated 2013, catalogue never heard).

**Approach:** Add a `MusicSource` interface with one Jamendo implementation, exposed only through two authenticated Route Handlers, with `JAMENDO_CLIENT_ID` required by the Config schema. A Jamendo failure degrades music only.

## Boundaries & Constraints

**Always:** `apps/web/lib/music/jamendo.ts` is the only module making outbound HTTP. Responses use the standard envelope and are cached one hour. Failures return 502 `MUSIC_UNAVAILABLE`, are logged, and never throw into a page. 401 without a session. Adapter tested against recorded responses (fixtures under `tests/fixtures/jamendo/`).

**Decisions (human, 2026-11-18):** (a) Listening check of `tags=lofi+chillout` is a pre-deploy gate, not a build blocker; if it fails, stop and re-decide the source via a sprint change. (b) Jamendo terms (last modified 2013-09-17: free non-commercial use, up to 35,000 requests/month, no caching of content, backlink to each track's page required) are accepted for this personal, non-commercial app; the track shape gains `shareUrl` (Jamendo track page) for the backlink. (c) The user registers `JAMENDO_CLIENT_ID`; CI and tests use a placeholder, the real id goes in local env and on Vercel before deploy.

**Never:** No DB migration, no UI, no storing of tracks (11.2), no player (11.3), no caching of audio content itself, no second catalogue.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Search | signed in, `q=rain&tags=lofi` | 200, list of `{ id, title, artist, licence, licenceUrl, shareUrl, streamUrl, duration }` | N/A |
| Track | signed in, valid id | 200, one track | unknown id: 404 `NOT_FOUND` |
| No session | any | 401 `UNAUTHENTICATED` | N/A |
| Jamendo down / bad payload | fetch rejects, non-2xx or malformed JSON | 502 `MUSIC_UNAVAILABLE`, one log line | no throw |

</frozen-after-approval>

## Code Map

- `apps/web/lib/env.ts` -- `envSchema` (Zod); add required `JAMENDO_CLIENT_ID` in the `BETTER_AUTH_SECRET` style.
- `.env.example` -- uncomment the existing `JAMENDO_CLIENT_ID` line; `DEPLOYMENT.md` section 3 -- add a table row.
- `playwright.config.ts` (`webServer.env`, ~line 38), `.github/workflows/ci.yml` (`env:` block), `tests/domain/env-validation.test.ts` -- add the var / valid-env fixtures.
- `apps/web/app/api/planner/categories/route.ts` -- route pattern to copy; use `requireSession` (`lib/session.ts`) directly (not the planner wrapper, which sweeps sessions).
- `apps/web/lib/api-response.ts` -- `ok`, `fail`, `validationFailure`; `ok()` takes no headers, so set `Cache-Control: private, max-age=3600` by building the response directly.
- `apps/web/lib/log.ts` -- `logOperation` for the failure log.
- `tests/domain/*.test.ts`, `vitest.config.ts` (includes only `tests/domain/**`) -- new `tests/domain/jamendo.test.ts`, `vi.stubGlobal("fetch")` with recorded JSON.
- Jamendo API: `GET /v3.0/tracks` (`search`, `tags=a+b` is AND, `format=json`, `audioformat`, `include=licenses`), `GET /v3.0/tracks/file` for stream redirect. Response field names must be confirmed from one real call when recording fixtures.

## Tasks & Acceptance

**Execution:**
- [x] `apps/web/lib/env.ts` + `.env.example` + `DEPLOYMENT.md` + `playwright.config.ts` + `ci.yml` + `tests/domain/env-validation.test.ts` -- require `JAMENDO_CLIENT_ID`
- [x] `apps/web/lib/music/types.ts`, `jamendo.ts` -- `MusicSource` and Jamendo implementation with a normalised `Track`
- [x] `apps/web/app/api/planner/music/search/route.ts`, `apps/web/app/api/planner/music/[trackId]/route.ts` -- handlers per the matrix
- [x] `tests/fixtures/jamendo/*.json`, `tests/domain/jamendo.test.ts` -- recorded-response tests incl. failure cases

**Acceptance Criteria:**
- Given no `JAMENDO_CLIENT_ID`, when the app boots, then it fails fast with a clear Config error.
- Given a Jamendo outage, when a music route is called, then 502 in the error envelope and the rest of the app is unaffected.
- Given a repo-wide search, then no module outside `lib/music/` calls `fetch` to an external host.

## Implementation Notes

- Files: `lib/music/{types,jamendo,index,respond}.ts`, routes under `app/api/planner/music/`, env wiring (env.ts, .env.example, DEPLOYMENT.md, playwright.config.ts, ci.yml, env-validation test), `tests/domain/jamendo.test.ts`, `tests/fixtures/jamendo/*.json`, plus `tests/api/planner-music.spec.ts` (added in verification to cover the 401/404/502 matrix rows at route level).
- Fixtures are written from Jamendo's documented shape, NOT recorded from a live call (no client id yet). Before deploy: one real call to confirm field names (`id`, `name`, `duration`, `artist_name`, `license_ccurl`, `shareurl`, `audio`) and the `include=licenses` / `audioformat=mp31` params.
- `apps/web/.env.local` (gitignored) got a placeholder `JAMENDO_CLIENT_ID`; replace with the real id, and set it on Vercel before deploy.
- Pre-deploy gate still open: the `tags=lofi+chillout` listening check.
- Route 502 test relies on the placeholder client id (Jamendo rejects it or is unreachable; both give 502).

## Spec Change Log

## Review Triage Log

| Finding | Verdict | Route / evidence |
|---|---|---|
| Tags joined with "+" then URLSearchParams encodes %2B (edge-case) | high | patch. Reproduced: `tags=lofi%2Bchillout`; Jamendo reads one literal tag. |
| Empty audio/shareurl/license_ccurl accepted (blind, edge-case) | medium | patch. Unplayable track or missing attribution backlink. |
| Route-level success, normalisation, 404, track-502 untested (verification-gap, blind) | medium | patch. Add Vitest route tests with stubbed source. |
| Playwright 502 test weak and network-dependent; mixed test bodies (verification-gap, edge-case) | low | patch. Split it, keep as a smoke check; real coverage moves to route tests. |
| track() returns first result without id check (edge-case) | low | patch. One-line fix. |
| licenceLabel "CC ZERO 1.0" for publicdomain (blind, edge-case) | low | patch. One-line fix. |
| Whitespace-only JAMENDO_CLIENT_ID passes (edge-case) | low | patch. `.trim()`. |
| Fixtures hand-written, not recorded live (edge-case) | medium | defer. Known; recorded in Implementation Notes; gate before deploy. |
| One bad record fails whole search (blind, edge-case) | low | rejected. Spec matrix says malformed payload gives 502; fix adds branches. |
| http(s)/host validation of upstream URLs (blind) | low | rejected. Trusted upstream, Zod-validated shape; fix adds complexity. |
| Cache staleness, Vary: Cookie, 404/502 uncached (blind, edge-case) | false | Spec requires one-hour cache; response is `private`; music metadata is not user data. |
| No rate limit / empty-query quota burn / no retry (blind, edge-case) | low | rejected. Private app, 35k/month tier; fix adds guards. |
| Log may leak client_id; cause dropped (blind) | false | Logged message is the generic constant, never the URL or cause. |
| JAMENDO_CLIENT_ID required everywhere; other workflows (blind, edge-case) | false | Required by spec; `ci.yml` is the only workflow with an env block. |
| Surrogate-pair slice, body.cancel, tag length, paging, trackId boundary (blind, edge-case) | low | rejected. Negligible; fixes add guards. |

## Verification

**Commands:**
- `npm test` -- expected: all pass (run via PowerShell on Windows)
- `npm run lint` and `npm run build` -- expected: clean
