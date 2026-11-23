"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  type MusicTrackRef,
  type TaskSummary,
  musicFadeGain,
  musicFadeOutGain,
} from "@training-sanctum/domain";
import { apiFetch } from "@/lib/api-client";
import { buttonQuiet } from "@/app/components/ui";
import { Attribution, TrackSearch, useTrack, writeLastPick } from "../music-field";

const VOLUME_KEY = "planner.music.volume";
const DEFAULT_VOLUME = 0.7;
const TICK_MS = 50;
const UNAVAILABLE_LINE = "Music unavailable — the timer continues.";

/** The remembered volume, per browser. Every access is guarded (private mode, blocked storage). */
function readVolume(): number {
  try {
    const raw = window.localStorage.getItem(VOLUME_KEY);
    const value = raw === null ? NaN : Number(raw);
    return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : DEFAULT_VOLUME;
  } catch {
    return DEFAULT_VOLUME;
  }
}

function writeVolume(volume: number) {
  try {
    window.localStorage.setItem(VOLUME_KEY, String(volume));
  } catch {
    // Storage is a convenience; the slider still works for this visit.
  }
}

/**
 * Music player strip (spec-11-3). Plays the Task's effective track in a plain
 * `<audio>` element while a focus session runs: fade in over 3 s, fade out over
 * the last 3 s and on Stop, silent in breaks. Gains come from wall-clock time
 * (`musicFadeGain`), never from the countdown tick. Every failure here only
 * shows one quiet line; the timer, plan and logging never depend on this file.
 */
