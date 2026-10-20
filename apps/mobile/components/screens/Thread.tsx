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

import { ARCHIVE_SHARED, archiveAsk, asksBeforeArchive, LAYOUT_NAMES, layoutFor, leaveAsk, threadLookAfter, type Layout, type ThreadLook } from "@offload/widgets";
import { LayoutSections, type LayoutHandlers } from "./LayoutSections";
import { TYPED_ROW_PLACEHOLDER } from "../../lib/typed-row";
import { ThreadIcon } from "../ThreadIcon";
import { EditThreadSheet } from "./EditThreadSheet";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
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
import { useColors } from "../../lib/colors";
import { ContentRowView } from "../shell/ContentRow";
import { NotesSection } from "../shell/Notes";
import { RowActionSheet, type RowAction } from "../shell/RowActionSheet";
import { PhotoViewer, type ViewerPhoto } from "../shell/PhotoViewer";
import { forgetRendition } from "../shell/PhotoThumb";
import { MoveSheet } from "../shell/MoveSheet";
import { CalendarsSheet, calendarsLabel } from "../shell/CalendarsSheet";
import { ToastHost, useToast } from "../shell/Toast";
import { InPlace } from "../shell/InPlace";
import { UndoAt } from "../shell/UndoLine";
import type { Place, UndoForm } from "@offload/widgets";
import { useFolds } from "../../lib/folds";
import { Timeline } from "../shell/Timeline";
import { Widgets } from "../shell/Widgets";
import {
  completeContent,
  deleteContent,
  deleteThread,
  restoreThread,
  editContent,
  forgetAction,
  restoreAction,
  fetchContent,
  fetchThread,
  isProvisional,
  moveContent,
  NOTE_CHARS,
  provisionalNote,
  provisionalRow,
  editThread,
  setArchived,
  setPriority,
  startsAs,
  QUICK_ADD_CHARS,
  type ContentRow,
  type Note,
  type ThreadEdit,
  type ThreadBundle,
  setPreference,
  type ContentPatch,
  type ContentSnapshot,
  fetchOne,
  type Point,
} from "../../lib/threads";
import { perform, useWrites } from "../../lib/optimistic";
import { useClock } from "../../lib/clock";
import { drawnWhen, patchFor, sameWhen, whenLabel, whenValueOf } from "../../lib/when";
import { drawnRemind, undoPatch } from "../../lib/reminders";
import { RowEditSheet } from "../shell/RowEditSheet";
import { WhenSheet } from "../shell/WhenSheet";
import { useConversation } from "../shell/conversation-context";
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
  withMadeLabels,
  writePick,
  type Label,
} from "../../lib/labels";
import { DragSheet } from "../shell/DragSheet";
import { Segmented } from "../Segmented";
import { ThreadMap } from "../map/ThreadMap";
import { PlaceSheet } from "../map/PlaceSheet";
import { useThreadMap } from "../map/use-thread-map";
import { barTools, type BarTool } from "../../lib/map-view";
import { useSheetBack } from "../../lib/sheet-back";
import { usePlateInset } from "../shell/plate-inset";
import { movedCopy, redirectFor } from "../../lib/loose";

const isAndroid = Platform.OS === "android";

/** 030. The place sheet's grabber and padding, above what its body measures. */
const SHEET_CHROME = 48;

