import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // packages/domain and packages/db are workspace packages consumed as TS
  // source (no pre-build step) — have Next.js transpile them directly.
  transpilePackages: ["@training-sanctum/domain", "@training-sanctum/db"],
};

export default nextConfig;
