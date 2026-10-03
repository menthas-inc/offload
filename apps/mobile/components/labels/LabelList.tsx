// 025. The label's list, for many rows at once: a full-height sheet on iOS
// and a Material bottom sheet on Android. A name field led by the colour's
// dot, "Tick what goes under it.", every row in the thread under the thread's
// own headings with a tick each, and a foot of Cancel and Label N; for an
// existing label also Rename, Colour and Delete, and Save.
//
// Virtualised, and read page by page from the server with the tick the server
// worked out, keeping what was ticked while later pages arrive. It writes
// nothing itself: the screen makes the one write and offers the one Undo.

import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Platform, Pressable, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { countWord, readEveryPage, widgetsFor, type WidgetKind } from "@offload/widgets";
import { Glyph } from "../Glyph";
import { useColors } from "../../lib/colors";
import { fetchContent, type ContentRow, type Note } from "../../lib/threads";
import type { Label, Rows } from "../../lib/labels";
import { LabelDot, LabelMark, labelBg } from "./LabelMark";
import { DragSheet } from "../shell/DragSheet";

const isAndroid = Platform.OS === "android";
const NAME_CHARS = 24;
const HEADINGS: Record<WidgetKind, string> = { todo: "To do", files: "Files" };

export interface ListSave {
  name: string;
  colour: number | undefined;
  add: Required<Rows>;
  remove: Required<Rows>;
}

type Line =
  | { kind: "heading"; key: string; title: string }
  | { kind: "row"; key: string; title: string; initial: boolean; carried: string[] };

