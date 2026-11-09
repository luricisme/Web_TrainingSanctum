/**
 * Server-side helpers for Route Handlers that build the AD-10 envelopes.
 */
import type { ZodError } from "zod";
import type {
  ErrorDetail,
  ErrorEnvelope,
  SuccessEnvelope,
} from "@training-sanctum/domain";

export function ok<T>(data: T, status = 200): Response {
  const body: SuccessEnvelope<T> = { data };
  return Response.json(body, { status });
}

export function fail(
  status: number,
  code: string,
  message: string,
  fields?: Record<string, string>,
  details?: ErrorDetail[]
): Response {
  const body: ErrorEnvelope = {
    error: {
      code,
      message,
      ...(fields ? { fields } : {}),
      ...(details ? { details } : {}),
    },
  };
  return Response.json(body, { status });
}

/** First Zod issue per top-level field, for the envelope's `fields`. */
export function zodFields(error: ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "body");
    fields[key] ??= issue.message;
  }
  return fields;
}

export function validationFailure(error: ZodError): Response {
  return fail(
    400,
    "VALIDATION_ERROR",
    "Check the highlighted fields.",
    zodFields(error)
  );
}

/** Parses the JSON body, or returns null when it is missing or malformed. */
export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

/** Thrown inside a `$transaction` to roll it back and answer with an envelope. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields?: Record<string, string>,
    readonly details?: ErrorDetail[]
  ) {
    super(message);
  }

  toResponse(): Response {
    return fail(this.status, this.code, this.message, this.fields, this.details);
  }
}
