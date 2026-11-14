import { LogoutButton } from "@/app/components/logout-button";
import { ThemeToggle } from "@/app/components/theme-toggle";
import { PageHeader } from "../page-header";
import { StudyDirectionsControl } from "./study-directions";

/**
 * Each setting: title (and help) left, control right. A white surface card
 * from 640px; below it a plain row with a divider, so a stacked control spans
 * the content column.
 */
const sectionClass =
  "flex flex-wrap justify-between gap-4 border-b border-divider pb-6 last:border-b-0 sm:rounded-lg sm:border sm:border-divider sm:bg-card sm:p-6 sm:shadow-low sm:last:border-b";

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" />

      <div className="mt-8 flex flex-col gap-6 sm:gap-3">
        <section className={`${sectionClass} items-center`}>
          <h2 className="text-heading-3 text-foreground">
            Theme
          </h2>
          <ThemeToggle />
        </section>

        <section className={`${sectionClass} items-start`}>
          <div className="max-w-md">
            <h2 id="study-directions-title" className="text-heading-3 text-foreground">
              Study directions
            </h2>
            <p id="study-directions-help" className="mt-1 text-body-sm text-foreground-secondary">
              Which way cards are asked in Learn and Review. Turning a direction off keeps its progress.
            </p>
          </div>
          <StudyDirectionsControl />
        </section>

        <section className={`${sectionClass} items-center`}>
          <h2 className="text-heading-3 text-foreground">
            Account
          </h2>
          <LogoutButton />
        </section>
      </div>
    </>
  );
}
