import { FlashcardDetailView } from "./flashcard-detail-view";

export default async function FlashcardDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <FlashcardDetailView flashcardId={id} />;
}
