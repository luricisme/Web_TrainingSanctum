import { requireSession } from "@/lib/session";
import type { SuccessEnvelope } from "@training-sanctum/domain";

export async function GET(request: Request): Promise<Response> {
  const result = await requireSession(request);
  if (result.response) return result.response;

  const { user } = result.session;
  const body: SuccessEnvelope<{ id: string; email: string; name: string }> = {
    data: { id: user.id, email: user.email, name: user.name },
  };
  return Response.json(body);
}
