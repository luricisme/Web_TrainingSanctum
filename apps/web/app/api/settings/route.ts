import { prisma } from "@training-sanctum/db";
import { type SettingsResponse, updateSettingsSchema } from "@training-sanctum/domain";
import { requireSession } from "@/lib/session";
import { fail, ok, readJson, validationFailure } from "@/lib/api-response";

/** spec-4-9: the account's settings (FR-18 study directions). */
export async function GET(request: Request): Promise<Response> {
  const result = await requireSession(request);
  if (result.response) return result.response;

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: result.session.user.id },
    select: { studyDirections: true },
  });
  const data: SettingsResponse = { studyDirections: user.studyDirections };
  return ok(data);
}

/**
 * Saves the study directions setting. It changes no Scheduling Record: the
 * queues read it at their next load, and a running session keeps its snapshot.
 */
export async function PATCH(request: Request): Promise<Response> {
  const result = await requireSession(request);
  if (result.response) return result.response;

  const body = await readJson(request);
  if (body === null) {
    return fail(400, "INVALID_JSON", "Request body must be JSON.");
  }
  const parsed = updateSettingsSchema.safeParse(body);
  if (!parsed.success) return validationFailure(parsed.error);

  const user = await prisma.user.update({
    where: { id: result.session.user.id },
    data: { studyDirections: parsed.data.studyDirections },
    select: { studyDirections: true },
  });
  const data: SettingsResponse = { studyDirections: user.studyDirections };
  return ok(data);
}
