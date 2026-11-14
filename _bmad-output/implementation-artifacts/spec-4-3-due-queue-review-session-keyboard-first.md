---
title: 'Story 4.3: Due-Queue Review Session (keyboard-first)'
type: 'feature'
created: '2026-11-13'
status: 'done'
baseline_commit: '235ab738b8d8eda20bd8bddf32fe20dea65bae3d'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/DESIGN.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/EXPERIENCE.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Web_TrainingSanctum-2026-10-29/history/focus-indigo/working/design-dna-profile.json'
  - '{project-root}/.claude/skills/design-dna/references/generation-guide.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `POST /api/review/grade` exists, but `/review` is still a placeholder. Nothing lists due Scheduling Records, so the user cannot study.

**Approach:**
- **Endpoint:** add `GET /api/review/queue` (optional `classId` | `folderId` | `flashcardId`). It returns the user's due records oldest-due-first, one entry per record, with the Card text needed to render each one.
- **Screen:** replace `/review` with a client session screen. It shows one entry at a time on a 640px card that flips in 3D. Space reveals the answer, and 1–4 / J K L ; grade it. Grading advances locally at once and POSTs in the background (AD-7).
- **Entry points:** add "Review this class / folder / flashcard" links that open `/review?<scope>=<id>`.

**Decisions (human, 2026-11-13):**
- **Same-day second grade:** keep 4.2's 409 `NOT_DUE`. The first grade of the day wins. The client treats a 409 as already applied, and the grade route is unchanged. This deliberately refines the epic's "last write wins": two grades never compound.
- **Swipe mapping:** ← Again, ↓ Hard, → Good, ↑ Easy.
- **Flip back and forth (human, after hand-off):** Space and click/tap flip the card both ways. The grade buttons, the grade keys and swipe go live after the first reveal and stay live on either face, until the entry is graded.
- **Spec size:** kept whole at about 2,400 tokens, by user choice.

## Boundaries & Constraints

**Always:**
- **Due rule:** "due" means `nextReviewDate <= now`, the same check the grade route makes. The queue therefore never offers a record the route would refuse with 409.
- **Ordering:** `nextReviewDate` ascending, tie-broken by `cardId` and then `direction` so the order is deterministic.
- **API conventions:** Zod validates the query in `packages/domain`. Use `requireSession` and scope every query by `userId`. Responses use the `{ data }` / error envelopes.
- **One snapshot per session:** the queue is fetched once when the session starts and is not refetched on focus or interval while the session runs. Advancing never waits on the network.
- **Grade failures:**
  - 409 `NOT_DUE` means the grade was already applied: drop the entry silently.
  - Any other failure puts the entry back as the current card, unflipped, and shows a `role="alert"` line: "Your grade wasn't saved. Grade this card again."
- **Card faces:**
  - Overline: `{Flashcard name} · Term → Definition` (or `Definition → Term`).
  - Prompt: the term or the definition, in the `display` role.
  - Answer: the other side in `heading-1` accent. Below it, `body-sm` tertiary shows part of speech, example and context when they are present.
  - Hint below the card: "Click the card, or press Space, to reveal".
- **Grade buttons:** they appear only after the flip, `rounded-full`, and each shows its key (1–4).
  - Again uses error border and text.
  - Hard, Good and Easy are neutral and identical in weight.
- **Progress counter:** mono "X / Y" under the card.
- **Scope header:** a scoped session names its scope in a header line and links back to the scope's page.
- **Keyboard and focus:** keys are ignored when a modifier is held or focus is in a text field. Space must not scroll the page. Every control has a visible `focus-ring`.
- **Mobile:** tapping the card flips it. Once revealed, a swipe ≥ 48px along its dominant axis grades it (mapping per Decisions). Swipe is added to the grade buttons, not a replacement for them, and the button row wraps below 640px.
- **Visual:** UI conforms to DESIGN.md tokens and the Design DNA `design_style`, and passes the anti-generic UI rules. It is checked against a screenshot in both dark and light themes.

**Never:**
- No focus mode (sidebar hiding) and no streak/"+ Add card" empty state. Those belong to 4.5.
  - For now, an empty or finished queue shows a calm line instead of the card: "You're all caught up — nothing is due for review right now." In a scoped session the line names the scope.
