"use client";

// The admin shell, from ui_kits/admin_web/A.jsx (ASideNav).
//
// Moss nav, mark plus wordmark plus an `admin` tag, nav pages carrying their
// own counts, the signed-in address at the bottom and a way back to the app.
// An earlier version had only the mark, no count, no address and no way back,
// which is what the kit is for and what reading it would have prevented.
//
// 034. Seven pages in two blocks (`ui/nav.ts`), glyphs from the vendored icon
// set, and the panel pinned light until a dark one is designed.

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Icon } from "../../components/Icon";
import { Logo } from "../../components/Logo";
import { AdminProvider, type Staff } from "./admin-context";
import { API, Failed, Loading, landingFor, navFor, ownerOnly } from "./ui";
import styles from "./admin.module.css";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [staff, setStaff] = useState<Staff | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    setFailed(false);
    fetch(`${API}/v1/admin/me`, { credentials: "include" })
      .then(async (response) => {
        // 404, not 403. The panel does not confirm its own existence to
        // someone signed in who is not staff, so there is nothing here to
        // distinguish "wrong person" from "wrong URL".
        if (response.status >= 400 && response.status < 500) {
          router.replace("/");
          return;
        }
        if (!response.ok) throw new Error(String(response.status));
        setStaff((await response.json()) as Staff);
      })
      .catch(() => {
        // A network blip is not a signed-out state. The nav keeps whatever it
        // last knew rather than throwing the person out of the panel. With
        // nothing known yet there is no nav to keep, and the shell says so.
        setFailed(true);
      });
  }, [router]);

  useEffect(load, [load, pathname]);

  // Where the panel opens, and where a role that changed elsewhere lands:
  // support on an owner page goes to Waitlist, not out of the panel. The API
  // has already refused the page's reads; this is only where to stand.
  const elsewhere = !staff
    ? null
    : pathname === "/admin"
      ? landingFor(staff.role)
      : staff.role !== "owner" && ownerOnly(pathname)
        ? "/admin/waitlist"
        : null;
  useEffect(() => {
    if (elsewhere) router.replace(elsewhere);
  }, [elsewhere, router]);

  // Never a white screen: the one spinner while it asks who is here, and a
  // failed read said as one, beside the way to try again.
  if (!staff) {
    return (
      <main className={styles.pane} data-theme="light">
        {failed ? <Failed what="the panel" onRetry={load} /> : <Loading />}
      </main>
    );
  }

  return (
    <AdminProvider value={{ staff, refresh: load }}>
      {/* Pinned light. The tokens follow the nearest data-theme, so this
          holds whatever the app or the system is set to. */}
      <div className={styles.frame} data-theme="light">
        <nav className={styles.nav}>
          <div className={styles.brand}>
            {/* The nav is moss, which is neither of the mark's two tones, and
                the inverse one flips with the theme. */}
            <Logo variant="mark" size={19} style={{ color: "var(--text-on-solid)" }} />
            <span className={styles.brandWord}>offload</span>
            <span className={styles.tag}>admin</span>
          </div>

          <div className={styles.navList}>
            {navFor(staff.role).map((block, index) => (
              <div key={index} className={styles.navBlock}>
                {block.map((page) => {
                  const count = page.count ? staff[page.count] : null;
                  const on = pathname === page.href || pathname.startsWith(`${page.href}/`);
                  return (
                    <Link
                      key={page.href}
                      href={page.href}
                      className={`${styles.navItem} ${on ? styles.navItemOn : ""}`}
                      aria-current={on ? "page" : undefined}
                    >
                      <Icon name={page.icon} size={17} />
                      <span className={styles.navLabel}>{page.label}</span>
                      {/* Only when there is something to do. A zero is not news. */}
                      {typeof count === "number" && count > 0 ? (
                        <em className={styles.navCount}>{count.toLocaleString("en-GB")}</em>
                      ) : null}
                    </Link>
                  );
                })}
              </div>
            ))}
          </div>

          <div className={styles.navFoot}>
            <span className={styles.who}>Signed in as {staff.email}</span>
            {/* Bidirectional: the app has a way here too, for staff only. */}
            <Link href="/today" className={styles.back}>
              <Icon name="chevron-left" size={15} />
              Back to the app
            </Link>
          </div>
        </nav>

        {/* The one boundary for every page. The range, and Health's view,
            are read from the address, which can suspend a render; a page
            does not carry a boundary of its own. */}
        <main className={styles.pane}>{elsewhere ? null : <Suspense fallback={<Loading />}>{children}</Suspense>}</main>
      </div>
    </AdminProvider>
  );
}
