---
title: 'Paste Import: Term and Card Separators'
type: 'feature'
created: '2026-11-12'
status: 'done'
baseline_commit: '0fe79a984e5c6ec2087587ebfdddcc657ce1a26a'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/spec-3-1-paste-import-with-review-editor.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/DESIGN.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/EXPERIENCE.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/history/focus-indigo/working/design-dna-profile.json'
  - '{project-root}/.claude/skills/design-dna/references/generation-guide.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Paste import (Story 3.1) has a single "Delimiter" select and always treats one line as one card. Users cannot paste Quizlet-style exports such as `a-b;c-d` or `a:d;b:e`, where both the term/definition separator and the card separator are their choice.

**Approach:** Replace the single select with two Quizlet-style choices:
- **Between term and definition:** Tab / Comma / Custom.
- **Between cards:** New line / Semicolon / Custom.

Each Custom option has a text input. The parse domain splits the text into cards with the card separator, then splits each card with the term separator. Review and Results label rows by line number in New line mode and by card number otherwise. A live "N cards found" count sits under the paste box.

## Boundaries & Constraints

**Always:**
- Decisions (2026-11-12, user):
  - Use the Quizlet option sets above.
  - Label rows "Card N" (the card's 1-based position among non-blank cards) when the card separator is not New line. In New line mode keep the current line-number labels ("L14" / "line 14").
  - Show only a live count under the paste box. Preview still opens the review editor.
- A Custom separator is matched literally, with no trimming and no regex. For example, `-` splits `a-b`.
- An empty Custom separator blocks Preview with the inline message "Enter a separator."
- The term and card separators must differ. If they are equal, show "Use different separators for terms and cards."
- Line breaks always separate cards too. With `;`, the text `a-b;c-d⏎e-f` gives 3 cards.
- Blank or whitespace-only cards produce no row.
- A card still splits on the first term separator only. Trimming, Unicode preservation and duplicate rules are unchanged from Story 3.1.
- The 200 limit counts cards, with the message "Paste at most 200 cards per import."
- A card with no term separator shows "No separator found".
- The live count uses the same domain parser as the server.
- Defaults are Tab and New line. With those defaults, existing tab-separated pastes behave exactly as before.

**Never:**
- No full live card list under the paste box.
- No auto-detection of separators.
- No regex or escape syntax in Custom.
- No changes to the batch commit route or Manual mode.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Custom term + semicolon | `a-b;c-d`, term `-`, cards `;` | Card 1 a/b, Card 2 c/d | N/A |
| Custom both | `a:d;b:e`, term `:`, cards `;` | Card 1 a/d, Card 2 b/e | N/A |
| Comma + newline | `hi,xin chào, bạn` | L1 term `hi`, definition `xin chào, bạn` | N/A |
| Mixed breaks | `a-b;c-d⏎e-f`, cards `;` | 3 cards: Card 1, 2, 3 | N/A |
| Trailing separator | `a-b;c-d;` | 2 cards; the empty tail is ignored | N/A |
| No term separator | `a-b;cd` with term `-` | Card 2 term `cd`, problem "No separator found" | Fixable |
| Custom empty | Custom selected, input blank | Preview blocked | "Enter a separator." |
| Same separators | term `;`, cards `;` | Preview blocked | "Use different separators for terms and cards." |
| Over limit | 201 cards on one line with `;` | No rows | 400 "Paste at most 200 cards per import." |
| Default unchanged | Tab + New line, Story 3.1 input | Same rows and line labels as before | N/A |

</frozen-after-approval>

## Code Map

- `packages/domain/src/import.ts`
  - Currently holds `IMPORT_DELIMITERS`, `DEFAULT_IMPORT_DELIMITER`, `delimiterValue`, `splitLines`, `countNonBlankLines`, `importParseSchema` (`delimiter` enum), `parseImportBlock(text, delimiter)`, `ParsedRow{line,...}`, `previewImport` (sets `duplicateOfLine`), `MAX_IMPORT_LINES`, `IMPORT_LINE_LIMIT_MESSAGE` and `NO_DELIMITER_MESSAGE`.
  - Replace these with separator-based equivalents. Keep `detectDuplicates`, `normalizeTermKey` and `validateImportCard` as they are.
- `apps/web/app/api/import/parse/route.ts` -- destructures `delimiter`. Switch it to the two separators.
- `apps/web/app/(shell)/flashcards/[id]/import-paste.tsx`
  - The single `<select>` (L54-69) and the hint text "One card per line…".
  - `SourceSwitcher` stays as it is.
- `apps/web/app/(shell)/flashcards/[id]/add-cards-panel.tsx` -- `delimiter` state (L76), the parse mutation (L92, L307), and the props passed to `ImportPaste` (L414).
- `apps/web/app/(shell)/flashcards/[id]/import-review.tsx`, `import-results.tsx`
  - Line labels and the "Duplicate of line N" note. These need a label mode ("line" | "card").
  - The commit row's `line` carries the label number (the line in New line mode, the card ordinal otherwise). The batch route echoes it unchanged.
- Tests to update:
  - `tests/domain/import.test.ts` (delimiter cases, L82-92, L171-203).
  - `tests/api/import.spec.ts` (`delimiter:` bodies, L57-284).
  - `tests/e2e/import.spec.ts` ("No delimiter found" assertions, L86 and L98).

## Tasks & Acceptance

**Execution:**
- [x] `packages/domain/src/import.ts`
  - Add `TERM_SEPARATORS` (tab, comma, custom), `CARD_SEPARATORS` (newline, semicolon, custom) and a `resolveSeparators` helper.
  - Schema body becomes `{flashcardId, text, termSeparator:{kind, custom?}, cardSeparator:{kind, custom?}}`, with the empty/equal refinements and the 200-card limit.
  - `parseImportBlock(text, separators)` returns `ParsedRow{line, card, term, definition, error?}`. `previewImport` also returns `duplicateOfCard`.
  - Export a `countImportCards` helper for the live count.
  - Remove the old delimiter exports.
- [x] `apps/web/app/api/import/parse/route.ts` -- accept the new body and pass the separators through.
- [x] `apps/web/app/(shell)/flashcards/[id]/import-paste.tsx`
  - Replace the select with two labelled groups, each a native `<select>` with a Custom option that reveals a short mono text input.
  - Show the inline validation messages.
  - Add the `aria-live="polite"` count, "N cards found" (or "1 card found"), using `countImportCards`.
  - Change the hint to "Up to 200 cards."
- [x] `apps/web/app/(shell)/flashcards/[id]/add-cards-panel.tsx` -- hold the separator state (defaults Tab / New line) and send it to parse.
- [x] `apps/web/app/(shell)/flashcards/[id]/import-review.tsx`, `import-results.tsx`
  - Label rows "Card N" when the card separator is not New line, otherwise keep line labels.
  - The duplicate note reads "Duplicate of card N" or "Duplicate of line N" to match.
- [x] Tests:
  - Domain tests for every matrix row.
  - Update the API bodies, and add one API case for `a-b;c-d`.
  - E2E: custom `-` with `;` → preview shows "Card 1", "Card 2" → save, plus the live count.

**Acceptance Criteria:**
- Given the Paste view, when I choose Custom `-` and Semicolon and paste `a-b;c-d`, then "2 cards found" shows, and Preview opens two rows labelled Card 1 and Card 2 that save as two Cards.
- Given the default separators, then every Story 3.1 test still passes, apart from the updated delimiter request shape and message text.
- The UI conforms to the DESIGN.md tokens and the Design DNA design_style, passes the anti-generic UI rules, and is checked against a screenshot in both dark and light themes.

## Implementation Notes

- The parse response keeps `line` and adds `card` per row (`duplicateOfCard` was dropped in review: the client derives repeats itself). The review editor picks the label number at Preview (`labelMode`, snapshotted so later separator changes cannot relabel the rows) and sends it as the commit row's `line`.
- `countImportCards(text, cardSeparator)` only needs the card separator and returns null for an empty Custom value; the paste view then shows no count.
- An empty Custom value is reported when Preview is pressed (focus moves to that input). Equal or overlapping separators (one contains the other) are reported as soon as they clash, under the Custom group (the term group when both or neither are Custom). Custom values are capped at 10 characters and may not contain a line break. Both block Preview on the client, and the schema rejects them on the server (`path: [field, "custom"]`).
- "Card N" labels use body-small sans (not mono, which DESIGN.md reserves for numeric displays); `ManualRow`'s label gained an optional `wide` flag so "Card 12" fits.
- The empty-paste message stays "Paste some lines to import."; it also covers a paste made only of card separators (e.g. `;;;`).

## Spec Change Log

## Review Triage Log

Pass 1 (2026-11-12). Layers: blind-hunter, edge-case-hunter, verification-gap (no gaps), design-fidelity.

| # | Layer | Finding | Verdict | Route | Evidence |
|---|-------|---------|---------|-------|----------|
| 1 | blind, edge, vgap | A paste of only card separators (`;;;`) opens an empty review | medium | patch | The schema checks only `text.trim()`; `splitCards` returns [] |
| 2 | blind, edge, vgap | Separators that contain one another pass and every card says "No separator found" | medium | patch | `resolveSeparators` compares with `===` only; cards split before terms |
| 3 | edge | A Custom value with a line break (API) never matches | low | patch | Lines split first; one-line refine |
| 4 | blind | A Custom value has no length cap | low | patch | `custom: z.string().optional()`; trivial `.max` |
| 5 | blind, edge | The equal-separators error and focus always land on "Between cards" | low | patch | `resolveSeparators` returns `field: "cardSeparator"` for the clash |
| 6 | blind | `attempted` never resets | low | patch | State set on a failed Preview is never cleared |
| 7 | blind | The live count re-splits the paste on every render | low | patch | No memo; trivial `useMemo` |
| 8 | blind | The over-limit count is shown only as red text | low | patch | Message constant exists; direct use |
| 9 | blind | The hint lost the format rule | low | patch | The copy now says only "Up to 200 cards." |
| 10 | design | A focused invalid select shows the accent border instead of error | low | patch | `selectClass` lacks the aria-invalid focus variant the inputs have |
| 11 | blind | `duplicateOfCard` is returned but never read | low | patch | No client read; direct deletion |
| 12 | blind | Story 3.1 presets (em dash, colon…) were removed | false | reject | The user chose the Quizlet option set on 2026-11-12 (frozen decision) |
| 13 | blind | The commit `line` carries the card number in card mode; the over-limit fallback would read "Card 201" | low | reject | The client caps at 200 cards, so the fallback is never reached; the batch route is out of scope (Never) |
| 14 | blind | The source line is not shown in card mode | low | reject | The user chose "Card N" labels |
| 15 | blind | Duplicated Preview guards in the panel and the paste view | low | reject | Harmless defence in depth |
| 16 | blind | Extra test gaps (whitespace Custom, regex characters, CRLF, `;` inside a definition) | low | reject | Literal matching is covered; the cited behaviours follow the frozen rules |
| 17 | design | `font-mono` on the Custom separator input | low | reject | The spec's Tasks call for a mono input; DESIGN.md already allows mono for the paste box |
| 18 | design | DESIGN.md / DNA still describe a single delimiter select and line-number reporting | low | defer | Planning documents need an update; not code |
| 19 | design | The accent `focus:outline` is used instead of `focus-ring` | low | reject | Pre-existing `inputClass` pattern |

## Verification

**Commands:**
- `npm test`, `npm run lint`, `npm run typecheck` -- clean
- `BETTER_AUTH_URL=http://localhost:3100 npx playwright test tests/api/import.spec.ts tests/e2e/import.spec.ts tests/e2e/cards.spec.ts` (with `apps/web/.env.local` sourced) -- pass