- No daily new-card cap; that is 4.4.
- No pin/audio/star icon row. It has no feature behind it.
- No computing SM-2 values on the client.
- No new dependencies, no schema migration, no confetti, sounds or cheer copy.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Default queue | Due records across 2 Classes plus 1 not-due record | Every due record, oldest-due-first; the not-due one is absent; `scope: null` | N/A |
| Both directions due | 1 new Card | 2 entries with the same `cardId` and different `direction` | N/A |
| Scoped | `?folderId=F` | Only records whose Card sits under F; `scope: { kind: "folder", id, name }` | N/A |
| Foreign or missing scope | `?classId=<another user's id>` | 404 `NOT_FOUND` | envelope |
| Two scopes | `?classId=a&folderId=b` | 400 `VALIDATION_ERROR` | envelope |
| No session | no cookie | 401 | envelope |
| Grade OK | Revealed, press `3` | The next entry shows unflipped at once; POST `good` runs in the background | N/A |
| Grade 409 | POST answers `NOT_DUE` | The entry stays gone and no error shows | silent |
| Grade fails | POST answers 500 or the network fails | The entry returns as the current card, unflipped | alert line |
| Prompt keys | Unrevealed, press `3` | Nothing happens; grades need the answer revealed | N/A |

</frozen-after-approval>

## Code Map

- `apps/web/app/api/review/grade/route.ts` -- write path (4.2). Reuse its patterns: `requireSession`, envelopes, owner filter `card: { userId }`. Do not change it (Decisions: 409 stays).
- `apps/web/app/api/flashcards/[id]/route.ts` -- GET pattern with owner-scoped `findFirst` and a 404.
- `packages/domain/src/review.ts` -- home for the queue query schema and the `ReviewQueueEntry` / `ReviewQueueResponse` types. Reuse `RecallDirection` and `REVIEW_GRADES`.
- `packages/db/schema.prisma` -- the chain `SchedulingRecord → Card(userId, flashcardId) → Flashcard(folderId) → Folder(classId)`. `@@index([nextReviewDate])` exists. No migration.
- `apps/web/app/(shell)/review/page.tsx` -- placeholder to replace. `/` already redirects here.
- `apps/web/lib/api-client.ts` -- use `apiFetch` / `ApiError` (`code === "NOT_DUE"`).
- `apps/web/lib/query-provider.tsx` -- QueryClient defaults (staleTime 15 s). Override the review query: `staleTime: Infinity`, `refetchOnWindowFocus: false`.
- `apps/web/app/components/ui.ts` -- `buttonSecondary`, `formErrorClass`, `overlineClass`.
- `apps/web/app/globals.css` -- token layer. Add flip tokens here; there are no inline magic values.
- `apps/web/app/(shell)/{classes,folders,flashcards}/[id]/*-detail-view.tsx` -- add the Review links in the section action row, next to the primary button.
- `tests/api/review-grade.spec.ts`, `tests/e2e/cards.spec.ts` -- the `newUser` / `register` / prisma-seed helpers to copy.

## Tasks & Acceptance

**Execution:**
- [x] `packages/domain/src/review.ts` -- add:
  - `reviewQueueQuerySchema`: optional non-empty `classId`, `folderId` and `flashcardId`, with at most one present. The refine message is "Choose one scope to review."
  - `ReviewScope { kind: "class" | "folder" | "flashcard"; id; name }`.
  - `ReviewQueueEntry { schedulingRecordId, cardId, direction, nextReviewDate, flashcardName, term, definition, example, context, partOfSpeech }`.
  - `ReviewQueueResponse { scope: ReviewScope | null; entries }`.
- [x] `apps/web/app/api/review/queue/route.ts` -- the GET handler:
  1. Authenticate the session.
  2. Parse `searchParams`.
  3. If a scope is given, resolve its owned name, or return 404.
  4. Run one `schedulingRecord.findMany` with `nextReviewDate <= now`, `card: { userId, flashcard: { … scope filter } }`, and the ordering above.
  5. Map the rows to entries.
