# Reconcile: quizlet-flashcard-view.png

Source: `imports/quizlet-flashcard-view.png` — Quizlet's flashcard/study screen.

## Taken

- **Large rounded card surface, centered text** — the basic anatomy of the review card: a single large surface, content centered, carried into `DESIGN.md.components.review-card`.
- **Progress counter pattern** — Quizlet's "1 / 26" style counter beneath the card, adapted as Training Sanctum's mono-font "X / Y" progress counter.
- **Icon row on the card** (star / audio / edit in Quizlet's version) — adapted into Training Sanctum's pin / audio / star icon row, top-right of the card face.
- **Sort/shuffle/settings/fullscreen control row concept beneath the card** — acknowledged as a Quizlet pattern; Training Sanctum's equivalent control surface is the grade-button row, serving the SM-2 grading purpose instead of playback controls (these are different functions filling a structurally similar "controls below the card" position).

## Deliberately NOT taken

- **"Study with Friends" and "Play live games" pill buttons** above the card — social/gamified study modes, explicitly excluded (PRD §2.2, §5).
- **"Flashcards / Learn / Test" mode-switcher tabs** — Quizlet offers multiple study modes (flashcards, adaptive learning quizzes, test mode); Training Sanctum has exactly one review mode (SM-2-scheduled due-queue review, FR-9) with no mode switcher — "Learn" and "Test" modes in particular are the gamified/quiz-style surfaces the PRD rules out.
- **"Students also studied" recommendation carousel and the yellow promotional banner** ("Improve your English skills... Learn English") — both are discovery/engagement surfaces for a multi-user public-set platform; neither applies to or was adapted for a single-user tool with no content discovery surface.
- **"Practice questions for this set" multiple-choice quiz widget** — a distinct, separate feature (adaptive multiple-choice learning) from SM-2 scheduled review; not part of this product's scope.
- **Full terms list below the card (with star/audio/edit per row)** — Quizlet shows the entire set's terms inline below the study card for reference/editing; Training Sanctum keeps review session (focus mode, FR-11) and folder/card management (the Folders screen) as separate surfaces, so this combined view was not carried over.
- **Flip interaction itself** — Quizlet's flashcard view in the reference screenshot does not show a flip animation (card term/definition display varies by click target in Quizlet's actual product); the Quizlet-style **3D flip** specifically was a deliberate refinement added during this UX pass (memlog decision), not a literal copy from the static screenshot.

## Dropped idea

The screenshot's "Creator" byline and avatar beneath the card (a social-proof pattern — whose set this is) was dropped outright. It has no meaning in a single-user product where every card is the same user's own content; there is no authorship distinction to surface.
