// One thread, from ui_kits/mobile_app/ThreadScreen.jsx.
//
// The app bar carries back, the name, Share, the calendar and More, one line,
// the same head the web draws. The kit puts the name as a heading inside the
// scroll with Share as a chip under it; that was built and then unbuilt on
// 2026-09-20, with an entry in the design system's log. Rename and Add a note
// are under More, where the web keeps them.
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
import { ALL_LABELS, changeToken, isAll, keepLive, listLabelledCopy, nameList, rowLabelledCopy, type LabelPick } from "@offload/widgets";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import {
  cadenceLabel,
  datedFor,
  splitRepeating,
  widgetsFor,
  type ReorderWrite,
} from "@offload/widgets";
import { Glyph } from "../Glyph";
import { atOpacity, useColors } from "../../lib/colors";
import { ContentRowView } from "../shell/ContentRow";
import { NotesSection } from "../shell/Notes";
import { RowActionSheet, type RowAction } from "../shell/RowActionSheet";
import { PhotoViewer, type ViewerPhoto } from "../shell/PhotoViewer";
import { forgetRendition } from "../shell/PhotoThumb";
import { MoveSheet } from "../shell/MoveSheet";
import { CalendarsSheet, calendarsLabel } from "../shell/CalendarsSheet";
import { ToastHost, useToast } from "../shell/Toast";
import { Timeline } from "../shell/Timeline";
import { Widgets } from "../shell/Widgets";
import {
  completeContent,
  deleteContent,
  deleteThread,
  restoreThread,
  editContent,
  fetchContent,
  fetchThread,
  isProvisional,
  moveContent,
  NOTE_CHARS,
  provisionalNote,
  provisionalRow,
  renameThread,
  setArchived,
  setPriority,
  startsAs,
  type ContentRow,
  type Note,
  type ThreadBundle,
  setPreference,
  type ContentPatch,
  type ContentSnapshot,
} from "../../lib/threads";
import { perform, useWrites } from "../../lib/optimistic";
import { useClock } from "../../lib/clock";
import { drawnWhen, patchFor, sameWhen, whenLabel, whenValueOf } from "../../lib/when";
import { RowEditSheet } from "../shell/RowEditSheet";
import { WhenSheet } from "../shell/WhenSheet";
import { useConversation, useScreenSheet } from "../shell/conversation-context";
import { PlateSpace } from "../shell/plate-inset";
import { failed } from "../../lib/log";
import { ShareSheet } from "../people/ShareSheet";
import { ConfirmSheet } from "../people/ConfirmSheet";
import { FilterBar } from "../labels/FilterBar";
import { LabelSheet, type LabelChoice } from "../labels/LabelSheet";
import { LabelList, type ListSave } from "../labels/LabelList";
import { RowLabelsContext, type RowLabels } from "../labels/labels-context";
import {
  createLabel,
  deleteLabel,
  labelRows,
  readPick,
  refusalLine,
  restoreLabel,
  writePick,
  type Label,
} from "../../lib/labels";

