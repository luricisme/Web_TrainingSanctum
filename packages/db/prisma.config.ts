// Prisma 7 CLI config (migrate/generate/studio). Connection string lives
// here instead of the schema.prisma datasource block. Runtime PrismaClient
// instantiation (client.ts) reads DATABASE_URL independently via the pg
// driver adapter.
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "./schema.prisma",
  datasource: {
    url: env("DATABASE_URL"),
  },
});
