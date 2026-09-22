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

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { zoneCity } from "@offload/widgets";
import { Group, Row } from "./SettingsRows";
import { Avatar } from "../Avatar";
import { RequestCard } from "../people/RequestCard";
import { refreshMe, useMe } from "../../lib/use-me";
import { answerRequest, fetchPeople, type PeoplePage } from "../../lib/people";
import { useAppearance, THEME_LABEL } from "../../lib/appearance";
import { signOut } from "../../lib/sign-out";
import pane from "../../app/(shell)/shell.module.css";

export function SettingsPane() {
  const router = useRouter();
  const me = useMe("shell");
  const { theme } = useAppearance();
  const [leaving, setLeaving] = useState(false);
  const [failed, setFailed] = useState(false);
  // 022. The cards and the count.
  const [people, setPeople] = useState<PeoplePage | null>(null);
  const loadPeople = useCallback(async () => {
    setPeople(await fetchPeople());
  }, []);
  useEffect(() => {
    void loadPeople();
  }, [loadPeople]);
  async function answerCard(requestId: string, answer: "accept" | "dismiss"): Promise<boolean> {
    const ok = await answerRequest(requestId, answer);
    if (ok) {
      await loadPeople();
      void refreshMe();
    }
    return ok;
  }

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
            {/* 022. The viewer's own mark, at the person page's 52. `?` when
                the field is absent, which is the server's own answer for a
                name with nothing to derive from. */}
            <Avatar uid={account.accountId} initials={account.initials || "?"} name={account.displayName ?? undefined} size={52} />
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

        {/* 022. A request waiting for an answer sits above everything, and
            is answered here. Nowhere else but My people lists it. */}
        {people?.requestsForYou.map((card) => (
          <RequestCard key={card.id} card={card} onAnswer={(answer) => answerCard(card.id, answer)} />
        ))}

        <Group label="You">
          <Row
            icon="circle-dot"
            title="My account"
            value={account?.email}
            href="/settings/account"
          />
          {/* 022. The count as the value when there is one, none at zero, and
              the dot when a request needs answering. In You, beside My
              account: your people are yours, not a service you authorised. */}
          <Row
            icon="users"
            title="My people"
            value={people && people.count > 0 ? String(people.count) : undefined}
            badge={(account?.requestsWaiting ?? 0) > 0}
            href="/settings/people"
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
          <Row icon="orbit" title="Reaching the web" href="/settings/privacy" last />
        </Group>

        <Group label="The app">
          {/* 023. The account's clock, as a city. Nothing until a device has
              named one. */}
          <Row
            icon="clock"
            title="Date and time"
            value={account?.timeZone ? zoneCity(account.timeZone) : undefined}
            href="/settings/datetime"
          />
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

