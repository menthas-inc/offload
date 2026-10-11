// A photo's thumbnail, wherever one is drawn: the tile on a row, the thumbnail
// beside a sent message, the square in Files.
//
// The bytes come down through `fetch` with the session as a header and are
// written once into the app's cache directory, and the `Image` draws the
// local file. Not `Image` with `source.headers`: on Android that sends no
// headers at all (verified against the API on 2026-09-19, the request
// arrived with none), and every rendition answered 401. The cache is keyed
// on the blob and the rendition, so a picture is fetched once per device and
// survives the app being closed. The caller's glyph stands in until the
// renditions exist or when the fetch fails, which is the failure table's
// "Not here yet". A message just sent has the file itself on this device,
// so `localUri` draws that until the renditions land, and the server's copy
// takes over.

import { useEffect, useState } from "react";
import { Image, type ImageStyle, type StyleProp } from "react-native";
import { Directory, File, Paths } from "expo-file-system";
import { authHeaders } from "../../lib/api";
import { photoUrl } from "../../lib/dump";
import { copyGeneration } from "../../lib/session-end";

/** Where a rendition lives on this device once fetched. */
function cached(blobId: string, rendition: "thumb" | "large"): File {
  return new File(Paths.cache, "photos", `${blobId}-${rendition}.jpg`);
}

/** Fetch a rendition into the cache, or say why not. Only a 200 is written,
 *  so a 404 for renditions not made yet never leaves a JSON body on disk
 *  wearing a picture's name, and only while the copy it was fetched for is
 *  still the phone's: one that lands after a session ended is dropped. */
export async function fetchRendition(blobId: string, rendition: "thumb" | "large"): Promise<string | null> {
  const file = cached(blobId, rendition);
  if (file.exists) return file.uri;
  const generation = copyGeneration();
  const headers = await authHeaders();
  const response = await fetch(photoUrl(blobId, rendition), { headers });
  if (!response.ok) return null;
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (copyGeneration() !== generation) return null;
  new Directory(Paths.cache, "photos").create({ idempotent: true, intermediates: true });
  file.write(bytes);
  return file.uri;
}

/** Forget a device's copy, for the day a photo is deleted or replaced. */
export function forgetRendition(blobId: string): void {
  for (const rendition of ["thumb", "large"] as const) {
    const file = cached(blobId, rendition);
    if (file.exists) file.delete();
  }
}

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
  const [uri, setUri] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [localFailed, setLocalFailed] = useState(false);

  // A photo that was not ready and became ready, or a Retry: the same id, a
  // new attempt.
  useEffect(() => {
    let live = true;
    setFailed(false);
    if (!ready) {
      setUri(null);
      return;
    }
    fetchRendition(blobId, rendition)
      .then((found) => {
        if (!live) return;
        if (found) setUri(found);
        else setFailed(true);
      })
      .catch(() => {
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [blobId, rendition, ready, attempt]);

  const drawn = uri && !failed ? uri : localUri && !localFailed ? localUri : null;
  if (!drawn) return <>{fallback}</>;
  return (
    <Image
      source={{ uri: drawn }}
      style={style}
      className={className ?? ""}
      resizeMode={resizeMode}
      onError={() => (drawn === uri ? setFailed(true) : setLocalFailed(true))}
      accessibilityLabel={accessibilityLabel}
      accessibilityElementsHidden={!accessibilityLabel}
      importantForAccessibility={accessibilityLabel ? "yes" : "no"}
    />
  );
}
