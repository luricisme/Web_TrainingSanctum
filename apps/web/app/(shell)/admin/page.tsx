import { notFound } from "next/navigation";
import { getServerSession, isAdminRole } from "@/lib/session";
import { PageHeader } from "../page-header";

export default async function AdminPage() {
  const session = await getServerSession();
  if (!session || !isAdminRole((session.user as { role?: unknown }).role)) notFound();

  return <PageHeader title="Admin" />;
}
