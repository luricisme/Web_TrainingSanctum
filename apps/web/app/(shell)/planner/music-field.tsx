"use client";

import { useId, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { type MusicTrackRef, parseMusicTrack } from "@training-sanctum/domain";
import { apiFetch } from "@/lib/api-client";
import type { Track } from "@/lib/music/types";
import { buttonQuiet, inputClass, labelClass, linkClass } from "@/app/components/ui";

const LAST_PICK_KEY = "planner.music.lastPick";
const UNAVAILABLE = "Music unavailable";

/** The last picked track, per browser. Every access is guarded (private mode, blocked storage). */
function readLastPick(): MusicTrackRef | null {
  try {
    const raw = window.localStorage.getItem(LAST_PICK_KEY);
    return raw ? parseMusicTrack(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function writeLastPick(ref: MusicTrackRef) {
  try {
    window.localStorage.setItem(LAST_PICK_KEY, JSON.stringify(ref));
  } catch {
    // Storage is a convenience; the pick itself is already saved in the form.
  }
}

function useTrack(ref: MusicTrackRef | null) {
  return useQuery({
    queryKey: ["planner-music-track", ref?.trackId],
    queryFn: () => apiFetch<Track>(`/api/planner/music/${encodeURIComponent(ref!.trackId)}`),
    enabled: ref !== null,
    staleTime: 60 * 60 * 1000,
    retry: false,
  });
}

/** Title · artist · licence, the licence linked (it is a licence condition). */
function Attribution({ track }: { track: Track }) {
  return (
    <p className="break-words text-body-sm text-foreground">
      <span className="font-medium">{track.title}</span>
      <span className="text-foreground-secondary"> · {track.artist} · </span>
      <a href={track.licenceUrl} target="_blank" rel="noreferrer" className={linkClass}>
        {track.licence}
      </a>
    </p>
  );
}

function TrackLine({ track }: { track: MusicTrackRef }) {
  const { data, isPending, isError } = useTrack(track);
  if (isPending) {
    return <p className="text-body-sm text-foreground-tertiary">Loading track</p>;
  }
  if (isError || !data) {
    return <p className="text-body-sm text-foreground-tertiary">{UNAVAILABLE}</p>;
  }
  return <Attribution track={data} />;
}

/**
 * Music field (spec-11-2, EXPERIENCE.md "Category modal"): shows the chosen
 * track with its attribution, searches Jamendo to change it, and offers
 * "None". A Jamendo failure only replaces the attribution with a quiet line;
 * it never blocks saving the surrounding form.
 */
export function MusicField({
  value,
  onChange,
  inherited = null,
}: {
  value: MusicTrackRef | null;
  onChange: (next: MusicTrackRef | null) => void;
  /** A Task's Category track, shown while the Task has none of its own. */
  inherited?: MusicTrackRef | null;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);

  return (
    <div role="group" aria-labelledby={`${id}-label`} className="flex flex-col gap-2">
      <span id={`${id}-label`} className={labelClass}>
        Music
      </span>
      <div className="flex flex-col gap-2 rounded-md border border-divider bg-background p-3">
        <div aria-live="polite">
          {value ? (
            <TrackLine track={value} />
          ) : inherited ? (
            <div className="flex flex-col gap-1">
              <p className="text-caption text-foreground-tertiary">Uses the category&apos;s track</p>
              <TrackLine track={inherited} />
            </div>
          ) : (
            <p className="text-body-sm text-foreground-tertiary">No music</p>
          )}
        </div>
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-controls={`${id}-panel`}
            className={buttonQuiet}
          >
            {value ? "Change" : "Choose a track"}
          </button>
          {value ? (
            <button
              type="button"
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}
              className={buttonQuiet}
            >
              None
            </button>
          ) : null}
        </div>
        {open ? (
          <TrackSearch
            id={`${id}-panel`}
            current={value}
            onPick={(ref) => {
              writeLastPick(ref);
              onChange(ref);
              setOpen(false);
            }}
          />
        ) : null}
      </div>
    </div>
  );
}

function TrackSearch({
  id,
  current,
  onPick,
}: {
  id: string;
  current: MusicTrackRef | null;
  onPick: (ref: MusicTrackRef) => void;
}) {
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState<string | null>(null);
  // Mounted only after the user opens the panel, so reading storage here never runs on the server.
  const [last] = useState<MusicTrackRef | null>(readLastPick);

  const lastShown = last && last.trackId !== current?.trackId ? last : null;
  const lastTrack = useTrack(lastShown);
  const search = useQuery({
    queryKey: ["planner-music-search", submitted],
    queryFn: () => {
      const q = (submitted ?? "").trim();
      const params = new URLSearchParams(q ? { q } : { tags: "lofi" });
      return apiFetch<Track[]>(`/api/planner/music/search?${params.toString()}`);
    },
    enabled: submitted !== null,
    staleTime: 60 * 60 * 1000,
    retry: false,
  });

  function runSearch() {
    if (submitted === query) void search.refetch();
    else setSubmitted(query);
  }

  const results = (search.data ?? []).filter((t) => t.id !== lastShown?.trackId);

  return (
    <div id={id} className="flex flex-col gap-2 border-t border-divider pt-3">
      <div className="flex gap-2">
        <input
          type="search"
          aria-label="Search tracks"
          autoComplete="off"
          placeholder="Search by title, artist or tag"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              runSearch();
            }
          }}
          className={inputClass}
        />
        <button type="button" onClick={runSearch} className={buttonQuiet}>
          Search
        </button>
      </div>

      {lastShown && lastTrack.data ? (
        <div className="flex flex-col gap-1">
          <p className="text-overline uppercase text-foreground-tertiary">Last picked</p>
          <TrackRow
            track={lastTrack.data}
            onPick={() => onPick({ source: "jamendo", trackId: lastTrack.data.id })}
          />
        </div>
      ) : null}

      {submitted !== null ? (
        search.isPending ? (
          <p className="text-body-sm text-foreground-tertiary">Searching</p>
        ) : search.isError ? (
          <p className="text-body-sm text-foreground-tertiary">{UNAVAILABLE}</p>
        ) : results.length === 0 ? (
          <p className="text-body-sm text-foreground-tertiary">No tracks found.</p>
        ) : (
          <ul className="flex max-h-56 flex-col overflow-y-auto">
            {results.map((t) => (
              <li key={t.id}>
                <TrackRow
                  track={t}
                  onPick={() => onPick({ source: "jamendo", trackId: t.id })}
                />
              </li>
            ))}
          </ul>
        )
      ) : null}
    </div>
  );
}

function TrackRow({ track, onPick }: { track: Track; onPick: () => void }) {
  return (
    <button
      type="button"
      onClick={onPick}
      className="flex w-full flex-col rounded-sm px-3 py-2 text-left transition-state hover:bg-row-hover focus-ring"
    >
      <span className="break-words text-body-sm font-medium text-foreground">{track.title}</span>
      <span className="break-words text-caption text-foreground-secondary">
        {track.artist} · {track.licence}
      </span>
    </button>
  );
}
