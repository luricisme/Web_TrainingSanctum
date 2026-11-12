/** True for a Prisma unique-constraint violation (P2002), e.g. a racing duplicate name. */
export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "P2002"
  );
}
