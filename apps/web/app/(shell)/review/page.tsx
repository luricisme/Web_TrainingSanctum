import { ReviewSession } from "./review-session";

const SCOPE_KEYS = ["classId", "folderId", "flashcardId"] as const;

/** spec-4-3: the due-queue review session, optionally scoped by `?<scope>=<id>`. */
export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const key of SCOPE_KEYS) {
    const value = params[key];
    const first = Array.isArray(value) ? value[0] : value;
    if (first) query.set(key, first);
  }
  const queryString = query.toString();
  // Keyed so a new scope starts a fresh session with its own snapshot.
  return <ReviewSession key={queryString} queryString={queryString} />;
}
