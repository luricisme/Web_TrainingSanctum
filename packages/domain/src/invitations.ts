/**
 * Class invitations (spec-12-3). Pure: AD-1, no next, react or prisma
 * imports. An Owner invites a registered user by email; the invitee accepts
 * or declines from the bell. No email is ever sent.
 */
import { z } from "zod";

/** Trimmed and lower-cased: the lookup key for an account email. */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export const inviteSchema = z.object({
  email: z
    .string({ error: "Enter an email address." })
    .trim()
    .min(1, "Enter an email address.")
    .max(254, "Enter a valid email address.")
    .pipe(z.email({ error: "Enter a valid email address." })),
});

export type InviteInput = z.infer<typeof inviteSchema>;

export type InvitationStatusName = "PENDING" | "ACCEPTED" | "DECLINED";

/** Why an invite is refused, as a field-level `email` message. */
export type InviteRefusal =
  | "unknown-account"
  | "own-email"
  | "already-member"
  | "already-pending";

export const INVITE_REFUSAL_MESSAGES: Record<InviteRefusal, string> = {
  "unknown-account": "No account uses this email.",
  "own-email": "That is your own email.",
  "already-member": "Already a member of this class.",
  "already-pending": "Already invited.",
};

/**
 * Classifies an invite attempt, or null when it may proceed. The order is
 * the order the Owner would want the message in.
 */
export function classifyInvite(input: {
  invitee: { id: string } | null;
  ownerId: string;
  memberIds: readonly string[];
  pendingInviteeIds: readonly string[];
}): InviteRefusal | null {
  const { invitee } = input;
  if (!invitee) return "unknown-account";
  if (invitee.id === input.ownerId) return "own-email";
  if (input.memberIds.includes(invitee.id)) return "already-member";
  if (input.pendingInviteeIds.includes(invitee.id)) return "already-pending";
  return null;
}

/** One row of the Share modal's lists. */
export interface ShareInvitation {
  id: string;
  status: InvitationStatusName;
  email: string;
  name: string;
  createdAt: string;
  respondedAt: string | null;
}

export interface ShareMember {
  userId: string;
  email: string;
  name: string;
}

/** `GET /api/classes/[id]/invitations`. */
export interface ShareState {
  members: ShareMember[];
  invitations: ShareInvitation[];
}

/** `GET /api/invitations`: one pending invitation for the caller's bell. */
export interface InvitationSummary {
  id: string;
  classId: string;
  className: string;
  ownerName: string;
  cardCount: number;
}
