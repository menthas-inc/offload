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
// with the composer's own line. The library's copy of the files is cleared as soon as
// they are in the draft, so nothing waits on disk past this. Signed out, the
// draft holds them behind the gate; the draft lives in memory, so a killed
// app forgets them, and nothing sent is ever lost.

import { useEffect } from "react";
import { useShareIntent } from "expo-share-intent";
import { useConversation } from "./conversation-context";
import { isPdf } from "../../lib/dump";

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
          // The library hands over a bare path on Android, and the runtime's
          // FormData wants a uri with a scheme: a path with none fails the
          // upload as a network error, which is what the first share on a
          // Pixel did.
          uri: /^[a-z]+:\/\//.test(file.path) ? file.path : `file://${file.path}`,
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
