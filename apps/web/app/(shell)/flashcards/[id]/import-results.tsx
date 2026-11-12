"use client";

import { useEffect, useRef, type ReactNode } from "react";
import type { ImportCommitResult } from "@training-sanctum/domain";
import { SectionMarker } from "@/app/components/section-marker";
import { buttonPrimary } from "../../classes/ui";
import { PanelFooter } from "./panel-footer";

function lineLabel(line: number | null): ReactNode {
  return line === null ? (
    <span className="w-12 shrink-0 text-body-sm text-foreground-tertiary">new</span>
  ) : (
    <span className="w-12 shrink-0 font-mono text-body-sm text-foreground-tertiary">
      L{line}
    </span>
  );
}

/**
 * Import results (spec-3-1): exactly three groups, Created, Duplicates
 * skipped and Errors (line + reason), kept on screen until Done.
 */
export function ImportResults({
  result,
  flashcardName,
  onDone,
}: {
  result: ImportCommitResult;
  flashcardName: string;
  onDone: () => void;
}) {
  const groupsRef = useRef<HTMLDivElement>(null);

  // The Save button is gone: move focus to the results so they are read next.
  useEffect(() => {
    groupsRef.current?.focus();
  }, []);

  const { created, duplicates, errors } = result;

  return (
    <div className="flex flex-col gap-6">
      <div
        ref={groupsRef}
        tabIndex={-1}
        role="group"
        aria-label="Import results"
        className="flex flex-col divide-y divide-divider rounded-sm focus:outline-none"
      >
        <section aria-labelledby="import-created" className="flex flex-col gap-2 pb-5">
          <SectionMarker as="h3" id="import-created">
            Created ({created})
          </SectionMarker>
          <p className="text-body text-foreground-secondary">
            {created === 0
              ? `No cards were added to ${flashcardName}.`
              : `${created} ${created === 1 ? "card" : "cards"} added to ${flashcardName}.`}
          </p>
        </section>

        <section aria-labelledby="import-duplicates" className="flex flex-col gap-2 py-5">
          <SectionMarker as="h3" id="import-duplicates">
            Duplicates skipped ({duplicates.length})
          </SectionMarker>
          {duplicates.length === 0 ? (
            <p className="text-body text-foreground-secondary">None.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {duplicates.map((d, i) => (
                <li key={i} className="flex items-baseline gap-3">
                  {lineLabel(d.line)}
                  <span className="min-w-0 break-words text-body text-foreground">{d.term}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="import-errors" className="flex flex-col gap-2 pt-5">
          <SectionMarker as="h3" id="import-errors">
            Errors ({errors.length})
          </SectionMarker>
          {errors.length === 0 ? (
            <p className="text-body text-foreground-secondary">None.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {errors.map((e, i) => (
                <li key={i} className="flex items-baseline gap-3">
                  {lineLabel(e.line)}
                  <span className="min-w-0 break-words text-body text-error">{e.reason}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <PanelFooter>
        <div className="flex justify-end">
          <button type="button" onClick={onDone} className={buttonPrimary}>
            Done
          </button>
        </div>
      </PanelFooter>
    </div>
  );
}
