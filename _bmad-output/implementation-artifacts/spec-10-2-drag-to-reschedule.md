---
title: '10-2 Drag to reschedule'
type: 'feature'
created: '2026-11-18'
status: 'done'
baseline_commit: '7eb9379b5026dc488e0f07fc3b92f5de74e5c414'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/DESIGN.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/EXPERIENCE.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/.working/design-dna-profile.json'
  - '{project-root}/.claude/skills/design-dna/references/generation-guide.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The Calendar (Story 10.1) is read-only. A user cannot move a Task to another time or day, give a tray Task a start, or clear one, except through the Task form.

**Approach:** Make blocks and tray chips movable by pointer drag and by keyboard, saving through the existing `PATCH /api/planner/tasks/[id]` (`localDay` + `startTime`). The move is optimistic on the week query, rolls back and shows an inline error on failure. A pure domain helper owns 15-minute snapping and keyboard stepping.

## Boundaries & Constraints

**Always:**
- Drop on a day column sets `localDay` and a start snapped to 15 min (clamped 00:00–23:45). Drop on a day's tray sets that `localDay` and `startTime: null`. Dropping a chip on the grid gives it a start; a block on a tray clears it.
- Drag uses Pointer Events (mouse and touch), no new dependency. The block's top follows the pointer; the grab offset is kept. A drag under ~4px is not a drag. Esc during a drag cancels.
- Keyboard (UX-DR29): a focused block or chip is selected with Enter or Space; arrows move it 15 min (up/down) or one day (left/right) within the shown days; Enter commits; Esc cancels and restores. Moves are announced in an `aria-live` region ("Moving {title}: Tuesday 19:15").
- The write is the existing PATCH; nothing else changes on the Task. Estimate, sessions, overrun count, category, done are untouched. A failed PATCH restores the cache and shows a `role="alert"` line "Could not move {title}. Try again." that dismisses on the next move or on close.
- The week query refetches after settle. Overlaps stay drawn, never blocked (conflict from 10.1 recomputes from the optimistic data).
- Done Tasks and midnight-continuation blocks are not draggable (move the start block). Under 640px chips and the one shown day are the drop targets; tray is the chip row.
- Draggable blocks use `touch-action: none` only while dragging so grid scrolling still works. A moving block is lifted with the existing `shadow-low` token and the accent focus ring; colours only from tokens.
- UI conforms to DESIGN.md tokens and the Design DNA design_style; passes the anti-generic UI rules; checked against a screenshot in both dark and light themes.

**Never:**
- No new route, no migration, no change to the PATCH schema or XP paths. No `startAt` rewrite on session start, progress fill or overrun length (Story 10.3). No resizing blocks, no multi-select, no drag across weeks.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Block to new time | Drag Tue 19:00 block to Wed, y at 20:07 | PATCH `{localDay: Wed, startTime: "20:00"}`; block jumps there at once | Failure: back to Tue 19:00, alert |
| Tray to grid | Drag chip onto Thu at 09:20 | PATCH `{localDay: Thu, startTime: "09:15"}`; chip becomes a block | Failure: chip returns |
| Block to tray | Drag block onto Fri tray | PATCH `{localDay: Fri, startTime: null}`; block becomes a chip | Failure: block returns |
| Snap near end | Drop at 23:58 | Start clamps to 23:45; block clipped at midnight as in 10.1 | N/A |
| Drop outside | Release over nothing | No PATCH; item back where it was | N/A |
| Same place | Drop on its own slot | No PATCH | N/A |
| Keyboard | Select, ArrowDown ×2, ArrowRight, Enter | PATCH +30 min, +1 day; Esc instead: no PATCH, original shown | Last day: ArrowRight stays |
| Done Task | Pointer or Enter on a done block | Nothing moves; no selection | N/A |

</frozen-after-approval>

## Code Map

- `packages/domain/src/calendar.ts` -- add pure `snapStartMinutes(rawMin)` (round to 15, clamp 0–1425), `stepSlot({day, startMin}, key, days)` for keyboard, `formatStartTime(min)`; export via `index.ts`. Do not touch `layoutCalendarDay`/`layoutWeek`.
- `apps/web/app/api/planner/tasks/[id]/route.ts` -- PATCH already handles `localDay`/`startTime`/`null`; reuse unchanged.
- `apps/web/app/(shell)/planner/calendar/calendar-view.tsx` -- hold drag/selection state, `useMutation` with `onMutate` (cancel + snapshot + `setQueryData` on `plannerWeekKey(monday)`), `onError` rollback, `onSettled` invalidate; day columns carry `data-day-column`, trays `role="group"`; add drop-target hit-testing by `data-day-column` / tray and the live region.
- `apps/web/app/(shell)/planner/calendar/calendar-block.tsx` -- `CalendarBlock` and `TrayChip` get pointer/key handlers (`onPointerDown` etc.), `aria-grabbed`-free: use `aria-describedby` hint "Press Enter to move"; keep `minutePx`.
- `apps/web/app/(shell)/planner/tasks-key.ts` -- reuse `plannerWeekKey`, `shiftDay`, `formatDay`.
- `apps/web/app/(shell)/planner/tasks-view.tsx` -- reference for mutation/invalidate pattern; do not change.
- DESIGN.md -- amend the calendar line: drag/keyboard built (Story 10.2).
- Tests: `tests/domain/calendar.test.ts` (extend), `tests/api/planner-tasks.spec.ts` (extend: move keeps estimate/sessions, null clears start), `tests/e2e/planner-calendar.spec.ts` (extend).