export default function Thread() {
  const COLOR = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [thread, setThread] = useState<ThreadBundle | null>(null);
  const [rows, setRows] = useState<ContentRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [renaming, setRenaming] = useState<ContentRow | null>(null);
  // 020. The photo open in the viewer, by row id, and the row a move sheet
  // is up for. The viewer pages through every photo row on the page.
  const [viewing, setViewing] = useState<string | null>(null);
  const [moving, setMoving] = useState<ContentRow | null>(null);
  // What arrived while this screen was open, marked for a moment rather than
  // appearing silently in the middle of a list.
  const [arrived, setArrived] = useState<Set<string>>(new Set());
  // 023. The row whose When sheet is open on its own, from the action sheet.
  const { zone, today } = useClock();
  // 019. The calendars sheet, and a counter bumped when the picks change so
  // the rail reads the calendars again.
  const [calendarsOpen, setCalendarsOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  // 022. The share sheet, and Leave with its confirmation.
  const [shareOpen, setShareOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  // 2026-10-07. The row asking before it is archived: in a shared thread
  // archive hides it for everyone, so it asks first.
  const [archiving, setArchiving] = useState<ContentRow | null>(null);
  const [leaveBusy, setLeaveBusy] = useState(false);
  const [leaveFailed, setLeaveFailed] = useState(false);
  // 037. Edit thread, and whether the icon or the name opened it.
  const [editingThread, setEditingThread] = useState<"icon" | "name" | null>(null);
  const [calendarsVersion, setCalendarsVersion] = useState(0);
  const toast = useToast();
  // 025. The filter bar's pick, kept per thread on this phone; the label sheet
  // open on a row; the label's list open for a label, or for a new one.
  const [pick, setPickState] = useState<LabelPick>(() => (id ? readPick(id) : ALL_LABELS));
  const [labelling, setLabelling] = useState<ContentRow | null>(null);
  // The note editor, drawn here at the root: see NotesSection's onSheet.
  const [noteSheet, setNoteSheet] = useState<ReactNode>(null);
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
    // Back to My threads, where its line takes the thread's row.
    router.dismissTo("/threads");
    notify(
      result.deleted ? "Thread deleted" : "You left the thread",
      { label: "Undo", onPress: () => void restoreThread(id) },
      { id: `thread:${id}`, icon: result.deleted ? "trash-2" : "log-out", form: "slot" },
    );
  }
  const { filed, setOnScreen, provisional: inFlight, adoptProvisional, raiseFor, notify, openPdf } =
    useConversation();
  /** 020, 041. A photo row opens the viewer; a PDF row opens the PDF. */
  const openFileOf = (row: ContentRow) =>
    row.photo?.kind === "pdf" ? openPdf(row.photo, row.title) : setViewing(row.id);

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
      // 028. The caller's own default thread is never drawn as a thread: from
      // the loading state straight to Not in a thread, never a flash of this.
      const away = redirectFor(bundle);
      if (away) return router.replace(away);
      setThread(bundle);
      setRows(page?.rows ?? []);
      setCursor(page?.nextCursor ?? null);
      adopt((page?.rows ?? []).map((row) => row.id), (bundle?.notes ?? []).map((note) => note.id));
    } catch (error) {
      failed("thread.load", error, { threadId: id });
    }
    // `writes` is a ref holder and stable, so it is not a dependency.
  }, [id, showArchived, adopt, pick, router]);

  // Every write here is drawn before it is sent. `writes` counts what is in
  // flight and reloads once nothing is; a reload that lands while something
  // still is gets dropped, or it would undo the change on screen for the
  // length of a round trip.
  const writes = useWrites(load);
  // 030. The map behind the switch. `thread` is the version: the points follow
  // every read of the bundle while the map shows.
  const map = useThreadMap({ threadId: id, hasPoint: thread?.hasPoint === true, version: thread });
  const plateInset = usePlateInset();
  // Back from Map returns to List on Android, while this screen is the one in
  // front; a sheet open over the map takes back first.
  const [focused, setFocused] = useState(true);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  useSheetBack(focused && map.layout === "map", {
    start: () => undefined,
    progress: () => undefined,
    cancel: () => undefined,
    invoke: () => map.setView("list"),
  });

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
      // A turn that filed before the first read landed: load does the leaving.
      if (redirectFor(bundle)) return;
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
  /** 2026-10-18. Where a row's Undo is drawn: in its list, or above the
   *  composer for a row only the rail draws, which has no line of its own. */
  const listed = useRef<Set<string>>(new Set());
  const [folds] = useFolds();
  const placeOf = (rowId: string, icon: string, form: UndoForm): Place => ({
    id: rowId,
    icon,
    form: listed.current.has(rowId) ? form : "plate",
  });

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

  /** Archive, asking first in a shared thread. Putting back never asks. */
  function askArchive(row: ContentRow): void {
    const shared = thread ? thread.members.some((member) => !member.isYou) : null;
    if (asksBeforeArchive(row, shared)) setArchiving(row);
    else archive(row);
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
        place: placeOf(row.id, "archive", "slot"),
      },
      toast,
      writes,
    );
  }

  /** 044. Remove a wrong action from a PDF's row. The row stays and changes,
   *  so the Undo draws under it (`form: "under"`), as an in-place edit does; a
   *  failed write puts the action back, and restore refuses, server side, any
   *  url the PDF did not carry. */
  function removeAction(row: ContentRow, url: string): void {
    if (isProvisional(row.id)) return;
    const before = row.actions ?? [];
    void perform(
      {
        apply: () => patchRow(row.id, { actions: before.filter((action) => action.url !== url) }),
        revert: () => patchRow(row.id, { actions: before }),
        write: () => forgetAction(row.id, url),
        unwrite: () => restoreAction(row.id, url),
        did: "Removed",
        failed: "Couldn't remove that",
        unfailed: "Couldn't put that back",
        place: placeOf(row.id, "arrow-up-right", "under"),
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
        place: placeOf(row.id, "trash-2", "slot"),
      },
      toast,
      writes,
    );
  }

  /** 023. The sheet's Save: every changed field in one request, drawn first
   *  and sent second, with the previous values as the Undo. The words are
   *  the ones the design gives a save, and never why it did not go through. */
  /** `made` is labels typed in the edit sheet's label sheet: made first, then
   *  added to `patch.labels`, and deleted again by the Undo. */
  function edit(row: ContentRow, patch: ContentPatch, made: string[] = []): void {
    const drawn: Partial<ContentRow> = {};
    if (patch.labels !== undefined) drawn.labels = patch.labels;
    if (patch.title !== undefined) drawn.title = patch.title;
    if (patch.body !== undefined) drawn.body = patch.body;
    // 042. The switch's part: a stop draws isReminder off with it.
    Object.assign(drawn, drawnRemind(patch));
    // The dates too, read in the account's clock exactly as the route reads
    // them, so the chip moves with the toast; the server's answer then
    // confirms what was drawn.
    Object.assign(drawn, drawnWhen(patch, zone));
    const before: Partial<ContentRow> = {
      title: row.title,
      body: row.body,
      isReminder: row.isReminder,
      reminders: row.reminders,
      dueAt: row.dueAt,
      occursAt: row.occursAt,
      occursEndAt: row.occursEndAt,
      rrule: row.rrule,
      allDay: row.allDay,
      labels: row.labels,
    };
    const threadId = thread?.id;
    const write = withMadeLabels<ContentPatch, ContentSnapshot>(
      {
        make: async (name) => {
          if (!threadId) return null;
          const created = await createLabel(threadId, { name });
          return created.ok ? created.value.label.id : null;
        },
        edit: async (fields) => {
          const result = await editContent(row.id, fields);
          if (result) void catchUp();
          return result ? result.previous : null;
        },
        undo: (previous) => undoPatch(previous),
        drop: (id) => deleteLabel(id),
      },
      patch,
      made,
    );
    void perform(
      {
        apply: () => patchRow(row.id, drawn),
        revert: () => patchRow(row.id, before),
        write: write.write,
        unwrite: write.unwrite,
        did: "Saved",
        failed: "Couldn't save that",
        unfailed: "Couldn't put it back",
        place: placeOf(row.id, "pencil", "under"),
      },
      toast,
      writes,
    );
  }

  /** 037. Edit thread's Save: the name, the icon and the hue in one write.
   *  Co-owned, so anybody in the thread may change them. The bar is drawn at
   *  the press, and Undo sends back everything that was there, whose pick it
   *  was included. */
  function saveThread(change: ThreadEdit, shown: { name: string; icon: string; hue: number }): void {
    if (!thread) return;
    const before: ThreadLook = { name: thread.name, icon: thread.icon, hue: thread.hue, iconSetBy: thread.iconSetBy };
    const after = threadLookAfter(before, change, shown);
    const fromLayout = thread.layout;
    const draw = (look: ThreadLook, layout?: Layout) =>
      setThread((current) => (current ? { ...current, ...look, ...(layout ? { layout, layoutSetBy: "person" as const } : {}) } : current));
    // Only stamp the layout on a draw when this edit actually moved it, so a
    // plain rename's Undo or a failed save does not claim the person's pick.
    // The layout switch's Undo needs the labels it moved, which only the write's
    // result carries, so it is captured here and sent by unwrite.
    let undo: ThreadEdit = before;
    void perform(
      {
        apply: () => draw(after, change.layout),
        revert: () => draw(before, change.layout ? fromLayout : undefined),
        write: () =>
          editThread(id, change).then((result) => {
            if (result?.layout) {
              undo = {
                ...before,
                layout: result.layout.previous.layout,
                layoutSetBy: result.layout.previous.layoutSetBy,
                undoLabels: { remove: result.layout.made, restore: result.layout.dropped },
              };
            }
            return result !== null;
          }),
        unwrite: () => editThread(id, undo).then((result) => result !== null),
        did: change.layout ? `Showing as ${LAYOUT_NAMES[change.layout]}` : "Thread updated",
        failed: "Couldn't save that",
        unfailed: "Couldn't put that back",
        // Under the thread's read, at the top of the page.
        place: { id: `thread:${id}`, icon: "pencil", form: "under" },
      },
      toast,
      writes,
    );
  }

  /** 020. Move, by hand, from the row's own sheet. The author's, like delete,
   *  and the picture goes with the row: the server adjusts its wraps in the
   *  same transaction. The row leaves this list at the press and comes back
   *  if the server refuses; Undo is the same move back. */
  function move(row: ContentRow, threadId: string, threadName: string): void {
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
        // 028. Where it went, as every move between threads now says.
        did: movedCopy(threadName),
        failed: "Couldn't move that",
        unfailed: "Couldn't put that back",
        place: placeOf(row.id, "arrow-up-right", "slot"),
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
  function reorder(writes_: ReorderWrite[], moved: string): void {
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
        // Under the row that was dragged, where it landed.
        place: placeOf(moved, "arrow-up-right", "under"),
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
    const names = [
      ...thread.labels.filter((label) => choice.ids.includes(label.id)).map((label) => label.name),
      ...choice.made,
    ];
    const threadId = thread.id;
    const write = withMadeLabels<ContentPatch, ContentSnapshot>(
      {
        make: async (name) => {
          const created = await createLabel(threadId, { name });
          return created.ok ? created.value.label.id : null;
        },
        edit: async (fields) => {
          const result = await editContent(row.id, fields);
          if (result) relabelled();
          return result ? result.previous : null;
        },
        undo: () => ({ labels: before }),
        drop: (id) => deleteLabel(id),
      },
      { labels: choice.ids },
      choice.made,
    );
    void perform(
      {
        apply: () => patchRow(row.id, { labels: choice.ids }),
        revert: () => patchRow(row.id, { labels: before }),
        write: write.write,
        unwrite: write.unwrite,
        did: rowLabelledCopy(row.title, names),
        failed: "Couldn't save that",
        unfailed: "Couldn't put it back",
        place: placeOf(row.id, "tag", "under"),
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
      toast.show(
        listLabelledCopy(made.count, made.name),
        {
          label: "Undo",
          onPress: async () => {
            await deleteLabel(made.id);
            relabelled();
          },
        },
        { id: `labels:${thread.id}`, icon: "tag", form: "under" },
      );
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
    toast.show(
      listLabelledCopy(saved.count, saved.name),
      {
        label: "Undo",
        onPress: async () => {
          await labelRows(label.id, {
            add: changed.removed,
            remove: changed.added,
            ...(previous ? { name: previous.name, colour: previous.colour } : {}),
          });
          relabelled();
        },
      },
      // Under the filter bar: the whole list changed.
      { id: `labels:${thread.id}`, icon: "tag", form: "under" },
    );
  }

  async function removeLabel(label: Label): Promise<void> {
    const result = await deleteLabel(label.id);
    setListing(null);
    if (!result.ok) {
      toast.show("Couldn't save that", { label: "Try again", onPress: () => void removeLabel(label) });
      return;
    }
    relabelled();
    // In the label's chip, which the filter bar keeps for the window.
    toast.show(
      `${label.name} deleted`,
      {
        label: "Undo",
        onPress: async () => {
          await restoreLabel(label.id);
          relabelled();
        },
      },
      { id: `label:${label.id}`, icon: "trash-2", form: "slot" },
    );
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

  // Thread layouts. Default keeps its own render below, to the pixel; the five
  // others draw layoutFor's sections. The rail is still the screen's, gated by
  // whether the layout permits one (decision 21).
  const threadLayout = (thread.layout ?? "default") as Layout;
  const isDefaultLayout = threadLayout === "default";
  const page =
    showArchived || isDefaultLayout
      ? null
      : layoutFor<ContentRow, Note>({
          layout: threadLayout,
          rows: allRows,
          notes: shownNotes,
          labels: thread.labels,
          // preference only steers Default's widget order, which never routes
          // through here, so the client's loose type need not be coerced.
          preference: {},
          now: new Date(),
          zone,
        });
  const layoutHandlers: LayoutHandlers = {
    onEdit: setRenaming,
    onDelete: remove,
    onToggle: tick,
    onOpenPhoto: openFileOf,
    // Todo list's "Add an item" opens the composer's quick add for a task, the
    // same raise the To do widget's add row uses (6.2).
    onAdd: () =>
      raiseFor({
        threadId: id,
        threadName: thread.name,
        write: "quickAdd",
        section: "todo",
        title: "Add an item",
        placeholder: TYPED_ROW_PLACEHOLDER,
        charLimit: QUICK_ADD_CHARS,
      }),
  };
  // The rows a list here draws, so their lines go in place; To do while it is
  // open, and Everything else.
  listed.current = new Set(
    [...(folds.todo || showArchived ? [] : widgets.filter((widget) => widget.kind === "todo").flatMap((widget) => widget.rows)), ...rest].map(
      (row) => row.id,
    ),
  );

  // 020. What the viewer pages through: every photo row on the page, in the
  // page's order, each with its row so the tools follow it.
  // 041. The viewer pages through photos; a PDF opens itself.
  const photoRows = rows.filter((row) => row.photo !== null && row.photo.kind !== "pdf");
  const viewerSet: ViewerPhoto[] = photoRows.map((row) => ({
    blobId: row.photo!.blobId,
    ready: row.photo!.ready,
    width: row.photo!.width ?? 0,
    height: row.photo!.height ?? 0,
    title: row.title,
    body: row.body,
    row,
  }));
  const viewerIndex = viewing ? photoRows.findIndex((row) => row.id === viewing) : -1;



  // 030. With the switch in the bar, the label and calendar tools go to the
  // top of More.
  const openNewLabel = (): void => {
    setListLine(null);
    setListing({ label: null });
  };
  const onMap = map.layout === "map";
  const tools = barTools({
    switchShown: map.ready,
    labels: !showArchived && thread.labels.length === 0,
    calendars: thread.calendars !== null,
  });
  const MORE_FIRST: Record<BarTool, RowAction> = {
    labels: { label: "Group with labels", icon: "tag", run: openNewLabel },
    calendars: { label: "Calendars in this thread", icon: "calendar", run: () => setCalendarsOpen(true) },
  };

  /** 030. Edit from the place sheet opens the row's own edit sheet, reading
   *  the row when it is not on the page yet. */
  async function editFromMap(point: Point): Promise<void> {
    if (!point.contentId) return;
    map.setOpen(null);
    const row = rows.find((one) => one.id === point.contentId) ?? (await fetchOne(point.contentId));
    if (row) setRenaming(row);
  }

  return (
    <SafeAreaView
      className={`flex-1 ${isAndroid ? "bg-a-surface" : "bg-surface-page"}`}
      edges={["top"]}
    >
      <Bar
        title={thread.name}
        look={thread}
        onEdit={setEditingThread}
        onBack={() => router.back()}
        // 019. The calendar glyph, drawn whenever the account has a connection
        // at all, with no badge or count in any state: the accessible name
        // carries the state. 030: in More instead while the switch is drawn.
        calendars={tools.inBar.includes("calendars") ? thread.calendars : null}
        onCalendars={() => setCalendarsOpen(true)}
        onMore={() => setMoreOpen(true)}
        onShare={thread.shareable ? () => setShareOpen(true) : undefined}
        // Labels' way in while the thread has none; the filter bar's plus
        // takes over once it has one.
        onLabels={tools.inBar.includes("labels") ? openNewLabel : undefined}
        // 030. List or Map, while the thread has a point: before share.
        mapSwitch={
          map.ready ? (
            <Segmented
              label="Show as"
              options={[
                { value: "list", label: "List", icon: "list" },
                { value: "map", label: "Map", icon: "map-pin" },
              ]}
              value={map.view}
              onChange={(value) => map.setView(value === "map" ? "map" : "list")}
            />
          ) : null
        }
      />

      {/* 025. The filter bar, under the app bar and outside the scroll, so it
          stays while the page moves under it. Not on the archived view. */}
      {showArchived || onMap ? null : (
        <>
          <FilterBar
            labels={thread.labels}
            unlabelled={thread.counts.unlabelled}
            pick={pick}
            onPick={setPick}
            onNew={openNewLabel}
            onOpen={(labelId) => rowLabels.onOpenLabel(labelId)}
          />
          {/* A whole list labelled: its line under the filter bar. */}
          <UndoAt id={`labels:${thread.id}`} />
        </>
      )}
      <RowLabelsContext.Provider value={rowLabels}>
      {/* 030. The body and the map in one box. Map replaces the list, which
          stays mounted, out of sight and reach, so its scroll is where it was
          on the way back. */}
      <View className="flex-1">
      <ScrollView
        contentContainerClassName="pb-space-9"
        pointerEvents={onMap ? "none" : "auto"}
        accessibilityElementsHidden={onMap}
        importantForAccessibility={onMap ? "no-hide-descendants" : "auto"}
        style={onMap ? { opacity: 0 } : undefined}
      >
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
        {/* Edit thread's line, under the read, or at the top without one. */}
        <UndoAt id={`thread:${thread.id}`} />

        {/* The rail is above the widgets, and only on a thread with something
            dated. It is not a widget: it lists every kind with a date rather
            than one, which is why 015 took it out of the widget set. */}
        {showArchived || !railEarned || !(isDefaultLayout || page?.rail) ? null : (
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
            onEdit={setRenaming}
            onToggle={tick}
          />
        )}

        {!isDefaultLayout && !showArchived && page ? (
          <LayoutSections page={page} labels={thread.labels} handlers={layoutHandlers} />
        ) : (
        <>
        {showArchived ? null : (
          <Widgets
            threadId={id}
            threadName={thread.name}
            widgets={widgets}
            hideDone={thread.preference.hideDone}
            onFold={fold}
            onDelete={remove}
            onEdit={setRenaming}
            onOpenPhoto={(row: ContentRow) => openFileOf(row)}
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
            onSheet={setNoteSheet}
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
            {/* Dark theme: edges (design decisions, 2026-10-07). */}
            {cursor ? null : (
              <View className="rounded-pill bg-surface-fill px-space-3 py-space-1" style={{ boxShadow: `inset 0 0 0 1px ${COLOR.edgeWell}` }}>
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
            onEdit={() => setRenaming(series.row)}
            note={
              cadenceLabel(series.everyDays)
                ? `${cadenceLabel(series.everyDays)} · ${series.count} held`
                : `${series.count} dates`
            }
          />
        ))}

        <InPlace
          items={rest}
          idOf={(row) => row.id}
          row={(row, border) => (
            <ContentRowView
              key={row.id}
              row={row}
              border={border}
              arrived={arrived.has(row.id)}
              onDelete={() => remove(row)}
              onRemoveAction={(url) => removeAction(row, url)}
              onEdit={() => setRenaming(row)}
              onOpenPhoto={() => openFileOf(row)}
            />
          )}
        />
        </>
        )}

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
      {map.made ? (
        <ThreadMap
          points={map.points}
          labels={thread.labels}
          pick={pick}
          pickedNames={pickedNames}
          hidden={!onMap}
          // What covers the foot: the place sheet, or the plate and the
          // keyboard under it. Google's logo and legal line sit above.
          bottom={map.open ? map.sheetHeight + SHEET_CHROME : plateInset + map.keyboard}
          selected={map.selected}
          onSelect={map.setSelected}
          onOpen={map.setOpen}
          failed={map.failed}
          onRetry={map.retry}
        />
      ) : null}
      {onMap && !map.made ? (
        // The one spinner, in the map's place, until the points arrive.
        <View className="absolute inset-0 items-center justify-center">
          <ActivityIndicator />
        </View>
      ) : null}
      {onMap && !showArchived ? (
        <View pointerEvents="box-none" className="absolute inset-x-0 top-0">
          <FilterBar
            floating
            labels={thread.labels}
            unlabelled={thread.counts.unlabelled}
            pick={pick}
            onPick={setPick}
            onNew={openNewLabel}
            onOpen={(labelId) => rowLabels.onOpenLabel(labelId)}
          />
        </View>
      ) : null}
      </View>
      </RowLabelsContext.Provider>
      {map.open ? (
        <PlaceSheet
          point={map.open}
          threadName={thread.name}
          labels={thread.labels}
          members={thread.members}
          onClose={() => map.setOpen(null)}
          onEdit={(point) => void editFromMap(point)}
          onHeight={map.setSheetHeight}
        />
      ) : null}

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
          onMore={setRenaming}
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
        labels={thread.labels}
        onSave={(row, patch, made) => {
          setRenaming(null);
          // Labels alone read as a labelling, with its own toast; anything
          // more is one edit carrying them.
          const keys = Object.keys(patch);
          if (keys.length === 1 && patch.labels) labelRow(row, { ids: patch.labels, made });
          else edit(row, patch, made);
        }}
        onRemove={(row) => {
          setRenaming(null);
          if (row.canDelete && row.archivedAt === null) remove(row);
          else askArchive(row);
        }}
        onArchive={(row) => {
          setRenaming(null);
          askArchive(row);
        }}
        onMove={(row) => setMoving(row)}
      />


      {/* The head's More: what the web keeps under its ellipsis, in its order.
          The calendars are reachable both ways, as there. */}
      <RowActionSheet
        open={moreOpen}
        actions={[
          ...tools.moreFirst.map((tool) => MORE_FIRST[tool]),
          { label: "Edit thread", icon: "pencil", run: () => setEditingThread("name") },
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
          ...(thread.calendars && !tools.moreFirst.includes("calendars")
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
        open={archiving !== null}
        title={archiveAsk(archiving?.title ?? "")}
        body={ARCHIVE_SHARED}
        action="Archive"
        danger
        onConfirm={() => {
          const row = archiving;
          setArchiving(null);
          if (row) archive(row);
        }}
        onClose={() => setArchiving(null)}
      />
      <ConfirmSheet
        open={leaving}
        title={leaveAsk(thread.name)}
        body="Your membership and your access go. What you added stays with the others, and the thread is theirs to keep."
        action="Leave"
        danger
        busy={leaveBusy}
        failed={leaveFailed}
        onConfirm={() => void leave()}
        onClose={() => setLeaving(false)}
      />
      {editingThread ? (
        <EditThreadSheet thread={thread} from={editingThread} onClose={() => setEditingThread(null)} onSave={saveThread} />
      ) : null}
      <MoveSheet
        open={moving !== null}
        exceptThreadId={id}
        onClose={() => setMoving(null)}
        onPick={(thread) => {
          if (moving) move(moving, thread.id, thread.name);
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
      {noteSheet}
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
  look,
  onEdit,
  onBack,
  calendars,
  onCalendars,
  onMore,
  onShare,
  onLabels,
  mapSwitch,
}: {
  /** 030. The List | Map switch, after the title and before share. */
  mapSwitch?: ReactNode;
  /** Neither while the thread loads: the bar is the back chevron alone. */
  title?: string;
  /** 037. The thread's icon, before its name. Absent while it loads. */
  look?: { id: string; icon: string; hue: number };
  /** Opens Edit thread, from the icon or from the name. */
  onEdit?: (from: "icon" | "name") => void;
  onBack: () => void;
  calendars: { picked: number; total: number } | null;
  onCalendars: () => void;
  onMore?: () => void;
  /** 022. Absent on the default thread. */
  onShare?: (() => void) | undefined;
  /** 2026-09-29. Only while the thread has no labels. */
  onLabels?: (() => void) | undefined;
}) {
  const COLOR = useColors();
  return (
    <View className={`${isAndroid ? "h-a-appbar-height" : "h-appbar-height"} flex-row items-center gap-space-4 px-gutter-screen`}>
      <Pressable onPress={onBack} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back">
        <Glyph name="chevron-left" size={22} color={COLOR.iconOnWell} />
      </Pressable>
      {/* 037. The icon and the name both open Edit thread. One button to a
          screen reader; a tap on the name is what opens the keyboard. The
          name gives way before any tool. */}
      <Pressable
        className="flex-1 flex-row items-center"
        style={{ gap: isAndroid ? 12 : 10 }}
        onPress={() => onEdit?.("name")}
        disabled={!onEdit}
        accessibilityRole="button"
        accessibilityLabel={title ? `${title}, edit thread` : undefined}
      >
        {look ? (
          <Pressable onPress={() => onEdit?.("icon")} hitSlop={8} disabled={!onEdit} accessible={false}>
            <ThreadIcon icon={look.icon} hue={look.hue} seed={look.id} size={28} />
          </Pressable>
        ) : null}
        <Text
          numberOfLines={1}
          className={`flex-1 font-core ${isAndroid ? "text-a-on" : "font-semibold text-text-primary"}`}
          style={{ fontSize: isAndroid ? 22 : 17 }}
        >
          {title}
        </Text>
      </Pressable>
      {/* Bare glyphs, as the back chevron and every bar control on the phones:
          the kit's `IconButton` in a bar is the ghost one, and a filled circle
          here read as a state. Share first, then the calendar, then More: the
          web's aside, tools and ellipsis, in that order. */}
      {onMore ? (
      <View className="flex-row items-center gap-space-5">
        {mapSwitch}
        {onLabels ? (
          <Pressable onPress={onLabels} hitSlop={10} accessibilityRole="button" accessibilityLabel="Group with labels">
            <Glyph name="tag" size={21} color={COLOR.iconOnWell} />
          </Pressable>
        ) : null}
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
  const [draft, setDraft] = useState(initial);
  const field = useRef<TextInput>(null);

  function save(): void {
    const text = draft.trim();
    if (text.length === 0) return onClose();
    onSave(text);
  }

  return (
    <>
      <DragSheet
        onClose={onClose}
        keyboard="lift"
        className="px-gutter-screen pb-space-8 pt-space-2"
        onOpen={() => field.current?.focus()}
      >
        <TextInput
          ref={field}
          value={draft}
          onChangeText={setDraft}
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
      </DragSheet>
    </>
  );
}
