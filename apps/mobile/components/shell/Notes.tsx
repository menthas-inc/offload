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

import { useState } from "react";
import { Platform, Pressable, Text, TextInput, View } from "react-native";
import Animated, { FadeIn, FadeInDown, FadeOut, useAnimatedStyle } from "react-native-reanimated";
import { useReanimatedKeyboardAnimation } from "react-native-keyboard-controller";
import { Glyph } from "../Glyph";
import { useColors } from "../../lib/colors";
import { useConversation } from "./conversation-context";
import {
  NOTE_BUDGET,
  NOTE_BODY_CHARS,
  NOTE_CHARS,
  deleteNote,
  editNote,
  foldedNotes,
  muteNote,
  restoreNote,
  type Member,
  type Note,
} from "../../lib/threads";

const isAndroid = Platform.OS === "android";

interface Props {
  threadId: string;
  threadName: string;
  notes: Note[];
  /** Active and folded. The second draws the history control and nothing else. */
  counts: { active: number; folded: number };
  members: Member[];
  onChanged: () => void;
  onToast: (message: string, action?: { label: string; onPress: () => void }) => void;
}

/** The date on a row, derived rather than stored, so a weekday can never
 *  disagree with the calendar. */
function when(note: Note): string | null {
  const at = note.occursAt ?? note.dueAt;
  if (!at) return null;
  return new Date(at).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export function NotesSection({
  threadId,
  threadName,
  notes,
  counts,
  members,
  onChanged,
  onToast,
}: Props) {
  const COLOR = useColors();
  const { raiseFor } = useConversation();
  const [editing, setEditing] = useState<Note | null>(null);
  const [draft, setDraft] = useState("");
  const [bodyDraft, setBodyDraft] = useState<string | null>(null);
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
    setDraft("");
    setBodyDraft(null);
  }

  async function save(): Promise<void> {
    const text = draft.trim();
    if (text.length === 0) return close();
    if (!editing) return close();
    const previous = editing.text;
    const previousBody = editing.body;
    const noteId = editing.id;
    const result = await editNote(
      noteId,
      text,
      bodyDraft === previousBody ? undefined : bodyDraft
    );
    close();
    if (!result) return;
    onChanged();
    onToast("Note changed", {
      label: "Undo",
      onPress: () => {
        void editNote(noteId, previous, previousBody).then(onChanged);
      },
    });
  }

  async function remove(note: Note): Promise<void> {
    close();
    if (!(await deleteNote(note.id))) return;
    onChanged();
    // Never the note's text: a toast is a few words and this runs to 200
    // characters.
    onToast("Note deleted", {
      label: "Undo",
      onPress: () => {
        void restoreNote(note.id).then(onChanged);
      },
    });
  }

  async function mute(note: Note): Promise<void> {
    close();
    if (!(await muteNote(note.id, !note.muted))) return;
    onChanged();
  }

  async function showFolded(): Promise<void> {
    if (folded) return setFolded(null);
    const result = await foldedNotes(threadId);
    setFolded(result?.notes ?? []);
  }

  /** One row. `readOnly` is the folded history, which is read and not worked
   *  with, so it does not open. */
  const row = (note: Note, divider: boolean, readOnly = false) => {
    const name = author(note);
    const date = when(note);
    const dim = readOnly || !instructing.has(note.id) || note.muted;

    return (
      <Pressable
        key={note.id}
        onPress={() => {
          if (readOnly) return;
          setEditing(note);
          setDraft(note.text);
          setBodyDraft(note.body);
        }}
        className={`min-h-tap-min flex-row items-start gap-space-3 py-space-4 ${
          divider ? "border-b border-border-hairline" : ""
        }`}
        // The glyph alone is not a state, so the accessible name says it, and
        // so does the one for a note that has stopped reaching offload.
        accessibilityLabel={
          (note.origin === "learned" ? "offload wrote this. " : "") +
          note.text +
          (!readOnly && !instructing.has(note.id) ? ". Not reaching offload" : "")
        }
      >
        {note.origin === "learned" ? (
          <View style={{ marginTop: 3 }}>
            <Glyph name="sparkles" size={14} color={dim ? COLOR.iconOnWell : COLOR.accent} />
          </View>
        ) : null}

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
          {note.body ? <Text className="text-text-tertiary"> more</Text> : null}
          {name ? <Text className="text-text-tertiary"> {name}</Text> : null}
          {note.muted ? <Text className="text-text-tertiary"> Muted</Text> : null}
          {!readOnly && !instructing.has(note.id) ? (
            <Text className="text-text-tertiary"> Not reaching offload</Text>
          ) : null}
        </Text>
      </Pressable>
    );
  };

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
          hitSlop={10}
          className="ml-auto"
          accessibilityLabel="Add a note"
        >
          <Glyph name="plus" size={18} color={COLOR.iconOnWell} />
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

      {editing ? (
        <Editor
          note={editing}
          draft={draft}
          onDraft={setDraft}
          bodyDraft={bodyDraft}
          onBodyDraft={setBodyDraft}
          canDelete={editing ? canDelete(editing) : false}
          onSave={() => void save()}
          onClose={close}
          onMute={() => editing && void mute(editing)}
          onDelete={() => editing && void remove(editing)}
        />
      ) : null}
    </>
  );
}

