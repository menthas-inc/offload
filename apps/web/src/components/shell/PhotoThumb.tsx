"use client";

// A photo's thumbnail, wherever one is drawn: the tile on a row, the chip in
// the composer, the thumbnail beside a sent message, the square in Files.
//
// One `<img>` with the credentials the API's own origin needs, and the type
// glyph in its place until the renditions exist or when the fetch fails,
// which is the failure table's "Not here yet". The glyph is drawn by the
// caller through `fallback`, since a row's lead and a chip's glyph are
// different sizes. A message just sent has the file itself on this device,
// so `localSrc` draws that until the renditions land: the message shows
// its photos at once, as the spec says, and the server's copy takes over.

import { useEffect, useState } from "react";
import { photoUrl } from "../../lib/dump";

export function PhotoThumb({
  blobId,
  ready,
  rendition = "thumb",
  alt,
  className,
  fallback,
  localSrc,
  attempt = 0,
  onLoad,
}: {
  blobId: string;
  ready: boolean;
  rendition?: "thumb" | "large";
  alt: string;
  className: string;
  /** What to draw when there is nothing to draw yet. */
  fallback: React.ReactNode;
  /** The file on this device, drawn until the server's copy exists. */
  localSrc?: string | undefined;
  /** Bumped by a Retry control: the same id, a new attempt. */
  attempt?: number;
  onLoad?: () => void;
}) {
  const [failed, setFailed] = useState(false);
  const [localFailed, setLocalFailed] = useState(false);
  // A photo that was not ready and became ready: the same id, a new attempt.
  useEffect(() => setFailed(false), [blobId, ready, attempt]);
  if (!ready || failed) {
    if (localSrc && !localFailed) {
      return (
        <img src={localSrc} alt={alt} className={className} onError={() => setLocalFailed(true)} onLoad={onLoad} />
      );
    }
    return <>{fallback}</>;
  }
  return (
    <img
      src={photoUrl(blobId, rendition)}
      alt={alt}
      className={className}
      crossOrigin="use-credentials"
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      onLoad={onLoad}
    />
  );
}