- [x] `apps/web/app/globals.css` -- add `--motion-flip: 520ms` and `--ease-entrance: cubic-bezier(0.16, 1, 0.3, 1)`, plus a `review-flip` utility. The global reduced-motion rule already shortens it.
- [x] `apps/web/app/(shell)/review/page.tsx` + `review-session.tsx` (client) + `review-card.tsx` -- the page reads `searchParams`. The session holds `entries`, `index` and `revealed`.
  - The card is keyed by `schedulingRecordId`, so the next entry mounts unflipped with no reverse animation.
  - A `window` keydown handler drives the keys. The grade `useMutation` advances in `onMutate`.
  - On error the entry goes back per Boundaries.
  - Pointer handlers on the card cover tap and swipe.
  - Loading uses a static card-shaped placeholder. A queue fetch error shows an alert plus a "Try again" button.
- [x] `apps/web/app/(shell)/classes/[id]/class-detail-view.tsx`, `folders/[id]/folder-detail-view.tsx`, `flashcards/[id]/flashcard-detail-view.tsx` -- add `Link` + `buttonSecondary`: "Review this class" → `/review?classId=…` (and the folder and flashcard equivalents).
- [x] `tests/domain/review.test.ts` -- query schema: zero or one scope accepted; two scopes and empty strings rejected.
- [x] `tests/api/review-queue.spec.ts` -- every API row of the I/O matrix. Also check that another user's due records never appear, and that a graded record leaves the queue while its other direction stays.
- [x] `tests/e2e/review.spec.ts` -- seed 1 Card:
  - On `/review`, check the prompt and hint. Space reveals the answer and the grade buttons. Pressing `3` shows the second direction.
  - Press `k` and the done line appears. The DB shows both records at `repetitions` 1.
  - A failed grade (`page.route` → 500) brings the entry back with the alert.
  - "Review this flashcard" opens a scoped session whose header names the scope.

**Acceptance Criteria:**
- Given due records exist, when I open `/review`, then entries from all Classes appear one at a time, prompt first, oldest-due-first, and the counter reads `1 / N`.
- Given I'm on a Class, Folder or Flashcard page, when I choose its "Review this …" link, then the session holds only that scope's due entries and otherwise behaves the same.
- Given the answer is revealed, when I grade by key, button or swipe, then the next entry appears with no wait on the network.
- Given any control, when it is focused by keyboard, then a visible focus ring shows.
- Given both themes, when the prompt, the answer and the done state are screenshotted, then they conform to DESIGN.md tokens and the anti-generic rules.

## Implementation Notes

- Session state is mirrored in a ref (`live`) updated synchronously, so rapid key sequences (Space, 3, Space, 4 with no waits) never read a stale `revealed`/`index`; covered by an extra e2e test.
- Grade POSTs use `keepalive: true` so a grade sent just before a full page navigation still completes.
- The queue query uses `gcTime: 0` (with `staleTime: Infinity`, no focus/reconnect refetch) so the next visit to `/review` refetches instead of reusing the old snapshot.
- Both card faces share one grid cell, so the card keeps the taller face's height in both states (fixed bounds without clipping long definitions).
- Swipe grading listens only to touch/pen pointers; a mouse drag never grades.

## Spec Change Log

- **Human renegotiation after hand-off:** the free flip replaces "Space reveals" (one-way).
  - Amended: `SessionState` gains `seen`; `reveal` becomes `flip`, which toggles; grading and swipe gate on `seen`; the card's click always flips.
  - Added e2e test "the card flips back and forth; grading stays available once the answer was seen".
  - KEEP: the reset to the unflipped prompt on advance and on rollback, the Space repeat guard, and the hint shown only before the first reveal.

## Review Triage Log

Pass 1. Layers: blind, edge, verification-gap, design-fidelity.

**Patch** (low unless marked):
- **Grade-key mapping untested (verification-gap):** pre-verified. Every e2e assertion is `repetitions [1,1]`, which Hard, Good and Easy all produce, and no Again key is pressed.
- **Class/Folder "Review this …" links and `page.tsx` scope forwarding untested (verification-gap):** pre-verified. Only the flashcard link has an e2e test.
- **Swipe mapping and the mouse-drag gate untested (verification-gap, blind):** pre-verified. Grep finds no swipe or pointer tests.
- **404 scope screen untested (verification-gap, blind):** pre-verified.
- **Empty or two-scope `/review` URLs land on a "Try again" that always gets 400 again (verification-gap other, blind, edge ×2):**
  - `page.tsx` forwards `""` for an empty scope.
  - The client treats only 404 as unrecoverable.
