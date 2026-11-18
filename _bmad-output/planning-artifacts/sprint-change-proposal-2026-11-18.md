# Sprint Change Proposal — Choose and change the music on the Pomodoro screen (Story 11.3 amended)

- **Date:** 2026-11-18
- **Project:** Web_TrainingSanctum
- **Requested by:** Luric (product owner)
- **Workflow:** bmad-correct-course (batch mode)
- **Status:** Approved by Luric. Applied 2026-11-18.
- **Scope:** **Minor.** One story's acceptance criteria grow; no migration, no new route, no new table. Story 11.2 stays as built.

---

## 1. Issue Summary

While testing Story 11.2 the product owner observed that the natural moment to choose or change the music is **on the Pomodoro screen**, while studying, not in the Category and Task edit modals, which are planning-time screens. Story 11.3 as written only *plays* the stored track; it offers no way to change it. Without a change control there, a user who dislikes the track has to leave the timer, open an edit modal, and come back.

## 2. Decisions made with the product owner

1. **Keep 11.2 as built (option A).** The Music field in the Category and Task modals remains; it sets the *default*. A Category holds the default, a Task overrides it.
2. **11.3 gains a "Change" control in the player.** It searches Jamendo (same search the 11.2 field uses) and picks a track.
3. **A pick on the Pomodoro screen is saved onto the Task** as its `musicTrack` override, so later sessions of that Task reuse it. It never edits the Category.
4. **"None" on the Pomodoro screen clears the Task override** (the Task then falls back to its Category's track), exactly as in 11.2. Silence for a session is the existing **pause** control.
5. **Timing:** a pick made while a focus session is playing takes effect at once (the new track fades in over 3 s); a pick made during a break or before start plays at the next focus session. Breaks stay silent.

## 3. Impact Analysis

### Epics
- **Epic 11:** Story 11.3 grows (player + change control). 11.1 and 11.2 are unchanged.
- **Other epics:** none.

### Stories
- **11.2 (built, in review):** no change. Its `MusicField` component (`apps/web/app/(shell)/planner/music-field.tsx`) is **reused** by 11.3, so it must stay self-contained (search, last-pick-first, attribution, "None").
- **11.3 (backlog):** amended below.

### Artifacts
- **PRD:** FR-26 gains one consequence.
- **Epics:** Epic 11 intro and Story 11.3.
- **Epic 11 context:** UX patterns and cross-story dependency.
- **UX (EXPERIENCE.md):** the Music player row gains the Change control.
- **Architecture:** **no change.** AD-18 (adapter, `{ source, trackId }` on Category and Task) already covers it; the pick is written through the existing `PATCH /api/planner/tasks/[id]`, which accepts `musicTrack` since 11.2.
- **Design (DESIGN.md):** no new component; the player stays a card-surface strip with quiet buttons.

### Technical
- **No migration, no new route.** Uses `PATCH /api/planner/tasks/[id]` (`musicTrack`) and `GET /api/planner/music/search`.
- The Pomodoro screen needs the Task's effective track: `Task.musicTrack` ?? its Category's `musicTrack`. `TaskSummary` carries `musicTrack` (11.2); the Category's track comes from the category summary already returned with the task's category or fetched from `GET /api/planner/categories`.
- Playback stays a client `<audio>` element; no iframe.

## 4. Recommended Approach

**Direct Adjustment:** amend Story 11.3. Rollback and MVP review are not applicable.

- **Effort:** Low to medium (one control and a mutation; the search UI already exists). **Risk:** Low. The one new interaction is swapping the audio source mid-session; it is covered by an acceptance criterion and the existing fade logic.
- **Build order unchanged:** 11.1 → 11.2 → 11.3 → 5.5.

## 5. Detailed Change Proposals

### 5.1 PRD — FR-26 (`prds/prd-Web_TrainingSanctum-2026-10-29/prd.md`)

OLD (consequences list, after the first bullet):
> - A Category can hold one track or none; a Task can override it. The last choice is remembered.

NEW:
> - A Category can hold one track or none; a Task can override it. The last choice is remembered.
> - The user can also choose or change the track from the Pomodoro screen itself; a track picked there is saved as the Task's override and used by that Task's later sessions.

Rationale: the choice is made while studying.

### 5.2 Epics — Epic 11 intro and Story 11.3 (`epics.md`)

Epic 11 intro, OLD:
> A user picks a Jamendo track per category (or per task); it fades in with each focus session, out at its end, stays silent in breaks, and shows its attribution.

NEW:
> A user picks a Jamendo track per category (or per task), or changes it from the Pomodoro screen; it fades in with each focus session, out at its end, stays silent in breaks, and shows its attribution.

Story 11.3 user story, OLD:
> As a user, I want the music to follow the session, So that I never touch it.

NEW:
> As a user, I want the music to follow the session and to change it without leaving the timer, So that I rarely have to touch it, and can when I want to.

Story 11.3, **new acceptance criteria** added after the existing ones:

> **Given** the player (UX-DR30)
> **Then** it also shows a quiet "Change" control; choosing it reveals the same Jamendo search used by the Music field (last picked first, "None"), without leaving the screen
>
> **Given** the user picks a track in the player
> **Then** it is saved as the Task's `musicTrack` override (`PATCH /api/planner/tasks/[id]`), never onto the Category; if a focus session is playing, the new track fades in over 3 s; otherwise it plays at the next focus session
> **And** choosing "None" clears the Task's override, so the Task uses its Category's track again; pausing is how to silence the music
>
> **Given** the track change fails to save or Jamendo is unreachable
> **Then** the current music and the timer are unaffected and the one quiet line "Music unavailable — the timer continues." shows

And the existing "player shows title · artist · licence link, pause and volume, nothing else" is reworded to "…pause, volume and Change, nothing else".

### 5.3 Epic 11 context (`implementation-artifacts/epic-11-context.md`)

UX bullet, OLD:
> Music field lives in the Category edit modal … and in Task edit; it searches Jamendo and stores the chosen track.

NEW: same, plus:
> The Pomodoro player also has a Change control that reuses the Music field's search and saves the pick as the Task's override.

Player bullet: "Player controls are only pause and volume" becomes "pause, volume and Change".

Cross-story dependencies, add: "11.3 reuses `MusicField` from 11.2 and writes via the existing Task PATCH."

### 5.4 UX — EXPERIENCE.md, "Music player" row

OLD: `Title · artist · licence link, pause, volume slider. …`
NEW: `Title · artist · licence link, pause, volume slider and a quiet Change control that opens the Jamendo search in place. …`

### 5.5 Tracking — `sprint-status.yaml`

Add a note on `11-3-player-in-the-pomodoro-screen` and the Sprint Change reference. Status stays `backlog`.

## 6. Implementation Handoff

- **Scope: Minor.** Developer agent (`bmad-build`) implements Story 11.3 with the amended acceptance criteria.
- **Success criteria:** the player offers Change; a pick saves on the Task and survives a reload; a pick mid-focus fades in; None falls back to the Category's track; a failure leaves the timer untouched; the `MusicField` and Category/Task modals from 11.2 behave as before.
- **Before building 11.3:** story 11.2 is merged (branch `story/11.2-track-per-category-and-task`), so 11.3 can import `MusicField`.