## Tasks & Acceptance

**Execution:**
- [x] `packages/domain/src/calendar.ts`, `tests/domain/calendar.test.ts` -- snap, clamp, keyboard step helpers with unit tests for the matrix rows
- [x] `calendar-view.tsx`, `calendar-block.tsx` -- pointer drag, drop targets, optimistic mutation with rollback and alert, keyboard select/move/commit/cancel, live region
- [x] `tests/api/planner-tasks.spec.ts` -- PATCH move preserves estimate, sessions and overrun; `startTime: null` clears `startAt`
- [x] `tests/e2e/planner-calendar.spec.ts` -- drag block to new time/day, chip to grid, block to tray, keyboard move + Esc, rollback on forced PATCH failure
- [x] `DESIGN.md` -- note drag and keyboard move built

**Acceptance Criteria:**
- Given a scheduled block, when I drag it to another slot, then it appears there immediately and persists after reload.
- Given a failing save, when I drop, then the block returns and an inline error is announced.
- Given a focused block, when I press Enter, arrows, Enter, then the Task moves in 15-minute and one-day steps; Esc leaves it unchanged.

## Implementation Notes

## Spec Change Log

## Review Triage Log

| Finding | Verdict | Evidence / route |
|---|---|---|
| Touch drag never starts: `touch-none` only once lifted, so the browser pans and fires `pointercancel` (all four layers) | medium | `moveClass` sets it only when `move.lift`, which exists after the threshold. Route: patch (touch pointers use a short long-press, then drag; moving before it fires cancels and lets the page scroll). |
| Concurrent moves: `onError` restores a whole-cache snapshot (blind, edge) | low | `onSettled` refetch masks it, flicker only. Route: patch (restore only the failed Task's fields). |
| `stepSlot` keeps off-grid starts (19:05 → 19:20) (blind, edge) | medium | Verified in `stepSlot`. Route: patch (snap the base first) plus unit test. |
| Keyboard ←/→ targets hidden days below 640px (blind, edge) | medium | `stepSlot` gets the full week. Route: patch (pass only the shown day on the narrow layout). |
| No edge auto-scroll while dragging (blind, edge) | medium | Scroller shows ~11h; with touch scroll blocked, far slots unreachable. Route: patch (scroll the grid while the pointer sits in its top/bottom edge). |
| Stuck drag after lost `pointerup` or window blur (blind, edge) | low | `dragRef` guard then blocks later drags. Route: patch (cancel on window blur). |
| Continuation block not draggable is untested; threshold and pointer-Esc untested (verification-gap) | medium | Pre-verified. Route: patch (e2e cases). |
| Keyboard e2e fails on Sundays; Esc check ignores weekday (verification-gap) | medium | `OTHER` goes off the week edge on Sunday. Route: patch. |
| Move alert is neutral text, not `error` (design) | low | Route: patch (match the existing inline failure alerts in Planner). |
| Lift shadow, accent ring, ghost outline and drop-tray fill not in DESIGN.md (design) | low | Route: patch (document them under the calendar-block rule). |
| `snapStartMinutes(NaN)` returns NaN (blind) | low | Direct one-line fix. Route: patch plus unit test. |
| Hygiene: `ghostFor` twice, double blank line, `MoveProps.lift` comment, unchecked boxes (blind) | low | Route: patch. |
| `cursor-grab` per component breaks the cursor rule (design) | false | The DESIGN.md row says "per component, or leave default". |
| Second-pointer commit; lingering alert across weeks; refocus ref lingering; silent drop when Task vanishes; announce-before-save; extra aria roles; `z-[5]`; API test lacks overrun/category/startAt; e2e `waitForTimeout`; duplicated `data-task-id`; `Drag` copies stale | low | Rare or cosmetic and each fix adds branches or surface. Route: reject. |
| `monday` null in `onMutate` (edge) | false | Tasks exist only after the week query loaded, so `monday` is set. |
| `.working/design-dna-profile.json` missing (design) | n/a | Not a code defect; the superseded profile was used. Noted for the user. |
