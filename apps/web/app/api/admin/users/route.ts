import { adminUsersQuerySchema } from "@training-sanctum/domain";
import { ok, validationFailure } from "@/lib/api-response";
import { listUsers } from "@/lib/admin-users";
import { requireAdmin } from "@/lib/session";

/** Story 7.2: read-only, paginated user list with derived realm and level. */
export async function GET(request: Request) {
  const { response } = await requireAdmin(request);
  if (response) return response;

  const params = Object.fromEntries(new URL(request.url).searchParams);
  const parsed = adminUsersQuerySchema.safeParse(params);
  if (!parsed.success) return validationFailure(parsed.error);
  return ok(await listUsers(parsed.data));
}
