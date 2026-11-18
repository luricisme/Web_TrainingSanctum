import { describe, expect, it } from "vitest";
import { MUSIC_FADE_MS, musicFadeGain, musicFadeOutGain } from "@training-sanctum/domain";

// spec-11-3: linear 3 s fades from wall-clock time.
describe("musicFadeGain", () => {
  const base = { fadeInStartMs: 1_000, sessionEndMs: 1_000 + 25 * 60_000 };

  it("starts silent and ramps linearly to full over 3 s", () => {
    expect(musicFadeGain({ ...base, nowMs: 1_000 })).toBe(0);
    expect(musicFadeGain({ ...base, nowMs: 1_000 + MUSIC_FADE_MS / 2 })).toBeCloseTo(0.5);
    expect(musicFadeGain({ ...base, nowMs: 1_000 + MUSIC_FADE_MS })).toBe(1);
  });

  it("holds at full in the middle of the session", () => {
    expect(musicFadeGain({ ...base, nowMs: 1_000 + 10 * 60_000 })).toBe(1);
  });

  it("ramps down over the last 3 s and is silent at the end and after", () => {
    expect(musicFadeGain({ ...base, nowMs: base.sessionEndMs - MUSIC_FADE_MS })).toBe(1);
    expect(musicFadeGain({ ...base, nowMs: base.sessionEndMs - MUSIC_FADE_MS / 2 })).toBeCloseTo(0.5);
    expect(musicFadeGain({ ...base, nowMs: base.sessionEndMs })).toBe(0);
    expect(musicFadeGain({ ...base, nowMs: base.sessionEndMs + 5_000 })).toBe(0);
  });

  it("fades in from the moment the page opened on a running session", () => {
    const opened = 1_000 + 10 * 60_000;
    expect(musicFadeGain({ nowMs: opened, fadeInStartMs: opened, sessionEndMs: base.sessionEndMs })).toBe(0);
    expect(musicFadeGain({ nowMs: opened + 1_500, fadeInStartMs: opened, sessionEndMs: base.sessionEndMs })).toBeCloseTo(0.5);
  });

  it("takes the lower ramp when the session is shorter than two fades", () => {
    expect(musicFadeGain({ nowMs: 2_000, fadeInStartMs: 0, sessionEndMs: 4_000 })).toBeCloseTo(2 / 3);
    expect(musicFadeGain({ nowMs: 3_000, fadeInStartMs: 0, sessionEndMs: 4_000 })).toBeCloseTo(1 / 3);
  });
});

describe("musicFadeOutGain", () => {
  it("ramps the current gain to zero over 3 s", () => {
    expect(musicFadeOutGain(0.8, 0)).toBeCloseTo(0.8);
    expect(musicFadeOutGain(0.8, MUSIC_FADE_MS / 2)).toBeCloseTo(0.4);
    expect(musicFadeOutGain(0.8, MUSIC_FADE_MS)).toBe(0);
    expect(musicFadeOutGain(0.8, MUSIC_FADE_MS * 2)).toBe(0);
  });
});
