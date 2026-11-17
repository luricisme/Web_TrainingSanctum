import type { BackupCategoryNode, BackupExport } from "@training-sanctum/domain";
import { tintFor } from "../../../../components/ui";
import { dateFormat, dateTimeFormat, numberFormat } from "./format";

const summary =
  "flex cursor-pointer list-none items-center gap-3 rounded-md px-3 py-3 transition-state hover:bg-row-hover marker:hidden [&::-webkit-details-marker]:hidden focus-ring";
const chevron =
  "h-2 w-2 shrink-0 -rotate-45 border-b-2 border-r-2 border-current transition-transform duration-150 group-open:rotate-45 motion-reduce:transition-none";
const plural = (n: number, noun: string) => `${n} ${noun}${n === 1 ? "" : "s"}`;
const count = "ml-auto shrink-0 pl-2 text-caption text-foreground-secondary";
const dayText = (day: string) => dateFormat.format(new Date(`${day}T00:00:00.000Z`));

function Setting({ label, value, unit }: { label: string; value: number; unit: string }) {
  return (
    <div>
      <dt className="text-overline uppercase text-foreground-tertiary">{label}</dt>
      <dd className="mt-1 text-body text-foreground">
        <span className="font-mono">{value}</span> {unit}
      </dd>
    </div>
  );
}

function SessionLine({ session }: { session: BackupCategoryNode["tasks"][number]["sessions"][number] }) {
  const length = session.actualMinutes ?? session.plannedMinutes;
  return (
    <li className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-3 py-2 text-caption">
      <span className="font-semibold text-foreground">{session.kind === "FOCUS" ? "Focus" : "Break"}</span>
      <span className="text-foreground-secondary">{dateTimeFormat.format(new Date(session.startedAt))} UTC</span>
      <span className="ml-auto text-foreground">
        <span className="font-mono">{session.endedAt ? length : session.plannedMinutes}</span> min
        {session.endedAt ? "" : ", open"}
        {session.overrun ? ", overrun" : ""}
      </span>
    </li>
  );
}

/** Pomodoro settings, then category -> Task -> session, read-only. Native <details>, collapsed. */
export function PlannerSummary({
  planner,
  tree,
}: {
  planner: BackupExport["planner"];
  tree: BackupCategoryNode[];
}) {
  const { settings } = planner;
  return (
    <section aria-labelledby="planner-heading" className="mt-10">
      <h2 id="planner-heading" className="text-heading-3 text-foreground">Planner</h2>
      <dl className="mt-4 grid gap-4 rounded-lg border border-divider bg-card p-4 shadow-low sm:grid-cols-4">
        <Setting label="Focus" value={settings.focus} unit="min" />
        <Setting label="Short break" value={settings.shortBreak} unit="min" />
        <Setting label="Long break" value={settings.longBreak} unit="min" />
        <Setting label="Long break every" value={settings.longBreakEvery} unit={settings.longBreakEvery === 1 ? "session" : "sessions"} />
      </dl>

      <h3 className="mt-6 text-body font-semibold text-foreground">Tasks</h3>
      {tree.length === 0 ? (
        <p className="mt-2 text-body-sm text-foreground-secondary">No Planner data yet.</p>
      ) : (
        <ul className="mt-2 space-y-3">
          {tree.map((category) => (
            <li key={category.id}>
              <details className={`group rounded-lg border ${tintFor(category.color)} p-1`}>
                <summary className={summary}>
                  <span aria-hidden="true" className={chevron} />
                  <span className="min-w-0 break-words text-body font-semibold text-foreground">{category.name}</span>
                  <span className={count}>{plural(category.tasks.length, "Task")}</span>
                </summary>
                <ul className="space-y-2 px-2 pb-2">
                  {category.tasks.map((task) => (
                    <li key={task.id}>
                      <details className="group rounded-md border border-divider bg-card p-1">
                        <summary className={summary}>
                          <span aria-hidden="true" className={chevron} />
                          <span className="min-w-0 break-words text-body-sm font-semibold text-foreground">
                            {task.title}
                          </span>
                          <span className={count}>
                            {dayText(task.localDay)} · {task.done ? "Done" : "Open"} ·{" "}
                            <span className="font-mono">
                              {numberFormat.format(task.loggedMinutes)} / {numberFormat.format(task.estimateMinutes)} min
                            </span>
                          </span>
                        </summary>
                        {task.sessions.length === 0 ? (
                          <p className="px-3 pb-3 text-caption text-foreground-secondary">No sessions.</p>
                        ) : (
                          <ul className="divide-y divide-divider px-2 pb-2">
                            {task.sessions.map((s) => (
                              <SessionLine key={s.id} session={s} />
                            ))}
                          </ul>
                        )}
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
