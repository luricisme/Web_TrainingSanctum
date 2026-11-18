---
title: 'Player in the Pomodoro screen (story 11.3)'
type: 'feature'
created: '2026-11-18'
status: 'done'
baseline_commit: '48f9d6bc877d655145bd85979aa4cf09d0b2d83e'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-11-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/sprint-change-proposal-2026-11-18.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/DESIGN.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/EXPERIENCE.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/.working/design-dna-profile.json'
  - '{project-root}/.claude/skills/design-dna/references/generation-guide.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A Task or Category can hold a track (11.2) but nothing plays it, and the only way to change it is to leave the timer for an edit modal.

**Approach:** Add a music player strip under the Pomodoro countdown. It plays the Task's effective track (`Task.musicTrack ?? Category.musicTrack`) in a client `<audio>` element, fading in and out with focus sessions, and has a quiet "Change" control that reuses the 11.2 search and saves the pick as the Task's override.

## Boundaries & Constraints

**Always:** Player shows title · artist · licence link (linked), a pause button, a volume slider (remembered in guarded `localStorage`) and "Change"; nothing else. Fade in 3 s at focus-session start (also when the page opens on a running focus session, from the current moment); fade out over the last 3 s of the session and on Stop; breaks silent. A track longer than the session is cut by the fade-out; a shorter one loops. Audio fades ignore `prefers-reduced-motion`. "Change" opens the 11.2 Jamendo search in place (last picked first, "None") and writes `musicTrack` through `PATCH /api/planner/tasks/[id]` — never onto the Category. A pick during a playing focus session fades the new track in over 3 s; otherwise it plays at the next focus session. "None" clears the override (Category's track applies); pause is how to silence. Any Jamendo, stream, or save failure shows only "Music unavailable — the timer continues."; timer, plan and logging are unaffected. A browser that blocks autoplay leaves the player paused without an error. UI conforms to DESIGN.md tokens and the Design DNA design_style; passes the anti-generic UI rules; checked against a screenshot in both dark and light themes.

**Never:** No migration, no new route, no second source, no outbound HTTP outside `lib/music/`, no iframe, no artwork/playlist/banner, no edit to the Category's track, no change to session/timer logic.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Start focus | Task has a track, user presses Start | Track fades in over 3 s, loops | stream error -> unavailable line |
| Session end | last 3 s of focus, or Stop | fades out, then pauses | N/A |
| Break | break running | silent | N/A |
| Change mid-focus | pick a track | Task `musicTrack` saved, new track fades in over 3 s | save fails -> old music keeps playing, unavailable line |
| Change idle/break | pick a track | saved; plays at next focus session | as above |
| None | task has override | override cleared; Category's track shown/played at next focus | as above |
| No track anywhere | neither Task nor Category | strip reads "No music" with "Choose a track" | N/A |
| Jamendo down | track lookup 502 | "Music unavailable — the timer continues."; timer runs | no throw |
| Pause | user pauses | silent until resumed; volume remembered | N/A |

</frozen-after-approval>

## Code Map

- `apps/web/app/(shell)/planner/pomodoro/pomodoro-screen.tsx` -- `TaskPomodoro`: `mine` (running session for this Task), `remainingMs`, `now` tick, `next`; render the player after the timer block. Reuses `taskKey`, `PLANNER_CATEGORIES_KEY` query for the Category track.
- `apps/web/app/(shell)/planner/music-field.tsx` -- reuse `useTrack`, `Attribution`, `TrackSearch`, `UNAVAILABLE`, `writeLastPick`; export them (do not fork the search). `MusicField` itself stays as built.
- New `apps/web/app/(shell)/planner/pomodoro/music-player.tsx` -- `<audio>` element, fade engine (rAF or interval ramping `audio.volume = master * gain`), volume in `localStorage`, controls, Change panel, PATCH mutation.
- `apps/web/app/api/planner/tasks/[id]/route.ts` -- PATCH already accepts `musicTrack`; do not change. `TaskSummary.musicTrack` and `TaskCategorySummary.musicTrack` already exist.
- `tests/e2e/pomodoro.spec.ts` (helpers `register`, `shoot`, `addTasks`) and `tests/e2e/planner-tasks.spec.ts` (`stubMusic`, `TRACKS`) -- extend; stub `**/api/planner/music/**` and the audio stream. `vitest.config.ts` runs only `tests/domain/**`, so keep fade math in a pure helper and unit-test it there if placed in `packages/domain`.

## Tasks & Acceptance

**Execution:**
- [x] `music-field.tsx` -- export the reusable pieces; no behaviour change -- single search UI
- [x] `pomodoro/music-player.tsx` -- player, fades, loop, volume memory, Change panel, PATCH + cache update -- core
- [x] `pomodoro-screen.tsx` -- mount the player with the Task, effective track, running focus session and its end time; invalidate task queries after a pick -- integration
- [x] tests -- pure fade-gain unit test; e2e: plays on Start (audio element not paused), pause, Change saves the Task override and not the Category, None falls back, Jamendo down shows the line and the timer still runs; both-theme screenshots

**Acceptance Criteria:**
- Given a focus session starts with a track, when it starts, then audio plays with a 3 s fade-in and stops with a 3 s fade-out; breaks are silent.
- Given the user picks a track via Change, then the Task row holds it and the Category row is unchanged.
- Given Jamendo is unreachable, then one quiet line shows and the timer continues.
- Given the story is built, then `npm test`, lint and build pass with no migration.

## Implementation Notes

## Spec Change Log

## Review Triage Log

| Finding | Verdict | Route / evidence |
|---|---|---|
| Autoplay-blocked pause and `failedUrl` persist across later focus sessions (edge, blind) | medium | patch. Next Start is a user gesture but the player stays paused/failed until reload. |
| Categories query pending/failed shows "No music", plays nothing, no line (gap, edge, blind) | medium | patch. Inherited track silently lost. |
| Matrix rows untested: fade-in ramp, break silent, session end, stream error, save fails (gap, blind, edge) | medium | patch. Step-03 matrix audit requires coverage. |
| `aria-pressed` plus label swap on Pause (blind) | low | patch. Direct one-line fix. |
| Volume slider lacks `focus-ring` (design) | low | patch. One class. |
| Leading-space helper strings (design, blind) | low | patch. Cosmetic one-liner. |
| iOS Safari `audio.volume` read-only: no fade, slider inert (blind, edge) | low | defer. Platform limit; needs Web Audio GainNode. Recorded in deferred-work. |
| Change/None/search/"No music" exceed DESIGN.md "title, licence, pause, volume" row (design) | low | defer. Sprint Change 2026-11-18 mandates them; DESIGN.md is stale. |
| Track swap mid-focus cuts old track, no crossfade (blind, edge) | low | rejected. Spec only requires the new track to fade in; noted in report. |
| fadeMs=0 gives NaN; NaN endsAtMs (blind, edge) | low | rejected. No caller passes 0; times come from validated server data. |
| Client clock skew vs server startedAt (blind, edge) | false | The existing countdown uses the same `startedAt + plannedMinutes - Date.now()`; fade stays in step with the timer. |
| `Date.now()` vs `performance.now()` for fades (edge) | low | rejected. Needs clock adjustment mid-fade; fix adds complexity. |
| Playback on an already-expired session (blind) | low | rejected. Gain is 0 and tick pauses at once. |
| Pause/Volume hidden while a new track's lookup is pending (edge) | low | rejected. Brief; Stop and the timer unaffected. |
| writeLastPick before save succeeds (edge) | low | rejected. Same behaviour as MusicField from 11.2. |
| Failed save closes the search panel, no retry (blind) | low | rejected. Unavailable line shows; reopening is one click. |
| `focus.id` prop not in effect deps (edge) | low | rejected. Back-to-back sessions never share an end time. |
| TrackSearch failure text lacks "— the timer continues." (edge) | low | rejected. Reused 11.2 wording inside the panel. |
| `onSaved` replaces cached task with PATCH summary (blind) | false | Cache holds a `TaskSummary`, the same shape the PATCH returns. |
| Screenshots lack a dark/light loop (blind) | false | The `shoot` helper writes `-dark` and `-light` for each. |
| Process: sprint-status shows in-progress while spec in-review (blind) | low | rejected. Set to review in step 5. |

## Design Notes

Gain ramp is linear over 3000 ms on top of the user's volume; the player computes it from wall-clock time, not from the countdown tick, so a throttled background tab cannot stall a fade. The strip is a card-surface row with quiet buttons (DESIGN.md), no accent colour — the Start button stays the one accent.

## Verification

**Commands:**
- `npm test` (PowerShell) -- expected: all pass
- `npm run lint` and `npm run build` -- expected: clean
- Playwright `pomodoro.spec.ts` and `planner-tasks.spec.ts` -- expected: pass
