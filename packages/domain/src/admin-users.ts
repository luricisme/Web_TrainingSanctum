import { z } from "zod";

export const ADMIN_USERS_DEFAULT_PAGE_SIZE = 20;
export const ADMIN_USERS_MAX_PAGE_SIZE = 100;
/** Keeps `skip` (page × pageSize) inside the database's 32-bit range. */
export const ADMIN_USERS_MAX_PAGE = 1_000_000;

/** Story 7.2: `GET /api/admin/users?page=&pageSize=`. */
export const adminUsersQuerySchema = z.object({
  page: z.coerce
    .number({ error: "Page must be a whole number." })
    .int("Page must be a whole number.")
    .min(1, "Page must be 1 or more.")
    .max(ADMIN_USERS_MAX_PAGE, `Page must be ${ADMIN_USERS_MAX_PAGE} or less.`)
    .default(1),
  pageSize: z.coerce
    .number({ error: "Page size must be a whole number." })
    .int("Page size must be a whole number.")
    .min(1, "Page size must be 1 or more.")
    .max(ADMIN_USERS_MAX_PAGE_SIZE, `Page size must be ${ADMIN_USERS_MAX_PAGE_SIZE} or less.`)
    .default(ADMIN_USERS_DEFAULT_PAGE_SIZE),
});

export type AdminUsersQuery = z.infer<typeof adminUsersQuerySchema>;

/** One row of the Admin user list. Read-only; no secrets or profile fields. */
export interface AdminUserItem {
  id: string;
  email: string;
  /** ISO 8601. */
  createdAt: string;
  disabled: boolean;
  /** Realm and stage label from `levelForXp`. */
  realm: string;
  /** 1-based level. */
  level: number;
  xp: number;
}

export interface AdminUsersResponse {
  items: AdminUserItem[];
  total: number;
  page: number;
  pageSize: number;
}
