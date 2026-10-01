// 028. Create a thread from offload's proposal, from the exploration's
// accepting sheet: *Create a thread*, *These three look like they belong together.*,
// the name prefilled and editable, *Moves into it* with each thing ticked,
// then Cancel and *Create thread*.
//
// Modelled on the label's list (025): it reads what it lists itself and
// writes nothing, so the screen makes the one write and offers the one Undo.
// The last ticked thing cannot be unticked, and a name the server would
// refuse disables the confirm. A create that fails keeps the sheet and what
// was typed, says so, and the confirm becomes Try again.

import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Glyph } from "../Glyph";
import { useColors } from "../../lib/colors";
import {
  CHIPS,
  NAME_CHARS,
  chipOf,
  createFromProposal,
  createLine,
  fetchProposal,
  keyOf,
  nameOk,
  titleOf,
  toggleTick,
  type LooseEntry,
  type Proposal,
} from "../../lib/loose";
import { DragSheet } from "../shell/DragSheet";
import { SheetFoot } from "../shell/SheetFoot";

const isAndroid = Platform.OS === "android";

export function CreateThreadSheet({
  proposalId,
  onClose,
  onCreated,
}: {
  proposalId: string;
  onClose: () => void;
  /** Made: the thread, and what moved into it. */
  onCreated: (thread: { id: string; name: string }, moved: LooseEntry[]) => void;
}) {
  const COLOR = useColors();
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [unread, setUnread] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [name, setName] = useState("");
  const [ticked, setTicked] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const live = useRef(true);

  useEffect(() => {
    live.current = true;
    setUnread(false);
    void fetchProposal(proposalId).then((read) => {
      if (!live.current) return;
      if (!read) return setUnread(true);
      setProposal(read);
      setName(read.name);
      setTicked(new Set(read.entries.map(keyOf)));
    });
    return () => {
      live.current = false;
    };
  }, [proposalId, attempt]);

  const tooLong = [...name.trim()].length > NAME_CHARS;
  const ready = proposal !== null && nameOk(name) && ticked.size > 0 && !busy;

  async function create(): Promise<void> {
    if (!ready) return;
    setBusy(true);
    setFailed(false);
    const made = await createFromProposal(proposalId, name, ticked);
    if (!live.current) return;
    setBusy(false);
    if (made.ok) onCreated(made.thread, proposal.entries.filter((entry) => ticked.has(keyOf(entry))));
    else setFailed(true);
  }

  return (
    <DragSheet
      onClose={onClose}
      keyboard="room"
      sheetStyle={{ maxHeight: "90%" }}
      className="px-gutter-screen pb-space-6 pt-space-2"
      accessibilityLabel="Create a thread"
    >
      <Text className={`font-core font-semibold text-title-2 ${isAndroid ? "text-a-on" : "text-text-primary"}`} accessibilityRole="header">
        Create a thread
      </Text>
      {proposal ? (
        <Text className={`mt-space-2 font-core text-body-sm ${isAndroid ? "text-a-on-var" : "text-text-secondary"}`}>
          {createLine(proposal.entries.length)}
        </Text>
      ) : null}

      {unread ? (
        <View className="flex-row items-center justify-between gap-space-4 pt-space-6">
          <Text className="flex-1 font-core text-body-sm text-text-danger" accessibilityRole="alert">
            Couldn&apos;t load these
          </Text>
          <Pressable
            onPress={() => setAttempt((n) => n + 1)}
            className="items-center justify-center rounded-pill border border-border-strong px-space-6"
            style={{ minHeight: 44 }}
            accessibilityRole="button"
          >
            <Text className="font-core font-medium text-body-sm text-text-primary">Try again</Text>
          </Pressable>
        </View>
      ) : !proposal ? (
        <View className="items-center py-space-8">
          <ActivityIndicator color={COLOR.spinnerHead} accessibilityLabel="Loading" />
        </View>
      ) : (
        <>
          <View
            className={`mt-space-6 flex-row items-center gap-space-4 border px-space-6 ${
              isAndroid ? "rounded-a-xs border-a-on-var" : "rounded-sm border-border-strong"
            }`}
            style={{ minHeight: 48 }}
          >
            <Glyph name="lasso" size={15} color={COLOR.accent} />
            <TextInput
              value={name}
              onChangeText={(text) => {
                setName(text);
                setFailed(false);
              }}
              placeholder="Name it"
              placeholderTextColor={COLOR.quiet}
              returnKeyType="done"
              onSubmitEditing={() => void create()}
              accessibilityLabel="Thread name"
              className={`flex-1 font-core font-medium ${isAndroid ? "text-a-on" : "text-text-primary"}`}
              style={{ fontSize: 16 }}
            />
          </View>
          {tooLong ? (
            <Text className="mt-space-3 font-core text-label text-text-danger">
              A name is {NAME_CHARS} characters at most.
            </Text>
          ) : null}

          <Text
            className={`pb-space-2 pt-space-7 font-core font-semibold ${isAndroid ? "text-a-on" : "text-text-primary"}`}
            style={{ fontSize: 21 }}
            accessibilityRole="header"
          >
            Moves into it
          </Text>
          <ScrollView style={{ flexShrink: 1 }} keyboardShouldPersistTaps="handled">
            {proposal.entries.map((entry, i) => {
              const key = keyOf(entry);
              const on = ticked.has(key);
              const last = on && ticked.size === 1;
              const glyph = CHIPS.find((chip) => chip.key === chipOf(entry))?.glyph ?? "text-quote";
              return (
                <Pressable
                  key={key}
                  onPress={() => setTicked((current) => toggleTick(current, key))}
                  className={`min-h-tap-min flex-row items-center gap-space-5 py-space-3 ${
                    i < proposal.entries.length - 1 ? "border-b border-border-hairline" : ""
                  }`}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on, disabled: last }}
                >
                  <View
                    className={`items-center justify-center rounded-xs ${on ? "bg-surface-accent" : "border border-border-strong"}`}
                    style={{ width: 21, height: 21, borderWidth: on ? 0 : 1.5 }}
                  >
                    {on ? <Glyph name="check" size={13} color={COLOR.onBrand} /> : null}
                  </View>
                  <Glyph name={glyph} size={15} color={COLOR.iconOnWell} />
                  <Text
                    className={`flex-1 font-core ${isAndroid ? "text-a-on" : "text-text-primary"}`}
                    style={{ fontSize: 15, lineHeight: 20 }}
                    numberOfLines={2}
                  >
                    {titleOf(entry)}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {failed ? (
            <Text className="mt-space-4 font-core text-body-sm text-text-danger" accessibilityRole="alert" accessibilityLiveRegion="polite">
              Couldn&apos;t create that
            </Text>
          ) : null}
          <SheetFoot onCancel={onClose} onConfirm={() => void create()} confirm={failed ? "Try again" : "Create thread"} disabled={!ready} />
        </>
      )}
    </DragSheet>
  );
}
