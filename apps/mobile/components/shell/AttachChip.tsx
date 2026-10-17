// A photo waiting in the composer, from ui_kits/mobile_app/Composer.jsx.
//
// Ink blue with white words, and a photo shows a little of itself where the
// kit draws the image glyph (owner, 2026-10-16: it should stand out against
// the field). A refused file keeps the kit's quiet chip and its danger border,
// so its line stays readable. The name clipped at twenty characters, and a remove
// control that is a plain glyph rather than an IconButton: a 44px hit area
// inside a 28px chip bleeds its hover pill past the chip's own edge, so the
// glyph is 18px and the hit area comes from hitSlop. One line beside the name
// when the photo was refused on the device, the failure table's own words.

import { Image, Pressable, Text, View } from "react-native";
import { Glyph } from "../Glyph";
import { useColors } from "../../lib/colors";
import { clipMiddle } from "@offload/widgets";

export type ChipError = "too_big" | "not_a_photo" | "locked_pdf" | null;

const LINES: Record<Exclude<ChipError, null>, string> = {
  too_big: "Too big to send.",
  not_a_photo: "Only photos and PDFs.",
  // 041.
  locked_pdf: "Only unlocked PDFs.",
};

export function AttachChip({
  name,
  uri,
  kind = "image",
  error,
  disabled,
  onRemove,
}: {
  name: string;
  /** The draft's own file, drawn small in place of the glyph. */
  uri: string;
  /** 041. A PDF draws the paperclip, clips its name in the middle so its end
   *  survives, and says it is a PDF to a screen reader. */
  kind?: "image" | "pdf";
  error: ChipError;
  /** While the send is out: a chip removed then would still go. */
  disabled?: boolean;
  onRemove: () => void;
}) {
  const COLOR = useColors();
  const pdf = kind === "pdf";
  const shown = pdf ? clipMiddle(name) : name.length > 20 ? `${name.slice(0, 20)}…` : name;
  const quiet = Boolean(error);
  const ink = quiet ? COLOR.iconOnWell : COLOR.onBrand;
  return (
    <View
      className={`flex-row items-center gap-space-1 rounded-pill ${
        error ? "border bg-surface-raised border-border-danger" : "bg-surface-attention"
      }`}
      style={{ minHeight: 28, paddingLeft: pdf || quiet ? 8 : 3, paddingRight: 4, maxWidth: "100%" }}
    >
      {pdf || quiet ? (
        <Glyph name={pdf ? "paperclip" : "image"} size={13} color={ink} />
      ) : (
        <Image source={{ uri }} accessible={false} style={{ width: 22, height: 22, borderRadius: 11 }} />
      )}
      <Text
        className={`font-core ${quiet ? "text-text-secondary" : "text-text-on-solid"}`}
        style={{ fontSize: 12.5, lineHeight: 15 }}
        numberOfLines={1}
        accessibilityLabel={`${pdf ? "PDF" : "Photo"}, ${name}`}
      >
        {shown}
      </Text>
      {error ? (
        <Text
          className="font-core text-text-danger"
          style={{ fontSize: 12.5, lineHeight: 15 }}
          accessibilityLiveRegion="polite"
        >
          {LINES[error]}
        </Text>
      ) : null}
      <Pressable
        onPress={onRemove}
        disabled={disabled}
        hitSlop={13}
        accessibilityLabel={`Remove ${name}`}
        accessibilityState={{ disabled: Boolean(disabled) }}
        className="items-center justify-center rounded-pill"
        style={{ width: 18, height: 18, opacity: disabled ? 0.4 : 1 }}
      >
        <Glyph name="x" size={12} color={ink} />
      </Pressable>
    </View>
  );
}
