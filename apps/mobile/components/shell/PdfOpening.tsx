// 041. The one spinner over a PDF's tile while its copy comes down to be
// opened, whatever the tile is showing underneath: page 1 or the paperclip.
// The system's spinner, which holds still under reduced motion, on the
// theme's scrim.

import { View } from "react-native";
import { useColors } from "../../lib/colors";
import { usePdfOpening } from "../../lib/pdf-open";
import { Spinner } from "../Spinner";

export function PdfOpening({ blobId }: { blobId: string }) {
  const COLOR = useColors();
  if (!usePdfOpening(blobId)) return null;
  return (
    <View pointerEvents="none" className="absolute inset-0 items-center justify-center">
      <View className="absolute inset-0" style={{ backgroundColor: COLOR.scrim, opacity: COLOR.scrimOpacity }} />
      <Spinner />
    </View>
  );
}
