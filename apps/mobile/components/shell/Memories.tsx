// The standing rules a thread holds about itself, on a phone.
//
// **No kit draws this anywhere**, on any platform. The web grew the chip into
// a container holding its own editor; a phone has about a third of the width
// and a keyboard that has to go somewhere, so the design system's answer here
// is a sheet. The chip stays a chip.
//
// Everything else matches web because it is the same feature: ten at most, one
// control and never two, the author's name in a shared thread, and a section
// that draws nothing when there is nothing in it.

import { useState } from "react";
import { Platform, Pressable, Text, TextInput, View } from "react-native";
import Animated, { FadeIn, FadeInDown, FadeOut } from "react-native-reanimated";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { Glyph } from "../Glyph";
import { COLOR } from "../../lib/colors";
import {
  MAX_MEMORIES,
  MEMORY_CHARS,
  addMemory,
  chipLabel,
  deleteMemory,
  editMemory,
  muteMemory,
  restoreMemory,
  type Member,
  type Memory,
} from "../../lib/threads";

const isAndroid = Platform.OS === "android";

interface Props {
  threadId: string;
  memories: Memory[];
  members: Member[];
  onChanged: () => void;
  onToast: (message: string, action?: { label: string; onPress: () => void }) => void;
}

export function MemoriesSection({ threadId, memories, members, onChanged, onToast }: Props) {
  const [editing, setEditing] = useState<Memory | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");

  const viewerId = members.find((m) => m.isYou)?.accountId ?? null;
  const shared = members.length > 1;
  const full = memories.length >= MAX_MEMORIES;

  /** Author, or nobody current. A memory whose author has left the thread
   *  belongs to whoever is still in it, and the server enforces the same. */
  const canDelete = (memory: Memory): boolean =>
    memory.authorId === viewerId || !memory.authorIsMember;

  const author = (memory: Memory): string | null => {
    if (!shared || memory.authorId === null) return null;
    return members.find((m) => m.accountId === memory.authorId)?.displayName ?? null;
  };

  function close(): void {
    setEditing(null);
    setAdding(false);
    setDraft("");
  }

  async function save(): Promise<void> {
    const text = draft.trim();
    if (text.length === 0) return close();

    if (adding) {
      const result = await addMemory(threadId, text);
      close();
      if (result && "full" in result) return onToast("This thread already holds ten. Delete one to add another.");
      if (result && "tooLong" in result) return;
      onChanged();
      return;
    }
    if (!editing) return close();
    const previous = editing.text;
    const memoryId = editing.id;
    const result = await editMemory(memoryId, text);
    close();
    if (!result) return;
    onChanged();
    onToast("Memory changed", {
      label: "Undo",
      onPress: () => {
        void editMemory(memoryId, previous).then(onChanged);
      },
    });
  }

  async function remove(memory: Memory): Promise<void> {
    close();
    if (!(await deleteMemory(memory.id))) return;
    onChanged();
    // Never the memory's text: a toast is a few words and this runs to 200
    // characters.
    onToast("Memory deleted", {
      label: "Undo",
      onPress: () => {
        void restoreMemory(memory.id).then(onChanged);
      },
    });
  }

  async function mute(memory: Memory): Promise<void> {
    close();
    if (!(await muteMemory(memory.id, !memory.muted))) return;
    onChanged();
  }

  // Nothing to show and nothing being written: draw nothing at all. A heading
  // over an empty row is a section announcing its own absence.
  if (memories.length === 0 && !adding) {
    return null;
  }

  const open = editing ?? (adding ? null : undefined);

  return (
    <>
      <View className="flex-row items-center gap-space-3 px-gutter-screen pb-space-3 pt-space-7">
        <Text
          className={`font-core font-semibold ${isAndroid ? "text-a-on" : "text-text-primary"}`}
          style={{ fontSize: 21 }}
        >
          Memories
        </Text>
        {memories.length > 0 ? (
          <View
            className={`rounded-pill px-space-3 py-space-1 ${
              isAndroid ? "bg-a-c" : "bg-surface-fill"
            }`}
          >
            <Text
              className={`font-core ${isAndroid ? "text-a-on-var" : "text-text-secondary"}`}
              style={{ fontSize: 12 }}
            >
              {memories.length}
            </Text>
          </View>
        ) : null}
      </View>

      <View className="flex-row flex-wrap gap-space-3 px-gutter-screen">
        {memories.map((memory) => {
          const name = author(memory);
          return (
            <Pressable
              key={memory.id}
              onPress={() => {
                setAdding(false);
                setEditing(memory);
                setDraft(memory.text);
              }}
              className={`max-w-full flex-row items-center gap-space-2 rounded-pill px-space-5 ${
                memory.muted
                  ? "border border-border-hairline"
                  : memory.origin === "learned"
                    ? "bg-surface-accent-soft"
                    : isAndroid
                      ? "bg-a-c"
                      : "bg-surface-fill"
              }`}
              style={{ height: 30 }}
            >
              {memory.origin === "learned" ? (
                <Glyph name="sparkles" size={13} color={COLOR.accent} />
              ) : null}
              <Text
                className={`font-core font-medium ${
                  memory.muted
                    ? "text-text-tertiary"
                    : memory.origin === "learned"
                      ? "text-text-accent"
                      : isAndroid
                        ? "text-a-on"
                        : "text-text-primary"
                }`}
                style={{ fontSize: 13 }}
                numberOfLines={1}
                // The glyph alone is not a state, so the accessible name says it.
                accessibilityLabel={
                  (memory.origin === "learned" ? "offload wrote this. " : "") + memory.text
                }
              >
                {chipLabel(memory.text)}
              </Text>
              {name ? (
                <Text className="font-core text-text-tertiary" style={{ fontSize: 13 }}>
                  {name}
                </Text>
              ) : null}
              {memory.muted ? (
                <Text className="font-core text-text-tertiary" style={{ fontSize: 13 }}>
                  Muted
                </Text>
              ) : null}
            </Pressable>
          );
        })}

        {full ? (
          <Text
            className="font-core text-text-tertiary"
            style={{ fontSize: 13, lineHeight: 19 }}
          >
            This thread already holds {MAX_MEMORIES}. Delete one to add another.
          </Text>
        ) : (
          <Pressable
            onPress={() => {
              setEditing(null);
              setDraft("");
              setAdding(true);
            }}
            className="flex-row items-center gap-space-2 rounded-pill border border-border-hairline px-space-5"
            style={{ height: 30 }}
          >
            <Glyph name="plus" size={13} color={COLOR.iconOnWell} />
            <Text className="font-core font-medium text-text-secondary" style={{ fontSize: 13 }}>
              Add
            </Text>
          </Pressable>
        )}
      </View>

      {open !== undefined ? (
        <Editor
          memory={editing}
          draft={draft}
          onDraft={setDraft}
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
  memory,
  draft,
  onDraft,
  canDelete,
  onSave,
  onClose,
  onMute,
  onDelete,
}: {
  memory: Memory | null;
  draft: string;
  onDraft: (value: string) => void;
  canDelete: boolean;
  onSave: () => void;
  onClose: () => void;
  onMute: () => void;
  onDelete: () => void;
}) {
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

      <KeyboardAvoidingView behavior="padding" className="absolute inset-x-0 bottom-0">
        <Animated.View
          entering={FadeInDown.duration(220)}
          exiting={FadeOut.duration(140)}
          className={`px-gutter-screen pb-space-8 pt-space-6 ${
            isAndroid ? "rounded-t-a-xl bg-a-c-low" : "rounded-t-lg bg-surface-raised"
          }`}
        >
          <TextInput
            value={draft}
            onChangeText={onDraft}
            maxLength={MEMORY_CHARS}
            multiline
            autoFocus
            placeholder="How should this thread be handled?"
            placeholderTextColor={COLOR.iconOnWell}
            className={`rounded-sm border border-border-hairline px-space-4 py-space-3 font-core ${
              isAndroid ? "text-a-on" : "text-text-primary"
            }`}
            style={{ fontSize: 15, minHeight: 76 }}
          />

          <View className="mt-space-4 flex-row items-center gap-space-4">
            <Text className="mr-auto font-core text-text-tertiary" style={{ fontSize: 12.5 }}>
              {draft.length}/{MEMORY_CHARS}
            </Text>

            {/* One control, never two. Muted wins over both, whoever is asking:
                mute is reversible by anyone, so a memory somebody quieted has
                to be un-quietable by anyone including its author. */}
            {memory?.muted ? (
              <Action label="Unmute" onPress={onMute} />
            ) : memory && canDelete ? (
              <Action label="Delete" danger onPress={onDelete} />
            ) : memory ? (
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
      </KeyboardAvoidingView>
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
