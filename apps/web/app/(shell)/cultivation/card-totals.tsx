import type { StatsResponse } from "@training-sanctum/domain";
import { SectionMarker } from "@/app/components/section-marker";

const numberFormat = new Intl.NumberFormat("en-US");

/**
 * spec-5-4: Card totals over the studied directions (AD-14). Learned plus
 * unlearned is the total. Figures are mono, labels are plain text.
 */
export function CardTotals({ cards }: { cards: StatsResponse["cards"] }) {
  const rows = [
    { label: "Total", value: cards.total },
    { label: "Learned", value: cards.learned },
    { label: "Unlearned", value: cards.unlearned },
  ];
  return (
    <section aria-labelledby="card-totals" className="mt-8">
      <div className="mb-3 px-3">
        <SectionMarker as="h2" id="card-totals">
          Cards
        </SectionMarker>
      </div>
      <dl className="grid grid-cols-3 divide-x divide-divider rounded-lg border border-divider bg-card shadow-low">
        {rows.map((row) => (
          <div key={row.label} className="p-4">
            <dt className="text-caption text-foreground-secondary">{row.label}</dt>
            <dd className="mt-1 font-mono text-heading-3 text-foreground tabular-nums">
              {numberFormat.format(row.value)}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
