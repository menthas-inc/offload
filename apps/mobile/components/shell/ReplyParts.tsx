// 052. A turn's reply in place of its footer: where the dump landed, shown
// rather than announced. Always in this order, every part optional: up to
// three slices, the Also line, up to two pills, the source line, the undo
// line. A question, when the turn asked one, follows in its own bubble.
//
// Drawn under the reply bubble when offload said something and under the
// message that was sent when it did not. Nothing here has a pan of its own:
// the conversation is a drag sheet, and the slices sit in its scroll.

import { useEffect, useState } from "react";
import { Linking, Platform, Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { ROW_PARAM, UNDO_MS, alsoLine, directionsUrl, pillLabel, sourceLine, summaryWords, type Pill } from "@offload/widgets";
import { tapPill, type FoundRow, type Slice, type Source } from "../../lib/dump";
import { useColors } from "../../lib/colors";
import { useClock } from "../../lib/clock";
import { openLink } from "../../lib/links";
import { foundHead, threadHref } from "../../lib/loose";
import {
  EDIT_PARAM,
  SHARE_PARAM,
  asResult,
  clockStart,
  dayOnce,
  entriesOf,
  linePhase,
  markLeft,
  memoriesHead,
  pillsOf,
  slicesOf,
  threadOfRow,
} from "../../lib/reply";
import { undoStore } from "../../lib/undo";
import { Glyph } from "../Glyph";
import { ThreadIcon } from "../ThreadIcon";
import { LabelMark } from "../labels/LabelMark";
import { AnswerResult, Mark } from "./AnswerResult";
import { CalendarSlice } from "./CalendarSlice";
import { useConversation, type Turn } from "./conversation-context";
import { TurnLine, UndoAt } from "./UndoLine";

const isAndroid = Platform.OS === "android";

const PILL_GLYPH: Record<Pill["kind"], string> = {
  date: "calendar",
  calendar: "calendar",
  remind: "bell",
  share: "user-plus",
  directions: "map-pin",
};

export function ReplyParts({ turn }: { turn: Turn }) {
  const { turns, lower, tickFound, undoReply, declineUndo } = useConversation();
  const router = useRouter();
  const now = Date.now();
  // A turn from another device draws what it did and none of its controls (048).
  const phase = turn.elsewhere && turn.parts?.summary ? "retired" : linePhase(turn, turns, now);

  // The clock's eight seconds end in a render of their own, so the line
  // drops its clock and keeps Undo.
  const [, tick] = useState(0);
  useEffect(() => {
    const start = clockStart(turn);
    if (phase !== "early" || start === null) return;
    const id = setTimeout(() => tick((n) => n + 1), Math.max(0, UNDO_MS - (Date.now() - start)));
    return () => clearTimeout(id);
  }, [phase, turn]);

  const folded = turn.folded !== undefined;
  const slices = folded ? [] : slicesOf(turn);
  const pills = folded ? [] : pillsOf(turn);
  const markFor = markLeft(turn, now);
  const labels = turn.labels ?? [];
  const marks = labels.slice(0, 3);

  const openThread = (threadId: string, threadName: string | null) => {
    lower();
    router.push(threadHref(threadId, threadName));
  };
  // A row's sheet, or its date field, on its thread's page.
  const openRow = (row: { contentId: string; threadId: string; threadName: string | null }, edit: "row" | "when") => {
    lower();
    router.push(
      row.threadName === null
        ? { pathname: "/threads/loose", params: { [ROW_PARAM]: row.contentId } }
        : { pathname: "/threads/[id]", params: { id: row.threadId, [ROW_PARAM]: row.contentId, [EDIT_PARAM]: edit } },
    );
  };

  if (slices.length === 0 && labels.length === 0 && !turn.parts?.also.length && pills.length === 0 && !turn.sources?.length && !phase) return null;

  return (
    <View className="mt-space-3 gap-space-3 self-stretch">
      {slices.map((slice, index) => (
        <SliceView
          key={index}
          slice={slice}
          markFor={markFor}
          onTick={(row) => void tickFound(turn.id, row)}
          onOpenThread={openThread}
          onOpenRow={(row) => openRow(row, "row")}
          onOpenMemories={() => {
            lower();
            router.push("/memories");
          }}
        />
      ))}

      {/* 025. What the turn applied, three and then a count. */}
      {marks.length > 0 ? (
        <View className="flex-row flex-wrap items-center gap-space-2">
          {marks.map((label) => (
            <LabelMark key={label.id} color={label.colour} size={30}>
              {label.name}
            </LabelMark>
          ))}
          {labels.length > marks.length ? (
            <Text className="font-core text-text-tertiary" style={{ fontSize: 12.5 }}>
              and {labels.length - marks.length} more
            </Text>
          ) : null}
        </View>
      ) : null}

      <AlsoLine turn={turn} onOpen={openThread} />

      <Pills
        turn={turn}
        pills={pills}
        onDate={(rowId) => {
          const where = turn.parts ? threadOfRow(turn.parts, rowId) : null;
          if (where) openRow({ contentId: rowId, threadId: where.id, threadName: where.name }, "when");
        }}
      />

      <SourceLine sources={turn.sources ?? []} />

      {phase && turn.parts?.summary ? (
        <TurnLine
          summary={turn.parts.summary}
          phase={phase}
          startedAt={clockStart(turn)}
          folded={turn.folded}
          ask={turn.undoAsk}
          failed={turn.undoFailed}
          onUndo={() => void undoReply(turn.turnId!)}
          onConfirm={() => void undoReply(turn.turnId!, true)}
          onDecline={() => declineUndo(turn.id)}
        />
      ) : null}
    </View>
  );
}

function SliceView({
  slice,
  markFor,
  onTick,
  onOpenThread,
  onOpenRow,
  onOpenMemories,
}: {
  slice: Slice;
  markFor: number;
  onTick: (row: FoundRow) => void;
  onOpenThread: (threadId: string, threadName: string | null) => void;
  onOpenRow: (row: FoundRow) => void;
  onOpenMemories: () => void;
}) {
  const COLOR = useColors();
  switch (slice.kind) {
    case "list":
      return (
        <AnswerResult
          result={asResult(slice)}
          count={slice.openCount}
          marked={slice.marked}
          markFor={markFor}
          notes={slice.notes}
          previous={slice.previous}
          onToggle={onTick}
          onOpenThread={onOpenThread}
          onOpenRow={onOpenRow}
        />
      );
    case "newThread":
      return (
        <AnswerResult
          result={asResult(slice)}
          count={0}
          marked={slice.rows.map((row) => row.contentId)}
          markFor={markFor}
          notes={slice.notes}
          onToggle={onTick}
          onOpenThread={onOpenThread}
          onOpenRow={onOpenRow}
          head={
            // Where it sits among other threads says nothing yet: the inside does.
            <Pressable
              onPress={() => onOpenThread(slice.thread.id, slice.thread.name)}
              accessibilityRole="button"
              accessibilityLabel={`Open ${foundHead(slice.thread.name)}`}
              className="min-h-tap-min flex-row items-center gap-space-4 border-b border-border-hairline bg-surface-accent-soft px-space-5 py-space-4"
            >
              <ThreadIcon icon={slice.thread.icon ?? ""} hue={slice.thread.hue ?? 1} seed={slice.thread.id} size={36} />
              <View className="flex-1">
                <Text className="font-core font-medium text-text-accent" style={{ fontSize: 12 }}>
                  New thread
                </Text>
                <Text className="font-core font-semibold text-text-primary" style={{ fontSize: 16, lineHeight: 20 }}>
                  {foundHead(slice.thread.name)}
                </Text>
              </View>
            </Pressable>
          }
        />
      );
    case "memories":
      return (
        <View
          className={`overflow-hidden rounded-a-md ${isAndroid ? "bg-a-c-low" : "border border-border-hairline bg-surface-raised"}`}
          style={isAndroid ? { boxShadow: `inset 0 0 0 1px ${COLOR.edgeCard}` } : undefined}
        >
          <Pressable
            onPress={onOpenMemories}
            accessibilityRole="button"
            className="min-h-tap-min flex-row items-center border-b border-border-hairline bg-surface-accent-soft px-space-5 py-space-4"
          >
            <Text className="font-core font-medium text-text-accent" style={{ fontSize: 13.5 }}>
              {memoriesHead(slice.memoryKind)}
            </Text>
          </Pressable>
          <View className="flex-row flex-wrap gap-space-2 px-space-5 py-space-4">
            {slice.memories.map((memory) => (
              <View
                key={memory.id}
                className={`justify-center overflow-hidden rounded-pill border px-space-4 ${
                  memory.marked ? "border-transparent bg-surface-accent-soft" : "border-border-strong"
                }`}
                style={{ minHeight: 30 }}
              >
                {memory.marked ? <Mark left={markFor} /> : null}
                <Text
                  className={`font-core font-medium ${memory.marked ? "text-text-accent" : "text-text-secondary"}`}
                  style={{ fontSize: 13, lineHeight: 18 }}
                >
                  {memory.text}
                </Text>
              </View>
            ))}
          </View>
        </View>
      );
    case "calendar":
      return <CalendarSlice slice={slice} markFor={markFor} onOpenThread={onOpenThread} />;
    case "removed":
      return (
        <Text className="font-core text-text-tertiary" style={{ fontSize: 13 }}>
          Since removed
        </Text>
      );
  }
}

/** The places past the third slice, each one a link, so every place the turn
 *  touched can be reached from the reply. */
function AlsoLine({ turn, onOpen }: { turn: Turn; onOpen: (threadId: string, threadName: string | null) => void }) {
  const line = alsoLine((turn.parts?.also ?? []).map((thread) => ({ ...thread, name: foundHead(thread.name), raw: thread.name })));
  if (!line || turn.folded !== undefined) return null;
  return (
    <View className="flex-row flex-wrap items-center gap-space-2">
      <Text className="font-core text-text-secondary" style={{ fontSize: 13 }}>
        {line.lead}
      </Text>
      {line.threads.map((thread, index) => (
        <Pressable
          key={thread.id}
          onPress={() => onOpen(thread.id, thread.raw)}
          accessibilityRole="link"
          className="min-h-tap-min justify-center"
        >
          <Text className="font-core font-medium text-text-accent" style={{ fontSize: 13 }}>
            {thread.name}
            {index < line.threads.length - 1 ? "," : ""}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

/** Up to two, for what the dump left out. `Chip`'s geometry, 30 tall in a 44
 *  target, in `QuickReplies`' value paint. A tap sends the turn and the kind;
 *  the server finds the row again from its own record. */
function Pills({ turn, pills, onDate }: { turn: Turn; pills: Pill[]; onDate: (rowId: string) => void }) {
  const COLOR = useColors();
  const router = useRouter();
  const { lower, pillConfirm } = useConversation();
  const { today } = useClock();
  const [tapped, setTapped] = useState<ReadonlySet<Pill["kind"]>>(new Set());
  if (pills.length === 0 || !turn.turnId) return null;
  const turnId = turn.turnId;
  const at = (pill: Pill) => ({ id: `pill:${turnId}`, icon: PILL_GLYPH[pill.kind], form: "under" as const });
  const shown = (kind: Pill["kind"], on: boolean) =>
    setTapped((now) => {
      const next = new Set(now);
      if (on) next.add(kind);
      else next.delete(kind);
      return next;
    });

  const tap = async (pill: Pill): Promise<void> => {
    if (pill.kind === "date") return pill.rowId ? onDate(pill.rowId) : undefined;
    if (pill.kind === "share") {
      const made = turn.parts?.slices.find((slice) => slice.kind === "newThread");
      if (!made || made.kind !== "newThread" || !pill.person) return;
      lower();
      return router.push({ pathname: "/threads/[id]", params: { id: made.thread.id, [SHARE_PARAM]: pill.person.accountId } });
    }
    if (pill.kind === "directions") {
      for (const slice of turn.parts?.slices ?? []) {
        if (slice.kind !== "calendar") continue;
        const day = await dayOnce(slice.day, slice.day < today);
        const entry = day ? entriesOf(day).find((one) => one.id === pill.rowId) : undefined;
        const place = entry?.item.place;
        if (place && place.lat !== null && place.lng !== null) {
          return void Linking.openURL(directionsUrl({ lat: place.lat, lng: place.lng, googlePlaceId: null })).catch(() => {});
        }
      }
      return;
    }
    const kind = pill.kind;
    const out = await tapPill(turnId, kind);
    if (out === "ok") {
      shown(kind, true);
      undoStore.put(at(pill), kind === "calendar" ? summaryWords({ kind: "added", count: 1 }) : "Reminder on", {
        label: "Undo",
        onPress: async function back() {
          const undone = await tapPill(turnId, kind, true);
          if (undone === "ok") return shown(kind, false);
          undoStore.put(at(pill), "Couldn't put that back", { label: "Retry", onPress: back });
        },
      });
    } else if (out && typeof out === "object") {
      // 019's pending-write confirm, drawn where the turn's proposals are.
      shown(kind, true);
      pillConfirm(turn.id, out);
    } else {
      undoStore.put(at(pill), "That didn't go through", { label: "Retry", onPress: () => tap(pill) });
    }
  };

  const left = pills.filter((pill) => !tapped.has(pill.kind));
  return (
    <View>
      {left.length > 0 ? (
        <View className="flex-row flex-wrap" style={{ columnGap: 8 }}>
          {left.map((pill) => (
            <Pressable
              key={pill.kind}
              onPress={() => void tap(pill)}
              accessibilityRole="button"
              className="justify-center"
              style={{ minHeight: 44 }}
            >
              <View
                className="flex-row items-center gap-space-2 rounded-pill border border-border-strong bg-surface-card px-space-4"
                style={{ height: 30 }}
              >
                <Glyph name={PILL_GLYPH[pill.kind]} size={13} color={COLOR.quiet} />
                <Text className="font-core font-medium text-text-primary" style={{ fontSize: 13 }} numberOfLines={1}>
                  {pillLabel(pill)}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>
      ) : null}
      <UndoAt id={`pill:${turnId}`} />
    </View>
  );
}

/** The domains the turn read, as one quiet line: the one external link in a
 *  conversation, so its words are a registrable domain from the read record. */
function SourceLine({ sources }: { sources: Source[] }) {
  const COLOR = useColors();
  const line = sourceLine(sources);
  if (!line) return null;
  return (
    <View className="flex-row flex-wrap items-center" style={{ columnGap: 8 }}>
      <Glyph name="link" size={12} color={COLOR.quiet} />
      {line.shown.map((source) => (
        <Pressable
          key={source.url}
          onPress={() => void openLink(source.url)}
          accessibilityRole="link"
          accessibilityLabel={`Open ${source.domain}`}
          className="min-h-tap-min justify-center"
        >
          <Text className="font-core text-text-tertiary" style={{ fontSize: 12 }}>
            {source.domain}
          </Text>
        </Pressable>
      ))}
      {line.more ? (
        <Text className="font-core text-text-tertiary" style={{ fontSize: 12 }}>
          {line.more}
        </Text>
      ) : null}
    </View>
  );
}
