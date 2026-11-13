/**
 * Account settings contract (spec-4-9, FR-18).
 *
 * The request schema and response shape of `GET/PATCH /api/settings`. AD-1:
 * no next, react or prisma imports.
 */
import { z } from "zod";

export const STUDY_DIRECTIONS = [
  "BOTH",
  "TERM_TO_DEFINITION",
  "DEFINITION_TO_TERM",
] as const;

export const studyDirectionsSchema = z.enum(STUDY_DIRECTIONS, {
  error: "Choose Both directions, Term → Definition or Definition → Term.",
});

export type StudyDirections = z.infer<typeof studyDirectionsSchema>;

export const updateSettingsSchema = z.object({
  studyDirections: studyDirectionsSchema,
});

export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;

/** Shape returned by `GET` and `PATCH /api/settings`. */
export interface SettingsResponse {
  studyDirections: StudyDirections;
}
