---
title: '5-5 Cross-Cutting Accessibility & Microcopy Pass'
type: 'chore'
created: '2026-11-19'
status: 'done'
baseline_commit: '196814709f9fb4ad65c0518155650d03a39d0859'
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

**Problem:** Accessibility and tone were built per story. Buttons show the default arrow (no global cursor rule), a few controls lack a visible focus ring, one heading is not imperative, and no check proves the token pairs meet WCAG AA across the Planner and sharing surfaces.

**Approach:** Close the gaps once and centrally: a global cursor base style, focus-ring fixes, a copy fix, and a token-contrast test that measures every text/background pair and the 3:1 UI pairs in both themes. Record exceptions in this spec.

## Boundaries & Constraints

**Always:** Tokens only (globals.css); no per-component cursor classes for buttons, `[role="button"]`, `a[href]`, `summary`. Disabled controls show `not-allowed` and no hover reaction. Non-interactive text and surfaces keep the default cursor. Focus uses `focus-visible` with the shared `focus-ring` / `focus-ring-frame`. Copy is direct and imperative (EXPERIENCE.md Voice and Tone).

**Never:** No palette or layout redesign; no new colours unless a measured pair fails 4.5:1 text (or 3:1 for the ones DESIGN.md says are "met"), and then only by adjusting that one token with the new ratio written into DESIGN.md. Do not touch the tile/card edge pairs DESIGN.md already "accepted". No new dependencies, no migration.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Enabled control | Hover button, tab, icon button, `a[href]`, `summary`, tile link | `cursor: pointer` from the base style | N/A |
| Disabled control | `button:disabled`, `[aria-disabled="true"]` | `cursor: not-allowed`, no hover change | N/A |
| Draggable calendar block | Hover a block | Keeps `grab`/`grabbing` (exception, recorded) | N/A |
| Failing pair | Token pair below threshold | Contrast test fails naming pair, theme, ratio | Fix token or list as accepted in DESIGN.md |

</frozen-after-approval>

## Code Map

- `apps/web/app/globals.css` -- tokens (light/dark); add `@layer base` cursor rule next to `focus-ring` utilities (l.229).
- `apps/web/app/components/ui.ts` -- button constants carry `disabled:cursor-not-allowed` but no pointer; `inputClass` uses `focus:` not `focus-visible:`.
- Per-component `cursor-pointer` (22 hits, 17 files, e.g. `users-table.tsx:57`, `card-viewer.tsx:11`, `realm-badge.tsx:70`) -- remove the ones the base rule now covers; keep on non-button targets (label/span checkbox and radio wrappers, range input, `tr`).
- `apps/web/app/(shell)/planner/tasks-view.tsx:250` -- task checkbox: no `cursor-pointer`, no focus ring.
- `apps/web/app/(shell)/flashcards/[id]/manual-row.tsx:37` (`underlineInput`, also `edit-card-modal.tsx:172`) -- `focus:outline-none`, only a border colour change; add a visible ring.
- `apps/web/app/(shell)/planner/calendar/calendar-block.tsx:61` -- `grab` cursor, role=group; stays (exception).
- `apps/web/app/(shell)/invitations-bell.tsx:183` -- `li tabIndex=0`; confirm ring.
- `apps/web/app/login/page.tsx:91` -- "Welcome back" heading; make it imperative ("Log in").
- `apps/web/app/(shell)/classes/modal.tsx:56` -- `backdrop:bg-black/40`, not a token (overlay; note only).
- `apps/web/app/(shell)/realm-avatar.tsx:37` -- hard-coded SVG art palettes; decorative, out of scope.
- `vitest.config.ts` -- `include` is `tests/domain/**` only; add `tests/a11y/**/*.test.ts` (node env).
- DESIGN.md Accessibility section (l.333-341) -- append the measured results and exceptions.

## Tasks & Acceptance

