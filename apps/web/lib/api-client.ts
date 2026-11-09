/**
 * Fetch wrapper that unwraps the AD-10 envelope. Success resolves with `data`;
 * an error envelope (or a network failure) rejects with an `ApiError`.
 */
import type { ApiResponse, ErrorDetail } from "@training-sanctum/domain";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields?: Record<string, string>,
    readonly details?: ErrorDetail[]
  ) {
    super(message);
  }
}

export async function apiFetch<T>(
  path: string,
  init?: Omit<RequestInit, "body"> & { json?: unknown }
): Promise<T> {
  const { json, headers, ...rest } = init ?? {};
  let response: Response;
  try {
    response = await fetch(path, {
      ...rest,
      headers: {
        ...(json !== undefined ? { "Content-Type": "application/json" } : {}),
        ...headers,
      },
      body: json !== undefined ? JSON.stringify(json) : undefined,
    });
  } catch {
    throw new ApiError(0, "NETWORK_ERROR", "Could not reach the server. Try again.");
  }

  let body: ApiResponse<T> | null = null;
  try {
    body = (await response.json()) as ApiResponse<T>;
  } catch {
    body = null;
  }

  if (body && "error" in body) {
    throw new ApiError(
      response.status,
      body.error.code,
      body.error.message,
      body.error.fields,
      body.error.details
    );
  }
  if (!response.ok || !body) {
    throw new ApiError(response.status, "UNKNOWN", "Something went wrong. Try again.");
  }
  return body.data;
}
