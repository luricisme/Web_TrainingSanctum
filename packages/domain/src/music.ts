/**
 * Music track reference (spec-11-2). Only `{ source, trackId }` is stored;
 * title, artist and licence are fetched for display (AD-18).
 */
import { z } from "zod";

export const musicTrackSchema = z.object({
  source: z.literal("jamendo", { error: "Choose a track from the list." }),
  trackId: z
    .string({ error: "Choose a track from the list." })
    .regex(/^\d{1,20}$/, "Choose a track from the list."),
});

export type MusicTrackRef = z.infer<typeof musicTrackSchema>;

/** Reads a stored Json column back into a reference, or null when it is not one. */
export function parseMusicTrack(value: unknown): MusicTrackRef | null {
  const parsed = musicTrackSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
