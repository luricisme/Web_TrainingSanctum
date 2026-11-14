import { backupExportSchema } from "@training-sanctum/domain";
import { z } from "zod";
import { fail, validationFailure } from "@/lib/api-response";
import { buildBackupExport } from "@/lib/backup-export";
import { requireAdmin } from "@/lib/session";

type Context = { params: Promise<{ id: string }> };

const idSchema = z.string().min(1).max(64);

/** Story 5.2: admin-only JSON backup download for one user. Read-only. */
export async function GET(request: Request, { params }: Context): Promise<Response> {
  const result = await requireAdmin(request);
  if (result.response) return result.response;
  const adminId = result.session.user.id;

  const parsedId = idSchema.safeParse((await params).id);
  if (!parsedId.success) return validationFailure(parsedId.error);
  const userId = parsedId.data;

  const payload = await buildBackupExport(userId);
  if (!payload) return fail(404, "NOT_FOUND", "User not found.");

  const checked = backupExportSchema.safeParse(payload);
  if (!checked.success) {
    console.error(
      JSON.stringify({
        operation: "admin.export.invalid",
        adminId,
        userId,
        issues: checked.error.issues
          .slice(0, 5)
          .map((i) => ({ path: i.path.join("."), message: i.message })),
      })
    );
    return fail(500, "EXPORT_INVALID", "The backup could not be built.");
  }

  console.info(JSON.stringify({ operation: "admin.export", adminId, userId }));
  const stamp = payload.exportedAt.slice(0, 10);
  return new Response(JSON.stringify(checked.data, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="training-sanctum-backup-${userId}-${stamp}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
