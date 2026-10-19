// Thread layouts: the phones draw what layoutFor returns (decision 10). Default
// keeps its own proven render in Thread.tsx; this is the five other layouts.
// Rows reuse ContentRowView so a row keeps its controls whatever the layout
// arranges it into.

import { useState } from "react";
import { Image, Pressable, Text, View } from "react-native";
import type { LayoutPage, LayoutSection } from "@offload/widgets";
import { Glyph } from "../Glyph";
import { ContentRowView } from "../shell/ContentRow";
import { useColors } from "../../lib/colors";
import type { ContentRow, Note } from "../../lib/threads";

type Page = LayoutPage<ContentRow, Note>;
type Sec = LayoutSection<ContentRow, Note>;

export interface LayoutHandlers {
  onEdit: (row: ContentRow) => void;
  onDelete: (row: ContentRow) => void;
  onToggle: (row: ContentRow) => void;
  onOpenPhoto: (row: ContentRow) => void;
  onAdd: () => void;
}

function Row({ row, handlers }: { row: ContentRow; handlers: LayoutHandlers }) {
  return (
    <ContentRowView
      row={row}
      border
      arrived={false}
      onDelete={() => handlers.onDelete(row)}
      onEdit={() => handlers.onEdit(row)}
      onToggle={() => handlers.onToggle(row)}
      onOpenPhoto={() => handlers.onOpenPhoto(row)}
    />
  );
}

