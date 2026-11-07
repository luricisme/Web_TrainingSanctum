// AD-2: the only place in the codebase allowed to instantiate PrismaClient.
// Every other package/route imports the singleton exported from here.
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/client/client";

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    // apps/web validates this at process start (lib/env.ts); this guard
    // covers any other consumer that imports the client directly.
    throw new Error(
      "DATABASE_URL is not set. packages/db requires it to construct the Prisma driver adapter."
    );
  }

  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

// Reuse a single client across hot reloads / serverless invocations instead
// of exhausting Postgres connections with a fresh client per import.
export const prisma: PrismaClient = global.__prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  global.__prisma = prisma;
}

export * from "./generated/client/client";
