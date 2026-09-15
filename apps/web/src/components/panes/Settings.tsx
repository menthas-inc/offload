"use client";

// Settings, the index.
//
// From `WSettings.jsx`: the identity, then rows in labelled groups. Three rows,
// not the kit's ten, because the other seven have no feature behind them; the
// group labels stay because they are where those pages will go, and adding a
// label later moves every row on the screen.
//
// **Sign out on the index is new surface on web.** Both phone kits put a
// secondary button beside the identity; `WSettings.jsx` has one only on the
// account page. It is here anyway, because AC-3 is one product with one
// behaviour and a person on a laptop should not have to open a page to leave.
// Logged in the design system's `decisions.md`.
//
// The kit's search field is not here. It has ten rows; three do not need one.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Group, Row } from "./SettingsRows";
import { useMe } from "../../lib/use-me";
import { useAppearance, THEME_LABEL } from "../../lib/appearance";
import { signOut } from "../../lib/sign-out";
import pane from "../../app/(shell)/shell.module.css";

export function SettingsPane() {
  const router = useRouter();
  const me = useMe("shell");
  const { theme } = useAppearance();
  const [leaving, setLeaving] = useState(false);
  const [failed, setFailed] = useState(false);

  async function leave(): Promise<void> {
    if (leaving) return;
    setLeaving(true);
    setFailed(false);
    try {
      await signOut();
      // Only once the server has agreed. Navigating before that is changing
      // the page, not signing anybody out.
      router.replace("/sign-in");
    } catch {
      setLeaving(false);
      setFailed(true);
    }
  }

  const account = me.status === "ready" ? me.me : null;

  return (
    <>
      <div className={pane.paneHead}>
        <div style={{ minWidth: 0 }}>
          <h1 className={`${pane.paneTitle} ${pane.paneTitleBig}`}>Settings</h1>
          {account ? <p className={pane.paneSub}>{account.email}</p> : null}
        </div>
      </div>

      <div className={pane.paneBody}>
        {/* Nothing rather than a guess while it loads. The rows below need no
            server, so a settings screen with no identity block still works. */}
        {account ? (
          <div className={pane.identity}>
            {/* `?` when the field is absent, which is the server's own answer
                for a name with nothing to derive from. A client deployed ahead
                of the server would otherwise draw an empty disc. */}
            <span className={pane.identityAvatar}>{account.initials || "?"}</span>
            <span className={pane.identityWho}>
              {account.displayName ? (
                <span className={pane.identityName}>{account.displayName}</span>
              ) : null}
              <span className={pane.identityMail}>{account.email}</span>
            </span>
            <button
              type="button"
              className={pane.shareButton}
              onClick={() => void leave()}
              disabled={leaving}
            >
              {leaving ? "Signing out" : "Sign out"}
            </button>
          </div>
        ) : null}

        {/* What happened, and the way forward beside it. Not why: this cannot
            see whether the network or the server was the problem. */}
        {failed ? (
          <p className={pane.signOutFailed} role="alert">
            That didn&rsquo;t go through.{" "}
            <button type="button" className={pane.retryQuiet} onClick={() => void leave()}>
              Try again
            </button>
          </p>
        ) : null}

        <Group label="You">
          <Row
            icon="circle-dot"
            title="My account"
            value={account?.email}
            href="/settings/account"
            last
          />
        </Group>

        <Group label="Reaching you">
          {/* The kit puts Connected apps here, beside Communication. That row
              is not built, so this group holds one thing rather than waiting
              for the other. */}
          <Row icon="link" title="Connected apps" href="/settings/apps" last />
        </Group>

        <Group label="What offload does with it">
          {/* The kit's Privacy group holds "Let offload notice patterns" too.
              That row is not built, so this group holds the two that are. */}
          <Row icon="globe" title="Reaching the web" href="/settings/privacy" last />
        </Group>

        <Group label="The app">
          <Row
            icon="blend"
            title="Appearance"
            value={THEME_LABEL[theme]}
            href="/settings/appearance"
          />
          {/* No version on web: package.json says 0.0.0, it is continuously
              deployed and has no version cycle to read, and printing 0.0.0
              would be the number-nothing-computes this feature refuses. */}
          <Row icon="compass" title="Help and about" href="/settings/help" last />
        </Group>
      </div>
    </>
  );
}

