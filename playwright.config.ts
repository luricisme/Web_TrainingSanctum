import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const baseURL = `http://localhost:${PORT}`;

// AD-12: Playwright runs both the API/integration suite (request fixture
// against Route Handlers) and the E2E suite (browser fixture against a
// running app) as two projects sharing one webServer. CI points
// DATABASE_URL at a disposable Postgres (see .github/workflows/ci.yml); a
// syntactically valid placeholder is enough for story 1.1, since no route
// touches the database yet.
export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "api",
      testDir: "./tests/api",
    },
    {
      name: "e2e",
      testDir: "./tests/e2e",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run build -w apps/web && npm run start -w apps/web -- -p " + PORT,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      DATABASE_URL:
        process.env.DATABASE_URL ??
        "postgresql://placeholder:placeholder@localhost:5432/placeholder",
      BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ?? "placeholder-secret-for-ci",
    },
  },
});
