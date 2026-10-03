// 036. Storage: what the account keeps against its limit, on Privacy.
//
// The phone kits draw a pressable *Files and photos* with a size on a
// *Memory and data* page, retired vocabulary, that was never built (`SettingsDetail.jsx`,
// `M3SettingsDetail.jsx`); this is that figure in 031's section format, beside
// Your copy, with the limit it is measured against. Not pressable: there is no
// list behind it yet, and the caption is the way back under it. The words are
// `storageFigure`'s, shared with the web.
//
// Read once when the page opens. A read that fails leaves the value out and
// says so once in the page's toast, with Retry.

import { useEffect, useRef, useState } from "react";
import { storageFigure } from "@offload/widgets";
import { loadStorage, type StorageAnswer } from "../../lib/storage";
import type { ToastState } from "../shell/Toast";
import { Group, Row } from "./Rows";

export function StorageSection({ toast }: { toast: ToastState }) {
  const [storage, setStorage] = useState<StorageAnswer | null>(null);
  // A read that lands after the page has gone says nothing: its toast would
  // be on another screen, with a Retry for a page that is not there.
  const live = useRef(true);

  useEffect(() => {
    live.current = true;
    const read = async (): Promise<void> => {
      const answer = await loadStorage();
      if (!live.current) return;
      if (answer) setStorage(answer);
      else toast.show("Couldn't load storage", { label: "Retry", onPress: () => void read() });
    };
    void read();
    return () => {
      live.current = false;
    };
    // Once on open: the toast is a fresh object on every render of the page,
    // and a read per render is a toast per render. A session that ended is
    // the session's own handling, through `send`.
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
