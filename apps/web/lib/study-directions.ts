/**
 * spec-4-9: the user's study directions setting (FR-18) and the Recall
 * Directions it studies, read once per request by the queue and count routes.
 */
import { prisma } from "@training-sanctum/db";
import {
  type RecallDirection,
  type StudyDirections,
  studiedDirections,
} from "@training-sanctum/domain";

export async function getStudiedDirections(
  userId: string
): Promise<{ setting: StudyDirections; dirs: RecallDirection[] }> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { studyDirections: true },
  });
  return { setting: user.studyDirections, dirs: studiedDirections(user.studyDirections) };
}
