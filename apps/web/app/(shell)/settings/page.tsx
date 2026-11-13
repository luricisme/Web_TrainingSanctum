import { LogoutButton } from "@/app/components/logout-button";
import { ThemeToggle } from "@/app/components/theme-toggle";
import { PageHeader } from "../page-header";
import { StudyDirectionsControl } from "./study-directions";

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" />

      <section className="mt-8 flex flex-wrap items-center justify-between gap-4 border-b border-divider pb-6">
        <h2 className="text-heading-3 text-foreground">
          Theme
        </h2>
        <ThemeToggle />
      </section>

      <section className="mt-6 flex flex-wrap items-start justify-between gap-4 border-b border-divider pb-6">
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

      <section className="mt-6 flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-heading-3 text-foreground">
          Account
        </h2>
        <LogoutButton />
      </section>
    </>
  );
}
