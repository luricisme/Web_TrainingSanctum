---
title: 'Story 6.6: Input Border Contrast'
type: 'chore'
created: '2026-11-14'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
baseline_commit: '30f750b4cf85a1107ec7c30986b8abac7572868e'
context:
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/DESIGN.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/EXPERIENCE.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/.working/design-dna-profile.json'
  - '{project-root}/.claude/skills/design-dna/references/generation-guide.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The `border` token measures 1.30:1 (light) and 1.59:1 (dark) against the panel, so an empty input has no visible boundary. DESIGN.md records this as a known gap to fix when next touched.

**Approach:** Darken `--color-border` in both themes to at least 3:1 against `bg` and `card`, and record the measured ratios in DESIGN.md. Inputs, selects and the Add cards fields already use `border-border`, so they pick up the new value and keep their focus and error states. For tile edges, card hairlines and the XP ring track, either raise them to 3:1 or record in DESIGN.md that they are accepted, with the reason. UI conforms to DESIGN.md tokens and the Design DNA design_style; passes the anti-generic UI rules; checked against a screenshot in both dark and light themes.

</frozen-after-approval>

## Implementation Notes

Decisions made at planning time (the user would not notice these choices, so they are recorded here, not asked):

- New values, measured with the WCAG 2.x formula: light `#838a98` is 3.18 on `bg` and 3.47 on `card`; dark `#656b80` is 3.41 on `bg` and 3.10 on `card`. Both keep the existing blue-grey hue.
- `border-border` is also used by secondary pills, the card-viewer arrows and the dashed drop zones. They are UI boundaries too, so they darken along with the inputs. The pill hover (`hover:border-foreground-tertiary`) stays darker than the resting border in both themes.
- Tile edges (`divider`, tint borders), card hairlines and the XP ring track are accepted, not raised. Reason: forcing 3:1 on pastel tiles would give them heavy outlines against the Pastel Frame design; each is identified by its text and icon, and the XP value is also written out.
- Files: `apps/web/app/globals.css` (lines 19 and 67), DESIGN.md (`border`, `border-dark` tokens, the Borders line, the Accessibility section).
- Run the e2e suite in PowerShell (Vitest and Playwright fail under Git Bash).
- Implemented: `globals.css` `--color-border` (both themes) and DESIGN.md (tokens, Borders line, Accessibility section). No component code changed. E2E: 139 of 139 pass (PowerShell). Screenshots (light and dark) checked: the Cancel pill outline is clearly visible; inputs were in focus state in the captures.

## Review Triage Log

- Borders line in DESIGN.md not updated: medium, real (line still described the old role). Patched.
- `border` also used as the XP bar track and `input-underline` token: low-medium, real for the XP bar (`empty-due-queue.tsx`, `track="bg-border"`); the track is now heavier but the accent fill still contrasts. Documented in the Borders line. `input-underline` has no consumer in code.
- Dark `border` on `card` is 3.10, thin margin; no formula recorded: low, rejected. DESIGN.md already states WCAG 2.x and the values were computed with it.
- `border` on `elevated` is below 3:1: low, rejected. Documented as a surface where inputs must not sit; no input sits there today.
- Hover and focus not re-verified: low, rejected. Pill hover also changes fill; focus uses the accent border plus a 2px outline, error uses the error colour. All remain distinct from the grey resting border.
- No automated contrast guard and no recorded screenshot evidence: low, rejected for the guard (two tokens, one-off); screenshot evidence added to Implementation Notes.