/** The editor, as a sheet.
 *
 *  Where the web grows the chip. A phone has a third of the width and the
 *  keyboard has to go somewhere, and this is the one interaction in the whole
 *  feature where the keyboard problem is solved by the pattern rather than
 *  fought. */
function Editor({
  note,
  draft,
  onDraft,
  bodyDraft,
  onBodyDraft,
  canDelete,
  onSave,
  onClose,
  onMute,
  onDelete,
}: {
  note: Note | null;
  draft: string;
  onDraft: (value: string) => void;
  bodyDraft: string | null;
  onBodyDraft: (value: string) => void;
  canDelete: boolean;
  onSave: () => void;
  onClose: () => void;
  onMute: () => void;
  onDelete: () => void;
}) {
  const COLOR = useColors();
  const { height: keyboardHeight } = useReanimatedKeyboardAnimation();
  const lift = useAnimatedStyle(() => ({ transform: [{ translateY: keyboardHeight.value }] }));

  return (
    <>
      <Animated.View
        entering={FadeIn.duration(140)}
        exiting={FadeOut.duration(140)}
        className="absolute inset-0"
        style={{ backgroundColor: COLOR.scrim, opacity: 0.35 }}
      >
        <Pressable className="flex-1" onPress={onClose} accessibilityLabel="Close" />
      </Animated.View>

      <Animated.View
        style={lift}
        entering={FadeInDown.duration(220)}
        exiting={FadeOut.duration(140)}
        className={`absolute inset-x-0 bottom-0 px-gutter-screen pb-space-8 pt-space-6 ${
          isAndroid ? "rounded-t-a-xl bg-a-c-low" : "rounded-t-lg bg-surface-raised"
        }`}
      >
          <TextInput
            value={draft}
            onChangeText={onDraft}
            maxLength={NOTE_CHARS}
            multiline
            autoFocus
            placeholder="What is true about this thread?"
            placeholderTextColor={COLOR.iconOnWell}
            className={`rounded-sm border border-border-hairline px-space-4 py-space-3 font-core ${
              isAndroid ? "text-a-on" : "text-text-primary"
            }`}
            style={{ fontSize: 15, minHeight: 76 }}
          />

          {/* The rest of what was dumped, when there is any. Only drawn for a
              note that has a body: an empty second field on every note would
              make a sentence look like a form. */}
          {bodyDraft !== null ? (
            <TextInput
              value={bodyDraft}
              onChangeText={onBodyDraft}
              maxLength={NOTE_BODY_CHARS}
              multiline
              className={`mt-space-3 rounded-sm border border-border-hairline px-space-4 py-space-3 font-core ${
                isAndroid ? "text-a-on" : "text-text-primary"
              }`}
              style={{ fontSize: 14.5, minHeight: 96 }}
            />
          ) : null}

          <View className="mt-space-4 flex-row items-center gap-space-4">
            <Text className="mr-auto font-core text-text-tertiary" style={{ fontSize: 12.5 }}>
              {draft.length}/{NOTE_CHARS}
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

            <Action label="Cancel" onPress={onClose} />
            <Pressable
              onPress={onSave}
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
          </View>
      </Animated.View>
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
