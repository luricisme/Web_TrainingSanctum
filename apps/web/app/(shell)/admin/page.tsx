import { notFound } from "next/navigation";
import { adminUsersQuerySchema } from "@training-sanctum/domain";
import { listUsers } from "@/lib/admin-users";
import { getServerSession, isAdminRole } from "@/lib/session";
import { PageHeader } from "../page-header";
import { UsersTable } from "./users-table";

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  const session = await getServerSession();
  if (!session || !isAdminRole((session.user as { role?: unknown }).role)) notFound();

  const { page } = await searchParams;
  const parsed = adminUsersQuerySchema.safeParse({
    page: Array.isArray(page) ? page[0] : page,
  });
  const data = await listUsers(parsed.success ? parsed.data : adminUsersQuerySchema.parse({}));

  return (
    <>
      <PageHeader title="Admin">Everyone who uses Training Sanctum, newest first.</PageHeader>
      <UsersTable data={data} />
    </>
  );
}
