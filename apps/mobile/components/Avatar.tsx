// A person's mark. 022.
//
// The design system's `Avatar`: a prism the server drew once from the
// account's id, with the initials over it in the product's type. The picture
// never changes, so the cache never expires: fetched once per account per
// device into the app's cache directory, the way a photo is, since `Image`
// with `source.headers` sends nothing on Android. Until the file is there,
// and when it cannot be, the initials sit on the fill, which is what every
// person row drew before there was a mark.
//
// Sizes are the design's five: 28, 32, 36, 52, 56. Never below 28.

import { useEffect, useState } from "react";
import { Image, Text, View } from "react-native";
import { nameOf } from "../lib/people";
import { cachedMark, fetchMark } from "../lib/marks";
import { useColors } from "../lib/colors";

export type AvatarSize = 28 | 32 | 36 | 52 | 56;

export function Avatar({
  uid,
  initials,
  name,
  size = 36,
}: {
  uid: string;
  initials: string;
  name?: string | undefined;
  size?: AvatarSize;
}) {
  const COLOR = useColors();
  const [uri, setUri] = useState<string | null>(() => cachedMark(uid));

  useEffect(() => {
    let live = true;
    if (uri) return;
    fetchMark(uid).then((found) => {
      if (live && found) setUri(found);
    });
    return () => {
      live = false;
    };
  }, [uid, uri]);

  // The monogram scales with the circle rather than stepping, as the kit's
  // does: five sizes, and a sixth would need no table.
  const fontSize = Math.round(size * 0.36);
  return (
    <View
      style={{ width: size, height: size }}
      accessibilityLabel={nameOf({ displayName: name ?? null })}
      accessibilityRole="image"
    >
      <View
        className={`items-center justify-center overflow-hidden rounded-pill ${uri ? "" : "bg-surface-fill"}`}
        style={{ width: size, height: size }}
      >
        {uri ? (
          <Image
            source={{ uri }}
            style={{ position: "absolute", width: size, height: size }}
            onError={() => setUri(null)}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
        ) : null}
        <Text
          className="font-core font-semibold"
          style={{ fontSize, lineHeight: fontSize, letterSpacing: 0.01 * fontSize, color: uri ? COLOR.onBrand : COLOR.secondary }}
          accessibilityElementsHidden
          importantForAccessibility="no"
        >
          {initials}
        </Text>
      </View>
    </View>
  );
}
