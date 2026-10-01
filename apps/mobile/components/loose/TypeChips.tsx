// 028. The type chips: All, then each type present with its count, only when
// two are. 025's `Chip`, in a row that scrolls sideways past the gutter. On
// My threads they filter the group in place; on the full list, the whole
// list.

import { ScrollView } from "react-native";
import { Chip } from "../labels/Chip";
import { chipsFor, type ChipKey, type LooseSummary } from "../../lib/loose";

export function TypeChips({
  count,
  byType,
  picked,
  onPick,
}: {
  count: number;
  byType: LooseSummary["byType"];
  picked: ChipKey | null;
  onPick: (key: ChipKey | null) => void;
}) {
  const chips = chipsFor(byType);
  if (chips.length === 0) return null;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerClassName="items-center gap-space-3 px-gutter-screen pb-space-3"
      accessibilityLabel="Filter by type"
    >
      <Chip selected={picked === null} onClick={() => onPick(null)}>
        {`All ${count}`}
      </Chip>
      {chips.map((one) => (
        <Chip key={one.key} icon={one.glyph} selected={picked === one.key} onClick={() => onPick(one.key)}>
          {`${one.label} ${one.count}`}
        </Chip>
      ))}
    </ScrollView>
  );
}
