// One thread, from ui_kits/mobile_app/ThreadScreen.jsx.
//
// The app bar carries back, Share and More, and nothing else: **the name is a
// heading inside the scroll**, not in the bar, which is the kit's own layout and
// the opposite of the web's pane head.
//
// Four things the kit does not draw and this does, each with an entry in the
// design system's log:
//
//   - **The notes section**, which no kit draws on any platform.
//   - **Content row actions**: a swipe deletes, a long press opens the rest.
//     The sheet lists what this account may actually do to the row, which is
//     how the authorship split is handled without a gesture map that is wrong
//     for half of them.
//   - **The archived pile**, a row under everything live.
//   - **No standing placeholder.** The kit says "offload has not summarised
//     this one yet" when there is none; nothing writes summaries, and a line
//     saying offload has not done something is an apology taking up the most
//     prominent space on the screen.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, {
  FadeIn,
  FadeInDown,
  FadeOut,
  useAnimatedStyle,
} from "react-native-reanimated";
import { useReanimatedKeyboardAnimation } from "react-native-keyboard-controller";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { cadenceLabel, datedFor, splitRepeating, widgetsFor } from "@offload/widgets";
import { Glyph } from "../Glyph";
import { atOpacity, useColors } from "../../lib/colors";
import { ContentRowView } from "../shell/ContentRow";
import { NotesSection } from "../shell/Notes";
import { RowActionSheet, type RowAction } from "../shell/RowActionSheet";
import { ToastHost, useToast } from "../shell/Toast";
import { Timeline } from "../shell/Timeline";
import { Widgets } from "../shell/Widgets";
import {
  completeContent,
  deleteContent,
  editContent,
  fetchContent,
  fetchThread,
  setArchived,
  type ContentRow,
  type ThreadBundle,
  setPreference,
} from "../../lib/threads";
import { useConversation, useScreenSheet } from "../shell/conversation-context";
import { failed } from "../../lib/log";

const isAndroid = Platform.OS === "android";

