// 028. Not in a thread, on My threads, from LooseParts.jsx's `LooseGroup`.
//
// My threads' own heading with the count, the type chips when two types or
// more are present, three rows, then *All 14* or *All 5 links*. A chip
// filters the group in place, from the first page read by that type; the
// pick is not kept, and falls back to All when its type empties. Not drawn
// when there is nothing in it.
//
// The chips are 025's `Chip`, in a row that scrolls sideways past the gutter,
// where the kit draws its own 34px moss ones: logged with the divergences.

import { useEffect, useState, type ReactNode } from "react";
import { Platform, Pressable, Text } from "react-native";
import { useRouter } from "expo-router";
import { Glyph } from "../Glyph";
import { TypeChips } from "./TypeChips";
import { drawInPlace } from "../shell/InPlace";
import { useColors } from "../../lib/colors";
import { useInPlace } from "../../lib/undo";
import {
  allLink,
  fetchLoose,
  groupRows,
  keepChip,
  keyOf,
  listCount,
  type ChipKey,
  type LooseEntry,
  type LooseSummary,
} from "../../lib/loose";

const isAndroid = Platform.OS === "android";

export function LooseGroup({
  summary,
  heading,
  live,
  less,
  row,
}: {
  summary: LooseSummary | null;
  /** My threads' own section heading. */
  heading: (label: string, count: number) => ReactNode;
  live: (entries: LooseEntry[]) => LooseEntry[];
  /** The counts less what has left since the read. */
  less: <T extends Pick<LooseSummary, "count" | "byType">>(counts: T) => T;
  row: (entry: LooseEntry, options: { border: boolean }) => ReactNode;
}) {
  const COLOR = useColors();
  const router = useRouter();
  const [chip, setChip] = useState<ChipKey | null>(null);
  const [page, setPage] = useState<LooseEntry[] | null>(null);

  // What has left comes off every count at once, as it does the heading's:
  // a type it empties loses its chip, and the pick goes back to All.
  const counts = less(summary ?? { count: 0, byType: {}, rows: [] });
  const kept = keepChip(chip, counts.byType);

  // A new read: the pick holds while its type is still there, and its first
  // page is read again so the three are the server's. A read that fails keeps
  // the rows in hand.
  useEffect(() => {
    if (kept !== chip) setChip(kept);
    if (!kept) return setPage(null);
    let current = true;
    void fetchLoose({ type: kept }).then((read) => {
      if (current && read) setPage(read.rows);
    });
    return () => {
      current = false;
    };
  }, [summary, kept]);

  /** Another type: what is in hand of it, until its page comes back. */
  function pick(next: ChipKey | null): void {
    if (next === kept) return;
    setPage(null);
    setChip(next);
  }

  // 2026-10-18. With the Undo lines, so the last row out keeps its slot.
  const rows = summary ? live(groupRows(summary, kept, page)) : [];
  const placed = useInPlace(rows, keyOf);
  if (!summary || (counts.count <= 0 && !placed.some((one) => "slot" in one))) return null;

  const link = allLink(listCount(counts, kept), kept);

  return (
    <>
      {heading("Not in a thread", counts.count)}
      <TypeChips count={counts.count} byType={counts.byType} picked={kept} onPick={pick} />
      {drawInPlace(placed, { idOf: keyOf, row: (entry, border) => row(entry, { border }) })}
      {link ? (
        <Pressable
          onPress={() => router.push(kept ? { pathname: "/threads/loose", params: { type: kept } } : "/threads/loose")}
          accessibilityRole="button"
          className="min-h-tap-min flex-row items-center gap-space-2 self-start px-gutter-screen pt-space-4"
        >
          <Text className={`font-core font-medium ${isAndroid ? "text-a-on-var" : "text-text-secondary"}`} style={{ fontSize: 14 }}>
            {link}
          </Text>
          <Glyph name="chevron-right" size={14} color={COLOR.iconOnWell} />
        </Pressable>
      ) : null}
    </>
  );
}
