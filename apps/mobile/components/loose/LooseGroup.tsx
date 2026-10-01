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
import { Platform, Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Glyph } from "../Glyph";
import { Chip } from "../labels/Chip";
import { useColors } from "../../lib/colors";
import {
  allLink,
  chipsFor,
  fetchLoose,
  groupRows,
  keepChip,
  listCount,
  type ChipKey,
  type LooseItem,
  type LooseSummary,
} from "../../lib/loose";

const isAndroid = Platform.OS === "android";

export function LooseGroup({
  summary,
  heading,
  live,
  gone,
  row,
}: {
  summary: LooseSummary | null;
  /** My threads' own section heading. */
  heading: (label: string, count: number) => ReactNode;
  live: (items: LooseItem[]) => LooseItem[];
  gone: number;
  row: (item: LooseItem, options: { border: boolean }) => ReactNode;
}) {
  const COLOR = useColors();
  const router = useRouter();
  const [chip, setChip] = useState<ChipKey | null>(null);
  const [page, setPage] = useState<LooseItem[] | null>(null);

  // A new read: the pick holds while its type is still there, and its first
  // page is read again so the three are the server's.
  const byType = summary?.byType ?? {};
  const kept = keepChip(chip, byType);
  useEffect(() => {
    if (kept !== chip) setChip(kept);
    if (!kept) return setPage(null);
    let current = true;
    void fetchLoose({ type: kept }).then((read) => {
      if (current) setPage(read?.rows ?? []);
    });
    return () => {
      current = false;
    };
  }, [summary, kept]);

  if (!summary) return null;
  const count = summary.count - gone;
  if (count <= 0) return null;

  const chips = chipsFor(byType);
  const rows = live(groupRows(summary, kept, page));
  const total = listCount(summary, kept);
  const link = allLink(total, kept);

  return (
    <>
      {heading("Not in a thread", count)}
      {chips.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="items-center gap-space-3 px-gutter-screen pb-space-3"
          accessibilityLabel="Filter by type"
        >
          <Chip selected={kept === null} onClick={() => setChip(null)}>
            {`All ${summary.count}`}
          </Chip>
          {chips.map((one) => (
            <Chip key={one.key} icon={one.glyph} selected={kept === one.key} onClick={() => setChip(one.key)}>
              {`${one.label} ${one.count}`}
            </Chip>
          ))}
        </ScrollView>
      ) : null}
      {rows.map((item, i) => row(item, { border: i < rows.length - 1 }))}
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
