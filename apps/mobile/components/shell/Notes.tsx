// What a thread holds about itself, on a phone.
//
// **Rows, from the `MemoryRow` contract**, as on web, extended by 014 for what
// a note now carries: a date, a body, and whether it is still reaching offload.
// A note is a sentence up to 200 characters and a chip is built for a tag, so
// the chip truncated every one to a window you had to open to read.
//
// **The editor is still a sheet here, and that is a divergence on purpose.** The
// contract says the row grows to hold its own editor, which is right on web. A
// phone has a third of the width and a keyboard that takes the bottom half of
// the screen, and an editor opening in a row halfway down a scrolling list opens
// underneath it. No kit can show that, which is the repo's oldest lesson about
// this platform. The row is the thing you clicked and the sheet is where you
// type; everything else matches the contract.
//
// The rest matches web because it is the same feature: one control and never
// two, the author's name in a shared thread, and a section that draws nothing
// when there is nothing in it. **Nothing here refuses a note**: a hundred is a
// prompt budget, so what replaced the cap line says which notes are not
// reaching offload rather than that you may not add another.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Platform, Pressable, Text, TextInput, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import { reorderPlan, type ReorderWrite } from "@offload/widgets";
import { Glyph } from "../Glyph";
import { LabelDot } from "../labels/LabelMark";
import { useRowLabels } from "../labels/labels-context";
import { useClock } from "../../lib/clock";
import { useColors } from "../../lib/colors";
import { perform, type Reversible, type Toaster, type Writes } from "../../lib/optimistic";
import { duplicateCopy, moveNote, movedCopy } from "../../lib/loose";
import { useConversation } from "./conversation-context";
import {
  NOTE_BUDGET,
  NOTE_CHARS,
  deleteNote,
  editNote,
  foldedNotes,
  isProvisional,
  muteNote,
  restoreNote,
  setNotePriority,
  type Member,
  type Note,
  type ThreadRow,
} from "../../lib/threads";
import { DragSheet } from "./DragSheet";
import { MoveSheet } from "./MoveSheet";

const isAndroid = Platform.OS === "android";

interface Props {
  threadId: string;
  threadName: string;
  notes: Note[];
  /** Active and folded. The second draws the history control and nothing else. */
  counts: { active: number; folded: number };
  members: Member[];
  /** The notes are the thread's. Every change here is drawn through this
   *  before it is sent, and the thread's own reload settles it. */
  onNotes: (update: (notes: Note[]) => Note[]) => void;
  toast: Toaster;
  /** The thread's count of writes in flight, shared so a note's write holds
   *  the thread's reload back the same as a row's does. */
  writes: Writes;
  /** Where the editor is drawn: the screen's root, beside the other sheets.
   *  This section sits inside the thread's scroll view, and a sheet drawn here
   *  measured `inset-0` and `bottom-0` against the scrolled content, so on
   *  Android it opened in the middle of the page with the keyboard over it. A
   *  Modal was tried first; with the keyboard up it received no touches. */
  onSheet: (sheet: ReactNode) => void;
}

/** The date on a row, derived rather than stored, so a weekday can never
 *  disagree with the calendar. */
function when(note: Note, zone: string | null): string | null {
  const at = note.occursAt ?? note.dueAt;
  if (!at) return null;
  // 023. A bare day is a date and reads as one everywhere; a timed note lands
  // on its day in the account's clock.
  return new Date(at).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(note.allDay ? { timeZone: "UTC" } : zone ? { timeZone: zone } : {}),
  });
}