export function LabelList({
  threadId,
  label,
  labels,
  notes,
  widgets,
  freeColour,
  line,
  onSave,
  onDelete,
  onClose,
}: {
  threadId: string;
  label: Label | null;
  labels: Label[];
  notes: Note[];
  widgets: string[] | undefined;
  freeColour: number;
  line: string | null;
  onSave: (save: ListSave) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const COLOR = useColors();
  const insets = useSafeAreaInsets();
  const [rows, setRows] = useState<(ContentRow & { ticked?: boolean })[] | null>(null);
  const [changed, setChanged] = useState<Map<string, boolean>>(new Map());
  const [name, setName] = useState(label?.name ?? "");
  const nameField = useRef<TextInput>(null);
  const [colour, setColour] = useState<number>(label?.colour ?? freeColour);
  const [renaming, setRenaming] = useState(label === null);
  const [colouring, setColouring] = useState(false);
  const [asking, setAsking] = useState(false);
  const [tooLong, setTooLong] = useState(false);
  const [unread, setUnread] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const live = useRef(true);
  // 2026-09-29. The keyboard pads the foot rather than lifting the sheet. The
  // sheet runs from under the status bar to the bottom, so lifting it by the
  // keyboard's height pushed its top, the name and the colour, off the
  // screen; padded, the list of rows is what gives up the room and scrolls.
  // `keyboardHeight` is negative while the keyboard is up.

  useEffect(() => {
    live.current = true;
    setUnread(false);
    void readEveryPage<ContentRow & { ticked?: boolean }>(
      (cursor) => fetchContent(threadId, { ...(cursor ? { cursor } : {}), ...(label ? { ticksFor: label.id } : {}) }),
      setRows,
      () => live.current,
    ).then((read) => {
      if (!read) setUnread(true);
    });
    return () => {
      live.current = false;
    };
  }, [threadId, label, attempt]);

  const noteTicked = (note: Note) => (label ? note.labels.includes(label.id) : false);
  const isOn = (key: string, initial: boolean) => changed.get(key) ?? initial;
  const flip = (key: string, initial: boolean) =>
    setChanged((current) => {
      const next = new Map(current);
      const now = !(current.get(key) ?? initial);
      if (now === initial) next.delete(key);
      else next.set(key, now);
      return next;
    });

  const lines = useMemo<Line[]>(() => {
    const content = rows ?? [];
    const sections = widgetsFor(content, widgets);
    const inSections = new Set(sections.flatMap((s) => s.rows.map((r) => r.id)));
    const rest = content.filter((row) => !inSections.has(row.id));
    const out: Line[] = [];
    for (const section of sections) {
      out.push({ kind: "heading", key: `h:${section.kind}`, title: HEADINGS[section.kind] });
      for (const row of section.rows) out.push({ kind: "row", key: `c:${row.id}`, title: row.title, initial: row.ticked === true, carried: row.labels });
    }
    if (notes.length > 0) {
      out.push({ kind: "heading", key: "h:notes", title: "Notes" });
      for (const note of notes) out.push({ kind: "row", key: `n:${note.id}`, title: note.text, initial: noteTicked(note), carried: note.labels });
    }
    if (rest.length > 0) {
      out.push({ kind: "heading", key: "h:rest", title: sections.length > 0 ? "Everything else" : "Everything in here" });
      for (const row of rest) out.push({ kind: "row", key: `c:${row.id}`, title: row.title, initial: row.ticked === true, carried: row.labels });
    }
    return out;
  }, [rows, notes, widgets, label]);

  const count = lines.filter((line) => line.kind === "row" && isOn(line.key, line.initial)).length;

  function save(): void {
    const clean = name.trim().replace(/^#+/, "").replace(/\s+/g, " ").trim();
    if ([...clean].length > NAME_CHARS) {
      setTooLong(true);
      return;
    }
    if (!clean) return;
    const add: Required<Rows> = { content: [], notes: [] };
    const remove: Required<Rows> = { content: [], notes: [] };
    for (const [key, on] of changed) {
      (on ? add : remove)[key.startsWith("c:") ? "content" : "notes"].push(key.slice(2));
    }
    onSave({ name: clean, colour: colour === label?.colour ? undefined : colour, add, remove });
  }

  const taken = (c: number) => labels.find((l) => l.colour === c && l.id !== label?.id);
  const pill = "items-center justify-center rounded-pill px-space-6";

  return (
    <>
      <DragSheet
        onClose={onClose}
        keyboard="room"
        surface={`rounded-t-lg ${isAndroid ? "bg-a-c" : "bg-surface-raised"}`}
        sheetStyle={{ top: insets.top + 12 }}
        style={{ flex: 1 }}
        onOpen={label === null ? () => nameField.current?.focus() : undefined}
      >
        <View className="px-gutter-screen pt-space-5">
          <Text className="font-core font-semibold text-text-primary text-title-2">
            {label ? label.name : "New label"}
          </Text>
          <View className="mt-space-5 flex-row items-center gap-space-4 rounded-sm border border-border-strong px-space-5" style={{ minHeight: 48 }}>
            <LabelDot colour={colour} size={10} />
            <TextInput
              value={name}
              ref={nameField}
              editable={renaming}
              onChangeText={(text) => {
                setName(text);
                setTooLong(false);
              }}
              placeholder="Name it"
              placeholderTextColor={COLOR.quiet}
              maxLength={NAME_CHARS + 4}
              returnKeyType="done"
              onSubmitEditing={save}
              accessibilityLabel="Label name"
              className="flex-1 font-core text-text-primary text-body"
            />
          </View>
          {tooLong ? (
            <Text className="mt-space-3 font-core text-text-danger text-label">
              A label is {NAME_CHARS} characters at most.
            </Text>
          ) : null}
          {line ? (
            <Text className="mt-space-3 font-core text-text-danger text-label">
              {line}
            </Text>
          ) : null}
          <Text className="mb-space-3 mt-space-4 font-core text-text-secondary text-body-sm">
            Tick what goes under it.
          </Text>
        </View>

        <FlatList
          data={rows === null ? [] : lines}
          keyExtractor={(item) => item.key}
          style={{ flex: 1 }}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            unread ? (
              <View className="flex-row items-center justify-between gap-space-4 px-gutter-screen pb-space-3">
                <Text className="flex-1 font-core text-body-sm text-text-danger" accessibilityLiveRegion="polite" accessibilityRole="alert">
                  Couldn&apos;t load everything
                </Text>
                <Pressable
                  onPress={() => setAttempt((n) => n + 1)}
                  className={`${pill} border border-border-strong`}
                  style={{ minHeight: 44 }}
                  accessibilityRole="button"
                >
                  <Text className="font-core font-medium text-body-sm text-text-primary">Try again</Text>
                </Pressable>
              </View>
            ) : null
          }
          ListEmptyComponent={
            rows === null && !unread ? (
              <View className="items-center py-space-8">
                <ActivityIndicator color={COLOR.spinnerHead} accessibilityLabel="Loading" />
              </View>
            ) : null
          }
          renderItem={({ item }) =>
            item.kind === "heading" ? (
              <Text className="px-gutter-screen pb-space-2 pt-space-5 font-core font-medium text-text-tertiary text-caption">
                {item.title}
              </Text>
            ) : (
              <Pressable
                onPress={() => flip(item.key, item.initial)}
                className="min-h-tap-min flex-row items-center gap-space-5 border-b border-border-hairline px-gutter-screen py-space-3"
                accessibilityRole="checkbox"
                accessibilityState={{ checked: isOn(item.key, item.initial) }}
              >
                <View className="flex-1 flex-row flex-wrap items-center gap-space-3">
                  <Text className="font-core text-text-primary text-body" numberOfLines={2}>
                    {item.title}
                  </Text>
                  {item.carried
                    .filter((id) => id !== label?.id)
                    .map((id) => labels.find((l) => l.id === id))
                    .filter((l): l is Label => l !== undefined)
                    .map((l) => (
                      <LabelMark key={l.id} color={l.colour}>
                        {l.name}
                      </LabelMark>
                    ))}
                </View>
                <View
                  className={`items-center justify-center rounded-xs ${isOn(item.key, item.initial) ? "bg-surface-inverse" : "border border-border-strong"}`}
                  style={{ width: 22, height: 22, borderWidth: isOn(item.key, item.initial) ? 0 : 1.5 }}
                >
                  {isOn(item.key, item.initial) ? <Glyph name="check" size={14} color={COLOR.onSolid} /> : null}
                </View>
              </Pressable>
            )
          }
        />

        {label ? (
          <View className="flex-row flex-wrap gap-space-3 border-t border-border-hairline px-gutter-screen pt-space-4">
            {[
              ["Rename", () => setRenaming(true)],
              ["Colour", () => setColouring((v) => !v)],
              ["Delete", () => setAsking(true)],
            ].map(([text, press]) => (
              <Pressable
                key={text as string}
                onPress={press as () => void}
                className={`${pill} border border-border-strong`}
                style={{ minHeight: 44 }}
                accessibilityRole="button"
              >
                <Text className="font-core font-medium text-text-primary text-body-sm">
                  {text as string}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        {colouring ? (
          <View className="flex-row flex-wrap gap-space-4 px-gutter-screen pt-space-4" accessibilityRole="radiogroup">
            {Array.from({ length: 10 }, (_, i) => i + 1).map((c) => {
              const holder = taken(c);
              return (
                <Pressable
                  key={c}
                  onPress={() => setColour(c)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: colour === c }}
                  accessibilityLabel={holder ? `Colour ${c}, ${holder.name}'s. Picking it swaps.` : `Colour ${c}`}
                  className={`items-center justify-center rounded-pill ${labelBg(c)}`}
                  style={{ width: 44, height: 44, borderWidth: colour === c ? 3 : 0, borderColor: COLOR.raised }}
                >
                  {colour === c ? <Glyph name="check" size={16} color={COLOR.onBrand} /> : holder ? <Text className="font-core text-text-on-solid text-caption">{[...holder.name][0]}</Text> : null}
                </Pressable>
              );
            })}
          </View>
        ) : null}
        {asking && label ? (
          <View className="gap-space-4 px-gutter-screen pt-space-5">
            <Text className="font-core text-text-primary" style={{ fontSize: 15 }}>
              Delete {label.name}? It comes off {countWord(label.count)}. Nothing else is deleted.
            </Text>
            <View className="flex-row flex-wrap gap-space-4">
              <Pressable onPress={() => setAsking(false)} className={`${pill} flex-1 border border-border-strong`} style={{ minHeight: 48 }} accessibilityRole="button">
                <Text className="font-core font-medium text-text-primary" style={{ fontSize: 15 }}>Cancel</Text>
              </Pressable>
              <Pressable onPress={onDelete} className={`${pill} flex-1 bg-clay-600`} style={{ minHeight: 48 }} accessibilityRole="button">
                <Text className="font-core font-medium text-text-on-solid" style={{ fontSize: 15 }}>Delete</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <View className="flex-row flex-wrap gap-space-4 px-gutter-screen pt-space-5">
            <Pressable onPress={onClose} className={`${pill} flex-1 border border-border-strong`} style={{ minHeight: 48 }} accessibilityRole="button">
              <Text className="font-core font-medium text-text-primary" style={{ fontSize: 15 }}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={save}
              disabled={!name.trim() || (label === null && count === 0)}
              className={`${pill} flex-1 ${!name.trim() || (label === null && count === 0) ? "bg-state-disabled-surface" : "bg-surface-inverse"}`}
              style={{ minHeight: 48 }}
              accessibilityRole="button"
            >
              <Text className={`font-core font-medium ${!name.trim() || (label === null && count === 0) ? "text-state-disabled-text" : "text-text-inverse"}`} style={{ fontSize: 15 }}>
                {label ? "Save" : `Label ${count}`}
              </Text>
            </Pressable>
          </View>
        )}
      </DragSheet>
    </>
  );
}