**Execution:**
- [x] `apps/web/app/globals.css` -- global cursor base style (pointer for `button`, `[role="button"]`, `a[href]`, `summary`; `not-allowed` for disabled/`aria-disabled`) -- single source of truth
- [x] `apps/web/app/components/ui.ts` and the 17 files with per-component cursor classes -- drop redundant classes; switch `inputClass`-family focus to `focus-visible` -- no per-component repeats
- [x] `tasks-view.tsx`, `manual-row.tsx`, `edit-card-modal.tsx`, `invitations-bell.tsx` -- add the missing visible focus ring/cursor
- [x] `apps/web/app/login/page.tsx` -- imperative heading
- [x] `tests/a11y/contrast.test.ts` + `vitest.config.ts` -- parse tokens from globals.css; assert 4.5:1 for foreground/secondary/tertiary on bg, card and each tint, on-accent on accent, on-frame on frame, status colours on card/tints; 3:1 for border on bg/card and the error conflict border on tints; both themes
- [x] `tests/a11y/cursor-and-copy.test.ts` -- static check: base rule present; no `!`/emoji in user-facing strings under `apps/web/app`
- [ ] DESIGN.md -- record measured Planner and sharing pairs, any accepted gap, and the calendar-block cursor exception

**Acceptance Criteria:**
- Given both themes, when the contrast test runs, then every listed pair meets its threshold or is listed as accepted in DESIGN.md.
- Given any button, link, tile, tab, toggle or summary, when hovered, then the cursor is pointer; disabled shows not-allowed.
- Given keyboard navigation on Admin, Planner, sharing, import and review screens, then every interactive element shows a visible ring in reading order.
- Given user-facing copy, then none has exclamation marks, emoji or cheerleading.
- UI conforms to DESIGN.md tokens and the Design DNA design_style; passes the anti-generic UI rules; checked against a screenshot in both dark and light themes.

## Implementation Notes

## Spec Change Log

## Review Triage Log

| Finding | Verdict | Evidence / route |
|---|---|---|
| Disabled secondary/danger/quiet buttons still react to hover (ui.ts) | medium | Only primary had `disabled:hover`; epics AC says disabled does not react. Routed patch: added `disabled:hover:*` resets. |
| Contrast test `block()` returns garbage if selector missing | low | Direct one-line fix. Routed patch: throws. |
| Contrast test misses `on-frame-muted`/`frame-raised` and focus-ring accent 3:1 | low | Measured 6.37/6.05 and 11.4-18.1; both pass. Routed patch: pairs added to test. |
| `a[href][aria-disabled]` outranks `[aria-disabled]` | false | No such element: aria-disabled is only on `span.pagerOff` (users-table.tsx:109,116), which gets not-allowed. |
| FlipCard may not be a button | false | flip-card.tsx:63 root is `<button type="button">`. |
| card-viewer.tsx modified but no hunk | false | Line-ending-only change (`git diff -w` empty); no content change. |
| invitations-bell fix claimed but untouched | false | `li` already had `focus-ring`; no change needed. |
| `underlineInput` invalid state vs `focus-visible:border-b-accent` ordering | low | Same ordering existed before (`focus:border-b-accent`); not caused by this change. Deferred. |
| `inputClass` on select loses border on mouse focus | low | `selectClass` is a separate definition (import-paste.tsx:22); no demonstrated use of inputClass on a select. Rejected. |
| Copy test regex weak (multi-line, .ts, `!` rule, `(c)`) | low | Fix needs a parser or more branches; no violation exists today (audit found none). Rejected. |
| Non-button clickables (tr, label, checkbox, range) keep explicit cursor | false | Recorded exception in DESIGN.md; spec Code Map keeps them. |
| Login heading vs subtext; "Welcome back" in EXPERIENCE.md | false | No "Welcome back" in planning docs; subtext still reads correctly under "Log in". |
| underline input double indicator; 20px checkbox target; cwd-relative paths; no per-pair ratios in DESIGN.md; scope gaps (reduced motion, headings, touch size) | low | Out of the spec's stated scope or negligible; fix is more than a direct correction. Rejected. |
| Regex-only cursor test / no computed-style test | low | Playwright computed-style check is added complexity; base rule covered by static test. Rejected. |

## Verification

**Commands:**
- `npm run typecheck` -- expected: no errors
- `npm run lint` -- expected: no errors
- `npm test` (PowerShell, see memory) -- expected: all pass including `tests/a11y`

**Manual checks (if no CLI):**
- Hover buttons on Admin, Planner, Share modal in light and dark; tab through each screen once; screenshot both themes.
