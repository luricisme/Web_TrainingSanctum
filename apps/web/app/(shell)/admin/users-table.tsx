import Link from "next/link";
import type { AdminUsersResponse } from "@training-sanctum/domain";

const dateFormat = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});
const numberFormat = new Intl.NumberFormat("en-US");

const th = "px-4 py-3 text-left text-overline uppercase text-foreground-tertiary";
const td = "px-4 py-3 align-middle";
const pagerLink =
  "inline-flex h-10 items-center rounded-full border border-border bg-card px-4 text-body-sm font-semibold text-foreground shadow-low transition-state hover:border-foreground focus-ring";
const pagerOff = `${pagerLink} cursor-not-allowed opacity-40 hover:border-border`;

/** Read-only user list (DESIGN.md admin-table): a card surface, each row a link to the user. */
export function UsersTable({ data }: { data: AdminUsersResponse }) {
  const { items, total, page, pageSize } = data;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const prev = Math.min(page - 1, pages);
  const first = items.length ? (page - 1) * pageSize + 1 : 0;
  const last = (page - 1) * pageSize + items.length;
  const href = (p: number) => (p <= 1 ? "/admin" : `/admin?page=${p}`);

  return (
    <section aria-label="Users" className="mt-8">
      <div className="overflow-x-auto rounded-lg border border-divider bg-card shadow-low">
        <table className="w-full min-w-[40rem] border-collapse text-body-sm">
          <thead>
            <tr className="border-b border-divider">
              <th scope="col" className={th}>Email</th>
              <th scope="col" className={th}>Created</th>
              <th scope="col" className={th}>Status</th>
              <th scope="col" className={th}>Realm</th>
              <th scope="col" className={`${th} text-right`}>Level</th>
              <th scope="col" className={`${th} text-right`}>XP</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-foreground-secondary">
                  No users on this page.
                </td>
              </tr>
            ) : (
              items.map((u) => (
                <tr
                  key={u.id}
                  className="relative cursor-pointer border-b border-divider last:border-b-0 transition-state hover:bg-row-hover"
                >
                  <td className={`${td} max-w-[18rem]`}>
                    <Link
                      href={`/admin/users/${u.id}`}
                      className="-mx-1 block truncate rounded-sm px-1 py-0.5 font-semibold text-foreground after:absolute after:inset-0 after:content-[''] focus-ring"
                    >
                      {u.email}
                    </Link>
                  </td>
                  <td className={`${td} whitespace-nowrap text-foreground-secondary`}>
                    {dateFormat.format(new Date(u.createdAt))}
                  </td>
                  <td
                    className={`${td} ${u.disabled ? "font-semibold text-foreground" : "text-foreground-secondary"}`}
                  >
                    {u.disabled ? "Disabled" : "Active"}
                  </td>
                  <td className={`${td} whitespace-nowrap text-foreground`}>{u.realm}</td>
                  <td className={`${td} text-right font-mono text-foreground`}>{u.level}</td>
                  <td className={`${td} text-right font-mono text-foreground-secondary`}>
                    {numberFormat.format(u.xp)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <nav aria-label="Pagination" className="mt-4 flex items-center justify-between gap-3">
        <p className="text-caption text-foreground-secondary">
          {items.length === 0
            ? `0 of ${numberFormat.format(total)}`
            : `${first}–${last} of ${numberFormat.format(total)}`}
        </p>
        <div className="flex gap-2">
          {page > 1 ? (
            <Link href={href(prev)} rel="prev" className={pagerLink}>
              Previous
            </Link>
          ) : (
            <span aria-disabled="true" className={pagerOff}>Previous</span>
          )}
          {page < pages ? (
            <Link href={href(page + 1)} rel="next" className={pagerLink}>
              Next
            </Link>
          ) : (
            <span aria-disabled="true" className={pagerOff}>Next</span>
          )}
        </div>
      </nav>
    </section>
  );
}