- **Scope link gets dimmer on hover (design, blind):** `linkClass` gives `text-foreground`, and the added `hover:text-foreground-secondary` steps it down. It is also inconsistent with `buttonSecondary`.
- **Grade buttons use `px-5`, 20px, which is off the DESIGN.md spacing scale (design).** `min-h-14` and `max-w-prose` (same finding) are negligible; rejected.
- **J K L ; keys depend on the US layout (blind, edge):**
  - The keys are matched by `event.key`.
  - Shift is rejected, so on QWERTZ, where `;` needs Shift, Easy has no letter key.
  - Mapping by `event.code` is a direct table change.
- **Direction tie-break relies on enum declaration order with no comment (blind):** it is real, and Postgres orders enums by declaration. The fix is a one-line comment.
- **Empty-scope validation message reads "Choose one scope to review." (blind):** it is real, and wrong for an empty id. The `path: ["scope"]` part is false: `zodFields` just keys it, which is harmless.
- **Screen-reader feedback (blind):**
  - The counter change is silent, and the loading `role=status` has no text.
  - Patched with `aria-live` on the counter and sr-only loading text.
  - Focus falling to body after a click is rejected: the window key handler keeps the loop working.

**Defer:**
- **Unbounded queue (blind, edge):** maybe-false, medium if true. It needs a measurement of payload and paint for about 5k due entries. Story 4.4's cap limits new cards.
- **401 mid-session gives an endless "grade wasn't saved" (blind, edge):** real, but pre-existing app-wide. No client screen handles 401, and `proxy.ts` only guards navigation.

**Rejected:**
- **Accent on the revealed answer, and the accent answer next to the accent sidebar item (design ×2):** low. The frozen spec and the mockup both require the accent answer, so the fix would edit the spec. The sidebar half goes away with 4.5 focus mode. Raised to the human at hand-off.
- **No focus mode, bare empty state, missing icon row (design ×3):** false as defects. The frozen intent's "Never" excludes all three, and they belong to 4.5.
- **Both directions of a new Card come back to back (blind):** low. The epic says "No other ordering or interleaving rule is required". Raised to the human.
- **Swipe lost without pointer capture (blind):** false. Touch and pen pointers are implicitly captured to the pointerdown target per Pointer Events, and mouse never swipes.
- **`touch-none` stops scrolling the revealed card (blind):** low. It is required so vertical swipes grade instead of scrolling (pointercancel). The card is 320px minimum.
- **Space captured page-wide (blind):** low. Links don't activate on Space, and a focused grade button activates with Enter. The spec requires that Space never scrolls.
- **"Review this …" shown when nothing is due (blind):** false. The spec deliberately gives an empty scope a calm "all caught up" line.
- **Grade 404 (record deleted mid-session) re-inserts forever (edge):** low and rare (a Card deleted in another tab during review). The frozen spec rolls back every non-409 failure. Raised to the human.
- **A trailing click after a swipe reveals the next card (edge):** maybe-false, low. React commits pointerup synchronously and the old node is removed, so the click cannot target the new card button.
- **A 404 shows a link, not "Try again" (edge claim):** false as a defect. A retry can never succeed on a missing scope.
- **Modifier, text-field and screenshot test gaps (blind):** low. The screenshots were produced in step 3. The guards are one-line conditions.

## Design Notes

**Why the client advances before the POST:** the < 100 ms target leaves no room for a round trip. Keep the in-flight entry in the mutation context so `onError` can put it back. Rolling back a 409 would show a false error for a grade that was saved, so 409 is never rolled back.

**Why the queue is a snapshot:** refetching mid-session would reorder or re-add entries graded optimistically but not yet persisted. The next visit to `/review` refetches.

## Verification

**Commands:**
- `npm run typecheck && npm run lint && npm test` -- expected: clean, all pass.
- `npm run test:api` and `npm run test:e2e` with `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/training_sanctum_test` and `BETTER_AUTH_URL=http://localhost:3100` -- expected: all pass. `apps/web/.env.local` points at a remote DB, so override the environment.

**Manual checks:**
- Screenshot `/review` (prompt, answer and done states) in dark and light themes, at desktop and at 390px width. Confirm the flip, the grade-row wrap and the focus rings.
