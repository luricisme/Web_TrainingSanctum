import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/session";
import { QueryProvider } from "@/lib/query-provider";
import { FocusModeProvider } from "./focus-mode";
import { Sidebar } from "./sidebar";

export default async function ShellLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  if (!(await getServerSession())) redirect("/login");

  return (
    <div className="min-h-screen bg-background sm:flex">
      {/* spec-5-1: the query client wraps the sidebar too, for the Realm badge. */}
      <QueryProvider>
        {/* spec-4-5: Review and Learn turn focus mode on to hide the sidebar. */}
        <FocusModeProvider>
          <Sidebar />
          <main className="min-w-0 flex-1 px-4 py-12 sm:px-6">
            <div className="mx-auto w-full max-w-content">{children}</div>
          </main>
        </FocusModeProvider>
      </QueryProvider>
    </div>
  );
}
