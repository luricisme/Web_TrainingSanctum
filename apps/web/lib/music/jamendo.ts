/**
 * The one MusicSource implementation (AD-18) and the only module in the
 * product allowed to make outbound HTTP.
 */
import { z } from "zod";
import { MusicUnavailableError, type MusicSource, type Track } from "./types";

const BASE_URL = "https://api.jamendo.com/v3.0/tracks/";
const TIMEOUT_MS = 8000;
const SEARCH_LIMIT = 20;

const jamendoTrackSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  name: z.string(),
  duration: z.number(),
  artist_name: z.string(),
  license_ccurl: z.string().min(1),
  shareurl: z.string().min(1),
  audio: z.string().min(1),
});

const jamendoResponseSchema = z.object({
  headers: z.object({ status: z.string(), code: z.number() }),
  results: z.array(z.unknown()),
});

/** "https://creativecommons.org/licenses/by-nc-sa/3.0/" -> "CC BY-NC-SA 3.0". */
export function licenceLabel(ccUrl: string): string {
  const match = /\/(?:licenses|publicdomain)\/([a-z-]+)\/?([\d.]+)?/i.exec(ccUrl);
  if (!match) return "Creative Commons";
  const [, code, version] = match;
  if (code.toLowerCase() === "zero") return `CC0 ${version ?? "1.0"}`;
  return `CC ${code.toUpperCase()}${version ? ` ${version}` : ""}`;
}

function toTrack(raw: unknown): Track {
  const t = jamendoTrackSchema.parse(raw);
  return {
    id: t.id,
    title: t.name,
    artist: t.artist_name,
    licence: licenceLabel(t.license_ccurl),
    licenceUrl: t.license_ccurl,
    shareUrl: t.shareurl,
    streamUrl: t.audio,
    duration: t.duration,
  };
}

export function createJamendoSource(clientId: string): MusicSource {
  async function call(params: Record<string, string>): Promise<unknown[]> {
    const url = new URL(BASE_URL);
    url.search = new URLSearchParams({
      client_id: clientId,
      format: "json",
      audioformat: "mp31",
      include: "licenses",
      ...params,
    }).toString();
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!res.ok) throw new Error(`Jamendo responded ${res.status}`);
      const body = jamendoResponseSchema.parse(await res.json());
      if (body.headers.code !== 0 || body.headers.status !== "success") {
        throw new Error(`Jamendo error code ${body.headers.code}`);
      }
      return body.results;
    } catch (error) {
      throw new MusicUnavailableError("Jamendo request failed", { cause: error });
    }
  }

  function parseAll(results: unknown[]): Track[] {
    try {
      return results.map(toTrack);
    } catch (error) {
      throw new MusicUnavailableError("Jamendo returned an unusable payload", {
        cause: error,
      });
    }
  }

  return {
    async search(query, tags) {
      const params: Record<string, string> = { limit: String(SEARCH_LIMIT) };
      if (query) params.search = query;
      // Jamendo ANDs "+"-joined tags; URLSearchParams encodes a space as "+".
      if (tags.length > 0) params.tags = tags.join(" ");
      return parseAll(await call(params));
    },
    async track(trackId) {
      const tracks = parseAll(await call({ id: trackId, limit: "1" }));
      return tracks.find((t) => t.id === trackId) ?? null;
    },
  };
}
