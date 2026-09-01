"use client";

// The admin shell.
//
// Moss nav, an `admin` tag beside the wordmark, sidebar plus one pane. The
// colour is the point: support keeps this window and the app open next to each
// other all day, and the two must never be confused at a glance.
//
// The nav renders from the role. Support does not see costs, limits and staff
// refused, it does not see them at all, so those items are absent rather than
// disabled. Right now only the waitlist exists, and an item that leads to a
// page nobody has built is the same lie as a disabled one.

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Logo } from "../../components/Logo";
import styles from "./admin.module.css";

const API = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4701";

type Role = "support" | "owner";

const PAGES: Array<{ href: string; label: string; owner?: boolean }> = [
  { href: "/admin/waitlist", label: "Waitlist" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [role, setRole] = useState<Role | null>(null);

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
        const data = (await response.json()) as { role: Role };
        setRole(data.role);
      })
      .catch(() => {});
  }, [router]);

  if (!role) return null;

  return (
    <div className={styles.frame}>
      <nav className={styles.nav}>
        <div className={styles.brand}>
          <Logo size={20} />
          <span className={styles.tag}>admin</span>
        </div>

        <div className={styles.navList}>
          {PAGES.filter((page) => !page.owner || role === "owner").map((page) => (
            <Link
              key={page.href}
              href={page.href}
              className={`${styles.navItem} ${pathname === page.href ? styles.navItemOn : ""}`}
            >
              {page.label}
            </Link>
          ))}
        </div>

        <p className={styles.who}>Signed in as {role}</p>
      </nav>

      <main className={styles.pane}>{children}</main>
    </div>
  );
}
