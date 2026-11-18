import { fail } from "@/lib/api-response";
import { requireSession } from "@/lib/session";
import { getMusicSource } from "@/lib/music";
import { musicFailure, musicJson } from "@/lib/music/respond";

export async function GET(
  request: Request,
  context: { params: Promise<{ trackId: string }> }
): Promise<Response> {
  const result = await requireSession(request);
  if (result.response) return result.response;

  const { trackId } = await context.params;
  if (!/^\d{1,12}$/.test(trackId)) {
    return fail(404, "NOT_FOUND", "Track not found.");
  }

  try {
    const track = await getMusicSource().track(trackId);
    if (!track) return fail(404, "NOT_FOUND", "Track not found.");
    return musicJson(track);
  } catch (error) {
    return musicFailure("music.track", error);
  }
}
