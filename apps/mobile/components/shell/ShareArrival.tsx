// A photo or a PDF shared from another app, arriving in the composer.
//
// On iOS the share extension hands the files to the app through the app group
// and opens it by the URL scheme, the workaround every shipping share
// extension uses because iOS offers no official way for an extension to
// raise its host; on Android it is the intent filter. Either way the library
// hands over file paths, and this puts them in the composer as chips, opens
// the sheet and focuses the field, so the words come next and one tap sends.
// Nothing is sent until the person sends.
//
// Still images and PDFs, as many as the draft takes: the rest are dropped
// with the composer's own line. The library's clear forgets the share's record
// and never its files, so each file moves into a folder of ours first
// (`shared-in.ts`), which the end of a session clears with the rest of the
// account. Signed out, the draft holds them behind the gate; the draft lives
// in memory, so a killed app forgets them, and nothing sent is ever lost.

import { useEffect } from "react";
import { useShareIntent } from "expo-share-intent";
import { useConversation } from "./conversation-context";
import { isPdf } from "../../lib/dump";
import { takeShared } from "../../lib/shared-in";

export function ShareArrival() {
  const { addPhotos } = useConversation();
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntent({
    // A share that arrived while the app was in the background should still
    // be in the composer when it comes forward.
    resetOnBackground: false,
  });

  useEffect(() => {
    if (!hasShareIntent) return;
    // 041. Photos and PDFs; the draft's own caps decide how many it keeps.
    const files = (shareIntent.files ?? []).filter(
      (file) => file.mimeType.startsWith("image/") || isPdf({ type: file.mimeType, name: file.fileName || file.path }),
    );
    if (files.length > 0) {
      addPhotos(
        files.map((file) => ({
          uri: takeShared(file.path),
          name: file.fileName || null,
          type: file.mimeType || null,
          size: file.size,
        })),
        "share",
      );
    }
    // Text and links from the share sheet are out until they are specced:
    // the extension is configured for images and PDFs, and anything else is
    // dropped.
    resetShareIntent();
  }, [hasShareIntent, shareIntent, addPhotos, resetShareIntent]);

  return null;
}
