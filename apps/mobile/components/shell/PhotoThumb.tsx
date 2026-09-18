// A photo's thumbnail, wherever one is drawn: the tile on a row, the thumbnail
// beside a sent message, the square in Files.
//
// One `Image` with the session as a header, since React Native has no cookie
// jar, and the caller's glyph in its place until the renditions exist or when
// the fetch fails, which is the failure table's "Not here yet". A message
// just sent has the file itself on this device, so `localUri` draws that
// until the renditions land, and the server's copy takes over.

import { useEffect, useState } from "react";
import { Image, type ImageStyle, type StyleProp } from "react-native";
import { authHeaders } from "../../lib/api";
import { photoUrl } from "../../lib/dump";

export function PhotoThumb({
  blobId,
  ready,
  rendition = "thumb",
  style,
  className,
  fallback,
  localUri,
  attempt = 0,
  resizeMode = "cover",
  accessibilityLabel,
}: {
  blobId: string;
  ready: boolean;
  rendition?: "thumb" | "large";
  style: StyleProp<ImageStyle>;
  /** The corner, as a token class: `rounded-sm` is the row tile's. */
  className?: string;
  /** What to draw when there is nothing to draw yet. */
  fallback: React.ReactNode;
  /** The file on this device, drawn until the server's copy exists. */
  localUri?: string | undefined;
  /** Bumped by a Retry control: the same id, a new attempt. */
  attempt?: number;
  resizeMode?: "cover" | "contain";
  /** Empty means decorative: the title beside it already says what it is. */
  accessibilityLabel?: string;
}) {
  const [headers, setHeaders] = useState<Record<string, string> | null>(null);
  const [failed, setFailed] = useState(false);
  const [localFailed, setLocalFailed] = useState(false);

  useEffect(() => {
    let live = true;
    void authHeaders().then((h) => {
      if (live) setHeaders(h);
    });
    return () => {
      live = false;
    };
  }, []);
  // A photo that was not ready and became ready: the same id, a new attempt.
  useEffect(() => setFailed(false), [blobId, ready, attempt]);

  if (!ready || failed || !headers) {
    if (localUri && !localFailed) {
      return (
        <Image
          source={{ uri: localUri }}
          style={style}
          className={className ?? ""}
          resizeMode={resizeMode}
          onError={() => setLocalFailed(true)}
          accessibilityLabel={accessibilityLabel}
          accessibilityElementsHidden={!accessibilityLabel}
          importantForAccessibility={accessibilityLabel ? "yes" : "no"}
        />
      );
    }
    return <>{fallback}</>;
  }
  return (
    <Image
      source={{ uri: photoUrl(blobId, rendition), headers }}
      style={style}
      className={className ?? ""}
      resizeMode={resizeMode}
      onError={() => setFailed(true)}
      accessibilityLabel={accessibilityLabel}
      accessibilityElementsHidden={!accessibilityLabel}
      importantForAccessibility={accessibilityLabel ? "yes" : "no"}
    />
  );
}
