"use client";

// The sidebar. From ui_kits/web_app/WMisc.jsx's WSidebar.
//
// Dark, always, whatever the rest of the window is doing: the kit stamps
// data-theme="dark" on it rather than tinting it, so it uses the same token
// names as everything else and simply resolves them differently.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "../Icon";
import { Logo } from "../Logo";
import { Preferences } from "./Preferences";
import styles from "../../app/(shell)/shell.module.css";
import type { ThreadRow } from "../../lib/threads";

interface Props {
  threads: ThreadRow[];
  threadCount: number;
}

/** A thread's icon, from its own `icon` column, falling back to the kit's
 *  default. `lasso` is what offload gives a thread it made, and the kit's own
 *  fixture uses `bookmark` and `house` for threads with a character of their
 *  own. */
export const threadIcon = (icon: string | null): string => icon ?? "message-circle";

export function Sidebar({ threads, threadCount }: Props) {
  const pathname = usePathname();

  const tabs = [
    { href: "/today", label: "Today", icon: "sun", count: undefined as number | undefined },
    { href: "/threads", label: "My threads", icon: "message-circle", count: threadCount },
  ];

  // **Nothing is pinned, so nothing is shown as pinned.**
  //
  // The kit has a Pinned group with a `+`, which implies somebody chose what is
  // in it. This took the first three threads by recency and called them pinned,
  // so a thread created a minute ago appeared pinned to itself, which is worse
  // than having no group at all: it looks like a feature misbehaving rather
  // than a feature that does not exist. Real pinning is a `pinned_at` on
  // `thread_members`, per person because threads are shared, and it arrives
  // with the control that sets it.
  const recent = threads.slice(0, 6);

  return (
    <nav className={styles.sidebar} data-theme="dark" aria-label="Sections">
      <Link href="/today" className={styles.brand} aria-label="offload, home">
        {/* The mark, not the threads glyph. It was `lasso`, which is the icon a
            thread carries, so the product's own name was wearing one of its
            nouns.

            `tone="ink"`, not `inverse`, and the difference is the whole bug:
            this container is stamped `data-theme="dark"`, so every token inside
            it has already flipped. `ink` resolves to `--text-primary`, which is
            light here. Asking for `inverse` asked for the dark theme's inverse,
            which is dark, and painted the mark black on black. */}
        <Logo tone="ink" size={21} />
      </Link>

      <div className={styles.navGroup}>
        {tabs.map((tab) => {
          const on = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          return (
            <Link key={tab.href} href={tab.href} className={styles.navItem} data-on={on}>
              {on ? <span className={styles.marker} /> : null}
              <Icon name={tab.icon} size={17} />
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
          <Icon name="cloudy" size={17} />
          <span className={styles.navLabel}>Memories</span>
        </button>
      </div>

      {recent.length ? (
        <>
          <div className={styles.sideLabel}>Recent</div>
          <div className={styles.navGroup}>
            {recent.map((thread) => {
              const on = pathname === `/threads/${thread.id}`;
              return (
                <Link
                  key={thread.id}
                  href={`/threads/${thread.id}`}
                  className={styles.navItem}
                  data-on={on}
                >
                  {on ? <span className={styles.marker} /> : null}
                  <Icon name={threadIcon(thread.icon)} size={17} />
                  <span className={styles.navLabel}>{thread.name}</span>
                </Link>
              );
            })}
          </div>
        </>
      ) : null}

      {/* The kit puts both at the bottom and both are inert: Activity needs
          notifications and Settings needs somewhere to go. Drawn, because the
          shape of the nav should not change under somebody as features land. */}
      <div className={styles.sideFoot}>
        <button
          type="button"
          className={styles.navItem}
          disabled
          aria-disabled="true"
          title="Nothing here yet"
        >
          <Icon name="bell" size={17} />
          <span className={styles.navLabel}>Activity</span>
        </button>
        <div className={styles.navItem} data-static="true">
          <Icon name="settings" size={17} />
          <span className={styles.navLabel}>Settings</span>
          {/* Right of Settings, per the product owner. Neither is in the kit;
              both are things about this device rather than about the account,
              which is why they sit beside Settings rather than inside it. */}
          <Preferences />
        </div>
      </div>
    </nav>
  );
}
