"use client";

// Settings, Privacy: whether offload may reach the web, 016, and the copy of
// everything a person can take with them, 035 (`YourCopy`).
//
// **Two switches rather than one**, because they are two different promises. A
// search sends words somebody wrote to a search company; opening a link they
// pasted sends nothing of theirs anywhere and only fetches something they
// already chose. Somebody can reasonably want the second without the first, and
// collapsing them makes the quieter one impossible to have on its own.
//
// **The notes carry the weight the default no longer does.** Both default on,
// which inverts the line this product draws elsewhere for content leaving
// offload, so the first clause of each note is what leaves and the second is
// the bound on it. No "Off by default" label: that exists to explain why
// something is off, and one saying a switch is on reads as an apology for it.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PaneHead } from "../shell/PaneHead";
import { Switch } from "../Switch";
import { Group } from "./SettingsRows";
import { YourCopy } from "./YourCopy";
import { useMe, updateWebAccess } from "../../lib/use-me";
import { useToast } from "../shell/Toast";
import styles from "../../app/(shell)/shell.module.css";

export function PrivacyPane() {
  const state = useMe("shell");
  const me = state.status === "ready" ? state.me : null;
  const toast = useToast();
  const router = useRouter();
  // Optimistic, and reverted with a word if the write fails: a switch that
  // waits for a round trip to move reads as a switch that did not work, and
  // one that moves back on its own with nothing said reads as haunted.
  const [pending, setPending] = useState<{ webSearch?: boolean; webLinks?: boolean }>({});

  const search = pending.webSearch ?? me?.webSearch ?? true;
  const links = pending.webLinks ?? me?.webLinks ?? true;

  async function set(patch: { webSearch?: boolean; webLinks?: boolean }): Promise<void> {
    setPending((current) => ({ ...current, ...patch }));
    const updated = await updateWebAccess(patch);
    if (updated) return;
    setPending({});
    toast.show("Couldn't change that", { label: "Retry", onPress: () => set(patch) });
  }

  return (
    <div className={styles.pane}>
      <PaneHead title="Privacy" />
      <div className={styles.paneBody}>
        <Group label="Reaching the web" icon="globe" caption="Each says what leaves, then the limit on it.">
          <Toggle
            title="Search the web"
            note="Sends the words you dumped to a search company when offload can't answer from your threads. Your threads and notes are never sent."
            checked={search}
            onChange={(next) => void set({ webSearch: next })}
          />
          <Toggle
            title="Read links I paste"
            note="Opens a link you dumped and reads the page. Where it names a place, the name goes to Google to put it on the map."
            checked={links}
            onChange={(next) => void set({ webLinks: next })}
            last
          />
        </Group>
        <YourCopy
          zone={me?.timeZone ?? null}
          onFailed={(line, retry) => toast.show(line, { label: "Retry", onPress: retry })}
          onSignedOut={() => router.replace("/sign-in")}
        />
      </div>
    </div>
  );
}

/** A settings row with the design system's Switch as its control.
 *
 *  The whole row is the label, so the switch is named by the title beside it
 *  and the row is the hit area: a 44px track still answers a click anywhere on
 *  the line. It was a native checkbox until 15 September, which passed for a
 *  tick and drew in the browser's own blue; the handoff for 016 asked for the
 *  real Switch, and `Apps.tsx`'s two calendar settings moved with it. */
function Toggle({
  title,
  note,
  checked,
  onChange,
  last,
}: {
  title: string;
  note: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  last?: boolean;
}) {
  return (
    <label className={`${styles.settingsRow} ${last ? styles.settingsRowLast : ""}`}>
      <span className={styles.settingsText}>
        <span className={styles.settingsTitle}>{title}</span>
        <span className={styles.settingsNote}>{note}</span>
      </span>
      <span className={styles.settingsValue}>
        <Switch checked={checked} onChange={onChange} />
      </span>
    </label>
  );
}
