---
title: 'Story 4.5: Focus Mode & Empty Due-Queue State'
type: 'feature'
created: '2026-11-13'
status: 'done'
baseline_commit: 'f3a55b29a0fa841234e4be50931b536aa665e9be'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/DESIGN.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/EXPERIENCE.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/.working/design-dna-profile.json'
  - '{project-root}/.claude/skills/design-dna/references/generation-guide.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Review and Learn sessions render inside the full app shell, so the sidebar competes with the card (FR-11). When nothing is due, Review shows only a bare "all caught up" line, which gives the user no next step.

**Approach:** The shell gets a client-side focus-mode flag. Review and Learn turn it on while a session is loading or has a card on screen, and turn it off when the session finishes, errors or unmounts. While the flag is on, the sidebar is not rendered. When Review has nothing due, at the start or after the queue is cleared, it shows the Empty due-queue state. That state has a calm line plus up to 3 Flashcards with Unlearned Cards ("Weather idioms · 12 new"), each linking to its page. When no such Flashcard exists, it shows a "+ Add card" button instead.

## Decisions (2026-11-13)

- **Exit:**
  - A quiet neutral "Exit" text button sits above the card, top-left of the stage.
  - Esc does the same, with the existing key guards: ignored in text fields and with modifiers.
  - Review exits to its scope page (`/classes/{id}` or `/folders/{id}`), or `/classes` when unscoped. Learn and practice exit to `/flashcards/{id}`.
  - Shown only while focus mode is on.
- **Streak:** left out of the Empty due-queue state. A deferred-work entry makes Story 5.1 add it there.
- **"+ Add card":**
  - It targets `/flashcards/{id}?add=1`, and `?add=1` auto-opens the Add cards panel in Manual mode.
  - The target is the Flashcard of the user's newest Card, or else their newest Flashcard, within scope when scoped.
  - With none, the button links to `/classes`.
  - There is no Flashcard picker; it is deferred.
- **Spec size:** the full spec is kept at about 2,100 tokens.

## Boundaries & Constraints

**Always:**
- Focus mode lives in client state, provided once in `(shell)/layout.tsx`. No route-specific checks in the Sidebar and no new layout files.
- Chrome comes back on finish, error, empty queue and unmount, including browser Back and in-app links.
- Unlearned counts use the AD-14 builders over the user's studied directions (`unlearnedRecordWhere(dirs)` / `unlearnedCardWhere(dirs)`), with the same `newCards` semantics as `countLearn`.
- A scoped Review (`?classId=` / `?folderId=`) limits the list to its scope and names the scope in the calm line.
- The list holds at most 3 Flashcards: those with Unlearned Cards, ordered by the newest Card created, most recent first.
- The UI conforms to DESIGN.md tokens and the Design DNA design_style, and passes the anti-generic UI rules. Check it against a screenshot in both dark and light themes. The list uses list rows; "+ Add card" is `button-primary`, and it is the only accent on the screen.

**Never:**
- Change the Review queue contract or ordering, the grade route, SM-2, or the Learn completion screen and practice run.
- Make a streak badge a blocker for this story. No streak model exists until Story 5.1.
- Hide chrome on the Flashcard detail page or in the card viewer.

## I/O & Edge-Case Matrix

| Scenario | State | Expected |
|---|---|---|
| Due entries exist | `/review`, loading then card on screen | No sidebar from first paint of the session through the last card |
| Queue cleared | Last card graded | Sidebar back; Empty due-queue state fetched fresh |
| Nothing due, unlearned exist | `/review` | Sidebar shown; ≤3 Flashcard rows "Name · N new" linking to `/flashcards/{id}` |
| Nothing due, none unlearned | `/review` | Sidebar shown; calm line + "+ Add card" |
| Scoped, nothing due | `/review?folderId=x` | Calm line names the scope; list limited to it |
| Learn running | `/flashcards/{id}/learn` | No sidebar; restored on the completion screen |
| Load error / 404 | Either session | Sidebar shown with the existing error UI |
| Leave mid-session | Back or link | Sidebar shown on the next page |
| One direction studied | D→T only, only T→D unlearned | That Flashcard is not listed |

</frozen-after-approval>

## Code Map

- `apps/web/app/(shell)/layout.tsx`: a server component. Wrap `<Sidebar/>` and `<main>` in a new `FocusModeProvider`. `QueryProvider` stays where it is.
- `apps/web/app/(shell)/focus-mode.tsx` (new, client):
  - `FocusModeProvider`: a context holding `{ focused, setFocused }`.
  - `useFocusMode(active: boolean)`: an effect that sets the flag and clears it on cleanup.