export default function Thread() {
  const COLOR = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [thread, setThread] = useState<ThreadBundle | null>(null);
  const [rows, setRows] = useState<ContentRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [acting, setActing] = useState<ContentRow | null>(null);
  const [renaming, setRenaming] = useState<ContentRow | null>(null);
  // What arrived while this screen was open, marked for a moment rather than
  // appearing silently in the middle of a list.
  const [arrived, setArrived] = useState<Set<string>>(new Set());
  const toast = useToast();
  const { filed, setOnScreen } = useConversation();

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [bundle, page] = await Promise.all([
        fetchThread(id),
        fetchContent(id, { archived: showArchived }),
      ]);
      setThread(bundle);
      setRows(page?.rows ?? []);
      setCursor(page?.nextCursor ?? null);
    } catch (error) {
      failed("thread.load", error, { threadId: id });
    }
  }, [id, showArchived]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  // Tell the composer where somebody is, so a dump typed here lands here
  // without them saying so. Cleared on the way out: the composer lives in the
  // shell and outlives this screen, and a stale thread would go on collecting
  // dumps from Today.
  const name = thread?.name;
  useFocusEffect(
    useCallback(() => {
      if (id && name) setOnScreen({ id, name });
      return () => setOnScreen(null);
    }, [id, name, setOnScreen]),
  );

  /** Reload, and mark whatever was not here before.
   *
   *  The diff is done here rather than asked of the server: the screen already
   *  knows what it was showing, and a "what changed since" parameter would be a
   *  second source of truth about the same question. */
  const catchUp = useCallback(async (): Promise<void> => {
    if (!id) return;
    const before = new Set(rows.map((row) => row.id));
    const [bundle, page] = await Promise.all([
      fetchThread(id),
      fetchContent(id, { archived: showArchived }),
    ]);
    const next = page?.rows ?? [];
    setThread(bundle);
    setRows(next);
    setCursor(page?.nextCursor ?? null);
    const fresh = next
      .filter((row) => !before.has(row.id))
      .map((row) => row.id);
    if (fresh.length > 0) setArrived(new Set(fresh));
  }, [id, rows, showArchived]);

  // offload filed into the thread somebody is looking at. The composer is on
  // this screen, so this is the ordinary case rather than a race, and without
  // it the page goes on showing what it held a moment ago while the reply says
  // otherwise.
  const lastFiled = useRef(0);
  useEffect(() => {
    if (!filed || filed.at === lastFiled.current) return;
    lastFiled.current = filed.at;
    if (filed.threadIds.length > 0 && !filed.threadIds.includes(id ?? ""))
      return;
    void catchUp();
  }, [filed, id, catchUp]);

  // The mark is a moment, not a state, and it is cleared on a timer so it
  // survives the reload that produced it.
  useEffect(() => {
    if (arrived.size === 0) return;
    const timer = setTimeout(() => setArrived(new Set()), 1600);
    return () => clearTimeout(timer);
  }, [arrived]);

  async function tick(row: ContentRow): Promise<void> {
    await completeContent(row.id, row.doneAt === null);
    await load();
  }

  async function archive(row: ContentRow): Promise<void> {
    if (!(await setArchived(row.id, row.archivedAt === null))) return;
    await load();
    toast.show(row.archivedAt === null ? "Archived" : "Back in the thread", {
      label: "Undo",
      onPress: async () => {
        await setArchived(row.id, row.archivedAt !== null);
        await load();
      },
    });
  }

  async function remove(row: ContentRow): Promise<void> {
    if (!(await deleteContent(row.id))) return;
    await load();
    // Never the row's title: a toast is a few words and a title is not.
    toast.show("Deleted");
  }

  if (!thread) {
    return (
      <SafeAreaView
        className={`flex-1 ${isAndroid ? "bg-a-surface" : "bg-surface-page"}`}
        edges={["top"]}
      >
        <Bar onBack={() => router.back()} />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      </SafeAreaView>
    );
  }

  const widgets = widgetsFor(rows, thread.preference.widgets);
  const inWidgets = new Set(widgets.flatMap((w) => w.rows.map((r) => r.id)));
  // **Anything with a date already has a home, so this does not repeat it.**
  // The rail above draws every dated row and its day lists them, which is where
  // an event belongs. Taken from what the rail actually draws rather than from
  // a type check, so the two cannot disagree.
  //
  // **Only while the rail is on screen.** The archived view hides it, and
  // taking dated rows out of a list that is the only list there makes an
  // archived event invisible. The two have to be decided together, which is
  // why this reads the same flag the rail does.
  //
  // **And the rail is earned.** With nothing dated there is no rail at all,
  // which 015's own opening paragraph said and its AC-1 contradicted. Computed
  // once, so the rail and the list agree about what is on it.
  const dated = showArchived ? [] : datedFor(rows, thread.notes);
  const onRail = new Set(dated.map((one) => one.rowId));

  // **A repeating thing is one row here, not thirty.** A weekly class filed as
  // thirty occurrences spends thirty rows saying what the row above said. The
  // rail draws every occurrence, because a calendar has a cell per day already;
  // a list has no grid, so it collapses and says how often.
  const { once, repeating } = splitRepeating(
    rows.filter((row) => !inWidgets.has(row.id) && !onRail.has(row.id)),
  );
  const rest = once;
  // "Everything else" once a widget has lifted anything out, per 007's AC-2.
  // Not a fixed string: it is the anti-duplication contract.
  const restHeading =
    inWidgets.size > 0 ? "Everything else" : "Everything in here";

  const actions: RowAction[] = acting
    ? [
        // Edit leads, because renaming is the commonest thing to want and the
        // one this sheet did not offer: the only way to fix a title was on the
        // web.
        { label: "Edit", icon: "pencil", run: () => setRenaming(acting) },
        {
          label: acting.doneAt ? "Mark not done" : "Mark done",
          icon: acting.doneAt ? "rewind" : "check",
          run: () => tick(acting),
        },
        // One way out, never two. Your own content offers Delete; somebody
        // else's, in a shared thread, offers Archive, because OFF-3 says you
        // may not destroy what another person wrote and a thread still has to
        // be tidyable by the people in it. Putting something back is neither,
        // so an archived row always offers it whoever is looking.
        ...(acting.archivedAt
          ? [
              {
                label: "Put back in the thread",
                icon: "rewind",
                run: () => archive(acting),
              },
            ]
          : acting.canDelete
            ? [
                {
                  label: "Delete",
                  icon: "trash-2",
                  danger: true,
                  run: () => remove(acting),
                },
              ]
            : [
                {
                  label: "Archive",
                  icon: "archive",
                  run: () => archive(acting),
                },
              ]),
      ]
    : [];

  return (
    <SafeAreaView
      className={`flex-1 ${isAndroid ? "bg-a-surface" : "bg-surface-page"}`}
      edges={["top"]}
    >
      <Bar onBack={() => router.back()} />

      <ScrollView contentContainerClassName="pb-space-9">
        <View className="px-gutter-screen pb-space-8 pt-space-7">
          <Text
            className={`font-core font-semibold ${isAndroid ? "text-a-on" : "text-text-primary"}`}
            style={{ fontSize: 28, lineHeight: 34, letterSpacing: -0.5 }}
          >
            {thread.name}
          </Text>

          <View className="mt-space-5 flex-row flex-wrap gap-space-3">
            {thread.members
              .filter((member) => !member.isYou)
              .map((member) => (
                <View
                  key={member.accountId}
                  className="flex-row items-center gap-space-2 rounded-pill bg-surface-fill px-space-5"
                  style={{ height: 30 }}
                >
                  <Glyph name="users" size={14} color={COLOR.iconOnWell} />
                  <Text
                    className="font-core text-text-primary"
                    style={{ fontSize: 13 }}
                  >
                    {member.displayName}
                  </Text>
                </View>
              ))}
            <View
              className="flex-row items-center gap-space-2 rounded-pill border border-border-hairline px-space-5"
              style={{ height: 30, opacity: 0.55 }}
            >
              <Glyph name="share-2" size={14} color={COLOR.iconOnWell} />
              <Text
                className="font-core text-text-secondary"
                style={{ fontSize: 13 }}
              >
                Share
              </Text>
            </View>
          </View>

          {/* Only when there is one. */}
          {thread.standing ? (
            <>
              <Text
                className="mt-space-7 font-quiet text-text-primary"
                style={{ fontSize: 18, lineHeight: 27 }}
              >
                {thread.standing}
              </Text>
              <View className="mt-space-5 flex-row items-center gap-space-3">
                <Glyph name="sparkles" size={13} color={COLOR.iconOnWell} />
                <Text
                  className="font-core text-text-tertiary"
                  style={{ fontSize: 12 }}
                >
                  offload wrote this
                </Text>
              </View>
            </>
          ) : null}
        </View>

        {/* The rail is above the widgets, and only on a thread with something
            dated. It is not a widget: it lists every kind with a date rather
            than one, which is why 015 took it out of the widget set. */}
        {showArchived || dated.length === 0 ? null : (
          <Timeline
            // Keyed by the thread, so the day you were reading and the gaps you
            // opened do not follow you into the next one.
            key={thread.id}
            threadId={thread.id}
            threadName={thread.name}
            rows={rows}
            notes={thread.notes}
            onDelete={(row: ContentRow) => void remove(row)}
            onActions={setActing}
            onEdit={setRenaming}
            onArchive={(row: ContentRow) => void archive(row)}
            onToggle={(row: ContentRow) => void tick(row)}
          />
        )}

        {showArchived ? null : (
          <Widgets
            threadId={id}
            threadName={thread.name}
            widgets={widgets}
            groupBy={thread.preference.groupBy}
            hideDone={thread.preference.hideDone}
            onFold={(next: boolean) => {
              // Optimistic, like a tick. A failed write leaves the screen as
              // the server has it on the next load.
              setThread({ ...thread, preference: { ...thread.preference, hideDone: next } });
              void setPreference(id, { hideDone: next });
            }}
            onDelete={(row: ContentRow) => void remove(row)}
            onActions={setActing}
            onEdit={setRenaming}
            onArchive={(row: ContentRow) => void archive(row)}
            onToggle={(row: ContentRow) => void tick(row)}
            arrived={arrived}
          />
        )}

        {showArchived ? null : (
          <NotesSection
            threadId={thread.id}
            threadName={thread.name}
            notes={thread.notes}
            counts={thread.noteCounts}
            members={thread.members}
            onChanged={() => void load()}
            onToast={toast.show}
          />
        )}

        {rest.length > 0 ? (
          <View className="flex-row items-center gap-space-3 px-gutter-screen pb-space-3 pt-space-7">
            <Text
              className={`font-core font-semibold ${isAndroid ? "text-a-on" : "text-text-primary"}`}
              style={{ fontSize: 21 }}
            >
              {showArchived ? "Archived" : restHeading}
            </Text>
            {cursor ? null : (
              <View className="rounded-pill bg-surface-fill px-space-3 py-space-1">
                <Text
                  className="font-core text-text-secondary"
                  style={{ fontSize: 12 }}
                >
                  {rest.length + repeating.length}
                </Text>
              </View>
            )}
          </View>
        ) : null}

        {rest.length === 0 && !showArchived && inWidgets.size === 0 ? (
          <Text
            className="px-gutter-screen py-space-8 font-core text-text-tertiary"
            style={{ fontSize: 14 }}
          >
            Nothing in this one yet. Dump something and offload will file it.
          </Text>
        ) : null}

        {/* One row per series, standing for all of its occurrences, with how
            often and how many held where its own date would be. **The
            occurrences are counted, never hidden**, and the rail above still
            draws every one of them. */}
        {repeating.map((series) => (
          <ContentRowView
            key={series.ref}
            row={series.row}
            border
            arrived={false}
            onDelete={() => void remove(series.row)}
            onActions={() => setActing(series.row)}
            onEdit={() => setRenaming(series.row)}
            onArchive={() => void archive(series.row)}
            note={
              cadenceLabel(series.everyDays)
                ? `${cadenceLabel(series.everyDays)} · ${series.count} held`
                : `${series.count} dates`
            }
          />
        ))}

        {rest.map((row, i) => (
          <ContentRowView
            key={row.id}
            row={row}
            border={i < rest.length - 1}
            arrived={arrived.has(row.id)}
            onDelete={() => void remove(row)}
            onActions={() => setActing(row)}
            onEdit={() => setRenaming(row)}
            onArchive={() => void archive(row)}
          />
        ))}

        {/* The way to the archived pile, and the way back: a row under
            everything live rather than a control in the section heading. The
            archive is a place you go, and the count reads without finding a
            control tucked into a heading that only exists when the list is not
            empty. */}
        {showArchived ? (
          <Pressable
            onPress={() => setShowArchived(false)}
            className="min-h-tap-min flex-row items-center gap-space-3 border-t border-border-hairline px-gutter-screen"
          >
            <Glyph name="chevron-left" size={15} color={COLOR.iconOnWell} />
            <Text
              className="font-core font-medium text-text-secondary"
              style={{ fontSize: 14 }}
            >
              Back to the list
            </Text>
          </Pressable>
        ) : thread.counts.archived > 0 ? (
          <Pressable
            onPress={() => setShowArchived(true)}
            className="min-h-tap-min flex-row items-center gap-space-3 border-t border-border-hairline px-gutter-screen"
          >
            <Text
              className="flex-1 font-core font-medium text-text-secondary"
              style={{ fontSize: 14 }}
            >
              {thread.counts.archived} archived
            </Text>
            <Glyph name="chevron-right" size={15} color={COLOR.iconOnWell} />
          </Pressable>
        ) : null}
      </ScrollView>

      <TitleSheet
        // **Keyed by the row, so the field starts out holding its title.**
        // Filling it from an effect meant the sheet mounted empty and then
        // caught up, and on a device it stayed empty: a controlled TextInput
        // that takes focus on mount and has its value replaced a tick later is
        // the one case where that race is visible. Mounting per row removes the
        // tick rather than sequencing it.
        key={renaming?.id ?? "none"}
        row={renaming}
        onClose={() => setRenaming(null)}
        onSaved={() => {
          setRenaming(null);
          void load();
        }}
        onRemove={(row) => {
          setRenaming(null);
          void (row.canDelete && row.archivedAt === null ? remove(row) : archive(row));
        }}
      />

      <RowActionSheet
        open={acting !== null}
        actions={actions}
        onClose={() => setActing(null)}
      />
      <ToastHost state={toast} />
    </SafeAreaView>
  );
}

