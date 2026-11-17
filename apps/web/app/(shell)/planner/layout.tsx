import { PageHeader } from "../page-header";
import { PlannerSwitcher } from "./planner-switcher";

/** Planner shell (Story 8.1): title, the segment switcher, then the segment. */
export default function PlannerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <PageHeader title="Planner">Plan your days, then work through them.</PageHeader>
      <div className="mt-6">
        <PlannerSwitcher />
      </div>
      <div className="mt-8">{children}</div>
    </div>
  );
}
