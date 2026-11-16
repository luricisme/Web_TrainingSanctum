import { prisma } from "@training-sanctum/db";
import {
  adminUserDeleteSchema,
  adminUserStatusSchema,
  type AdminUserDeleted,
  type AdminUserStatus,
} from "@training-sanctum/domain";
import { z } from "zod";
import { HttpError, fail, ok, readJson, validationFailure } from "@/lib/api-response";
import { requireAdmin } from "@/lib/session";

type Context = { params: Promise<{ id: string }> };

const idSchema = z.string().min(1).max(64);

/**
 * Story 7.4: disable or enable a user. Disabling deletes every session of the
 * user in the same transaction; the Better Auth `session.create.before` hook
 * (lib/auth.ts) refuses new ones. The user's data is never touched.
 */
export async function PATCH(request: Request, { params }: Context): Promise<Response> {
  const result = await requireAdmin(request);
  if (result.response) return result.response;
  const adminId = result.session.user.id;

  const parsedId = idSchema.safeParse((await params).id);
  if (!parsedId.success) return validationFailure(parsedId.error);
  const userId = parsedId.data;

  let operation = "admin.disable";
  const log = (level: "info" | "error", entry: Record<string, unknown>) =>
    console[level](JSON.stringify({ operation, adminId, userId, ...entry }));

  const raw = await readJson(request);
  if (raw === null) {
    log("error", { outcome: "rejected:400" });
    return fail(400, "INVALID_JSON", "Request body must be JSON.");
  }
  const parsed = adminUserStatusSchema.safeParse(raw);
  if (!parsed.success) {
    log("error", { outcome: "rejected:400" });
    return validationFailure(parsed.error);
  }
  const { disabled } = parsed.data;
  operation = disabled ? "admin.disable" : "admin.enable";

  try {
    const sessionsRevoked = await prisma.$transaction(async (tx) => {
      // First statement: locks the target and every admin row in id order, so
      // concurrent changes serialise and two admins cannot disable each other.
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM "users" WHERE id = ${userId} OR role = 'admin' ORDER BY id FOR UPDATE`;
      if (!locked.some((row) => row.id === userId)) {
        throw new HttpError(404, "NOT_FOUND", "User not found.");
      }
      const target = await tx.user.findUniqueOrThrow({
        where: { id: userId },
        select: { role: true, disabled: true },
      });

      if (disabled) {
        if (userId === adminId) {
          throw new HttpError(409, "CANNOT_DISABLE_SELF", "You cannot disable your own account.");
        }
        if (target.role === "admin" && !target.disabled) {
          const others = await tx.user.count({
            where: { role: "admin", disabled: false, id: { not: userId } },
          });
          if (others === 0) {
            throw new HttpError(
              409,
              "LAST_ADMIN",
              "This is the last enabled admin. Enable or add another admin first."
            );
          }
        }
      }

      if (target.disabled !== disabled) {
        await tx.user.update({ where: { id: userId }, data: { disabled } });
      }
      if (!disabled) return 0;
      // Also covers a repeat disable: any session that slipped in is removed.
      return (await tx.session.deleteMany({ where: { userId } })).count;
    });

    log("info", { outcome: "success", sessionsRevoked });
    const data: AdminUserStatus = { id: userId, disabled };
    return ok(data);
  } catch (error) {
    if (error instanceof HttpError) {
      log("error", { outcome: `rejected:${error.status}`, code: error.code });
      return error.toResponse();
    }
    log("error", {
      outcome: "failed",
      error: error instanceof Error ? error.message.slice(0, 300) : String(error),
    });
    return fail(500, "STATUS_FAILED", "The change failed. Nothing was changed.");
  }
}

/**
 * Story 7.6: delete a user and everything scoped to them in one transaction.
 * Every user-owned table cascades from `users`; verification rows are keyed by
 * email, so they are removed explicitly. The body's `email` must equal the
 * stored one exactly.
 */
export async function DELETE(request: Request, { params }: Context): Promise<Response> {
  const result = await requireAdmin(request);
  if (result.response) return result.response;
  const adminId = result.session.user.id;

  const parsedId = idSchema.safeParse((await params).id);
  if (!parsedId.success) return validationFailure(parsedId.error);
  const userId = parsedId.data;

  const log = (level: "info" | "error", entry: Record<string, unknown>) =>
    console[level](JSON.stringify({ operation: "admin.delete", adminId, userId, ...entry }));

  const raw = await readJson(request);
  if (raw === null) {
    log("error", { outcome: "rejected:400" });
    return fail(400, "INVALID_JSON", "Request body must be JSON.");
  }
  const parsed = adminUserDeleteSchema.safeParse(raw);
  if (!parsed.success) {
    log("error", { outcome: "rejected:400" });
    return validationFailure(parsed.error);
  }
  const { email } = parsed.data;

  try {
    await prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM "users" WHERE id = ${userId} OR role = 'admin' ORDER BY id FOR UPDATE`;
      if (!locked.some((row) => row.id === userId)) {
        throw new HttpError(404, "NOT_FOUND", "User not found.");
      }
      const target = await tx.user.findUniqueOrThrow({
        where: { id: userId },
        select: { role: true, disabled: true, email: true },
      });
      if (userId === adminId) {
        throw new HttpError(409, "CANNOT_DELETE_SELF", "You cannot delete your own account.");
      }
      if (target.role === "admin" && !target.disabled) {
        const others = await tx.user.count({
          where: { role: "admin", disabled: false, id: { not: userId } },
        });
        if (others === 0) {
          throw new HttpError(
            409,
            "LAST_ADMIN",
            "This is the last enabled admin. Enable or add another admin first."
          );
        }
      }
      if (email !== target.email) {
        throw new HttpError(400, "EMAIL_MISMATCH", "The email does not match this user.");
      }
      await tx.verification.deleteMany({ where: { identifier: target.email } });
      await tx.user.delete({ where: { id: userId } });
    });

    log("info", { outcome: "success" });
    const data: AdminUserDeleted = { id: userId };
    return ok(data);
  } catch (error) {
    if (error instanceof HttpError) {
      log("error", { outcome: `rejected:${error.status}`, code: error.code });
      return error.toResponse();
    }
    log("error", {
      outcome: "failed",
      error: error instanceof Error ? error.message.slice(0, 300) : String(error),
    });
    return fail(500, "DELETE_FAILED", "The delete failed. Nothing was deleted.");
  }
}
