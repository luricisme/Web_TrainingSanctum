/** Normalised track returned by every MusicSource (AD-18). */
export interface Track {
  id: string;
  title: string;
  artist: string;
  /** Human label, e.g. "CC BY-NC-SA 3.0". */
  licence: string;
  licenceUrl: string;
  /** Jamendo track page; the licence requires a backlink to it. */
  shareUrl: string;
  streamUrl: string;
  /** Seconds. */
  duration: number;
}

export interface MusicSource {
  /** `tags` are AND-ed. */
  search(query: string, tags: string[]): Promise<Track[]>;
  /** Resolves one track, or null when the id is unknown. */
  track(trackId: string): Promise<Track | null>;
}

/** Source unreachable, non-2xx, or an unusable payload. */
export class MusicUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "MusicUnavailableError";
  }
}
