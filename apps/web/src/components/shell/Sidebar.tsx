"use client";

// The sidebar. From ui_kits/web_app/WMisc.jsx's WSidebar.
//
// Dark, always, whatever the rest of the window is doing: the kit stamps
// data-theme="dark" on it rather than tinting it, so it uses the same token
// names as everything else and simply resolves them differently.

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "../../app/(shell)/shell.module.css";
import type { ThreadRow } from "../../lib/threads";

interface Props {
  threads: ThreadRow[];
  threadCount: number;
}

export function Sidebar({ threads, threadCount }: Props) {
  const pathname = usePathname();

  const tabs = [
    { href: "/today", label: "Today", icon: "☀", count: undefined as number | undefined },
    { href: "/threads", label: "My threads", icon: "◎", count: threadCount },
  ];

  const pinned = threads.slice(0, 3);
  const recent = threads.slice(3, 6);

  const item = (thread: ThreadRow) => {
    const on = pathname === `/threads/${thread.id}`;
    return (
      <Link
        key={thread.id}
        href={`/threads/${thread.id}`}
        className={styles.navItem}
        data-on={on}
      >
        {on ? <span className={styles.marker} /> : null}
        <span aria-hidden="true">◦</span>
        <span className={styles.navLabel}>{thread.name}</span>
      </Link>
    );
  };

  return (
    <nav className={styles.sidebar} data-theme="dark" aria-label="Sections">
      <div className={styles.brand}>
        <span className={styles.wordmark}>offload</span>
      </div>

      <div className={styles.navGroup}>
        {tabs.map((tab) => {
          const on = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          return (
            <Link key={tab.href} href={tab.href} className={styles.navItem} data-on={on}>
              {on ? <span className={styles.marker} /> : null}
              <span aria-hidden="true">{tab.icon}</span>
              <span className={styles.navLabel}>{tab.label}</span>
              {tab.count ? <em className={styles.navCount}>{tab.count}</em> : null}
            </Link>
          );
        })}

        {/* Memories is drawn and inert rather than absent. A nav that grows as
            features land moves under people who have learned where things are,
            and saying "nothing here yet" beats a click that does nothing. */}
        <button
          type="button"
          className={styles.navItem}
          disabled
          aria-disabled="true"
          title="Nothing here yet"
        >
          <span aria-hidden="true">☁</span>
          <span className={styles.navLabel}>Memories</span>
        </button>
      </div>

      {pinned.length ? (
        <>
          <div className={styles.sideLabel}>Pinned</div>
          <div className={styles.navGroup}>{pinned.map(item)}</div>
        </>
      ) : null}

      {recent.length ? (
        <>
          <div className={styles.sideLabel}>Recent</div>
          <div className={styles.navGroup}>{recent.map(item)}</div>
        </>
      ) : null}
    </nav>
  );
}
