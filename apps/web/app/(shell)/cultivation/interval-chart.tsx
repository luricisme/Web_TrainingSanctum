import type { IntervalDistribution } from "@training-sanctum/domain";
import { SectionMarker } from "@/app/components/section-marker";

const DIRECTION_LABEL: Record<IntervalDistribution["direction"], string> = {
  TERM_TO_DEFINITION: "Term → Definition",
  DEFINITION_TO_TERM: "Definition → Term",
};

/**
 * spec-5-4: Scheduling Records by interval, one chart per studied Recall
 * Direction. Horizontal bars in the border tone with the count and bucket
 * written out, so colour never carries the value. Each chart also has an
 * sr-only table.
 */
export function IntervalChart({ distribution }: { distribution: IntervalDistribution[] }) {
  const empty = distribution.every((d) => d.total === 0);
  return (
    <section aria-labelledby="interval-distribution" className="mt-8">
      <div className="mb-3 px-3">
        <SectionMarker as="h2" id="interval-distribution">
          Intervals
        </SectionMarker>
      </div>
      {empty ? (
        <p className="px-3 text-body-sm text-foreground-tertiary">Add cards to see your intervals.</p>
      ) : (
        <div className={`grid gap-4 ${distribution.length > 1 ? "lg:grid-cols-2" : ""}`}>
          {distribution.map((d) => {
            const max = Math.max(1, ...d.buckets.map((b) => b.count));
            return (
              <figure
                key={d.direction}
                className="rounded-lg border border-divider bg-card p-4 shadow-low"
              >
                <figcaption className="text-body-sm font-bold text-foreground">
                  {DIRECTION_LABEL[d.direction]}
                  <span className="ml-2 font-mono text-caption font-medium text-foreground-tertiary tabular-nums">
                    {d.total} {d.total === 1 ? "record" : "records"}
                  </span>
                </figcaption>
                <ul aria-hidden="true" className="mt-3 space-y-2">
                  {d.buckets.map((b) => (
                    <li key={b.key} className="flex items-center gap-3">
                      <span className="w-16 shrink-0 text-caption text-foreground-secondary">
                        {b.label}
                      </span>
                      <span className="h-2 min-w-0 flex-1">
                        <span
                          className="block h-full rounded-full bg-border"
                          style={{ width: `${(b.count / max) * 100}%`, minWidth: b.count > 0 ? "0.5rem" : 0 }}
                        />
                      </span>
                      <span className="w-10 shrink-0 text-right font-mono text-caption text-foreground tabular-nums">
                        {b.count}
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="sr-only"><table>
                  <caption>{DIRECTION_LABEL[d.direction]} records by interval</caption>
                  <thead>
                    <tr>
                      <th scope="col">Interval</th>
                      <th scope="col">Records</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.buckets.map((b) => (
                      <tr key={b.key}>
                        <th scope="row">{b.label}</th>
                        <td>{b.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table></div>
              </figure>
            );
          })}
        </div>
      )}
    </section>
  );
}
