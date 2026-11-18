import type { BackupClassNode, BackupExport } from "@training-sanctum/domain";
import { tintFor } from "../../../../components/ui";
import { dateFormat, dateTimeFormat } from "./format";

type Card = BackupExport["cards"][number];
type SchedulingRecord = Card["schedulingRecords"][number];

const DIRECTION_LABEL: Record<SchedulingRecord["direction"], string> = {
  TERM_TO_DEFINITION: "Term to definition",
  DEFINITION_TO_TERM: "Definition to term",
};

const summary =
  "flex list-none items-center gap-3 rounded-md px-3 py-3 transition-state hover:bg-row-hover marker:hidden [&::-webkit-details-marker]:hidden focus-ring";
const chevron =
  "h-2 w-2 shrink-0 -rotate-45 border-b-2 border-r-2 border-current transition-transform duration-150 group-open:rotate-45 motion-reduce:transition-none";
const plural = (n: number, noun: string) => `${n} ${noun}${n === 1 ? "" : "s"}`;
const count = "ml-auto shrink-0 pl-2 text-caption text-foreground-secondary";

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-overline uppercase text-foreground-tertiary">{label}</dt>
      <dd className="mt-1 font-mono text-body-sm text-foreground">{children}</dd>
    </div>
  );
}

function RecordView({ record }: { record: SchedulingRecord }) {
  return (
    <section
      aria-label={DIRECTION_LABEL[record.direction]}
      className="rounded-md border border-divider bg-elevated px-3 py-3"
    >
      <h4 className="text-caption font-semibold text-foreground">{DIRECTION_LABEL[record.direction]}</h4>
      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-5">
        <Fact label="Interval">{record.interval} d</Fact>
        <Fact label="Repetitions">{record.repetitions}</Fact>
        <Fact label="Ease">{record.easeFactor.toFixed(2)}</Fact>
        <Fact label="Next review">{dateFormat.format(new Date(record.nextReviewDate))}</Fact>
        <Fact label="First graded">
          {record.firstGradedAt ? (
            `${dateTimeFormat.format(new Date(record.firstGradedAt))} UTC`
          ) : (
            <span className="font-sans text-foreground-secondary">Not graded yet</span>
          )}
        </Fact>
      </dl>
    </section>
  );
}

function CardView({ card }: { card: Card }) {
  const meta = [card.partOfSpeech, card.context].filter(Boolean).join(" · ");
  return (
    <li className="rounded-md border border-divider bg-card p-3">
      <h3 className="break-words text-body-sm font-semibold text-foreground">{card.term}</h3>
      <p className="mt-1 break-words text-body-sm text-foreground-secondary">{card.definition}</p>
      {card.example ? (
        <p className="mt-1 break-words text-caption italic text-foreground-tertiary">{card.example}</p>
      ) : null}
      {meta ? <p className="mt-1 break-words text-caption text-foreground-tertiary">{meta}</p> : null}
      <div className="mt-3 grid gap-2">
        {card.schedulingRecords.map((r) => (
          <RecordView key={r.id} record={r} />
        ))}
      </div>
    </li>
  );
}

/** Class -> Folder -> Flashcard -> Card, read-only. Native <details>, collapsed; tint inherited from the Class. */
export function BackupTreeView({ tree }: { tree: BackupClassNode[] }) {
  return (
    <section aria-labelledby="tree-heading" className="mt-10">
      <h2 id="tree-heading" className="text-heading-3 text-foreground">Classes</h2>
      {tree.length === 0 ? (
        <p className="mt-3 text-body-sm text-foreground-secondary">No Classes yet.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {tree.map((klass) => (
            <li key={klass.id}>
              <details className={`group rounded-lg border ${tintFor(klass.color)} p-1`}>
                <summary className={summary}>
                  <span aria-hidden="true" className={chevron} />
                  <span className="min-w-0 break-words text-body font-semibold text-foreground">{klass.name}</span>
                  <span className={count}>
                    {klass.members.length > 0 ? `${plural(klass.members.length, "member")} · ` : ""}
                    {plural(klass.folders.length, "Folder")}
                  </span>
                </summary>
                <ul className="space-y-2 px-2 pb-2">
                  {klass.folders.map((folder) => (
                    <li key={folder.id}>
                      <details className="group rounded-md border border-divider bg-card p-1">
                        <summary className={summary}>
                          <span aria-hidden="true" className={chevron} />
                          <span className="min-w-0 break-words text-body-sm font-semibold text-foreground">
                            {folder.isUnsorted ? "Unsorted" : folder.name}
                          </span>
                          <span className={count}>{plural(folder.flashcards.length, "Flashcard")}</span>
                        </summary>
                        <ul className="space-y-2 px-2 pb-2">
                          {folder.flashcards.map((fc) => (
                            <li key={fc.id}>
                              <details className="group rounded-md border border-divider bg-background p-1">
                                <summary className={summary}>
                                  <span aria-hidden="true" className={chevron} />
                                  <span className="min-w-0 break-words text-body-sm font-semibold text-foreground">
                                    {fc.name}
                                  </span>
                                  <span className={count}>{plural(fc.cards.length, "Card")}</span>
                                </summary>
                                <ul className="space-y-2 px-2 pb-2">
                                  {fc.cards.map((card) => (
                                    <CardView key={card.id} card={card} />
                                  ))}
                                </ul>
                              </details>
                            </li>
                          ))}
                        </ul>
                      </details>
                    </li>
                  ))}
                </ul>
              </details>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