export function NotesSection({
  threadId,
  threadName,
  notes,
  counts,
  members,
  onNotes,
  toast,
  writes,
  onSheet,
}: Props) {
  const { zone } = useClock();
  const COLOR = useColors();
  const { raiseFor } = useConversation();
  const [editing, setEditing] = useState<Note | null>(null);
  // 028. The note whose move sheet is up.
  const [moving, setMoving] = useState<Note | null>(null);
  const [folded, setFolded] = useState<Note[] | null>(null);

  const viewerId = members.find((m) => m.isYou)?.accountId ?? null;
  const shared = members.length > 1;

  // **Which notes are not reaching offload.** The budget takes the most
  // recently written, so anything outside that set is on the thread and out of
  // the prompt. The same rule the server applies at assembly, applied again
  // here rather than sent, because a field saying so is stale the moment
  // somebody writes another note.
  const instructing = new Set(
    [...notes]
      .sort((a, b) => b.writtenAt.localeCompare(a.writtenAt))
      .slice(0, NOTE_BUDGET)
      .map((note) => note.id)
  );
  const quiet = notes.length - instructing.size;

  /** Author, or nobody current. A note whose author has left the thread
   *  belongs to whoever is still in it, and the server enforces the same. */
  const canDelete = (note: Note): boolean =>
    note.authorId === viewerId || !note.authorIsMember;

  const author = (note: Note): string | null => {
    if (!shared || note.authorId === null) return null;
    return members.find((m) => m.accountId === note.authorId)?.displayName ?? null;
  };

  function close(): void {
    setEditing(null);
  }

  // ---------------------------------------------------------------- writes
  //
  // Drawn first, sent second, through the thread's `perform`: the row changes
  // at the press and comes back with a word if the server refuses.

  const patch = (noteId: string, fields: Partial<Note>): void =>
    onNotes((current) => current.map((note) => (note.id === noteId ? { ...note, ...fields } : note)));

  function save(draft: string): void {
    const text = draft.trim();
    if (text.length === 0 || !editing) return close();
    const note = editing;
    const previous = note.text;
    close();
    // The text alone: a note's details are no longer drawn or edited
    // (2026-09-29), and what is stored there is left as it is.
    void perform(
      {
        apply: () => patch(note.id, { text }),
        revert: () => patch(note.id, { text: previous }),
        write: () => editNote(note.id, text).then((result) => result !== null),
        unwrite: () => editNote(note.id, previous).then((result) => result !== null),
        did: "Note changed",
        failed: "Couldn't change the note",
        unfailed: "Couldn't put the note back",
      },
      toast,
      writes,
    );
  }

  function remove(note: Note): void {
    close();
    const at = notes.findIndex((one) => one.id === note.id);
    void perform(
      {
        apply: () => onNotes((current) => current.filter((one) => one.id !== note.id)),
        revert: () =>
          onNotes((current) =>
            current.some((one) => one.id === note.id)
              ? current
              : [...current.slice(0, at), note, ...current.slice(at)],
          ),
        write: () => deleteNote(note.id),
        unwrite: () => restoreNote(note.id),
        // Never the note's text: a toast is a few words and this runs to 200
        // characters.
        did: "Note deleted",
        failed: "Couldn't delete the note",
        unfailed: "Couldn't put the note back",
      },
      toast,
      writes,
    );
  }

  /** 028. To another thread, by the same rule as a row: the author's, or
   *  anybody's once the author has left. The note leaves the section at the
   *  press; Undo is the same move back. Its labels stay behind with the
   *  thread they belong to, and show again when it comes back. */
  function move(note: Note, to: ThreadRow): void {
    setMoving(null);
    const at = notes.findIndex((one) => one.id === note.id);
    const op: Reversible = {
      apply: () => onNotes((current) => current.filter((one) => one.id !== note.id)),
      revert: () =>
        onNotes((current) =>
          current.some((one) => one.id === note.id) ? current : [...current.slice(0, at), note, ...current.slice(at)],
        ),
      write: async () => {
        const moved = await moveNote(note.id, to.id);
        // The same words are already there: trying again changes nothing.
        if (moved === "duplicate") {
          op.failed = duplicateCopy(to.name);
          op.retry = null;
        }
        return moved !== null && moved !== "duplicate";
      },
      unwrite: () => moveNote(note.id, threadId).then((moved) => moved !== null && moved !== "duplicate"),
      did: movedCopy(to.name),
      failed: "Couldn't move that",
      unfailed: "Couldn't put that back",
      retry: "Try again",
    };
    void perform(op, toast, writes);
  }

  /** No Undo: the same control, pressed again, is the undo. */
  function mute(note: Note): void {
    close();
    void perform(
      {
        apply: () => patch(note.id, { muted: !note.muted }),
        revert: () => patch(note.id, { muted: note.muted }),
        write: () => muteNote(note.id, !note.muted),
        failed: note.muted ? "Couldn't unmute the note" : "Couldn't mute the note",
      },
      toast,
      writes,
    );
  }

  async function showFolded(): Promise<void> {
    if (folded) return setFolded(null);
    const result = await foldedNotes(threadId);
    setFolded(result?.notes ?? []);
  }

  /** A note was dragged somewhere else in the section.
   *
   *  The same arithmetic To do uses, on the same scale, through the note's
   *  own endpoint. It moves the row and nothing else: not when the note was
   *  written, which is what precedence turns on. */
  const layouts = useRef(new Map<string, { y: number; height: number }>());

  function reorder(writes_: ReorderWrite[]): void {
    close();
    const set = (pick: (write: ReorderWrite) => number): void =>
      onNotes((current) =>
        current.map((note) => {
          const write = writes_.find((one) => one.id === note.id);
          return write ? { ...note, priority: pick(write) } : note;
        }),
      );
    const all = async (pick: (write: ReorderWrite) => number): Promise<boolean> => {
      const results = await Promise.all(writes_.map((one) => setNotePriority(one.id, pick(one))));
      return results.every((result) => result !== null);
    };
    void perform(
      {
        apply: () => set((write) => write.priority),
        revert: () => set((write) => write.previous),
        write: () => all((write) => write.priority),
        unwrite: () => all((write) => write.previous),
        did: "Moved",
        failed: "Couldn't move that",
        unfailed: "Couldn't put that back",
      },
      toast,
      writes,
    );
  }

  function drop(id: string, dy: number): void {
    // Only what the server has can be arranged: a note drawn at the press
    // has no priority to write yet and is left out of the plan.
    const settled = notes.filter((note) => !isProvisional(note.id));
    const mine = layouts.current.get(id);
    const from = settled.findIndex((note) => note.id === id);
    if (!mine || from < 0) return;
    const centre = mine.y + mine.height / 2 + dy;
    let to = 0;
    for (const note of settled) {
      if (note.id === id) continue;
      const theirs = layouts.current.get(note.id);
      if (theirs && theirs.y + theirs.height / 2 < centre) to += 1;
    }
    const { writes: plan } = reorderPlan(settled, from, to);
    if (plan.length > 0) reorder(plan);
  }

  /** One row. `readOnly` is the folded history, which is read and not worked
   *  with, so it neither opens nor moves. */
  const row = (note: Note, divider: boolean, readOnly = false) => (
    <NoteRow
      key={note.id}
      note={note}
      divider={divider}
      readOnly={readOnly}
      provisional={isProvisional(note.id)}
      name={author(note)}
      date={when(note, zone)}
      instructing={instructing.has(note.id)}
      onLayout={(layout) => layouts.current.set(note.id, layout)}
      onOpen={() => setEditing(note)}
      onDrop={(dy) => drop(note.id, dy)}
    />
  );

  // The editor goes to the screen's root. The handlers are read through a ref
  // so the sheet is handed over when a note opens or closes, not on every
  // render of this section, and still acts on the notes as they are now.
  const latest = useRef({ save, close, mute, remove, canDelete, move });
  latest.current = { save, close, mute, remove, canDelete, move };
  useEffect(() => {
    onSheet(
      editing ? (
        <NoteEditor
          key={editing.id}
          note={editing}
          canDelete={latest.current.canDelete(editing)}
          onSave={(text) => latest.current.save(text)}
          onClose={() => latest.current.close()}
          onMute={() => latest.current.mute(editing)}
          onDelete={() => latest.current.remove(editing)}
          // 028. Move, for whoever may move it, which is whoever may delete it.
          onMove={
            latest.current.canDelete(editing)
              ? () => {
                  latest.current.close();
                  setMoving(editing);
                }
              : undefined
          }
        />
      ) : moving ? (
        <MoveSheet
          open
          exceptThreadId={threadId}
          onClose={() => setMoving(null)}
          onPick={(to) => latest.current.move(moving, to)}
        />
      ) : null,
    );
  }, [editing, moving, onSheet, threadId]);
  useEffect(() => () => onSheet(null), [onSheet]);

  // Nothing to show: draw nothing at all. A heading over an empty row is a
  // section announcing its own absence, and the pinned composer this + raises
  // lives above this component regardless, so it never depends on the
  // section being mounted.
  if (notes.length === 0 && counts.folded === 0) {
    return null;
  }

  return (
    <>
      <View className="flex-row items-center gap-space-3 px-gutter-screen pb-space-3 pt-space-7">
        <Text
          className={`font-core font-semibold ${isAndroid ? "text-a-on" : "text-text-primary"}`}
          style={{ fontSize: 21 }}
        >
          Notes
        </Text>
        {notes.length > 0 ? (
          <View
            className={`rounded-pill px-space-3 py-space-1 ${
              isAndroid ? "bg-a-c" : "bg-surface-fill"
            }`}
          >
            <Text
              className={`font-core ${isAndroid ? "text-a-on-var" : "text-text-secondary"}`}
              style={{ fontSize: 12 }}
            >
              {notes.length}
            </Text>
          </View>
        ) : null}

        {/* The way in, once the section already draws. A thread with no notes
            and no folded history draws nothing here, per the early return
            above: dumping something is the way in for that case.

            Raises the shell's composer, pinned to this thread, and writes
            with `addNote` on submit, same as this section always did. Only
            *adding* moved: editing an existing note still opens the sheet
            below, since that needs mute, delete and a second field the
            composer has no room for. */}
        <Pressable
          onPress={() =>
            raiseFor({
              threadId,
              threadName,
              write: "note",
              title: "Add a note",
              placeholder: "What is true about this thread?",
              charLimit: NOTE_CHARS,
              showCounter: true,
            })
          }
          hitSlop={12}
          className="ml-auto"
          accessibilityLabel="Add a note"
        >
          <Glyph name="plus" size={22} color={COLOR.iconOnWell} />
        </Pressable>
      </View>

      <View className="px-gutter-screen">
        {notes.map((note, index) => row(note, index < notes.length - 1))}
      </View>

      {/* Over the budget, and the sentence sits next to what resolves it: the
          rows above, which delete from their own sheet. Never a refusal. */}
      {quiet > 0 ? (
        <View className="px-gutter-screen pt-space-4">
          <Text className="font-core text-text-tertiary" style={{ fontSize: 13, lineHeight: 19 }}>
            {quiet} of these are not reaching offload. Delete the ones that have stopped being
            true.
          </Text>
        </View>
      ) : null}

      {/* What the daily job folded. Counted rather than hidden: offload
          rewriting sentences somebody typed and saying nothing about it is the
          version of this nobody would trust. Read, not worked with, which is
          why these rows do not open. */}
      {counts.folded > 0 ? (
        <View className="px-gutter-screen pt-space-4">
          <Pressable onPress={() => void showFolded()} className="min-h-tap-min justify-center">
            <Text
              className="font-core font-medium text-text-secondary"
              style={{ fontSize: 13 }}
            >
              {folded ? "Hide" : `Show ${counts.folded} folded`}
            </Text>
          </Pressable>
          {folded ? folded.map((note, index) => row(note, index < folded.length - 1, true)) : null}
        </View>
      ) : null}

    </>
  );
}