function Tile({ row, handlers }: { row: ContentRow; handlers: LayoutHandlers }) {
  const cover = row.imageUrl ?? null;
  const letters = row.title.trim().slice(0, 2);
  return (
    <Pressable onPress={() => (row.type === "link" ? handlers.onOpenPhoto(row) : handlers.onEdit(row))} style={{ width: "47%" }}>
      <View className="border border-border-hairline bg-surface-fill" style={{ aspectRatio: 1, borderRadius: 8, overflow: "hidden" }}>
        {cover ? (
          <Image source={{ uri: cover }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
        ) : (
          <Text className="font-core font-semibold text-text-accent" style={{ fontSize: 34, padding: 12 }}>
            {letters}
          </Text>
        )}
      </View>
      <Text className="font-core font-semibold text-text-primary" style={{ fontSize: 14, marginTop: 6 }} numberOfLines={1}>
        {row.title}
      </Text>
    </Pressable>
  );
}

function ListSection({ section, colour, handlers }: { section: Extract<Sec, { kind: "list" }>; colour: string | undefined; handlers: LayoutHandlers }) {
  const COLOR = useColors();
  const [open, setOpen] = useState(!section.foldedAtFirst);
  const tiles = section.form === "tile";
  return (
    <View style={{ marginTop: 16 }}>
      {section.heading !== null && section.folds ? (
        <Pressable
          onPress={() => setOpen((v) => !v)}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          className="min-h-tap-min flex-row items-center gap-space-3 px-gutter-screen"
        >
          {colour ? <View style={{ width: 10, height: 10, borderRadius: 999, backgroundColor: colour }} /> : null}
          <Text className="font-core font-semibold text-text-primary" style={{ fontSize: 17 }}>
            {section.heading}
          </Text>
          <Text className="font-core text-text-tertiary" style={{ fontSize: 13 }}>
            {section.rows.length}
          </Text>
          <View className="flex-1" />
          <Glyph name={open ? "chevron-down" : "chevron-right"} size={18} color={COLOR.secondary} />
        </Pressable>
      ) : null}
      {open ? (
        <>
          {section.add ? (
            <Pressable onPress={handlers.onAdd} className="min-h-tap-min flex-row items-center gap-space-3 px-gutter-screen">
              <Glyph name="plus" size={20} color={COLOR.quiet} />
              <Text className="font-core text-text-tertiary" style={{ fontSize: 17 }}>
                Add an item
              </Text>
            </Pressable>
          ) : null}
          {section.rows.length === 0 && section.heading !== null ? (
            <Text className="px-gutter-screen py-space-3 font-core text-text-tertiary" style={{ fontSize: 14 }}>
              Nothing here yet
            </Text>
          ) : tiles ? (
            <View className="flex-row flex-wrap px-gutter-screen" style={{ gap: 12 }}>
              {section.rows.map((row) => (
                <Tile key={row.id} row={row} handlers={handlers} />
              ))}
            </View>
          ) : (
            section.rows.map((row) => <Row key={row.id} row={row} handlers={handlers} />)
          )}
        </>
      ) : null}
    </View>
  );
}

function FoldSection({ heading, rows, handlers }: { heading: string; rows: ContentRow[]; handlers: LayoutHandlers }) {
  const COLOR = useColors();
  const [open, setOpen] = useState(false);
  return (
    <View style={{ marginTop: 16 }}>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        className="mx-gutter-screen min-h-tap-min flex-row items-center gap-space-3 rounded-lg bg-surface-fill px-space-4"
      >
        <Glyph name="check" size={16} color={COLOR.secondary} />
        <Text className="font-core text-text-secondary" style={{ fontSize: 14 }}>
          {heading} {rows.length}
        </Text>
        <View className="flex-1" />
        <Glyph name={open ? "chevron-down" : "chevron-right"} size={16} color={COLOR.secondary} />
      </Pressable>
      {open ? rows.map((row) => <Row key={row.id} row={row} handlers={handlers} />) : null}
    </View>
  );
}

function DaySection({ section, handlers }: { section: Extract<Sec, { kind: "day" }>; handlers: LayoutHandlers }) {
  const d = new Date(section.day + "T00:00:00");
  return (
    <View className="flex-row border-b border-border-hairline px-gutter-screen" style={{ gap: 12, paddingVertical: 16 }}>
      <View style={{ width: 48, alignItems: "flex-end" }}>
        <Text className="font-core font-semibold text-text-primary" style={{ fontSize: 13 }}>
          {d.toLocaleDateString(undefined, { weekday: "short" })}
        </Text>
        <Text className="font-core text-text-tertiary" style={{ fontSize: 12 }}>
          {d.toLocaleDateString(undefined, { day: "numeric", month: "short" })}
        </Text>
      </View>
      <View className="flex-1">
        {section.rows.map((item) =>
          "type" in item ? (
            <ContentRowView
              key={item.id}
              row={item}
              border={false}
              arrived={false}
              onDelete={() => handlers.onDelete(item)}
              onEdit={() => handlers.onEdit(item)}
              onToggle={() => handlers.onToggle(item)}
            />
          ) : (
            <Text key={item.id} className="font-quiet text-text-secondary" style={{ fontSize: 15, paddingVertical: 8 }}>
              {item.text}
            </Text>
          ),
        )}
      </View>
    </View>
  );
}

export function LayoutSections({ page, labels, handlers }: { page: Page; labels: { id: string; name: string; colour: number }[]; handlers: LayoutHandlers }) {
  const COLOR = useColors();
  const [others, setOthers] = useState(false);
  const otherCount = page.others.rows.length + page.others.notes.length;

  if (others) {
    return (
      <View>
        <View className="px-gutter-screen pb-space-3 pt-space-7">
          <Text className="font-core font-semibold text-text-primary" style={{ fontSize: 21 }}>
            Other things
          </Text>
        </View>
        {page.others.rows.map((row) => (
          <Row key={row.id} row={row} handlers={handlers} />
        ))}
        {page.others.notes.map((note) => (
          <Text key={note.id} className="px-gutter-screen font-quiet text-text-secondary" style={{ fontSize: 15, paddingVertical: 8 }}>
            {note.text}
          </Text>
        ))}
        <Pressable
          onPress={() => setOthers(false)}
          className="min-h-tap-min flex-row items-center gap-space-3 border-t border-border-hairline px-gutter-screen"
          style={{ marginTop: 16 }}
        >
          <Glyph name="chevron-left" size={15} color={COLOR.secondary} />
          <Text className="font-core text-text-secondary" style={{ fontSize: 14.5 }}>
            Back to the list
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View>
      {page.sections.map((section, i) => {
        if (section.kind === "list") {
          const colour = section.labelId ? COLOR.labels[labels.find((l) => l.id === section.labelId)?.colour ?? 0] : undefined;
          return <ListSection key={section.key} section={section} colour={colour} handlers={handlers} />;
        }
        if (section.kind === "done") return <FoldSection key={section.key} heading={section.heading} rows={section.rows} handlers={handlers} />;
        if (section.kind === "day") return <DaySection key={section.key} section={section} handlers={handlers} />;
        if (section.kind === "files")
          return (
            <View key={`files-${i}`} className="flex-row flex-wrap px-gutter-screen" style={{ gap: 12, marginTop: 16 }}>
              {section.rows.map((row) => (
                <Tile key={row.id} row={row} handlers={handlers} />
              ))}
            </View>
          );
        return null;
      })}

      {otherCount > 0 ? (
        <Pressable
          onPress={() => setOthers(true)}
          className="min-h-tap-min flex-row items-center gap-space-3 border-t border-border-hairline px-gutter-screen"
          style={{ marginTop: 16 }}
        >
          <Text className="font-core flex-1 text-text-secondary" style={{ fontSize: 14.5 }}>
            {otherCount} other things in here
          </Text>
          <Glyph name="chevron-right" size={16} color={COLOR.secondary} />
        </Pressable>
      ) : null}
    </View>
  );
}
