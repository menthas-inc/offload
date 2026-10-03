// The panel's pages, in the order the nav draws them (034, section 0.2).
//
// Two blocks with a gap and no labels: what support sees, then what only an
// owner does. Support does not see an owner page refused, it does not see it,
// and the API answers 404 for the same pages, so this list is a courtesy and
// never the control.

export type Role = "support" | "owner";

export interface Page {
  href: string;
  label: string;
  /** A slug from the vendored icon set, `public/icons/`. */
  icon: string;
  owner: boolean;
  /** The count the entry carries, from `/v1/admin/me`. Drawn only above zero. */
  count?: "waiting" | "wrong";
}

export const PAGES: readonly Page[] = [
  { href: "/admin/waitlist", label: "Waitlist", icon: "inbox", owner: false, count: "waiting" },
  { href: "/admin/people", label: "People", icon: "users", owner: false },
  // Health carries a count when something is wrong, and nothing when all is well.
  { href: "/admin/health", label: "Health", icon: "monitor", owner: true, count: "wrong" },
  { href: "/admin/costs", label: "Costs", icon: "blend", owner: true },
  { href: "/admin/limits", label: "Limits", icon: "lock", owner: true },
  { href: "/admin/staff", label: "Staff", icon: "group", owner: true },
  { href: "/admin/audit", label: "Audit", icon: "list", owner: true },
];

/** The nav's blocks for a role. An empty block is not drawn. */
export function navFor(role: Role): Page[][] {
  const blocks = [PAGES.filter((page) => !page.owner), role === "owner" ? PAGES.filter((page) => page.owner) : []];
  return blocks.filter((block) => block.length > 0);
}

/** Where the panel opens: an owner on Health, support on Waitlist. */
export function landingFor(role: Role): string {
  return role === "owner" ? "/admin/health" : "/admin/waitlist";
}

/** Whether a path is one only an owner sees. A role that changed elsewhere
 *  sends support from one of these to Waitlist, not out of the panel. */
export function ownerOnly(pathname: string): boolean {
  return PAGES.some((page) => page.owner && (pathname === page.href || pathname.startsWith(`${page.href}/`)));
}
