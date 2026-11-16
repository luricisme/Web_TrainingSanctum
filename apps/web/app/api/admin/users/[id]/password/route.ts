import { prisma } from "@training-sanctum/db";
import { adminPasswordResetSchema, type AdminPasswordReset } from "@training-sanctum/domain";
import { z } from "zod";
import { HttpError, fail, ok, readJson, validationFailure } from "@/lib/api-response";
import { auth } from "@/lib/auth";
import { requireAdmin } from "@/lib/session";

type Context = { params: Promise<{ id: string }> };

const idSchema = z.string().min(1).max(64);

/**
 * Story 7.5: an admin sets a new password for a user. The hash comes from
 * Better Auth's own hasher, and every session of the user is deleted in the
 * same transaction. The password and hash are never logged or returned.
 */
export async function PUT(request: Request, { params }: Context): Promise<Response> {
  const result = await requireAdmin(request);
  if (result.response) return result.response;
  const adminId = result.session.user.id;

  const parsedId = idSchema.safeParse((await params).id);
  if (!parsedId.success) return validationFailure(parsedId.error);
  const userId = parsedId.data;

  const log = (level: "info" | "error", entry: Record<string, unknown>) =>
    console[level](JSON.stringify({ operation: "admin.reset-password", adminId, userId, ...entry }));

  const raw = await readJson(request);
  if (raw === null) {
    log("error", { outcome: "rejected:400" });
    return fail(400, "INVALID_JSON", "Request body must be JSON.");
  }
  const parsed = adminPasswordResetSchema.safeParse(raw);
  if (!parsed.success) {
    log("error", { outcome: "rejected:400" });
    return validationFailure(parsed.error);
  }

  if (userId === adminId) {
    log("error", { outcome: "rejected:409", code: "CANNOT_RESET_SELF" });
    return fail(409, "CANNOT_RESET_SELF", "You cannot reset your own password here.");
  }

  try {
    const hash = await (await auth.$context).password.hash(parsed.data.password);
    const sessionsRevoked = await prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM "users" WHERE id = ${userId} FOR UPDATE`;
      if (locked.length === 0) throw new HttpError(404, "NOT_FOUND", "User not found.");

      const account = await tx.account.findFirst({
        where: { userId, providerId: "credential" },
        select: { id: true },
      });
      if (!account) {
        throw new HttpError(
          409,
          "NO_PASSWORD_ACCOUNT",
          "This user has no password login, so there is no password to reset."
        );
      }
      await tx.account.update({ where: { id: account.id }, data: { password: hash } });
      return (await tx.session.deleteMany({ where: { userId } })).count;
    });

    log("info", { outcome: "success", sessionsRevoked });
    const data: AdminPasswordReset = { id: userId };
    return ok(data);
  } catch (error) {
    if (error instanceof HttpError) {
      log("error", { outcome: `rejected:${error.status}`, code: error.code });
      return error.toResponse();
    }
    log("error", { outcome: "failed", error: "unexpected error" });
    return fail(500, "RESET_FAILED", "The reset failed. Nothing was changed.");
  }
}
