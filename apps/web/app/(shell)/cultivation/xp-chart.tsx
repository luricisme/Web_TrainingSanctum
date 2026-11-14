import type { XpSeriesPoint } from "@training-sanctum/domain";
import { SectionMarker } from "@/app/components/section-marker";

const WIDTH = 600;
const HEIGHT = 160;
const PAD = 4;
const xpFormat = new Intl.NumberFormat("en-US");
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-11-14" -> "Nov 14". */
function dayLabel(localDay: string): string {
  return `${MONTHS[Number(localDay.slice(5, 7)) - 1]} ${Number(localDay.slice(8, 10))}`;
}

/**
 * spec-5-4: cumulative XP at the end of each of the last 30 local days as a
 * plain line in the text colour (no gradient, fill or animation). The text
 * equivalent is the summary line and an sr-only table of every day.
 */
export function XpChart({ series }: { series: XpSeriesPoint[] }) {
  const first = series[0];
  const last = series[series.length - 1];
  if (!first || !last) return null;

  const max = Math.max(1, ...series.map((p) => p.xp));
  const x = (i: number) => PAD + (i / Math.max(1, series.length - 1)) * (WIDTH - 2 * PAD);
  const y = (xp: number) => HEIGHT - PAD - (xp / max) * (HEIGHT - 2 * PAD);
  const points = series.map((p, i) => `${x(i).toFixed(1)},${y(p.xp).toFixed(1)}`).join(" ");
  const summary = `${xpFormat.format(first.xp)} XP on ${dayLabel(first.localDay)}, ${xpFormat.format(last.xp)} XP on ${dayLabel(last.localDay)}.`;

  return (
    <section aria-labelledby="xp-history" className="mt-8">
      <div className="mb-3 px-3">
        <SectionMarker as="h2" id="xp-history">
          XP, last 30 days
        </SectionMarker>
      </div>
      <div className="rounded-lg border border-divider bg-card p-4 shadow-low">
        <p className="text-body-sm text-foreground-secondary">{summary}</p>
        <div className="mt-3 flex gap-3">
          <span className="w-12 shrink-0 text-right font-mono text-caption text-foreground-tertiary tabular-nums">
            {xpFormat.format(max)}
          </span>
          <svg
            aria-hidden="true"
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            preserveAspectRatio="none"
            className="h-40 min-w-0 flex-1"
          >
            <line
              x1="0"
              x2={WIDTH}
              y1={HEIGHT - PAD}
              y2={HEIGHT - PAD}
              className="stroke-border"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
            <polyline
              points={points}
              fill="none"
              className="stroke-foreground"
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        </div>
        <div className="mt-1 flex justify-between pl-15 text-caption text-foreground-tertiary">
          <span>{dayLabel(first.localDay)}</span>
          <span>{dayLabel(last.localDay)}</span>
        </div>
        <div className="sr-only"><table>
          <caption>Cultivation XP at the end of each day</caption>
          <thead>
            <tr>
              <th scope="col">Day</th>
              <th scope="col">XP</th>
            </tr>
          </thead>
          <tbody>
            {series.map((p) => (
              <tr key={p.localDay}>
                <th scope="row">{dayLabel(p.localDay)}</th>
                <td>{p.xp}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>
    </section>
  );
}
