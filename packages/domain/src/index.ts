// Barrel export for @training-sanctum/domain.
//
// Story 1.1 shipped the package skeleton, the AD-1 isolation boundary (see
// ../eslint.config.mjs), and the shared HTTP envelope types (AD-10). Story
// 1.2 adds the registration request validation schema. SM-2 scheduling,
// import parsing, duplicate detection, and the streak/time helpers land in
// later stories (Epic 2) per the architecture spine's Structural Seed.

export * from "./http";
export * from "./auth/registration";
