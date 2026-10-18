// A list drawn with its Undo lines (2026-10-18). A thing that left keeps a
// slot where it was while its window runs; one that changed has its line
// directly under it; one Undo brought back is softly lit. The order is
// `useInPlace`'s; this draws it, keeping the row rules either side of a slot.
//
// A virtualised list takes its items as data, so Not in a thread and Memories
// call `useInPlace` themselves and draw each item with `placedItem`.

import type { ReactNode } from "react";
import { Platform, View } from "react-native";
import { android, token } from "@offload/tokens";
import { useInPlace, type InPlace as Placed } from "../../lib/undo";
import { Returned, UndoLine } from "./UndoLine";

/** The corner of a card a slot replaces: the kit's 14, Android's 16. */
export const CARD_RADIUS = parseFloat(Platform.OS === "android" ? android.light["radius-lg"]! : token("radius-md"));
/** A slot in a chip. */
export const PILL_RADIUS = parseFloat(token("radius-pill"));

interface Drawing<T> {
  idOf: (item: T) => string;
  /** The row, with its own rule below it or not. */
  row: (item: T, border: boolean) => ReactNode;
  /** The corner of what a slot replaces: 0 inside a card. */
  radius?: number | undefined;
  /** The rule's ink, for a list that draws its own. */
  rule?: string | undefined;
  /** The rule above each item rather than below it. */
  above?: boolean | undefined;
}

/** One item of a list in place, ruled below when `border`. */
export function placedItem<T>(
  one: Placed<T>,
  border: boolean,
  { idOf, row, radius = 0, rule = "border-border-hairline", above = false }: Drawing<T>,
): ReactNode {
  const ruled = border ? `${above ? "border-t" : "border-b"} ${rule}` : "";
  // A slot, or a thing still drawn whose slot line has not failed: a tick
  // that strikes the row in place takes the row's place for its window.
  const slot = "slot" in one ? one.entry : one.line?.form === "slot" && !one.line.failed ? one.line : null;
  if (slot) {
    return (
      <View key={slot.id} className={ruled}>
        <UndoLine entry={slot} radius={radius} />
      </View>
    );
  }
  if ("slot" in one) return null;
  const id = idOf(one.row);
  return (
    <Returned key={id} id={id}>
      {one.line ? (
        <View className={ruled}>
          {row(one.row, false)}
          <UndoLine entry={one.line} />
        </View>
      ) : (
        row(one.row, border)
      )}
    </Returned>
  );
}

/** Each item ruled but the last, unless `trailing` rules that one too. */
export function drawInPlace<T>(placed: Placed<T>[], drawing: Drawing<T> & { trailing?: boolean | undefined }): ReactNode {
  return placed.map((one, index) => placedItem(one, index < placed.length - 1 || drawing.trailing === true, drawing));
}

export function InPlace<T>({ items, trailing, ...drawing }: Drawing<T> & { items: readonly T[]; trailing?: boolean | undefined }) {
  const placed = useInPlace(items, drawing.idOf);
  return <>{drawInPlace(placed, { ...drawing, trailing })}</>;
}
