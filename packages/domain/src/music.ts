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

/** Length of every music fade, in and out (spec-11-3). */
export const MUSIC_FADE_MS = 3000;

/**
 * Music gain (0..1, multiplied by the user's volume) at `nowMs`, from wall-clock
 * time only so a throttled tab cannot stall a fade: a linear ramp up from
 * `fadeInStartMs`, held, then a linear ramp down over the last `fadeMs` before
 * `sessionEndMs`. The lower of the two wins when a short session overlaps them.
 */
export function musicFadeGain(input: {
  nowMs: number;
  fadeInStartMs: number;
  sessionEndMs: number;
  fadeMs?: number;
}): number {
  const fadeMs = input.fadeMs ?? MUSIC_FADE_MS;
  const up = (input.nowMs - input.fadeInStartMs) / fadeMs;
  const down = (input.sessionEndMs - input.nowMs) / fadeMs;
  return Math.min(1, Math.max(0, Math.min(up, down)));
}

/** Gain of a fade-out that began at `fromGain`, `elapsedMs` ago (Stop, or the session ending). */
export function musicFadeOutGain(fromGain: number, elapsedMs: number, fadeMs = MUSIC_FADE_MS): number {
  return Math.min(1, Math.max(0, fromGain * (1 - elapsedMs / fadeMs)));
}
