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

  it("defaults AUTH_RATE_LIMIT to on and accepts off", async () => {
    const base = {
      ...ORIGINAL_ENV,
      DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
      BETTER_AUTH_SECRET: "test-secret",
    };

    process.env = { ...base };
    delete process.env.AUTH_RATE_LIMIT;
    expect((await import("../../apps/web/lib/env")).env.AUTH_RATE_LIMIT).toBe("on");

    vi.resetModules();
    process.env = { ...base, AUTH_RATE_LIMIT: "off" };
    expect((await import("../../apps/web/lib/env")).env.AUTH_RATE_LIMIT).toBe("off");
  });

  describe("ADMIN_EMAILS (Story 7.1)", () => {
    const base = {
      DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
      BETTER_AUTH_SECRET: "test-secret",
    };

    it("is [] when unset or empty", async () => {
      process.env = { ...ORIGINAL_ENV, ...base };
      delete process.env.ADMIN_EMAILS;
      expect((await import("../../apps/web/lib/env")).adminEmails).toEqual([]);

      vi.resetModules();
      process.env = { ...ORIGINAL_ENV, ...base, ADMIN_EMAILS: "" };
      expect((await import("../../apps/web/lib/env")).adminEmails).toEqual([]);
    });

    it("trims, lower-cases and de-duplicates", async () => {
      process.env = {
        ...ORIGINAL_ENV,
        ...base,
        ADMIN_EMAILS: " A@x.test , b@X.test,a@x.test ",
      };
      expect((await import("../../apps/web/lib/env")).adminEmails).toEqual([
        "a@x.test",
        "b@x.test",
      ]);
    });

    it("fails with the ADMIN_EMAILS message on a malformed entry", async () => {
      process.env = { ...ORIGINAL_ENV, ...base, ADMIN_EMAILS: "a@x.test,not-an-email" };
      await expect(import("../../apps/web/lib/env")).rejects.toThrow(
        /ADMIN_EMAILS: ADMIN_EMAILS must be a comma-separated list of valid emails/
      );
    });
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

  // Code review (2026-11-08): this exact empty-string-rejection bug already
  // regressed once in story 1.2 (see spec-1-2's Review Triage Log) and CI
  // never sets BETTER_AUTH_URL, so nothing else would catch a reintroduction.
  it("treats an explicitly-empty BETTER_AUTH_URL as unset", async () => {
    process.env = {
      ...ORIGINAL_ENV,
      DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
      BETTER_AUTH_SECRET: "test-secret",
      BETTER_AUTH_URL: "",
    };

    const { env } = await import("../../apps/web/lib/env");
    expect(env.BETTER_AUTH_URL).toBeUndefined();
  });

  it("rejects a BETTER_AUTH_URL that isn't a valid URL", async () => {
    process.env = {
      ...ORIGINAL_ENV,
      DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
      BETTER_AUTH_SECRET: "test-secret",
      BETTER_AUTH_URL: "not-a-url",
    };

    await expect(import("../../apps/web/lib/env")).rejects.toThrow(
      /BETTER_AUTH_URL must be a valid URL/
    );
  });
});
