import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// AC2: apps/web/lib/env.ts validates process.env at import time and throws
// a clear, readable error on missing/malformed config instead of letting a
// request crash deep inside a handler. The module has import-time
// side-effects, so each case needs a fresh module instance via
// vi.resetModules() + dynamic import.
describe("apps/web/lib/env fail-fast validation (AC2)", () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("throws naming every missing required variable", async () => {
    process.env = { ...ORIGINAL_ENV };
    delete process.env.DATABASE_URL;
    delete process.env.BETTER_AUTH_SECRET;

    await expect(import("../../apps/web/lib/env")).rejects.toThrow(
      /DATABASE_URL: DATABASE_URL is required[\s\S]*BETTER_AUTH_SECRET: BETTER_AUTH_SECRET is required/
    );
  });

  it("rejects a DATABASE_URL that isn't a postgres connection string", async () => {
    process.env = {
      ...ORIGINAL_ENV,
      DATABASE_URL: "http://example.com/not-postgres",
      BETTER_AUTH_SECRET: "test-secret",
    };

    await expect(import("../../apps/web/lib/env")).rejects.toThrow(
      /DATABASE_URL must use the postgres:\/\/ or postgresql:\/\/ scheme/
    );
  });

  it("succeeds and returns the parsed env when config is valid", async () => {
    process.env = {
      ...ORIGINAL_ENV,
      DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
      BETTER_AUTH_SECRET: "test-secret",
    };

    const { env } = await import("../../apps/web/lib/env");
    expect(env.DATABASE_URL).toBe("postgresql://user:pass@localhost:5432/db");
  });
});