- `apps/web/app/(shell)/sidebar.tsx`: return `null` while focused. It is already hidden below 640px.
- `apps/web/app/(shell)/review/grading-session.tsx`: shared by Review, Learn and practice. Don't change grading logic.
  - Call `useFocusMode(Boolean(current))`.
  - Add an `exitHref` prop. While `current` is set, render the Exit link above `header`.
  - Handle Esc in the existing keydown handler with `router.push(exitHref)`.
- `apps/web/app/(shell)/session-exit.tsx` (new): the Exit link, a neutral `linkClass`-style text link with `aria-keyshortcuts="Escape"`. The loading branches reuse it too.
- `apps/web/app/(shell)/flashcards/[id]/flashcard-detail-view.tsx:76`: initialize `adding` from `useSearchParams().get("add") === "1"` only when the Flashcard is loaded. Then `router.replace` the URL without `?add`.
- `apps/web/app/(shell)/review/review-session.tsx`:
  - Loading branch: `useFocusMode(true)`, via a tiny wrapper component so hooks stay unconditional.
  - Empty snapshot (`entries.length === 0`): render `<EmptyDueQueue>` directly, without `GradingSession`.
  - `finished`: also `<EmptyDueQueue>`.
- `apps/web/app/(shell)/review/empty-due-queue.tsx` (new, client):
  - Query key `["review-empty", queryString]`, data from `GET /api/review/unlearned`.
  - Styling: rows mirror the Flashcard list rows in `folders/[id]/folder-detail-view.tsx`. Button classes come from `app/components/ui.ts`.
- `apps/web/app/(shell)/flashcards/[id]/learn/learn-session.tsx`: loading branch gets `useFocusMode(true)`, the same wrapper as Review.
- `packages/domain/src/review.ts`: add `UnlearnedFlashcardsResponse { flashcards: {id,name,newCards}[]; addCardTarget: {id,name} | null }`. Reuse `reviewQueueQuerySchema` for the scope.
- `apps/web/app/api/review/unlearned/route.ts` (new): reuse from `api/review/queue/route.ts`:
  - `requireSession`;
  - the `reviewQueueQuerySchema` parse, `flashcardId` → 400;
  - `resolveScope` → 404;
  - `getStudiedDirections`.

  New logic:
  - Group unlearned Cards with `prisma.card.groupBy` on `flashcardId`, with `where { userId, ...unlearnedCardWhere(dirs), flashcard scope }`, plus `_count` and `_max.createdAt`. Order by `_max.createdAt` desc and take 3, then read the names.
- **Tests:** `tests/api/review-queue.spec.ts` (fixture helpers), `tests/e2e/review.spec.ts`, `tests/e2e/learn.spec.ts`.

## Tasks & Acceptance

**Execution:**
- [x] `focus-mode.tsx`, `layout.tsx`, `sidebar.tsx`: the provider, the hook, and hiding the sidebar.
- [x] `grading-session.tsx`, `review-session.tsx`, `learn-session.tsx`, `session-exit.tsx`: turn focus on during loading and while a card is on screen, plus the Exit link and Esc.
- [x] `flashcard-detail-view.tsx`: `?add=1` opens the Add cards panel.
- [x] `packages/domain/src/review.ts` and the new `api/review/unlearned/route.ts`: the response type and the route.
- [x] `empty-due-queue.tsx` and its wiring in `review-session.tsx`.
- [x] `tests/api/review-unlearned.spec.ts` (new). Cover:
  - the order and the cap of 3;
  - the studied-direction filter;
  - the class/folder scope;
  - 400 on `flashcardId`;
  - 404 on an unknown scope;
  - 401;
  - `addCardTarget` null with no Flashcards.
- [x] `tests/e2e/review.spec.ts` and `learn.spec.ts`. Cover:
  - the sidebar hidden in a session and back after the last grade;
  - the sidebar back after leaving mid-session;
  - Exit and Esc reaching the right page in Review, scoped Review and Learn;
  - the empty state's rows and links;
  - "+ Add card";
  - screenshots of the session and the empty state, in both themes, at 1280px and 390px.

**Acceptance Criteria:**
- Given due cards, when `/review` opens, then the `Main` nav landmark is absent until the session ends.
- Given the existing unit, API and e2e suites, when they run, then they pass. Assertions on the old "all caught up" text may be updated to the new calm line.

## Implementation Notes

