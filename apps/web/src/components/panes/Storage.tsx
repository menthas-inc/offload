"use client";

// 036. Storage: what the account keeps against its limit, on Privacy.
//
// The phone kits draw a pressable *Files and photos* with a size on a page
// that was never built; this is that figure in 031's section format, beside
// Your copy, with the limit it is measured against. Not pressable: there is no
// list behind it yet, and the caption is the way back under it.
//
// Read once when the pane opens. A read that fails leaves the value out and
// says so once, with Retry; the row never shows a figure it does not have.

import { useEffect, useRef, useState } from "react";
import { storageFigure } from "@offload/widgets";
import { Group, Row } from "./SettingsRows";
import { fetchStorage, type StorageAnswer } from "../../lib/storage";

export function Storage({
  onFailed,
  onSignedOut,
}: {
  onFailed?: (line: string, retry: () => void) => void;
  /** The session ended under the page: sign in, not Retry. */
  onSignedOut?: () => void;
}) {
  const [storage, setStorage] = useState<StorageAnswer | null>(null);
  // A read that lands after the pane has gone says nothing: its toast would
  // be on another screen, with a Retry for a pane that is not there.
  const live = useRef(true);

  useEffect(() => {
    live.current = true;
    const read = async (): Promise<void> => {
      const answer = await fetchStorage();
      if (!live.current) return;
      if (answer === "signed_out") onSignedOut?.();
      else if (answer) setStorage(answer);
      else onFailed?.("Couldn't load storage", () => void read());
    };
    void read();
    return () => {
      live.current = false;
    };
    // Once on open. The handlers are fresh functions on every render of the
    // pane, and a read per render is a toast per render.
  }, []);

  return (
    <Group label="Storage" icon="image" caption="Deleting a photo makes room.">
      <Row
        title="Photos and voice notes"
        value={storage ? storageFigure(storage.usedBytes, storage.limitBytes) : undefined}
        last
      />
    </Group>
  );
}
