import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/session";
import { QueryProvider } from "@/lib/query-provider";
import { AppBar } from "./app-bar";
import { Dock } from "./dock";
import { FocusModeProvider } from "./focus-mode";

export default async function ShellLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await getServerSession();
  if (!session) redirect("/login");

  return (
    <div className="min-h-screen bg-backdrop sm:p-3">
      {/* The app frame: a dark shell holding the app bar, with the light
          content panel inset in it. Below 640px the panel is the whole screen. */}
      <div className="flex min-h-screen flex-col bg-frame sm:min-h-[calc(100vh-1.5rem)] sm:rounded-frame sm:p-1.5">
        {/* spec-5-1: the query client wraps the app bar too, for the Realm badge. */}
        <QueryProvider>
          {/* spec-4-5: Review and Learn turn focus mode on to hide the app bar. */}
          <FocusModeProvider>
            <AppBar userName={session.user.name} />
            {/* Below 640px the bottom padding keeps the dock off the page end. */}
            <main className="min-w-0 flex-1 bg-background px-4 pb-28 pt-10 sm:rounded-panel sm:px-8 sm:pb-10">
              <div className="mx-auto w-full max-w-content">{children}</div>
            </main>
            <Dock />
          </FocusModeProvider>
        </QueryProvider>
      </div>
    </div>
  );
}
