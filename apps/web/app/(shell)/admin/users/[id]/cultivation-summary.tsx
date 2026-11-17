import { levelForXp, type BackupExport } from "@training-sanctum/domain";
import { dateFormat, numberFormat } from "./format";

const QUEST_LABEL: Record<NonNullable<BackupExport["cultivation"]["xpEvents"][number]["questKind"]>, string> = {
  LEARN_FLASHCARDS: "Learn flashcards",
  CLEAR_REVIEW: "Clear review",
};
const REASON_LABEL = {
  CLAIM: "Claimed",
  PENALTY: "Missed day",
  FOCUS_SESSION: "Focus session",
  TASK_DONE: "Task done",
} as const;

const dayText = (day: string) => dateFormat.format(new Date(`${day}T00:00:00.000Z`));

/** Realm label, XP, settled-through day and the XP event log, all read-only. */
export function CultivationSummary({ cultivation }: { cultivation: BackupExport["cultivation"] }) {
  const realm = levelForXp(cultivation.xp);
  const events = [...cultivation.xpEvents].reverse();
  return (
    <section aria-labelledby="cultivation-heading" className="mt-10">
      <h2 id="cultivation-heading" className="text-heading-3 text-foreground">Cultivation</h2>
      <dl className="mt-4 grid gap-4 rounded-lg border border-divider bg-card p-4 shadow-low sm:grid-cols-3">
        <div>
          <dt className="text-overline uppercase text-foreground-tertiary">Realm</dt>
          <dd className="mt-1 text-body font-semibold text-foreground">{realm.label}</dd>
        </div>
        <div>
          <dt className="text-overline uppercase text-foreground-tertiary">XP</dt>
          <dd className="mt-1 font-mono text-body text-foreground">{numberFormat.format(cultivation.xp)}</dd>
        </div>
        <div>
          <dt className="text-overline uppercase text-foreground-tertiary">Settled through</dt>
          <dd className="mt-1 text-body text-foreground">
            {cultivation.settledThrough ? dayText(cultivation.settledThrough) : "Not settled yet"}
          </dd>
        </div>
      </dl>

      <h3 className="mt-6 text-body font-semibold text-foreground">XP events</h3>
      {events.length === 0 ? (
        <p className="mt-2 text-body-sm text-foreground-secondary">No XP events yet.</p>
      ) : (
        <ul className="mt-2 divide-y divide-divider rounded-lg border border-divider bg-card shadow-low">
          {events.map((e) => (
            <li key={e.id} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-4 py-3 text-body-sm">
              <span className="text-foreground-secondary">{dayText(e.localDay)}</span>
              <span className="min-w-0 text-foreground">
                {e.questKind ? `${QUEST_LABEL[e.questKind]} · ` : ""}{REASON_LABEL[e.reason]}
              </span>
              <span className="ml-auto font-mono text-foreground">
                {e.delta > 0 ? "+" : ""}
                {numberFormat.format(e.delta)} XP
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