/** 025. The six rows a thread needs before it offers labels unasked. */
const GROUP_PROMPT_ROWS = 6;

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
  // 020. The photo open in the viewer, by row id, and the row a move sheet
  // is up for. The viewer pages through every photo row on the page.
  const [viewing, setViewing] = useState<string | null>(null);
  const [moving, setMoving] = useState<ContentRow | null>(null);
  // What arrived while this screen was open, marked for a moment rather than
  // appearing silently in the middle of a list.
  const [arrived, setArrived] = useState<Set<string>>(new Set());
  // 023. The row whose When sheet is open on its own, from the action sheet.
  const [timing, setTiming] = useState<ContentRow | null>(null);
  const { zone, today } = useClock();
  // 019. The calendars sheet, and a counter bumped when the picks change so
  // the rail reads the calendars again.
  const [calendarsOpen, setCalendarsOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  // 022. The share sheet, and Leave with its confirmation.
  const [shareOpen, setShareOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [leaveBusy, setLeaveBusy] = useState(false);
  const [leaveFailed, setLeaveFailed] = useState(false);
  const [naming, setNaming] = useState(false);
  const [calendarsVersion, setCalendarsVersion] = useState(0);
  const toast = useToast();
  // 025. The filter bar's pick, kept per thread on this phone; the label sheet
  // open on a row; the label's list open for a label, or for a new one.
  const [pick, setPickState] = useState<LabelPick>(() => (id ? readPick(id) : ALL_LABELS));
  const [labelling, setLabelling] = useState<ContentRow | null>(null);
  const [listing, setListing] = useState<{ label: Label | null } | null>(null);
  const [listLine, setListLine] = useState<string | null>(null);
  const filterOf = (current: LabelPick): { labels?: string[]; unlabelled?: boolean } => ({
    ...(current.labels.length > 0 ? { labels: current.labels } : {}),
    ...(current.none ? { unlabelled: true } : {}),
  });
  function setPick(next: LabelPick): void {
    setPickState(next);
    if (id) writePick(id, next);
  }

  // 022. Leave: what the swipe on My threads does, from the thread's own
  // More, with the same toast and the same Undo.
  async function leave() {
    setLeaveBusy(true);
    setLeaveFailed(false);
    const result = await deleteThread(id);
    setLeaveBusy(false);
    if (!result) {
      setLeaveFailed(true);
      return;
    }
    setLeaving(false);
    router.back();
    notify(result.deleted ? "Thread deleted" : "You left the thread", {
      label: "Undo",
      onPress: () => void restoreThread(id),
    });
  }
  const { filed, setOnScreen, provisional: inFlight, adoptProvisional, raiseFor, notify } =
    useConversation();

  // The `+` writes in flight for this thread, drawn from the composer's list
  // rather than from the server: the row is on screen at the press, with the
  // words as its title. One that has landed keeps its place under the
  // server's id until the reload below brings the real row, then the entry is
  // adopted and goes.
  const mine = inFlight.filter((one) => one.threadId === id);
  const landed = mine.filter((one) => one.landedId !== undefined).map((one) => one.landedId as string);

  /** Once a reload has the real rows, the entries they replace can go. Reads
   *  the list through a ref so `load` keeps its identity: a callback that
   *  changed with every render would re-run the focus reload forever. */
  const latestProvisional = useRef(inFlight);
  latestProvisional.current = inFlight;
  const adopt = useCallback(
    (rowIds: readonly string[], noteIds: readonly string[]) => {
      for (const one of latestProvisional.current) {
        if (one.threadId !== id || !one.landedId) continue;
        if (rowIds.includes(one.landedId) || noteIds.includes(one.landedId)) adoptProvisional(one.key);
      }
    },
    [id, adoptProvisional],
  );

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [bundle, page] = await Promise.all([
        fetchThread(id),
        fetchContent(id, { archived: showArchived, ...filterOf(pick) }),
      ]);
      if (!writes.idle()) return;
      setThread(bundle);
      setRows(page?.rows ?? []);
      setCursor(page?.nextCursor ?? null);
      adopt((page?.rows ?? []).map((row) => row.id), (bundle?.notes ?? []).map((note) => note.id));
    } catch (error) {
      failed("thread.load", error, { threadId: id });
    }
    // `writes` is a ref holder and stable, so it is not a dependency.
  }, [id, showArchived, adopt, pick]);

  // Every write here is drawn before it is sent. `writes` counts what is in
  // flight and reloads once nothing is; a reload that lands while something
  // still is gets dropped, or it would undo the change on screen for the
  // length of a round trip.
  const writes = useWrites(load);

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
    // A row typed in here and just landed is not news, so it is not marked.
    // 023. Keyed on the row's change token, not on whether it was here: a row
    // already on screen whose date offload moved flashes too.
    const before = new Map(rows.map((row) => [row.id, changeToken(row)]));
    const typed = new Set(landed);
    try {
      const [bundle, page] = await Promise.all([
        fetchThread(id),
        fetchContent(id, { archived: showArchived, ...filterOf(pick) }),
      ]);
      if (!writes.idle()) return;
      const next = page?.rows ?? [];
      setThread(bundle);
      setRows(next);
      setCursor(page?.nextCursor ?? null);
      adopt(next.map((row) => row.id), (bundle?.notes ?? []).map((note) => note.id));
      const fresh = next
        .filter((row) => !typed.has(row.id) && before.get(row.id) !== changeToken(row))
        .map((row) => row.id);
      if (fresh.length > 0) setArrived(new Set(fresh));
    } catch (error) {
      failed("thread.catchUp", error, { threadId: id });
    }
  }, [id, rows, showArchived, landed.join(","), adopt, pick]);

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

  // ---------------------------------------------------------------- writes
  //
  // Each one is drawn first and sent second, through `perform`, which offers
  // Undo the moment it is drawn and puts the screen back with a word if the
  // server refuses. The rows and the counts are patched by hand here rather
  // than reloaded, and the reload that follows once every write has settled
  // is what makes the screen the server's again.

  const patchRow = (rowId: string, fields: Partial<ContentRow>): void =>
    setRows((current) => current.map((row) => (row.id === rowId ? { ...row, ...fields } : row)));
  const dropRow = (rowId: string): void =>
    setRows((current) => current.filter((row) => row.id !== rowId));
  const putRow = (row: ContentRow, at: number): void =>
    setRows((current) =>
      current.some((one) => one.id === row.id)
        ? current
        : [...current.slice(0, at), row, ...current.slice(at)],
    );
  const count = (fields: Partial<ThreadBundle["counts"]>): void =>
    setThread((current) =>
      current ? { ...current, counts: { ...current.counts, ...fields } } : current,
    );
  /** The notes are the thread's, and the section under the widgets draws
   *  them, so a change it draws early is written here. */
  const patchNotes = (update: (notes: Note[]) => Note[]): void =>
    setThread((current) => (current ? { ...current, notes: update(current.notes) } : current));

  /** Tick, or put it back. The box moves at the press; the row sinks or rises
   *  with it, since the lists derive that from the row. No toast: the kits
   *  tick without one, and the box is its own undo. */
  function tick(row: ContentRow): void {
    if (isProvisional(row.id)) return;
    const wasDone = row.doneAt !== null;
    void perform(
      {
        apply: () => patchRow(row.id, { doneAt: wasDone ? null : new Date().toISOString() }),
        revert: () => patchRow(row.id, { doneAt: row.doneAt }),
        write: () => completeContent(row.id, !wasDone),
        failed: wasDone ? "Couldn't put that back" : "Couldn't tick that off",
      },
      toast,
      writes,
    );
  }

  /** Out of the list, or back into it. The row leaves this list either way,
   *  because the live rows and the archived ones are two lists. */
  function archive(row: ContentRow): void {
    if (isProvisional(row.id)) return;
    const wasArchived = row.archivedAt !== null;
    const at = rows.findIndex((one) => one.id === row.id);
    const moved = wasArchived ? -1 : 1;
    void perform(
      {
        apply: () => {
          dropRow(row.id);
          if (thread) count({ active: thread.counts.active - moved, archived: thread.counts.archived + moved });
        },
        revert: () => {
          putRow(row, at);
          if (thread) count({ active: thread.counts.active, archived: thread.counts.archived });
        },
        write: () => setArchived(row.id, !wasArchived),
        unwrite: () => setArchived(row.id, wasArchived),
        did: wasArchived ? "Back in the thread" : "Archived",
        failed: wasArchived ? "Couldn't put that back" : "Couldn't archive that",
        unfailed: wasArchived ? "Couldn't archive that" : "Couldn't put that back",
      },
      toast,
      writes,
    );
  }

  function remove(row: ContentRow): void {
    if (isProvisional(row.id)) return;
    setViewing(null);
    const at = rows.findIndex((one) => one.id === row.id);
    void perform(
      {
        apply: () => {
          dropRow(row.id);
          if (thread && !row.archivedAt) count({ active: thread.counts.active - 1 });
        },
        revert: () => {
          putRow(row, at);
          if (thread) count({ active: thread.counts.active });
        },
        write: async () => {
          const ok = await deleteContent(row.id);
          // 020. The device's copy goes with the row.
          if (ok && row.photo) forgetRendition(row.photo.blobId);
          return ok;
        },
        // Restore is the undo for delete as well as for archive: one endpoint
        // clears `deleted_at`, `purge_after` and `archived_at` together.
        unwrite: () => setArchived(row.id, false),
        // The readme's own line, verbatim from the kit. Never the row's
        // title: a toast is a few words and a title is not.
        did: "Deleted, gone in a moment",
        failed: "Couldn't delete that",
        unfailed: "Couldn't put that back",
      },
      toast,
      writes,
    );
  }

  /** 023. The sheet's Save: every changed field in one request, drawn first
   *  and sent second, with the previous values as the Undo. The words are
   *  the ones the design gives a save, and never why it did not go through. */
  function edit(row: ContentRow, patch: ContentPatch): void {
    const drawn: Partial<ContentRow> = {};
    if (patch.title !== undefined) drawn.title = patch.title;
    if (patch.body !== undefined) drawn.body = patch.body;
    if (patch.isReminder !== undefined) drawn.isReminder = patch.isReminder;
    // The dates too, read in the account's clock exactly as the route reads
    // them, so the chip moves with the toast; the server's answer then
    // confirms what was drawn.
    Object.assign(drawn, drawnWhen(patch, zone));
    const before: Partial<ContentRow> = {
      title: row.title,
      body: row.body,
      isReminder: row.isReminder,
      dueAt: row.dueAt,
      occursAt: row.occursAt,
      occursEndAt: row.occursEndAt,
      rrule: row.rrule,
      allDay: row.allDay,
    };
    let previous: ContentSnapshot | null = null;
    void perform(
      {
        apply: () => patchRow(row.id, drawn),
        revert: () => patchRow(row.id, before),
        write: () =>
          editContent(row.id, patch).then((result) => {
            if (!result) return false;
            previous = result.previous;
            void catchUp();
            return true;
          }),
        unwrite: () =>
          (previous ? editContent(row.id, previous) : Promise.resolve(null)).then((result) => {
            if (result) void catchUp();
            return result !== null;
          }),
        did: "Saved",
        failed: "Couldn't save that",
        unfailed: "Couldn't put it back",
      },
      toast,
      writes,
    );
  }

  /** The thread's name. Co-owned, so anybody in it may change it, and undone
   *  the same way a row's rename is. */
  function renameThreadTo(name: string): void {
    if (!thread) return;
    const previous = thread.name;
    const draw = (value: string) =>
      setThread((current) => (current ? { ...current, name: value } : current));
    void perform(
      {
        apply: () => draw(name),
        revert: () => draw(previous),
        write: () => renameThread(id, name).then((result) => result !== null),
        unwrite: () => renameThread(id, previous).then((result) => result !== null),
        did: "Renamed",
        failed: "Couldn't rename that",
        unfailed: "Couldn't put the name back",
      },
      toast,
      writes,
    );
  }

  /** 020. Move, by hand, from the row's own sheet. The author's, like delete,
   *  and the picture goes with the row: the server adjusts its wraps in the
   *  same transaction. The row leaves this list at the press and comes back
   *  if the server refuses; Undo is the same move back. */
  function move(row: ContentRow, threadId: string): void {
    setMoving(null);
    if (isProvisional(row.id) || !id) return;
    setViewing(null);
    const at = rows.findIndex((one) => one.id === row.id);
    const home = id;
    void perform(
      {
        apply: () => {
          dropRow(row.id);
          if (thread) count({ active: thread.counts.active - 1 });
        },
        revert: () => {
          putRow(row, at);
          if (thread) count({ active: thread.counts.active });
        },
        write: () => moveContent(row.id, threadId).then((moved) => moved !== null),
        unwrite: () => moveContent(row.id, home).then((moved) => moved !== null),
        did: "Moved",
        failed: "Couldn't move that",
        unfailed: "Couldn't put that back",
      },
      toast,
      writes,
    );
  }

  /** A row was dragged somewhere else in To do.
   *
   *  The writes are priorities, computed by the list from the rows either
   *  side of the drop, through the endpoint a priority has always gone
   *  through, which pins it. Undo writes every previous number back. */
  function reorder(writes_: ReorderWrite[]): void {
    // A row drawn at the press has no priority to write yet.
    if (writes_.some((write) => isProvisional(write.id))) return;
    const set = (pick: (write: ReorderWrite) => number): void =>
      setRows((current) =>
        current.map((row) => {
          const write = writes_.find((one) => one.id === row.id);
          return write ? { ...row, priority: pick(write), priorityPinned: true } : row;
        }),
      );
    const all = async (pick: (write: ReorderWrite) => number): Promise<boolean> => {
      const results = await Promise.all(writes_.map((one) => setPriority(one.id, pick(one))));
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

  /** The To do fold. A preference of the thread, so it travels to the next
   *  device; drawn at the press, and put back with a word if it does not
   *  stick. No Undo: pressing it again is the undo. */
  function fold(next: boolean): void {
    if (!thread || !id) return;
    const was = thread.preference.hideDone === true;
    const draw = (hideDone: boolean): void =>
      setThread((current) =>
        current ? { ...current, preference: { ...current.preference, hideDone } } : current,
      );
    void perform(
      {
        apply: () => draw(next),
        revert: () => draw(was),
        write: () => setPreference(id, { hideDone: next }),
        failed: next ? "Couldn't hide those" : "Couldn't show those",
      },
      toast,
      writes,
    );
  }

  // ------------------------------------------------------------- 025 labels

  // The kept pick, less any label that has since been deleted.
  useEffect(() => {
    if (!thread) return;
    const live = keepLive(pick, thread.labels.map((label) => label.id));
    if (live.labels.length !== pick.labels.length) setPick(live);
  }, [thread]);

  const relabelled = (): void => {
    void catchUp();
  };

  /** The label sheet's Done: the row's labels as a full set, any typed names
   *  made first with this row under them, one toast, one Undo. */
  function labelRow(row: ContentRow, choice: LabelChoice): void {
    setLabelling(null);
    if (!thread || isProvisional(row.id)) return;
    const same = choice.made.length === 0 && choice.ids.length === row.labels.length && choice.ids.every((one) => row.labels.includes(one));
    if (same) return;
    const before = row.labels;
    const made: string[] = [];
    const names = [
      ...thread.labels.filter((label) => choice.ids.includes(label.id)).map((label) => label.name),
      ...choice.made,
    ];
    void perform(
      {
        apply: () => patchRow(row.id, { labels: choice.ids }),
        revert: () => patchRow(row.id, { labels: before }),
        write: async () => {
          for (const name of choice.made) {
            const result = await createLabel(thread.id, { name });
            if (!result.ok) return false;
            made.push(result.value.label.id);
          }
          const edited = await editContent(row.id, { labels: [...choice.ids, ...made] });
          if (edited) relabelled();
          return edited !== null;
        },
        unwrite: async () => {
          const edited = await editContent(row.id, { labels: before });
          for (const labelId of made) await deleteLabel(labelId);
          if (edited) relabelled();
          return edited !== null;
        },
        did: rowLabelledCopy(row.title, names),
        failed: "Couldn't save that",
        unfailed: "Couldn't put it back",
      },
      toast,
      writes,
    );
  }

  /** The label's list's Save or Label N: one write, one Undo. A refusal keeps
   *  the list open with its line under the name. */
  async function saveList(label: Label | null, save: ListSave): Promise<void> {
    if (!thread) return;
    setListLine(null);
    if (label === null) {
      const result = await createLabel(thread.id, {
        name: save.name,
        ...(save.colour ? { colour: save.colour } : {}),
        rows: { content: save.add.content, notes: save.add.notes },
      });
      if (!result.ok) {
        setListLine(refusalLine(result.error, save.name));
        return;
      }
      const made = result.value.label;
      setListing(null);
      relabelled();
      toast.show(listLabelledCopy(made.count, made.name), {
        label: "Undo",
        onPress: async () => {
          await deleteLabel(made.id);
          relabelled();
        },
      });
      return;
    }
    const renamed = save.name !== label.name;
    const result = await labelRows(label.id, {
      add: save.add,
      remove: save.remove,
      ...(renamed ? { name: save.name } : {}),
      ...(save.colour !== undefined ? { colour: save.colour } : {}),
    });
    if (!result.ok) {
      if (result.error === "label_gone") {
        setListing(null);
        toast.show("That label was deleted");
        relabelled();
        return;
      }
      setListLine(refusalLine(result.error, save.name));
      return;
    }
    const { changed, previous, label: saved } = result.value;
    setListing(null);
    relabelled();
    toast.show(listLabelledCopy(saved.count, saved.name), {
      label: "Undo",
      onPress: async () => {
        await labelRows(label.id, {
          add: changed.removed,
          remove: changed.added,
          ...(previous ? { name: previous.name, colour: previous.colour } : {}),
        });
        relabelled();
      },
    });
  }

  async function removeLabel(label: Label): Promise<void> {
    const result = await deleteLabel(label.id);
    setListing(null);
    if (!result.ok) {
      toast.show("Couldn't save that", { label: "Try again", onPress: () => void removeLabel(label) });
      return;
    }
    relabelled();
    toast.show(`${label.name} deleted`, {
      label: "Undo",
      onPress: async () => {
        await restoreLabel(label.id);
        relabelled();
      },
    });
  }

  if (!thread) {
    return (
      <SafeAreaView
        className={`flex-1 ${isAndroid ? "bg-a-surface" : "bg-surface-page"}`}
        edges={["top"]}
      >
        <Bar onBack={() => router.back()} calendars={null} onCalendars={() => undefined} />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      </SafeAreaView>
    );
  }

  // What the composer's `+` writes are about to be, in front of what the
  // server has, unless the server has them already. A section with no widget
  // type to start as, Files, writes a note, so its words are drawn among the
  // notes, at the end, where a new note goes.
  const you = thread.members.find((member) => member.isYou) ?? null;
  const author = { accountId: you?.accountId ?? null, displayName: you?.displayName ?? "you" };
  const provisional = mine
    .filter((one) => !one.landedId || !rows.some((row) => row.id === one.landedId))
    .filter((one) => !one.landedId || !thread.notes.some((note) => note.id === one.landedId));
  const allRows = [
    ...provisional.flatMap((one) => {
      const type = one.write === "quickAdd" ? startsAs(one.section ?? "") : null;
      if (!type) return [];
      // The entry's key is already a provisional id.
      const row = provisionalRow(one.text, type, author, one.day);
      return [{ ...row, id: one.landedId ?? one.key }];
    }),
    ...rows,
  ];
  const allNotes = [
    ...thread.notes,
    ...provisional.flatMap((one) => {
      const isNote = one.write === "note" || startsAs(one.section ?? "") === null;
      if (!isNote) return [];
      const note = provisionalNote(one.text, author.accountId);
      return [{ ...note, id: one.landedId ?? one.key }];
    }),
  ];

  const widgets = widgetsFor(allRows, thread.preference.widgets);
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
  // 025. The notes are all in the bundle, so they are narrowed here; the rows
  // came narrowed from the server.
  const filtering = !isAll(pick);
  const shownNotes = filtering
    ? allNotes.filter((note) =>
        note.labels.length === 0 ? pick.none : note.labels.some((labelId) => pick.labels.includes(labelId)),
      )
    : allNotes;
  const pickedNames = thread.labels.filter((label) => pick.labels.includes(label.id)).map((label) => label.name);
  const rowLabels: RowLabels = {
    labels: new Map(thread.labels.map((label) => [label.id, label])),
    onLabel: (row) => setLabelling(row),
    onOpenLabel: (labelId) => {
      const label = thread.labels.find((one) => one.id === labelId);
      if (label) {
        setListLine(null);
        setListing({ label });
      }
    },
  };
  const dated = showArchived ? [] : datedFor(allRows, shownNotes, zone);
  const onRail = new Set(dated.map((one) => one.rowId));
  // 019. A pick earns the rail on its own: a thread with a calendar and
  // nothing dated shows this week, with the calendar's events on it.
  // A calendar's events carry no labels, so under a filter they are not shown.
  const railEarned = dated.length > 0 || (!filtering && thread.calendars?.anyPicked === true);

  // **A repeating thing is one row here, not thirty.** A weekly class filed as
  // thirty occurrences spends thirty rows saying what the row above said. The
  // rail draws every occurrence, because a calendar has a cell per day already;
  // a list has no grid, so it collapses and says how often.
  const { once, repeating } = splitRepeating(
    allRows.filter((row) => !inWidgets.has(row.id) && !onRail.has(row.id)),
  );
  const rest = once;
  // "Everything else" once a widget has lifted anything out, per 007's AC-2.
  // Not a fixed string: it is the anti-duplication contract.
  const restHeading =
    inWidgets.size > 0 ? "Everything else" : "Everything in here";

  // 020. What the viewer pages through: every photo row on the page, in the
  // page's order, each with its row so the tools follow it.
  const photoRows = rows.filter((row) => row.photo !== null);
  const viewerSet: ViewerPhoto[] = photoRows.map((row) => ({
    blobId: row.photo!.blobId,
    ready: row.photo!.ready,
    width: row.photo!.width,
    height: row.photo!.height,
    title: row.title,
    body: row.body,
    row,
  }));
  const viewerIndex = viewing ? photoRows.findIndex((row) => row.id === viewing) : -1;

  const actions: RowAction[] = acting
    ? [
        // Edit leads, because renaming is the commonest thing to want and the
        // one this sheet did not offer: the only way to fix a title was on the
        // web.
        // 023. When sits above Edit and carries its value where the other
        // rows carry nothing; a row on a calendar keeps its time, which is
        // Google's, and does not offer it.
        ...(!acting.onCalendar
          ? [{ label: "When", icon: "calendar", value: whenLabel(whenValueOf(acting, zone)), run: () => setTiming(acting) }]
          : []),
        { label: "Edit", icon: "pencil", run: () => setRenaming(acting) },
        // 020. The first move control the product has drawn, on the row's own
        // sheet. The author's, like delete, because both change who can see
        // something.
        ...(acting.canMove ? [{ label: "Move", icon: "layers", run: () => setMoving(acting) }] : []),
        // A picture is not done or not done.
        ...(acting.photo
          ? []
          : [
              {
                label: acting.doneAt ? "Mark not done" : "Mark done",
                icon: acting.doneAt ? "rewind" : "check",
                run: () => tick(acting),
              },
            ]),
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
      <Bar
        title={thread.name}
        onBack={() => router.back()}
        // 019. The calendar glyph, drawn whenever the account has a connection
        // at all, with no badge or count in any state: the accessible name
        // carries the state.
        calendars={thread.calendars}
        onCalendars={() => setCalendarsOpen(true)}
        onMore={() => setMoreOpen(true)}
        onShare={thread.shareable ? () => setShareOpen(true) : undefined}
      />

      {/* 025. The filter bar, under the app bar and outside the scroll, so it
          stays while the page moves under it. Not on the archived view. */}
      {showArchived ? null : (
        <FilterBar
          labels={thread.labels}
          unlabelled={thread.counts.unlabelled}
          pick={pick}
          prompt={thread.counts.active + thread.notes.length >= GROUP_PROMPT_ROWS}
          onPick={setPick}
          onNew={() => {
            setListLine(null);
            setListing({ label: null });
          }}
          onOpen={(labelId) => rowLabels.onOpenLabel(labelId)}
        />
      )}
      <RowLabelsContext.Provider value={rowLabels}>
      <ScrollView contentContainerClassName="pb-space-9">
        {filtering && !showArchived && rows.length === 0 && shownNotes.length === 0 ? (
          <Text className="px-gutter-screen py-space-6 font-core text-text-secondary" style={{ fontSize: 15 }}>
            {pickedNames.length > 0 ? `Nothing under ${nameList(pickedNames)} yet.` : "Nothing without a label yet."}
          </Text>
        ) : null}
        {/* What offload holds to be true of the thread, and only when there
            is one. The people chips went on 21 September: who a thread is
            shared with is a question you ask by tapping Share, and the answer
            belongs beside the actions that change it. The name is in the bar,
            so with no standing the first section starts at the top. Nothing
            writes a standing yet, and its updated date will join the
            attribution when something does. */}
        {thread.standing ? (
          <View className="px-gutter-screen pb-space-8 pt-space-7">
            <Text className="font-quiet text-text-primary" style={{ fontSize: 18, lineHeight: 27 }}>
              {thread.standing}
            </Text>
            <View className="mt-space-5 flex-row items-center gap-space-3">
              <Glyph name="sparkles" size={13} color={COLOR.quiet} />
              <Text className="font-core text-text-tertiary" style={{ fontSize: 12 }}>
                offload wrote this
              </Text>
            </View>
          </View>
        ) : null}

        {/* The rail is above the widgets, and only on a thread with something
            dated. It is not a widget: it lists every kind with a date rather
            than one, which is why 015 took it out of the widget set. */}
        {showArchived || !railEarned ? null : (
          <Timeline
            // Keyed by the thread, so the day you were reading and the gaps you
            // opened do not follow you into the next one.
            key={thread.id}
            threadId={thread.id}
            threadName={thread.name}
            rows={allRows}
            notes={shownNotes}
            calendars={{ anyPicked: !filtering && thread.calendars?.anyPicked === true, version: calendarsVersion }}
            onDelete={remove}
            onActions={setActing}
            onEdit={setRenaming}
            onArchive={archive}
            onToggle={tick}
          />
        )}

        {showArchived ? null : (
          <Widgets
            threadId={id}
            threadName={thread.name}
            widgets={widgets}
            hideDone={thread.preference.hideDone}
            onFold={fold}
            onDelete={remove}
            onActions={setActing}
            onEdit={setRenaming}
            onArchive={archive}
            onOpenPhoto={(row: ContentRow) => setViewing(row.id)}
            onToggle={tick}
            onReorder={reorder}
            arrived={arrived}
          />
        )}

        {showArchived ? null : (
          <NotesSection
            threadId={thread.id}
            threadName={thread.name}
            notes={shownNotes}
            counts={thread.noteCounts}
            members={thread.members}
            onNotes={patchNotes}
            toast={toast}
            writes={writes}
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

        {rest.length === 0 && !showArchived && inWidgets.size === 0 && !filtering ? (
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
            onDelete={() => remove(series.row)}
            onActions={() => setActing(series.row)}
            onEdit={() => setRenaming(series.row)}
            onArchive={() => archive(series.row)}
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
            onDelete={() => remove(row)}
            onActions={() => setActing(row)}
            onEdit={() => setRenaming(row)}
            onArchive={() => archive(row)}
            onOpenPhoto={() => setViewing(row.id)}
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
        <PlateSpace />
      </ScrollView>
      </RowLabelsContext.Provider>

      {/* 020. The viewer, over the screen, and the row's tools on the same
          sheet a row opens from its list. The set is every photo row on the
          page, in the page's order. Mounted before the sheets, which are
          absolute siblings: More opens the action sheet, and a sheet under
          the plane is a sheet nobody can see. */}
      {viewerIndex >= 0 ? (
        <PhotoViewer
          photos={viewerSet}
          index={viewerIndex}
          onIndex={(index) => setViewing(photoRows[index]?.id ?? null)}
          onClose={() => setViewing(null)}
          onMore={setActing}
        />
      ) : null}

      <RowEditSheet
        // **Keyed by the row, so the fields start out holding its values.**
        // Filling them from an effect meant the sheet mounted empty and then
        // caught up, and on a device it stayed empty: a controlled TextInput
        // that takes focus on mount and has its value replaced a tick later is
        // the one case where that race is visible. Mounting per row removes the
        // tick rather than sequencing it.
        key={renaming?.id ?? "none"}
        row={renaming}
        onClose={() => setRenaming(null)}
        onSave={(row, patch) => {
          setRenaming(null);
          edit(row, patch);
        }}
        onRemove={(row) => {
          setRenaming(null);
          if (row.canDelete && row.archivedAt === null) remove(row);
          else archive(row);
        }}
      />

      {/* 023. The When sheet on its own, from the action sheet's row: here it
          writes on Save and on Clear, since there is no edit sheet to hand
          back to. */}
      {timing ? (
        <WhenSheet
          key={timing.id}
          open
          title={timing.title}
          isEvent={timing.type === "event"}
          initial={whenValueOf(timing, zone)}
          onClose={() => setTiming(null)}
          onSave={(value) => {
            const row = timing;
            setTiming(null);
            if (!sameWhen(value, whenValueOf(row, zone))) edit(row, patchFor(row, value));
          }}
        />
      ) : null}

      <RowActionSheet
        open={acting !== null}
        actions={actions}
        onClose={() => setActing(null)}
      />
      {/* The head's More: what the web keeps under its ellipsis, in its order.
          The calendars are reachable both ways, as there. */}
      <RowActionSheet
        open={moreOpen}
        actions={[
          { label: "Rename thread", icon: "pencil", run: () => setNaming(true) },
          {
            label: "Add a note",
            icon: "brain",
            run: () =>
              raiseFor({
                threadId: thread.id,
                threadName: thread.name,
                write: "note",
                title: "Add a note",
                placeholder: "What is true about this thread?",
                charLimit: NOTE_CHARS,
                showCounter: true,
              }),
          },
          ...(thread.calendars
            ? [{ label: "Calendars in this thread", icon: "calendar", run: () => setCalendarsOpen(true) }]
            : []),
          // 022. Leave, on a thread with more than one member, confirmed. It
          // does what the swipe on My threads does, Undo included; on a
          // thread you are alone in the swipe's Delete is the whole story.
          ...(thread.members.length > 1
            ? [{ label: "Leave this thread", icon: "x", danger: true, run: () => setLeaving(true) }]
            : []),
        ]}
        onClose={() => setMoreOpen(false)}
      />
      <ShareSheet
        open={shareOpen}
        threadId={thread.id}
        threadName={thread.name}
        viewerId={you?.accountId ?? null}
        onClose={() => setShareOpen(false)}
        onChanged={() => void load()}
      />
      <ConfirmSheet
        open={leaving}
        title={`Leave ${thread.name}?`}
        body="Your membership and your access go. What you added stays with the others, and the thread is theirs to keep."
        action="Leave"
        danger
        busy={leaveBusy}
        failed={leaveFailed}
        onConfirm={() => void leave()}
        onClose={() => setLeaving(false)}
      />
      {naming ? (
        <EditSheet
          initial={thread.name}
          placeholder="What is it about?"
          onClose={() => setNaming(false)}
          onSave={(name) => {
            setNaming(false);
            if (name !== thread.name) renameThreadTo(name);
          }}
        />
      ) : null}
      <MoveSheet
        open={moving !== null}
        exceptThreadId={id}
        onClose={() => setMoving(null)}
        onPick={(thread) => {
          if (moving) move(moving, thread.id);
        }}
      />
      <CalendarsSheet
        open={calendarsOpen}
        threadId={thread.id}
        threadName={thread.name}
        members={thread.members.length}
        onClose={() => setCalendarsOpen(false)}
        onChanged={() => {
          setCalendarsVersion((v) => v + 1);
          void fetchThread(id).then((bundle) => {
            if (bundle) setThread(bundle);
          });
        }}
      />
      {labelling ? (
        <LabelSheet
          key={labelling.id}
          title={labelling.title}
          labels={thread.labels}
          carried={labelling.labels}
          onDone={(choice) => labelRow(labelling, choice)}
          onClose={() => setLabelling(null)}
        />
      ) : null}
      {listing ? (
        <LabelList
          key={listing.label?.id ?? "new"}
          threadId={thread.id}
          label={listing.label}
          labels={thread.labels}
          notes={thread.notes}
          widgets={thread.preference.widgets}
          freeColour={Array.from({ length: 10 }, (_, i) => i + 1).find((c) => !thread.labels.some((l) => l.colour === c)) ?? 1}
          line={listLine}
          onSave={(save) => void saveList(listing.label, save)}
          onDelete={() => {
            if (listing.label) void removeLabel(listing.label);
          }}
          onClose={() => setListing(null)}
        />
      ) : null}
      <ToastHost state={toast} />
    </SafeAreaView>
  );
}

function Bar({
  title,
  onBack,
  calendars,
  onCalendars,
  onMore,
  onShare,
}: {
  /** Neither while the thread loads: the bar is the back chevron alone. */
  title?: string;
  onBack: () => void;
  calendars: { picked: number; total: number } | null;
  onCalendars: () => void;
  onMore?: () => void;
  /** 022. Absent on the default thread. */
  onShare?: (() => void) | undefined;
}) {
  const COLOR = useColors();
  return (
    <View className="h-appbar-height flex-row items-center gap-space-4 px-gutter-screen">
      <Pressable onPress={onBack} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back">
        <Glyph name="chevron-left" size={22} color={COLOR.iconOnWell} />
      </Pressable>
      <Text
        numberOfLines={1}
        className={`flex-1 font-core font-semibold ${isAndroid ? "text-a-on" : "text-text-primary"}`}
        style={{ fontSize: 17 }}
      >
        {title}
      </Text>
      {/* Bare glyphs, as the back chevron and every bar control on the phones:
          the kit's `IconButton` in a bar is the ghost one, and a filled circle
          here read as a state. Share first, then the calendar, then More: the
          web's aside, tools and ellipsis, in that order. */}
      {onMore ? (
      <View className="flex-row items-center gap-space-5">
        {/* 022. Alive, except on the default thread, where it is not drawn:
            every dump with no obvious home lands there, so sharing it would
            share whatever arrives next. */}
        {onShare ? (
          <Pressable onPress={onShare} hitSlop={10} accessibilityRole="button" accessibilityLabel="Share">
            <Glyph name="share-2" size={21} color={COLOR.iconOnWell} />
          </Pressable>
        ) : null}
        {calendars ? (
          <Pressable
            onPress={onCalendars}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={calendarsLabel(calendars.picked, calendars.total)}
          >
            <Glyph name="calendar" size={21} color={COLOR.iconOnWell} />
          </Pressable>
        ) : null}
        <Pressable onPress={onMore} hitSlop={10} accessibilityRole="button" accessibilityLabel="More">
          <Glyph name="ellipsis" size={21} color={COLOR.iconOnWell} />
        </Pressable>
      </View>
      ) : null}
    </View>
  );
}


/** One line of text, edited in a sheet: a row's title, the thread's name.
 *
 *  Mounted only while open, and keyed by whoever opens it, so the field starts
 *  out holding its text: filling it from an effect meant the sheet mounted
 *  empty and then caught up, and on a device it stayed empty. */
function EditSheet({
  initial,
  placeholder,
  onClose,
  onSave,
  leading,
}: {
  initial: string;
  placeholder: string;
  onClose: () => void;
  /** The text, trimmed and never empty. The sheet closes at the press and
   *  the screen writes it, so the keyboard is never held up for a round trip. */
  onSave: (text: string) => void;
  /** A control at the start of the button row, before Cancel and Save. */
  leading?: React.ReactNode;
}) {
  const COLOR = useColors();
  // Same reason as the action sheet: this is anchored to the bottom of a screen
  // and the plate is mounted above the router.
  useScreenSheet(true);
  const [draft, setDraft] = useState(initial);
  const { height: keyboardHeight } = useReanimatedKeyboardAnimation();
  const lift = useAnimatedStyle(() => ({
    transform: [{ translateY: keyboardHeight.value }],
  }));

  function save(): void {
    const text = draft.trim();
    if (text.length === 0) return onClose();
    onSave(text);
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
          placeholder={placeholder}
          placeholderTextColor={COLOR.iconOnWell}
          className={`rounded-sm border border-border-hairline px-space-4 py-space-3 font-core ${
            isAndroid ? "text-a-on" : "text-text-primary"
          }`}
          style={{ fontSize: 15 }}
          onSubmitEditing={save}
          returnKeyType="done"
        />

        <View className="mt-space-4 flex-row items-center justify-end gap-space-4">
          {leading}

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
            onPress={save}
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
