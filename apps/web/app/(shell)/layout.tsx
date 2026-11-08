import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/session";
import { QueryProvider } from "@/lib/query-provider";
import { Sidebar } from "./sidebar";

export default async function ShellLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  if (!(await getServerSession())) redirect("/login");

  return (
    <div className="min-h-screen bg-background sm:flex">
      <Sidebar />
      <main className="min-w-0 flex-1 px-4 py-12 sm:px-6">
        <div className="mx-auto w-full max-w-content">
          <QueryProvider>{children}</QueryProvider>
        </div>
      </main>
    </div>
  );
}
