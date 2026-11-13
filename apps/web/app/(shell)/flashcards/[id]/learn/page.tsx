import { LearnSession } from "./learn-session";

/** spec-4-8: the graded Learn session for one Flashcard (FR-17). */
export default async function LearnPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Keyed so another Flashcard starts a fresh session with its own snapshot.
  return <LearnSession key={id} flashcardId={id} />;
}
