// Barrel export for @training-sanctum/domain.
//
// This story (1.1) ships only the package skeleton, the AD-1 isolation
// boundary (see ../eslint.config.mjs), and the shared HTTP envelope types
// (AD-10). SM-2 scheduling, import parsing, duplicate detection, and the
// streak/time helpers land in later stories (1.2+, Epic 2) per the
// architecture spine's Structural Seed.

export * from "./http";
