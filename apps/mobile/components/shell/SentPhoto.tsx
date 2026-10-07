// A photo sent with a message, from ui_kits/mobile_app/LiveConversation.jsx.
//
// "A photo sent with a message is shown, not named": the tile is the picture
// and the name sits beside it, for the dumper alone. The kit drew the tile at
// 34px and the extra-small radius because it had no pictures to draw; here it
// is the row tile's 36px and small radius, so one thumbnail size holds across
// the product (decisions.md, 2026-09-18).

import { Pressable, Text, View } from "react-native";
import { Glyph } from "../Glyph";
import { useColors } from "../../lib/colors";
import type { PhotoOnWire } from "../../lib/dump";
import { PhotoThumb } from "./PhotoThumb";
import { PdfOpening } from "./PdfOpening";

/** 041. A PDF draws the same way: page 1 in the tile, the paperclip until it
 *  exists, the one spinner while its copy comes down, and a tap that opens
 *  the PDF itself. */
export function SentPhoto({ photo, onOpen }: { photo: PhotoOnWire; onOpen: () => void }) {
  const COLOR = useColors();
  const pdf = photo.kind === "pdf";
  const name = photo.name ?? (pdf ? "PDF" : "Photo");
  return (
    <Pressable
      onPress={onOpen}
      accessibilityLabel={`Open ${name}`}
      className="mt-space-3 flex-row items-center gap-space-3 rounded-sm border border-blue-100 bg-surface-raised py-space-2 px-space-3"
    >
      <View className="overflow-hidden rounded-sm" style={{ width: 36, height: 36 }}>
        <PhotoThumb
          blobId={photo.blobId}
          ready={photo.ready}
          localUri={photo.localUri}
          style={{ width: 36, height: 36 }}
          className="rounded-sm"
          fallback={
            <View
              className="items-center justify-center rounded-sm bg-surface-fill"
              style={{ width: 36, height: 36 }}
            >
              <Glyph name={pdf ? "paperclip" : "image"} size={15} color={COLOR.iconOnWell} />
            </View>
          }
        />
        {pdf ? <PdfOpening blobId={photo.blobId} /> : null}
      </View>
      <Text
        className="flex-1 font-core text-text-secondary"
        style={{ fontSize: 12.5 }}
        numberOfLines={1}
      >
        {name}
      </Text>
    </Pressable>
  );
}
