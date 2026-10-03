// 035. Your copy: everything the account can read, in one file.
//
// The phone kits draw the row, `Export everything`, on a page that was never
// built (`SettingsDetail.jsx`, `M3SettingsDetail.jsx`); the web kit has it on
// Privacy under *Your copy*, which is where it lives here, in the section
// format of 031. What the row says in each state is
// `copyRow`'s, shared with the web.
//
// Read on open and again every five seconds only while a copy is being made.
// No state says why: a build that failed sits beside Try again, and a press
// that did not go through is the page's toast with Retry.

import { useCallback, useEffect, useState } from "react";
import { copyRow, COPY_POLL_MS } from "@offload/widgets";
import { askForCopy, clearSavedCopy, deleteCopy, loadCopy, saveCopy, type CopyState } from "../../lib/copy";
import type { ToastState } from "../shell/Toast";
import { Group, Row } from "./Rows";

export function YourCopy({ zone, toast }: { zone: string | null; toast: ToastState }) {
  const [copy, setCopy] = useState<CopyState | null>(null);
  const [busy, setBusy] = useState<"ask" | "save" | "delete" | null>(null);

  useEffect(() => {
    let live = true;
    // Android keeps a downloaded copy in the cache until the app it was
    // handed to has read it. By the next visit it has.
    clearSavedCopy();
    void loadCopy().then((read) => {
      if (live && read) setCopy(read);
    });
    return () => {
      live = false;
    };
  }, []);

  const making = copy?.state === "making";
  useEffect(() => {
    if (!making) return;
    const timer = setInterval(() => {
      void loadCopy().then((read) => {
        if (read) setCopy(read);
      });
    }, COPY_POLL_MS);
    return () => clearInterval(timer);
  }, [making]);

  const ask = useCallback(async (): Promise<void> => {
    setBusy("ask");
    const next = await askForCopy();
    setBusy(null);
    if (next) setCopy(next);
    else toast.show("Couldn't start your copy", { label: "Retry", onPress: () => void ask() });
  }, [toast]);

  const save = useCallback(async (): Promise<void> => {
    setBusy("save");
    const done = await saveCopy();
    setBusy(null);
    if (!done) {
      const read = await loadCopy();
      // A copy that has gone, or a session that ended, is the row's to say:
      // the read goes through the session's own handling.
      if (read) setCopy(read);
      if (!read || read.state === "ready") toast.show("Couldn't download your copy", { label: "Retry", onPress: () => void save() });
    }
  }, [toast]);

  const remove = useCallback(async (): Promise<void> => {
    setBusy("delete");
    const next = await deleteCopy();
    setBusy(null);
    if (next) setCopy(next);
    else toast.show("Couldn't delete your copy", { label: "Retry", onPress: () => void remove() });
  }, [toast]);

  // Before the first read the row is the idle one, and stays pressable: a
  // read that never arrived is then a press that says so.
  const row = copyRow(copy ?? { state: "idle", readyAt: null, expiresAt: null, nextAt: null }, zone);
  const idle = busy === null;

  return (
    <Group label="Your copy" icon="archive" caption="Kept for 7 days. One every 7 days.">
      {row.canDelete ? (
        <>
          <Row
            title={row.title}
            note={row.note ?? undefined}
            pill="Download"
            busy={busy === "save"}
            onPress={idle ? () => void save() : undefined}
          />
          <Row title="Delete copy" action busy={busy === "delete"} onPress={idle ? () => void remove() : undefined} last />
        </>
      ) : (
        <Row
          title={row.title}
          note={row.note ?? undefined}
          pill={row.action ?? undefined}
          busy={row.busy || busy === "ask"}
          onPress={row.action && idle ? () => void ask() : undefined}
          last
        />
      )}
    </Group>
  );
}