- Esc lives in `session-exit.tsx` (one listener per mounted Exit link) instead of the grading-session keydown handler, so the loading screens get Esc too. Same guards: ignored with modifiers and in text fields.
- The scope parse and `resolveScope` moved from `api/review/queue/route.ts` to `apps/web/lib/review-scope.ts` (`readReviewScope`, `scopeFlashcardWhere`), shared by the queue and unlearned routes. Queue behavior is unchanged.
- `useFocusMode` uses a layout effect, so client navigation into a session never paints the sidebar. Before hydration, a CSS rule in globals.css hides it: `:root:has([data-focus-session]) [data-sidebar]`. The stage carries `data-focus-session` on the loading screens, and on the grading stage while a card is on screen.
- The calm line keeps the old "all caught up" wording, so the existing assertions still hold. "Ready to learn" uses `SectionMarker`. Its bullet is the sanctioned non-actionable accent, so "+ Add card" stays the only accent action.

## Spec Change Log

## Review Triage Log

Pass 1. Layers: blind, edge, verification-gap and design-fidelity.

**Patch:**
- **The sidebar flashes before hydration (edge):** medium. `focused` starts false on the server, so the SSR HTML of `/review` or `/learn` includes the sidebar until the layout effect runs. That breaks the matrix row "No sidebar from first paint" on every daily app open. The fix is a CSS fallback: the stage carries `data-focus-session`, and `:root:has([data-focus-session]) [data-sidebar]` hides the aside. Client state stays the source of truth.
- **Esc ignores `defaultPrevented` and IME composition (blind, edge):** low, and the fix is a direct guard. No overlay can be open during a session today, but the guard matches the shell's other Escape handlers.
- **The empty-state load-failure path and "Try again" are untested (verification-gap, pre-verified):** medium. Add an e2e test that aborts once and then continues.
- **Review error screens don't assert the sidebar returns (verification-gap, pre-verified):** medium. Add a `Main` nav check to the scope-error test.
- **`min-h-[60svh]` is an arbitrary value (design):** low, and the fix is a direct correction to `min-h-80`.
- **`max-w-md` is not a token (design):** low, and the fix is a direct deletion. `text-balance` already handles the wrap.
- **"Esc" uses `font-mono` (design):** low, and the fix is a direct deletion. DESIGN.md reserves mono for numbers.
- **"Ready to learn" has no section bullet (design):** low, and the fix is a direct correction to `SectionMarker`. The bullet is a marker, not an action, so the one-accent rule still holds.

**Defer:**
- **The row icon chip uses `bg-card`, but DESIGN.md says `elevated` (design):** low and pre-existing. The same chip appears in `class-row.tsx`, `class-detail-view.tsx` and `folder-detail-view.tsx`, and this change copies them.

**Rejected:**
- **One boolean focus flag could be cleared by an overlapping caller (blind, edge):** false. In a single commit, React runs every cleanup before every setup, so the Loading → GradingSession hand-off ends with the flag on. No two callers ever stay mounted at once.
- **Keyboard focus is lost when the sidebar unmounts (blind):** low. The session's keys are handled on `window`, so the keyboard flow still works. Moving focus means new behaviour.
- **The Exit href is built from the raw query on a bad scope (blind, edge):** low. It shows only on the loading screen, before the 400/404 screen replaces it.
- **Ids are not encoded in Flashcard links (blind):** false. Ids are cuids, and existing links don't encode them either.
- **Exit uses push, so Back re-enters the session (blind):** false. That is normal history behaviour, and the user chose Back.
- **Layout shift while the empty state loads (blind):** low. It is a cosmetic one-frame shift, and reserving the height differs per variant.
- **`?add=1` stays in the URL on a 404 (blind, edge):** low and unlikely. The 404 screen never opens the panel.
- **`router.replace(pathname)` drops other params (edge):** false. No Flashcard link carries other params.
- **Four round trips in the unlearned route (blind):** low. The fallback query runs only when there are no Cards. No soft-delete exists in the schema.
- **Ordering by the newest unlearned Card vs the newest Card (blind, edge):** low. It is a reasonable reading of the Always rule, and the tests pin it.
- **A `createdAt` tie flakes the tests (edge):** false. The tests space `createdAt` explicitly (`review-unlearned.spec.ts:67`).
- **The screenshot tests assert nothing (blind):** the spec requires them. It is the same convention as 4.9.
- **No Esc-in-text-field test, Learn loading untested, no mobile effect (blind):** low. No text field exists in a session, and Learn's test covers the focus flag.
- **`main` keeps the page layout in focus mode (blind):** false. The stage is centred in `max-w-content`, which is what the session layout calls for.
- **The streak is missing (design):** an intended deferral, decided 2026-11-13.

## Verification

**Commands:**
- `npm run typecheck && npm run lint && npm test`: run in PowerShell. Expected clean.
- `npm run test:api && npm run test:e2e` with `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/training_sanctum_test` and `BETTER_AUTH_URL=http://localhost:3100`: expected all pass.

**Manual checks:**
- Session screenshots: only the card, the grade controls and the counter are on screen.
- Empty-state screenshots: one accent element at most.
- No migration in this story.