/** One note, and the handle that moves it.
 *
 *  A component rather than a closure because the drag is a shared value, and
 *  a hook cannot live inside a map. The handle sits at the trailing edge, where
 *  the pencil would be if a note row had one: a note opens on a tap, so the
 *  handle is the row's only drawn control. The drag is the content row's,
 *  exactly: hold, lift, follow, snap home, and the list re-sorts under it. */
function NoteRow({
  note,
  divider,
  readOnly,
  provisional,
  name,
  date,
  instructing,
  onLayout,
  onOpen,
  onDrop,
}: {
  note: Note;
  divider: boolean;
  readOnly: boolean;
  /** Drawn at the press, before the server has it. Looks like the note it is
   *  about to be and neither opens nor moves: there is nothing yet to open or
   *  move. Not `readOnly`, which is the folded history and dims. */
  provisional: boolean;
  name: string | null;
  date: string | null;
  instructing: boolean;
  onLayout: (layout: { y: number; height: number }) => void;
  onOpen: () => void;
  onDrop: (dy: number) => void;
}) {
  const COLOR = useColors();
  const dim = readOnly || !instructing || note.muted;
  const threadLabels = useRowLabels();
  const marks = threadLabels
    ? note.labels.flatMap((id) => {
        const label = threadLabels.labels.get(id);
        return label ? [label] : [];
      })
    : [];

  const dy = useSharedValue(0);
  const lifted = useSharedValue(0);
  const drag = Gesture.Pan()
    .activateAfterLongPress(250)
    .hitSlop(8)
    .onStart(() => {
      lifted.value = 1;
    })
    .onUpdate((event) => {
      dy.value = event.translationY;
    })
    .onEnd((event) => {
      runOnJS(onDrop)(event.translationY);
    })
    .onFinalize(() => {
      lifted.value = 0;
      dy.value = 0;
    });
  const lift = useAnimatedStyle(() => ({
    transform: [{ translateY: dy.value }],
    backgroundColor: lifted.value === 1 ? COLOR.raised : "transparent",
    zIndex: lifted.value === 1 ? 10 : 0,
    elevation: lifted.value === 1 ? 3 : 0,
  }));

  return (
    <Animated.View
      style={lift}
      onLayout={(event) => {
        const { y, height } = event.nativeEvent.layout;
        onLayout({ y, height });
      }}
      className={`flex-row items-start gap-space-3 ${
        divider ? "border-b border-border-hairline" : ""
      }`}
    >
      {/* The move area, leading the row. Always drawn, no container. On the
          text's first line, as the content row's handle is: centred on the
          whole row, it sat between a two-line note's lines, and even a single
          line sat low against the row's 44px floor. Clear of the text by the
          glyph's own margin, where it used to touch it. */}
      {readOnly || provisional ? null : (
        <GestureDetector gesture={drag}>
          <View
            className="justify-start self-stretch"
            style={{ marginLeft: -6, paddingTop: 10 }}
            accessibilityRole="button"
            accessibilityLabel={`Move ${note.text}`}
            accessibilityHint="Hold, then drag"
          >
            <Glyph name="grip-vertical" size={17} color={COLOR.iconOnWell} />
          </View>
        </GestureDetector>
      )}

      <Pressable
        onPress={() => {
          if (readOnly || provisional) return;
          onOpen();
        }}
        className="min-h-tap-min flex-1 flex-row items-start gap-space-3 py-space-4"
        // The glyph alone is not a state, so the accessible name says it, and
        // so does the one for a note that has stopped reaching offload.
        accessibilityLabel={
          (note.origin === "learned" ? "offload wrote this. " : "") +
          note.text +
          (!readOnly && !instructing ? ". Not reaching offload" : "") +
          (marks.length > 0 ? `. Labels: ${marks.map((label) => label.name).join(", ")}` : "")
        }
      >
        {/* 2026-09-29. No sparkle: the moss ink already says offload wrote
            it, and the glyph took a column off every line it led. */}
        {/* Wrapped, not clipped. The whole point of the row. */}
        <Text
          className={`flex-1 font-core ${
            dim
              ? "text-text-tertiary"
              : note.origin === "learned"
                ? "text-text-accent"
                : isAndroid
                  ? "text-a-on"
                  : "text-text-primary"
          }`}
          style={{ fontSize: 14.5, lineHeight: 21 }}
        >
          {note.text}
          {date ? <Text className="text-text-tertiary"> {date}</Text> : null}
          {name ? <Text className="text-text-tertiary"> {name}</Text> : null}
          {note.muted ? <Text className="text-text-tertiary"> Muted</Text> : null}
          {!readOnly && !instructing ? (
            <Text className="text-text-tertiary"> Not reaching offload</Text>
          ) : null}
        </Text>

        {/* 2026-09-29. A note's labels as their dots, at the trailing edge
            and on the first line. The mark with its name took a line of its
            own under every note; the dot says which group at a glance, and
            the filter bar names them. */}
        {marks.length > 0 ? (
          <View
            className="flex-row items-center gap-space-2"
            style={{ marginTop: (21 - 8) / 2 }}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            {marks.map((label) => (
              <LabelDot key={label.id} colour={label.colour} />
            ))}
          </View>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

/** The editor, as a sheet.
 *
 *  Where the web grows the chip. A phone has a third of the width and the
 *  keyboard has to go somewhere, and this is the one interaction in the whole
 *  feature where the keyboard problem is solved by the pattern rather than
 *  fought. 028: Not in a thread opens the same one. */
export function NoteEditor({
  note,
  canDelete,
  onSave,
  onClose,
  onMute,
  onDelete,
  onMove,
  placeholder = "What is true about this thread?",
}: {
  note: Note | null;
  canDelete: boolean;
  onSave: (text: string) => void;
  onClose: () => void;
  onMute: () => void;
  onDelete: () => void;
  /** 028. To another thread. Its own line above the foot, which already
   *  holds four pills and has no room on a small phone for a fifth. */
  onMove?: (() => void) | undefined;
  /** 028. Not in a thread asks its own question, since there is no thread. */
  placeholder?: string;
}) {
  const COLOR = useColors();
  // The fields are the sheet's own, so typing re-renders the sheet and not
  // the thread it was handed to. Keyed by the note, so they start out holding
  // its words.
  const [draft, onDraft] = useState(note?.text ?? "");
  const field = useRef<TextInput>(null);
  // Somebody else's note: words to read, with Mute and no Save. Its words are
  // its author's to change, on the terms delete has, and the server refuses
  // anybody else, so the sheet never offers the edit.
  const readOnly = note !== null && !canDelete;
  // Anchored to the bottom of a screen, and the plate is mounted above the
  // router. Without this it opens underneath the composer and the tabs.

  return (
    <>
      <DragSheet
        onClose={onClose}
        keyboard="lift"
        className="px-gutter-screen pb-space-8 pt-space-2"
        onOpen={() => (readOnly ? undefined : field.current?.focus())}
      >
          <TextInput
            ref={field}
            value={draft}
            editable={!readOnly}
            onChangeText={onDraft}
            maxLength={NOTE_CHARS}
            multiline
            placeholder={placeholder}
            placeholderTextColor={COLOR.iconOnWell}
            className={`rounded-sm border border-border-hairline px-space-4 py-space-3 font-core ${
              isAndroid ? "text-a-on" : "text-text-primary"
            }`}
            style={{ fontSize: 15, minHeight: 76 }}
          />

          {onMove ? (
            <Pressable
              onPress={onMove}
              accessibilityRole="button"
              className="mt-space-2 min-h-tap-min flex-row items-center gap-space-3 self-start"
            >
              <Glyph name="layers" size={16} color={COLOR.iconOnWell} />
              <Text
                className={`font-core font-medium ${isAndroid ? "text-a-on-var" : "text-text-secondary"}`}
                style={{ fontSize: 13 }}
              >
                Move
              </Text>
            </Pressable>
          ) : null}

          <View className="mt-space-4 flex-row items-center gap-space-4">
            {/* Kept when there is nothing to count: it is what holds the
                controls to the right. */}
            <Text className="mr-auto font-core text-text-tertiary" style={{ fontSize: 12.5 }}>
              {readOnly ? "" : `${draft.length}/${NOTE_CHARS}`}
            </Text>

            {/* One control, never two. Muted wins over both, whoever is asking:
                mute is reversible by anyone, so a note somebody quieted has to
                be un-quietable by anyone including its author. */}
            {note?.muted ? (
              <Action label="Unmute" onPress={onMute} />
            ) : note && canDelete ? (
              <Action label="Delete" danger onPress={onDelete} />
            ) : note ? (
              <Action label="Mute" onPress={onMute} />
            ) : null}

            <Action label={readOnly ? "Close" : "Cancel"} onPress={onClose} />
            {readOnly ? null : (
              <Pressable
                onPress={() => onSave(draft)}
                disabled={draft.trim().length === 0}
                className={`rounded-pill px-space-5 ${isAndroid ? "bg-a-on" : "bg-surface-inverse"}`}
                style={{ height: 30, justifyContent: "center", opacity: draft.trim() ? 1 : 0.55 }}
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
            )}
          </View>
      </DragSheet>
    </>
  );
}

function Action({
  label,
  danger,
  onPress,
}: {
  label: string;
  danger?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="rounded-pill border border-border-hairline px-space-5"
      style={{ height: 30, justifyContent: "center" }}
    >
      <Text
        className={`font-core font-medium ${
          danger ? "text-text-danger" : isAndroid ? "text-a-on-var" : "text-text-secondary"
        }`}
        style={{ fontSize: 13 }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