export function MusicPlayer({
  taskId,
  ownTrack,
  categoryTrack,
  categoryLoading = false,
  categoryError = false,
  focus,
  onSaved,
  className = "flex flex-col gap-3",
}: {
  taskId: string;
  /** The Task's own override, or null. */
  ownTrack: MusicTrackRef | null;
  /** The Task's Category track, used while there is no override. */
  categoryTrack: MusicTrackRef | null;
  /** The Category list is still loading / failed, so `categoryTrack` is not known yet. */
  categoryLoading?: boolean;
  categoryError?: boolean;
  /** The running focus session of this Task, or null (idle, break, or another Task). */
  focus: { id: string; endsAtMs: number } | null;
  onSaved: (task: TaskSummary) => void;
  /** Surface classes; the screen embeds the strip in its own card. */
  className?: string;
}) {
  const panelId = useId();
  const audioRef = useRef<HTMLAudioElement>(null);
  const [volume, setVolume] = useState(readVolume);
  const [paused, setPaused] = useState(false);
  const [open, setOpen] = useState(false);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);

  const volumeRef = useRef(volume);
  const pausedRef = useRef(false);
  // A pause caused by the browser blocking autoplay (not chosen by the user).
  const blockedRef = useRef(false);
  const gainRef = useRef(0);
  const fadeOutTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const effective = ownTrack ?? categoryTrack;
  const trackQuery = useTrack(effective);
  const track = trackQuery.data ?? null;
  const streamUrl = track?.streamUrl ?? null;
  const streamFailed = streamUrl !== null && failedUrl === streamUrl;
  const unresolved = ownTrack === null && categoryLoading;
  const categoryUnavailable = ownTrack === null && categoryError;
  const unavailable =
    (effective !== null && trackQuery.isError) || streamFailed || saveFailed || categoryUnavailable;

  const focusEndsAtMs = focus?.endsAtMs ?? null;
  const focusId = focus?.id ?? null;

  // A new focus session retries once: it clears an autoplay-block pause and a
  // stream failure, but never a pause the user chose.
  useEffect(() => {
    if (focusId === null) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reacts to an external session change
    setFailedUrl(null);
    if (blockedRef.current) {
      blockedRef.current = false;
      pausedRef.current = false;
      setPaused(false);
    }
  }, [focusId]);
  const active = focusEndsAtMs !== null && !paused && streamUrl !== null && !streamFailed;

  function applyVolume(gain: number) {
    const audio = audioRef.current;
    if (audio) audio.volume = Math.min(1, Math.max(0, volumeRef.current * gain));
  }

  function stopFadeOut() {
    if (fadeOutTimer.current !== null) clearInterval(fadeOutTimer.current);
    fadeOutTimer.current = null;
  }

  // The fade engine. A new run starts a fade-in (session start, the page opening
  // on a running session, a track change, or resume); its cleanup fades out.
  useEffect(() => {
    const audio = audioRef.current;
    if (!active || !audio || streamUrl === null || focusEndsAtMs === null) return;

    stopFadeOut();
    const fadeInStartMs = Date.now();
    gainRef.current = 0;
    applyVolume(0);
    if (audio.getAttribute("src") !== streamUrl) audio.src = streamUrl;
    audio.loop = true;
    audio.play().catch((err: unknown) => {
      const name = err instanceof DOMException ? err.name : "";
      if (name === "AbortError") return;
      if (name === "NotAllowedError") {
        // Autoplay blocked: stay paused, no error. The user presses Play.
        pausedRef.current = true;
        blockedRef.current = true;
        setPaused(true);
        return;
      }
      setFailedUrl(streamUrl);
    });

    const timer = setInterval(() => {
      const now = Date.now();
      const gain = musicFadeGain({ nowMs: now, fadeInStartMs, sessionEndMs: focusEndsAtMs });
      gainRef.current = gain;
      applyVolume(gain);
      if (now >= focusEndsAtMs && !audio.paused) audio.pause();
    }, TICK_MS);

    return () => {
      clearInterval(timer);
      const from = gainRef.current;
      if (pausedRef.current || from <= 0.001) {
        audio.pause();
        gainRef.current = 0;
        return;
      }
      const startedMs = Date.now();
      fadeOutTimer.current = setInterval(() => {
        const gain = musicFadeOutGain(from, Date.now() - startedMs);
        gainRef.current = gain;
        applyVolume(gain);
        if (gain <= 0) {
          stopFadeOut();
          audio.pause();
        }
      }, TICK_MS);
    };
  }, [active, streamUrl, focusEndsAtMs]);

  // Leaving the screen silences the element (a removed <audio> can keep playing).
  useEffect(
    () => () => {
      stopFadeOut();
      audioRef.current?.pause();
    },
    []
  );

  const save = useMutation({
    mutationFn: (ref: MusicTrackRef | null) =>
      apiFetch<TaskSummary>(`/api/planner/tasks/${taskId}`, {
        method: "PATCH",
        json: { musicTrack: ref },
      }),
    onMutate: () => setSaveFailed(false),
    onSuccess: (task) => onSaved(task),
    onError: () => setSaveFailed(true),
  });

  function pick(ref: MusicTrackRef) {
    writeLastPick(ref);
    setOpen(false);
    save.mutate(ref);
  }

  function clearOverride() {
    setOpen(false);
    save.mutate(null);
  }

  function togglePause() {
    const next = !paused;
    blockedRef.current = false;
    pausedRef.current = next;
    setPaused(next);
  }

  function changeVolume(next: number) {
    volumeRef.current = next;
    setVolume(next);
    writeVolume(next);
    applyVolume(gainRef.current);
  }

  return (
    <section aria-label="Music" className={className}>
      <audio
        ref={audioRef}
        preload="none"
        onError={(event) => {
          // Ignore the empty-source event; only a real stream failure counts.
          if (streamUrl !== null && event.currentTarget.getAttribute("src") === streamUrl) {
            setFailedUrl(streamUrl);
          }
        }}
      />

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span
          aria-hidden="true"
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-elevated text-foreground-secondary"
        >
          <NoteIcon />
        </span>
        <div className="min-w-0 flex-1 text-left">
          {track ? (
            <Attribution track={track} />
          ) : unresolved ? (
            <p className="text-body-sm text-foreground-tertiary">Loading track</p>
          ) : effective === null ? (
            categoryUnavailable ? null : (
              <p className="text-body-sm text-foreground-tertiary">No music</p>
            )
          ) : trackQuery.isPending ? (
            <p className="text-body-sm text-foreground-tertiary">Loading track</p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-x-1 gap-y-1">
          {track !== null ? (
            <>
              <button type="button" onClick={togglePause} className={buttonQuiet}>
                {paused ? "Play" : "Pause"}
              </button>
              <label className="flex items-center gap-2 px-2 text-body-sm font-medium text-foreground-secondary">
                <span className="sr-only">Volume</span>
                <VolumeIcon />
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={volume}
                  onChange={(event) => changeVolume(Number(event.target.value))}
                  aria-valuetext={`${Math.round(volume * 100)}%`}
                  className="h-1 w-24 cursor-pointer accent-foreground focus-ring"
                />
              </label>
            </>
          ) : null}
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-controls={panelId}
            disabled={save.isPending || unresolved}
            className={buttonQuiet}
          >
            {effective === null ? "Choose a track" : "Change"}
          </button>
        </div>
      </div>

      {open ? (
        <div className="flex flex-col gap-2 text-left">
          {ownTrack ? (
            <div className="flex items-center gap-2">
              <button type="button" onClick={clearOverride} className={buttonQuiet}>
                None
              </button>
              <span className="text-caption text-foreground-tertiary">
                {categoryTrack ? "Uses the category's track" : "Plays no music"}
              </span>
            </div>
          ) : null}
          <TrackSearch id={panelId} current={ownTrack} onPick={pick} />
        </div>
      ) : null}

      <p
        role="status"
        aria-live="polite"
        className={unavailable ? "text-left text-body-sm text-foreground-tertiary" : "sr-only"}
      >
        {unavailable ? UNAVAILABLE_LINE : ""}
      </p>
    </section>
  );
}

function NoteIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </svg>
  );
}

function VolumeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M11 5 6 9H2v6h4l5 4V5z" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7" />
    </svg>
  );
}
