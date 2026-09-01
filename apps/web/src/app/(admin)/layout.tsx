"use client";

// The admin shell, from ui_kits/admin_web/A.jsx (ASideNav).
//
// Moss nav, mark plus wordmark plus an `admin` tag, nav items carrying their
// own counts, the signed-in address at the bottom and a way back to the app.
// An earlier version had only the mark, no count, no address and no way back,
// which is what the kit is for and what reading it would have prevented.

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Logo } from "../../components/Logo";
import styles from "./admin.module.css";

const API = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4701";

interface Staff {
  role: "support" | "owner";
  email: string;
  waiting: number;
}

/** Only the pages that exist. An item leading nowhere is the same lie as a
 *  disabled one, and support does not see owner pages refused, it does not see
 *  them: the `owner` flag is how that stays true when they arrive. */
const PAGES: Array<{
  href: string;
  label: string;
  icon: string;
  owner?: boolean;
  count?: keyof Staff;
}> = [{ href: "/admin/waitlist", label: "Waitlist", icon: "inbox", count: "waiting" }];

/** The nav glyphs, one per page, at the kit's 17px on a 24 grid.
 *
 *  Drawn here rather than imported: the design system's Icon set lives in its
 *  bundle, which is generated for the kits and not a package this app can
 *  depend on. Same stroke weight and same grid, so they sit with the set. */
function NavIcon({ name }: { name: string }) {
  const common = {
    width: 17,
    height: 17,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  // inbox: a tray whose lid opens in the middle, which is where things land.
  if (name === "inbox") {
    return (
      <svg {...common}>
        <path d="M4 13h4l1.5 2.5h5L16 13h4" />
        <path d="M4 13l2.2-6.2A2 2 0 0 1 8.1 5.5h7.8a2 2 0 0 1 1.9 1.3L20 13v3.5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
      </svg>
    );
  }

  return null;
}

function ChevronLeft() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 6l-6 6 6 6" />
    </svg>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [staff, setStaff] = useState<Staff | null>(null);

  useEffect(() => {
    fetch(`${API}/v1/admin/me`, { credentials: "include" })
      .then(async (response) => {
        // 404, not 403. The panel does not confirm its own existence to
        // someone signed in who is not staff, so there is nothing here to
        // distinguish "wrong person" from "wrong URL".
        if (!response.ok) {
          router.replace("/");
          return;
        }
        setStaff((await response.json()) as Staff);
      })
      .catch(() => {});
  }, [router, pathname]);

  if (!staff) return null;

  return (
    <div className={styles.frame}>
      <nav className={styles.nav}>
        <div className={styles.brand}>
          <Logo variant="mark" size={19} tone="inverse" />
          <span className={styles.brandWord}>offload</span>
          <span className={styles.tag}>admin</span>
        </div>

        <div className={styles.navList}>
          {PAGES.filter((page) => !page.owner || staff.role === "owner").map((page) => {
            const count = page.count ? staff[page.count] : null;
            return (
              <Link
                key={page.href}
                href={page.href}
                className={`${styles.navItem} ${pathname === page.href ? styles.navItemOn : ""}`}
              >
                <NavIcon name={page.icon} />
                <span className={styles.navLabel}>{page.label}</span>
                {/* Only when there is something to do. A zero is not news. */}
                {typeof count === "number" && count > 0 ? (
                  <em className={styles.navCount}>{count.toLocaleString("en-GB")}</em>
                ) : null}
              </Link>
            );
          })}
        </div>

        <div className={styles.navFoot}>
          <span className={styles.who}>Signed in as {staff.email}</span>
          {/* Bidirectional: the app has a way here too, for staff only. */}
          <Link href="/today" className={styles.back}>
            <ChevronLeft />
            Back to the app
          </Link>
        </div>
      </nav>

      <main className={styles.pane}>{children}</main>
    </div>
  );
}
