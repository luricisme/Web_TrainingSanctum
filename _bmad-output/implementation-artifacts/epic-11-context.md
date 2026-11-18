# Epic 11 Context: Planner — Music

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Let a user pick a background track per Task Category (with an optional per-Task override) so that each Pomodoro focus session plays the right music automatically: fade in at session start, fade out at its end, silent during breaks, with licence attribution always visible. Music comes from one catalogue, Jamendo (Creative Commons), behind a swappable adapter so a Jamendo failure can never affect the timer, plan or logging. This is the product's first outbound HTTP dependency.

## Stories

- Story 11.1: Jamendo Adapter
- Story 11.2: Track per Category and Task
- Story 11.3: Player in the Pomodoro Screen

## Requirements & Constraints

- Jamendo is the only source in v1. Other sources (YouTube, Spotify, uploads, bundled files, a second catalogue) are out of scope; a second catalogue must be additive later.
- A Category holds one track or none; a Task may override it; "None" is allowed; the last pick is remembered and offered first.
- Fade in on focus-session start and fade out at its end; breaks are silent. A track longer than the session is cut by the fade-out; a shorter one loops until the fade-out. Reduced-motion preference does not alter audio fades.
- The current track's title, artist and licence link must be shown (attribution is a licence condition), including beside the Music field in edit forms.
- Player controls are only pause and volume (volume remembered in `localStorage`); no artwork, no playlist, no "now playing" banner elsewhere.
- If Jamendo or the stream is unreachable, show one quiet line, "Music unavailable — the timer continues.", and the session runs unchanged.
- External dependency isolation: music failure degrades music only; no Planner or flashcard feature waits on it.
- Story 11.1 gate: before building, record the current Jamendo API terms (the terms page was dated 2013) and do a listening check of `tags=lofi,chillout`. If either fails, stop and re-decide the music source through a sprint change.

## Technical Decisions

- `apps/web/lib/music/` defines a `MusicSource` interface (search by query/tags; stream URL by track id) with one implementation, `jamendo.ts`. It is the only module allowed to make outbound HTTP.
- Route Handlers: `GET /api/planner/music/search?q=&tags=` and `GET /api/planner/music/[trackId]`. They return `{ id, title, artist, licence, licenceUrl, streamUrl, duration }` in the standard envelope, cached one hour; 401 without a session; a Jamendo failure returns 502 in the error envelope and is logged, never thrown into a page.
- `JAMENDO_CLIENT_ID` is required by the Config Zod schema from Story 11.1 onward (set on Vercel before deploy); Epics 8–10 boot without it.
- Adapter is unit-tested against recorded responses.
- Data: nullable JSON `musicTrack` of shape `{ source, trackId }` on both `TaskCategory` and `Task` (source "jamendo", so a second source is additive). Migration must be deployed to Neon together with the code. The planner section of `backupExportSchema` must carry both fields.
- Playback is a plain client-side `<audio>` element (needed for per-session fade); never an iframe.

## UX & Interaction Patterns

- Music field lives in the Category edit modal (reusing its name and tint rows) and in Task edit; it searches Jamendo and stores the chosen track.
- Music player: a card-surface strip under the Pomodoro countdown showing title · artist · licence link in small body text, a pause button and a volume slider. Quiet voice: the unavailable line is plain, not playful.
- Pomodoro does not enter focus mode; the only sound the product makes is the music the user chose.

## Cross-Story Dependencies

- Build order is strict: 11.1 (adapter, API, config) -> 11.2 (storage and picker, uses the search API) -> 11.3 (player, uses stored track and the track endpoint).
- Depends on Epic 8 (Categories and Tasks, the Category modal) and Epic 9 (Pomodoro screen, focus session and break lifecycle).
- Epic 8's Categories modal anticipates the Music field added here.
