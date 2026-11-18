import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./apps/web", import.meta.url)) },
  },
  test: {
    include: ["tests/domain/**/*.test.ts", "tests/a11y/**/*.test.ts"],
    environment: "node",
  },
});
