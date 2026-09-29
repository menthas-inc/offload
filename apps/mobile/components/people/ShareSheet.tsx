// The share sheet. 022.
//
// `Sharing.jsx`'s `ShareSheet`, as the 21 September design changed it: the
// people already in are lifted to the top, so the answer to "who sees this"
// is the first thing in the sheet, each with an x that withdraws a waiting
// share or takes a member out; then your connections who are not in, each
// with a tick; then New connection, the line a person reads before sharing,
// and a footer that is Done until somebody is ticked. No search field when
// every connection fits: it appears past eight rows, lifted by the keyboard
// as the move sheet's is. The row ticks and its mark opens the person, at a
// 44px hit, which is the design's rule and not the kit's row.
//
// Pressing Share is the confirmation (OFF-6), and there is no Undo: a share
// is a message to a person. The two x's each confirm on their own sheet.

import { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, Platform, Pressable, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Svg, { Path } from "react-native-svg";
import { Glyph } from "../Glyph";
import { Avatar } from "../Avatar";
import { ConfirmSheet } from "./ConfirmSheet";
import { useColors } from "../../lib/colors";
import {
  dayMonth,
  fetchShareSheet,
  firstNameOf,
  nameOf,
  shareThread,
  takeOut,
  type Person,
  type ShareRefusal,
  type ShareSheet as Sheet,
} from "../../lib/people";
import { DragSheet } from "../shell/DragSheet";

const isAndroid = Platform.OS === "android";

/** Past this many connections, searching beats scrolling. */
const SEARCH_PAST = 8;

/** The line a person reads before sharing, unchanged since 5 September. */
export const SHARE_LINE =
  "A shared thread belongs to everyone in it. If somebody leaves offload, the thread and everything they added stay with the rest of you.";

function sinceLabel(iso: string): string {
  return `in since ${dayMonth(iso)}`;
}

const REFUSAL: Record<ShareRefusal, string> = {
  unknown_thread: "That didn't go through.",
  default_thread: "That didn't go through.",
  not_connected: "You are not connected any more.",
  already_in: "Already in.",
  waiting: "Already waiting.",
  too_many: "already has three waiting from you.",
};

export function ShareSheet({
  open,
  threadId,
  threadName,
  viewerId,
  onClose,
  onChanged,
}: {
  open: boolean;
  threadId: string;
  threadName: string;
  viewerId: string | null;
  onClose: () => void;
  /** A share made, a member taken out, a share withdrawn: the thread reloads. */
  onChanged: () => void;
}) {
  const COLOR = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [failed, setFailed] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [sending, setSending] = useState(false);
  const [line, setLine] = useState<string | null>(null);
  const [x, setX] = useState<{ person: Person; member: boolean; added?: { count: number; titles: string[] } } | null>(null);
  const [xBusy, setXBusy] = useState(false);
  const [xFailed, setXFailed] = useState(false);

  const load = useCallback(async () => {
    const next = await fetchShareSheet(threadId);
    if (next) {
      setSheet(next);
      setFailed(false);
    } else setFailed(true);
  }, [threadId]);

  useEffect(() => {
    if (!open) return;
    setPicked(new Set());
    setQuery("");
    setLine(null);
    setSheet(null);
    void load();
  }, [open, load]);

  const others = useMemo(() => (sheet?.members ?? []).filter((m) => m.accountId !== viewerId), [sheet, viewerId]);
  const shownConnections = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (sheet?.connections ?? []).filter((c) => !needle || nameOf(c).toLowerCase().includes(needle));
  }, [sheet, query]);
  const searchable = (sheet?.connections.length ?? 0) > SEARCH_PAST;
  const chosen = (sheet?.connections ?? []).filter((c) => picked.has(c.accountId));

  async function share() {
    if (chosen.length === 0) return;
    setSending(true);
    setLine(null);
    const outcomes = await shareThread(
      threadId,
      chosen.map((c) => c.accountId),
    );
    setSending(false);
    if (!outcomes) {
      setLine("That didn't go through.");
      return;
    }
    const refused = outcomes.find((o) => !o.ok);
    if (refused?.error) {
      const who = chosen.find((c) => c.accountId === refused.accountId);
      setLine(refused.error === "too_many" ? `${who ? firstNameOf(who) : "Someone"} ${REFUSAL.too_many}` : REFUSAL[refused.error]);
    }
    onChanged();
    if (outcomes.every((o) => o.ok)) onClose();
    else {
      setPicked(new Set());
      await load();
    }
  }

  async function runX() {
    if (!x) return;
    setXBusy(true);
    setXFailed(false);
    const result = await takeOut(threadId, x.person.accountId);
    setXBusy(false);
    if (!result) {
      setXFailed(true);
      return;
    }
    setX(null);
    onChanged();
    await load();
  }

  function footerLabel(): string {
    if (chosen.length === 0) return "Done";
    const names = chosen.map(firstNameOf);
    if (names.length === 1) return `Share with ${names[0]}`;
    if (names.length === 2) return `Share with ${names[0]} and ${names[1]}`;
    return `Share with ${names[0]}, ${names[1]} and ${names.length - 2} more`;
  }

  if (!open) return null;

  const lifted = [
    ...others.map((m) => ({ key: m.accountId, person: m, kind: "member" as const, meta: sinceLabel(m.since), added: m.added })),
    ...(sheet?.waiting ?? []).map((w) => ({ key: w.memberId, person: w, kind: "waiting" as const, meta: "waiting", added: undefined })),
  ];

  return (
    <>
      {/* Mounted once the list is in hand, so the slide's first layout is
          its last: a Reanimated entering animation measures the view on
          mount, and a sheet that grew from three lines to a list once its
          fetch landed stayed drawn at the height it was born with, half off
          the bottom of a simulator's screen. */}
      {sheet || failed ? (
      <DragSheet
        onClose={onClose}
        keyboard="lift"
        surface={isAndroid ? "rounded-t-a-xl bg-a-c" : "rounded-t-lg bg-surface-raised"}
        sheetStyle={{ maxHeight: "82%", paddingBottom: insets.bottom }}
      >
        <View className="px-gutter-screen pt-space-5">
          <Text className={`font-core font-semibold ${isAndroid ? "text-a-on" : "text-text-primary"}`} style={{ fontSize: 21, letterSpacing: -0.25 }} accessibilityRole="header" numberOfLines={1}>
            Share {threadName}
          </Text>
          <Text className={`pt-space-2 font-core ${isAndroid ? "text-a-on-var" : "text-text-secondary"}`} style={{ fontSize: 14 }}>
            Everyone in here sees everything in it.
          </Text>
        </View>

        {failed && !sheet ? (
          <Text className="px-gutter-screen pt-space-5 font-core text-text-danger" style={{ fontSize: 13 }} accessibilityRole="alert">
            That didn't go through.{" "}
            <Text className="font-core font-medium text-text-accent" onPress={() => void load()}>
              Try again
            </Text>
          </Text>
        ) : null}

        {sheet ? (
          <>
            {/* 42 on the pill, 52dp on Material's, as `M3Sharing.jsx` draws it. */}
            {searchable ? (
              <View
                className={`mx-gutter-screen mt-space-4 flex-row items-center gap-space-3 rounded-pill px-space-5 ${isAndroid ? "bg-a-c-high" : "bg-surface-fill"}`}
                style={{ minHeight: isAndroid ? 52 : 42 }}
              >
                <Glyph name="search" size={15} color={COLOR.iconOnWell} />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search your connections"
                  placeholderTextColor={COLOR.iconOnWell}
                  accessibilityLabel="Search your connections"
                  className="flex-1 font-core text-text-primary"
                  style={{ fontSize: 14.5 }}
                />
                {query ? (
                  <Pressable onPress={() => setQuery("")} hitSlop={8} accessibilityRole="button" accessibilityLabel="Clear">
                    <Glyph name="x" size={14} color={COLOR.iconOnWell} />
                  </Pressable>
                ) : null}
              </View>
            ) : null}

            <FlatList
              data={[
                ...lifted.map((row) => ({ ...row, section: "in" as const })),
                ...shownConnections.map((c) => ({ key: c.accountId, person: c, kind: "connection" as const, meta: undefined, added: undefined, section: "out" as const })),
              ]}
              keyExtractor={(row) => row.key}
              keyboardShouldPersistTaps="handled"
              className="mt-space-2"
              style={{ flexGrow: 0, flexShrink: 1 }}
              ListEmptyComponent={
                sheet.connections.length === 0 && lifted.length === 0 ? (
                  <View className="px-gutter-screen pt-space-4">
                    <Text className={`font-core font-medium ${isAndroid ? "text-a-on" : "text-text-primary"}`} style={{ fontSize: 15 }}>
                      You have no connections yet
                    </Text>
                    <Text className={`pt-space-1 font-core ${isAndroid ? "text-a-on-var" : "text-text-secondary"}`} style={{ fontSize: 14, lineHeight: 20 }}>
                      A connection is somebody already on offload. You need the email they signed up with.
                    </Text>
                  </View>
                ) : query ? (
                  <Text className="px-gutter-screen py-space-4 font-core text-text-tertiary" style={{ fontSize: 13 }}>
                    Nothing by that name.
                  </Text>
                ) : null
              }
              renderItem={({ item, index }) => {
                const last = index === lifted.length + shownConnections.length - 1;
                const on = picked.has(item.person.accountId);
                return (
                  <Pressable
                    onPress={
                      item.kind === "connection"
                        ? () =>
                            setPicked((prev) => {
                              const next = new Set(prev);
                              if (next.has(item.person.accountId)) next.delete(item.person.accountId);
                              else next.add(item.person.accountId);
                              return next;
                            })
                        : undefined
                    }
                    accessibilityRole={item.kind === "connection" ? "checkbox" : undefined}
                    accessibilityState={item.kind === "connection" ? { checked: on } : undefined}
                    className={`flex-row items-center gap-space-4 px-gutter-screen ${last ? "" : "border-b border-border-hairline"}`}
                    style={{ minHeight: 56 }}
                  >
                    <Pressable
                      onPress={() => router.push(`/people/${item.person.accountId}`)}
                      hitSlop={6}
                      accessibilityRole="button"
                      accessibilityLabel={nameOf(item.person)}
                    >
                      <Avatar uid={item.person.accountId} initials={item.person.initials} name={item.person.displayName ?? undefined} size={36} />
                    </Pressable>
                    <View className="flex-1">
                      <Text className={`font-core ${isAndroid ? "text-a-on" : "text-text-primary"}`} style={{ fontSize: 15 }} numberOfLines={1}>
                        {nameOf(item.person)}
                      </Text>
                      {item.meta ? (
                        <Text className="font-core text-text-tertiary" style={{ fontSize: 12.5, marginTop: 2 }}>
                          {item.meta}
                        </Text>
                      ) : null}
                    </View>
                    {item.kind === "connection" ? (
                      <Tick on={on} />
                    ) : (
                      <Pressable
                        onPress={() => {
                          setXFailed(false);
                          setX({ person: item.person, member: item.kind === "member", ...(item.added ? { added: item.added } : {}) });
                        }}
                        hitSlop={14}
                        accessibilityRole="button"
                        accessibilityLabel={item.kind === "member" ? `Take ${firstNameOf(item.person)} out` : `Withdraw the share with ${firstNameOf(item.person)}`}
                      >
                        <Glyph name="x" size={16} color={COLOR.iconOnWell} />
                      </Pressable>
                    )}
                  </Pressable>
                );
              }}
              ListFooterComponent={
                query ? null : (
                  <Pressable
                    onPress={() => {
                      onClose();
                      router.push("/people/add");
                    }}
                    accessibilityRole="button"
                    className="flex-row items-center gap-space-4 px-gutter-screen"
                    style={{ minHeight: 56 }}
                  >
                    <View className="items-center justify-center rounded-pill bg-surface-fill" style={{ width: 36, height: 36 }}>
                      <Glyph name="plus" size={17} color={COLOR.secondary} />
                    </View>
                    <Text className={`flex-1 font-core ${isAndroid ? "text-a-on" : "text-text-primary"}`} style={{ fontSize: 15 }}>
                      New connection
                    </Text>
                    <Glyph name="chevron-right" size={15} color={COLOR.iconOnWell} />
                  </Pressable>
                )
              }
            />

            <Text className="px-gutter-screen pt-space-3 font-core text-text-secondary" style={{ fontSize: 12.5, lineHeight: 18 }}>
              {SHARE_LINE}
            </Text>
          </>
        ) : null}

        {line ? (
          <Text className="px-gutter-screen pt-space-3 font-core text-text-danger" style={{ fontSize: 13 }} accessibilityRole="alert">
            {line}
          </Text>
        ) : null}

        <View className="px-gutter-screen pb-space-3 pt-space-4">
          <Pressable
            onPress={() => (chosen.length > 0 ? void share() : onClose())}
            disabled={sending}
            accessibilityRole="button"
            className={`items-center justify-center rounded-pill ${
              chosen.length > 0 ? (isAndroid ? "bg-blue-600" : "bg-surface-inverse") : "border border-border-strong"
            }`}
            style={{ minHeight: 44, opacity: sending ? 0.55 : 1 }}
          >
            <Text
              className={`font-core font-medium ${
                chosen.length > 0 ? (isAndroid ? "text-text-on-solid" : "text-text-inverse") : isAndroid ? "text-a-on" : "text-text-primary"
              }`}
              style={{ fontSize: 15 }}
              numberOfLines={1}
            >
              {line && chosen.length > 0 ? "Try again" : footerLabel()}
            </Text>
          </Pressable>
        </View>
      </DragSheet>
      ) : null}

      <ConfirmSheet
        open={x !== null}
        title={x ? (x.member ? `Take ${firstNameOf(x.person)} out of ${threadName}?` : `Withdraw the share with ${firstNameOf(x.person)}?`) : ""}
        body={
          x?.member
            ? `${firstNameOf(x.person)} loses the thread. What ${firstNameOf(x.person)} added stays, because a shared thread belongs to everyone who was in it.`
            : `${x ? firstNameOf(x.person) : "They"} will not see it any more, and nothing tells them it was there.`
        }
        rows={x?.added ? x.added.titles.map((title) => ({ title, meta: `${firstNameOf(x.person)} added it` })) : []}
        rowCount={x?.added?.count}
        action={x?.member ? "Take out" : "Withdraw"}
        danger={x?.member === true}
        busy={xBusy}
        failed={xFailed}
        onConfirm={() => void runX()}
        onClose={() => setX(null)}
      />
    </>
  );
}

/** The design's checkbox: 22px, `--border-strong` idle, ink filled with a
 *  white tick on. ConsentTicks draws the same box for the gate. */
function Tick({ on }: { on: boolean }) {
  const COLOR = useColors();
  return (
    <View
      className={`items-center justify-center rounded-xs border ${
        on ? (isAndroid ? "border-transparent bg-blue-600" : "border-transparent bg-ink-950") : "border-border-strong"
      }`}
      style={{ width: 22, height: 22 }}
    >
      {on ? (
        <Svg width={13} height={13} viewBox="0 0 24 24" fill="none">
          <Path d="M20 6L9 17l-5-5" stroke={isAndroid ? COLOR.onBrand : COLOR.onSolid} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      ) : null}
    </View>
  );
}