function Bar({ onBack }: { onBack: () => void }) {
  const COLOR = useColors();
  return (
    <View className="h-appbar-height flex-row items-center px-gutter-screen">
      <Pressable onPress={onBack} hitSlop={12}>
        <Glyph name="chevron-left" size={22} color={COLOR.iconOnWell} />
      </Pressable>
    </View>
  );
}

/** Renaming one piece of content, as a sheet.
 *
 *  The same shape the note editor uses and for the same reason: a phone has a
 *  third of the width and the keyboard takes the bottom half of the screen, so
 *  an editor opening in a row halfway down a scrolling list opens underneath
 *  it. The sheet solves the keyboard problem by the pattern rather than
 *  fighting it. */
function TitleSheet({
  row,
  onClose,
  onSaved,
  onRemove,
}: {
  row: ContentRow | null;
  onClose: () => void;
  onSaved: () => void;
  /** The way out, in the sheet that already has the row open.
   *
   *  The action sheet behind this one offers it too, and this is not a second
   *  opinion about which one you get: both ask the same question of the row and
   *  get the same answer. Having opened something to change it, the other thing
   *  you wanted is to be rid of it, and going back out to a long press to do
   *  that is a trip through a menu for the second commonest thing there is. */
  onRemove: (row: ContentRow) => void;
}) {
  const COLOR = useColors();
  // Same reason as the action sheet: this is anchored to the bottom of a screen
  // and the plate is mounted above the router.
  useScreenSheet(row !== null);
  const [draft, setDraft] = useState(row?.title ?? "");
  const { height: keyboardHeight } = useReanimatedKeyboardAnimation();
  const lift = useAnimatedStyle(() => ({
    transform: [{ translateY: keyboardHeight.value }],
  }));

  if (!row) return null;

  async function save(): Promise<void> {
    const title = draft.trim();
    if (title.length === 0 || title === row?.title) return onClose();
    if (!row || !(await editContent(row.id, { title }))) return onClose();
    onSaved();
  }

  return (
    <>
      <Animated.View
        entering={FadeIn.duration(220)}
        exiting={FadeOut.duration(140)}
        className="absolute inset-0"
        style={{ backgroundColor: atOpacity(COLOR.scrim, 0.35) }}
      >
        <Pressable
          className="flex-1"
          onPress={onClose}
          accessibilityLabel="Close"
        />
      </Animated.View>

      <Animated.View
        style={lift}
        entering={FadeInDown.duration(220)}
        exiting={FadeOut.duration(140)}
        className={`absolute inset-x-0 bottom-0 px-gutter-screen pb-space-8 pt-space-6 ${
          isAndroid
            ? "rounded-t-a-xl bg-a-c-low"
            : "rounded-t-lg bg-surface-raised"
        }`}
      >
        <TextInput
          value={draft}
          onChangeText={setDraft}
          autoFocus
          placeholder="What is it?"
          placeholderTextColor={COLOR.iconOnWell}
          className={`rounded-sm border border-border-hairline px-space-4 py-space-3 font-core ${
            isAndroid ? "text-a-on" : "text-text-primary"
          }`}
          style={{ fontSize: 15 }}
          onSubmitEditing={() => void save()}
          returnKeyType="done"
        />

        <View className="mt-space-4 flex-row items-center gap-space-4">
          {/* One way out, never two, and the same rule the action sheet
              states: your own content offers Delete, somebody else's offers
              Archive, because OFF-3 says you may not destroy what another
              person wrote. An archived row offers the way back instead. */}
          <Pressable
            onPress={() => (row ? onRemove(row) : onClose())}
            accessibilityLabel={
              row?.archivedAt
                ? "Put back in the thread"
                : row?.canDelete
                  ? "Delete"
                  : "Archive"
            }
            className="mr-auto flex-row items-center gap-space-2 rounded-pill border border-border-hairline px-space-5"
            style={{ height: 30 }}
          >
            <Glyph
              name={
                row?.archivedAt ? "rewind" : row?.canDelete ? "trash-2" : "archive"
              }
              size={14}
              color={row?.archivedAt || !row?.canDelete ? COLOR.iconOnWell : COLOR.danger}
            />
            <Text
              className={`font-core font-medium ${
                row?.archivedAt || !row?.canDelete ? "text-text-secondary" : "text-text-danger"
              }`}
              style={{ fontSize: 13 }}
            >
              {row?.archivedAt ? "Put back" : row?.canDelete ? "Delete" : "Archive"}
            </Text>
          </Pressable>

          <Pressable
            onPress={onClose}
            className="rounded-pill border border-border-hairline px-space-5"
            style={{ height: 30, justifyContent: "center" }}
          >
            <Text
              className={`font-core font-medium ${
                isAndroid ? "text-a-on-var" : "text-text-secondary"
              }`}
              style={{ fontSize: 13 }}
            >
              Cancel
            </Text>
          </Pressable>
          <Pressable
            onPress={() => void save()}
            disabled={draft.trim().length === 0}
            className={`rounded-pill px-space-5 ${isAndroid ? "bg-a-on" : "bg-surface-inverse"}`}
            style={{
              height: 30,
              justifyContent: "center",
              opacity: draft.trim() ? 1 : 0.55,
            }}
          >
            <Text
              className={`font-core font-medium ${
                isAndroid ? "text-a-surface" : "text-text-inverse"
              }`}
              style={{ fontSize: 13 }}
            >
              Save
            </Text>
          </Pressable>
        </View>
      </Animated.View>
    </>
  );
}
