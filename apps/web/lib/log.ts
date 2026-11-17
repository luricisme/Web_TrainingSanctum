/**
 * Structured one-line JSON logging shared by Route Handlers (AD-10): every
 * membership- or data-affecting write logs `{operation, ...fields}`.
 */
export function logOperation(
  operation: string,
  entry: Record<string, unknown>
): void {
  console.info(JSON.stringify({ operation, ...entry }));
}
