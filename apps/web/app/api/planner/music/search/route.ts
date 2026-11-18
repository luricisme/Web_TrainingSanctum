import { requireSession } from "@/lib/session";
import { getMusicSource } from "@/lib/music";
import { musicFailure, musicJson } from "@/lib/music/respond";

export async function GET(request: Request): Promise<Response> {
  const result = await requireSession(request);
  if (result.response) return result.response;

  const params = new URL(request.url).searchParams;
  const q = (params.get("q") ?? "").trim().slice(0, 100);
  const tags = (params.get("tags") ?? "")
    .split(/[\s,+]+/)
    .filter(Boolean)
    .slice(0, 5);

  try {
    return musicJson(await getMusicSource().search(q, tags));
  } catch (error) {
    return musicFailure("music.search", error);
  }
}
