import { LogoutButton } from "@/app/components/logout-button";
import { ThemeToggle } from "@/app/components/theme-toggle";
import { PageHeader } from "../page-header";

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" />

      <section className="mt-8 flex flex-wrap items-center justify-between gap-4 border-b border-divider pb-6">
        <h2 className="text-xl font-semibold leading-[1.3] text-foreground">
          Theme
        </h2>
        <ThemeToggle />
      </section>

      <section className="mt-6 flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-xl font-semibold leading-[1.3] text-foreground">
          Account
        </h2>
        <LogoutButton />
      </section>
    </>
  );
}
