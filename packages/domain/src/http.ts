/**
 * Shared Route Handler response envelope types (AD-10).
 *
 * Every successful Route Handler response is `{ data: T }` (optionally with
 * `meta` for paginated/listy endpoints). Every error response is
 * `{ error: { code, message, fields?, details? } }`, matching HTTP status to
 * `code`. A response uses at most one of `fields`/`details`, never both, and
 * never a bare string or toast-only message.
 *
 * This file intentionally has zero imports — pure types only — so it can be
 * imported by both `packages/domain` consumers and `apps/web` (API routes
 * and the UI fetch wrapper) without violating AD-1.
 */

export interface SuccessEnvelope<T> {
  data: T;
  meta?: Record<string, unknown>;
}

export interface ErrorDetail {
  line: number;
  reason: string;
}

export interface ErrorBody {
  code: string;
  message: string;
  /** Single-record field-level errors (e.g. one bad field on a create/update request). */
  fields?: Record<string, string>;
  /** Batch/line-numbered errors (e.g. import rows), one entry per failed row. */
  details?: ErrorDetail[];
}

export interface ErrorEnvelope {
  error: ErrorBody;
}

export type ApiResponse<T> = SuccessEnvelope<T> | ErrorEnvelope;

export function isErrorEnvelope<T>(
  response: ApiResponse<T>
): response is ErrorEnvelope {
  return "error" in response;
}
