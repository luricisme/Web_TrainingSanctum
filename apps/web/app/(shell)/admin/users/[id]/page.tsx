import Link from "next/link";
import { notFound } from "next/navigation";
import { buildBackupTree } from "@training-sanctum/domain";
import { buildBackupExport } from "@/lib/backup-export";
import { getServerSession, isAdminRole } from "@/lib/session";
import { PageHeader } from "../../../page-header";
import { BackupTreeView } from "./backup-tree-view";
import { CultivationSummary } from "./cultivation-summary";
import { ReadOnlyBanner } from "./read-only-banner";

const MAX_ID_LENGTH = 128;

const linkButton =
  "inline-flex h-10 items-center rounded-full border border-border bg-card px-4 text-body-sm font-semibold text-foreground shadow-low transition-state hover:border-foreground focus-ring";

export default async function AdminUserPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession();
  if (!session || !isAdminRole((session.user as { role?: unknown }).role)) notFound();

  const { id } = await params;
  if (!id || id.length > MAX_ID_LENGTH) notFound();
  const payload = await buildBackupExport(id);
  if (!payload) notFound();

  return (
    <>
      <ReadOnlyBanner email={payload.user.email} />
      <Link
        href="/admin"
        className="inline-flex rounded-sm text-body-sm font-semibold text-foreground-secondary transition-state hover:text-foreground focus-ring"
      >
        Back to Admin
      </Link>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <PageHeader title={payload.user.email}>
            Timezone {payload.user.timezone}. Study directions:{" "}
            {payload.user.studyDirections.toLowerCase().replaceAll("_", " ")}.
          </PageHeader>
        </div>
        <a href={`/api/admin/users/${payload.user.id}/export`} download className={linkButton}>
          Export
        </a>
      </div>
      <BackupTreeView tree={buildBackupTree(payload)} />
      <CultivationSummary cultivation={payload.cultivation} />
    </>
  );
}
