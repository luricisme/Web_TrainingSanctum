import { test, expect } from "@playwright/test";

// Trivial placeholder (AC3): proves the Playwright `request` fixture suite
// runs against a live app instance (AD-12). Real API/integration coverage
// (seeded test database, Route Handlers) lands alongside the routes
// themselves in later stories.
test("landing page responds over HTTP", async ({ request, baseURL }) => {
  const response = await request.get(baseURL ?? "http://localhost:3000");
  expect(response.ok()).toBeTruthy();
});
