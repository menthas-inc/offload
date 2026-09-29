"use client";

// One thread. From ui_kits/web_app/WThing.jsx.
//
// Head with the faces and the name, offload's standing read of the thread, then
// everything in it. The kit also draws a To do section, a map, a timeline and a
// file grid; none of them can exist until 006 produces tasks, dates and places,
// and a widget drawn over nothing is a widget drawn for nobody. They arrive
// in 007.
//
// **Two divergences from the kit, each logged in the design system's
// decisions.md:** the kit draws `trash-2` on every row where delete is the
// author's alone, and no kit draws an archived state though every kit draws an
// archive control.

import { ALL_LABELS, changeToken, isAll, keepLive, listLabelledCopy, nameList, rowLabelledCopy, type LabelPick } from "@offload/widgets";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Icon } from "../Icon";
import styles from "../../app/(shell)/shell.module.css";
import { PaneHead } from "../shell/PaneHead";
import { CalendarsTool } from "../shell/CalendarsPopover";
import { Notes } from "./Notes";
import { Timeline } from "./Timeline";
import { ContentRowView, type RowHandlers } from "./ContentRowView";
import { useThreads } from "../shell/threads-context";
import { useToast } from "../shell/Toast";
import { perform, useWrites } from "../../lib/optimistic";
import { Widgets } from "./Widgets";
import {
  cadenceLabel,
  datedFor,
  splitRepeating,
  widgetsFor,
  type ReorderWrite,
} from "../../lib/widgets";
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
  provisionalNote,
  provisionalRow,
  quickAdd,
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
import { PhotoViewer, type ViewerPhoto } from "../shell/PhotoViewer";
import { Avatar } from "../Avatar";
import { ShareModal } from "../people/ShareModal";
import { EditModal } from "./EditModal";
import { ConfirmModal } from "../people/Modal";
import { useRouter } from "next/navigation";
import { useClock } from "../../lib/clock";
import { drawnWhen } from "../../lib/when";
import { FilterBar } from "../labels/FilterBar";
import { LabelPopover, type LabelChoice } from "../labels/LabelPopover";
import { LabelList, type ListSave } from "../labels/LabelList";
import labelStyles from "../labels/labels.module.css";
import {
  createLabel,
  deleteLabel,
  labelRows,
  refusalLine,
  restoreLabel,
  type Label,
} from "../../lib/labels";

/** 025. The filter bar's pick, kept per thread on this device and nowhere
 *  else. Storage can be missing or refuse, and then the pick is All. */
const pickKey = (threadId: string) => `offload.labels.${threadId}`;
function readPick(threadId: string): LabelPick {
  try {
    const raw = window.localStorage.getItem(pickKey(threadId));
    if (!raw) return ALL_LABELS;
    const parsed = JSON.parse(raw) as Partial<LabelPick>;
    return {
      labels: Array.isArray(parsed.labels) ? parsed.labels.filter((id): id is string => typeof id === "string") : [],
      none: parsed.none === true,
    };
  } catch {
    return ALL_LABELS;
  }
}
function writePick(threadId: string, pick: LabelPick): void {
  try {
    if (isAll(pick)) window.localStorage.removeItem(pickKey(threadId));
    else window.localStorage.setItem(pickKey(threadId), JSON.stringify(pick));
  } catch {
    // A pick that is not kept is still the pick on screen.
  }
}

interface Props {
  id: string;
  onChanged: () => void;
}

export function Thread({ id, onChanged }: Props) {
  const [thread, setThread] = useState<ThreadBundle | null>(null);
  // 025. The filter bar's pick, the label sheet open on a row, and the label's
  // list open for a label (or for a new one, `null`).
  const [pick, setPickState] = useState<LabelPick>(ALL_LABELS);
  const [labelling, setLabelling] = useState<{ row: ContentRow; anchor: HTMLElement } | null>(null);
  const [listing, setListing] = useState<{ label: Label | null } | null>(null);
  const [listLine, setListLine] = useState<string | null>(null);
  const [rows, setRows] = useState<ContentRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  // Lifted out of `Notes` so the pane head's More menu can open the editor. It
  // is also the answer to a cost that section had accepted: a thread with no
  // notes drew nothing, so there was nowhere to type the first one.
  const [addingNote, setAddingNote] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [editRow, setEditRow] = useState<ContentRow | null>(null);
  const [draft, setDraft] = useState("");
  const [renaming, setRenaming] = useState(false);
  // 019. The calendars popover, and a counter bumped when the picks change so
  // the rail reads the calendars again.
  const [calendarsOpen, setCalendarsOpen] = useState(false);
  const [calendarsVersion, setCalendarsVersion] = useState(0);
  // Which row is asking to be deleted. The kit asks in the row's own place
  // rather than in a dialog, so the question never covers what it is about.
  const [asking, setAsking] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const input = useRef<HTMLInputElement>(null);
  // What arrived while this screen was open, so it can be marked for a moment
  // rather than appearing silently in the middle of a list.
  const [arrived, setArrived] = useState<Set<string>>(new Set());
  const { filed } = useThreads();
  // 020. The photo open in the viewer, by row id. The set it pages through is
  // every photo row on the page, in the page's order.
  const [viewing, setViewing] = useState<string | null>(null);
  const toast = useToast();
  const router = useRouter();
  // 023. The clock the rail and a freshly saved date are drawn in.
  const { zone } = useClock();
  // 022. The share modal, and Leave with its confirmation.
  const [sharing, setSharing] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [leaveBusy, setLeaveBusy] = useState(false);
  const [leaveFailed, setLeaveFailed] = useState(false);
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
    toast.show(result.deleted ? "Thread deleted" : "You left the thread", {
      label: "Undo",
      onPress: async () => {
        await restoreThread(id);
        onChanged();
      },
    });
    onChanged();
    router.push("/threads");
  }
  // Every write here is drawn before it is sent. `writes` counts what is in
  // flight and reloads once nothing is; a reload that lands while something
  // still is gets dropped, or it would undo the change on screen for the
  // length of a round trip.
  const writes = useWrites(load);

  /** The pick as the content read takes it. */
  const filterOf = (current: LabelPick): { labels?: string[]; unlabelled?: boolean } => ({
    ...(current.labels.length > 0 ? { labels: current.labels } : {}),
    ...(current.none ? { unlabelled: true } : {}),
  });

  async function load(): Promise<void> {
    const [bundle, page] = await Promise.all([
      fetchThread(id),
      fetchContent(id, { archived: showArchived, ...filterOf(pick) }),
    ]);
    if (!writes.idle()) return;
    setThread(bundle);
    setRows(page?.rows ?? []);
    setCursor(page?.nextCursor ?? null);
  }

  /** Reload, and mark whatever was not here before.
   *
   *  The diff is done here rather than asked of the server: the client already
   *  knows what it was showing, and a "what changed since" parameter would be a
   *  second source of truth about the same question. */
  async function catchUp(): Promise<void> {
    // 023. Keyed on the row's change token, not on whether it was here: a row
    // already on screen whose date offload moved flashes too.
    const before = new Map(rows.map((row) => [row.id, changeToken(row)]));
    const [bundle, page] = await Promise.all([
      fetchThread(id),
      fetchContent(id, { archived: showArchived, ...filterOf(pick) }),
    ]);
    if (!writes.idle()) return;
    const next = page?.rows ?? [];
    setThread(bundle);
    setRows(next);
    setCursor(page?.nextCursor ?? null);

    const fresh = next.filter((row) => before.get(row.id) !== changeToken(row)).map((row) => row.id);
    if (fresh.length === 0) return;
    setArrived(new Set(fresh));
  }

  // offload filed into a thread while somebody was looking at it. The composer
  // floats over every tab, so this is the ordinary case rather than an edge
  // one, and before this the page went on showing what it held a moment ago
  // while the reply said otherwise.
  //
  // `filed.at` is in the dependency list on purpose: filing into the same
  // thread twice running produces an identical id list, and without the
  // timestamp the second one would not re-run this.
  const lastFiled = useRef(0);
  useEffect(() => {
    if (!filed || filed.at === lastFiled.current) return;
    // Guarded by the timestamp rather than by a narrowed dependency list, so
    // the effect can depend on the whole value and still run exactly once per
    // turn. Filing into the same thread twice running produces an identical id
    // list, which is why the guard is a clock and not the ids.
    lastFiled.current = filed.at;
    // An empty list means "something changed, work out what", which is what
    // Undo sends because it does not carry the threads it reversed.
    if (filed.threadIds.length > 0 && !filed.threadIds.includes(id)) return;
    void catchUp();
  }, [filed, id]);

  // The mark is a moment, not a state. Cleared on a timer rather than on the
  // next render, so it survives the reload that produced it.
  useEffect(() => {
    if (arrived.size === 0) return;
    const timer = setTimeout(() => setArrived(new Set()), 1400);
    return () => clearTimeout(timer);
  }, [arrived]);

  useEffect(() => {
    let live = true;
    void (async () => {
      const [bundle, page] = await Promise.all([
        fetchThread(id),
        fetchContent(id, { archived: showArchived, ...filterOf(pick) }),
      ]);
      if (!live) return;
      setThread(bundle);
      setRows(page?.rows ?? []);
      setCursor(page?.nextCursor ?? null);
    })();
    return () => {
      live = false;
    };
  }, [id, showArchived, pick]);

  // 025. The kept pick, read once per thread, and less any label that has
  // since been deleted once the thread's labels are known.
  useEffect(() => {
    setPickState(readPick(id));
  }, [id]);
  useEffect(() => {
    if (!thread) return;
    const live = keepLive(pick, thread.labels.map((label) => label.id));
    if (live.labels.length !== pick.labels.length) setPick(live);
  }, [thread]);

  function setPick(next: LabelPick): void {
    setPickState(next);
    writePick(id, next);
  }

  async function more(): Promise<void> {
    if (!cursor) return;
    const page = await fetchContent(id, { cursor, archived: showArchived, ...filterOf(pick) });
    if (!page) return;
    setRows((current) => [...current, ...page.rows]);
    setCursor(page.nextCursor);
  }

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
  /** The sidebar and the crumb are the route's, and they change with a
   *  count or a name. */
  const telling = async (write: Promise<boolean>): Promise<boolean> => {
    const ok = await write;
    if (ok) onChanged();
    return ok;
  };

  function saveTitle(row: ContentRow): void {
    const title = draft.trim();
    setEditing(null);
    rename(row, title);
  }

  /** 023. The modal's Save: every changed field in one request, drawn first
   *  and sent second, with the previous values as the Undo. The dates are
   *  drawn from the server's answer, which reads a wall time in the account's
   *  clock, so the page catches up once the write lands. */
  function edit(row: ContentRow, patch: ContentPatch): void {
    if (isProvisional(row.id)) return;
    const drawn: Partial<ContentRow> = {};
    if (patch.title !== undefined) drawn.title = patch.title;
    if (patch.body !== undefined) drawn.body = patch.body;
    if (patch.isReminder !== undefined) drawn.isReminder = patch.isReminder;
    // The dates too, read in the account's clock exactly as the route reads
    // them, so the chip moves with the toast.
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
          telling(
            editContent(row.id, patch).then((result) => {
              if (!result) return false;
              previous = result.previous;
              void catchUp();
              return true;
            }),
          ),
        unwrite: () =>
          telling(
            (previous ? editContent(row.id, previous) : Promise.resolve(null)).then((result) => {
              if (result) void catchUp();
              return result !== null;
            }),
          ),
        did: "Saved",
        failed: "Couldn't save that",
        unfailed: "Couldn't put it back",
      },
      toast,
      writes,
    );
  }

  function rename(row: ContentRow, title: string): void {
    if (!title || title === row.title || isProvisional(row.id)) return;
    void perform(
      {
        apply: () => patchRow(row.id, { title }),
        revert: () => patchRow(row.id, { title: row.title }),
        write: () => telling(editContent(row.id, { title }).then((result) => result !== null)),
        unwrite: () =>
          telling(editContent(row.id, { title: row.title }).then((result) => result !== null)),
        did: "Renamed",
        failed: "Couldn't rename that",
        unfailed: "Couldn't put the name back",
      },
      toast,
      writes,
    );
  }

  /** 020. Move, by hand, from the viewer. The author's, like delete, and the
   *  picture goes with the row: the server adjusts its wraps in the same
   *  transaction. The row leaves this list at the press and comes back if the
   *  server refuses; Undo is the same move back. */
  function move(row: ContentRow, threadId: string): void {
    if (isProvisional(row.id)) return;
    setViewing(null);
    const at = rows.findIndex((one) => one.id === row.id);
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
        write: () => telling(moveContent(row.id, threadId).then((moved) => moved !== null)),
        unwrite: () => telling(moveContent(row.id, id).then((moved) => moved !== null)),
        did: "Moved",
        failed: "Couldn't move that",
        unfailed: "Couldn't put that back",
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
        write: () => telling(setArchived(row.id, !wasArchived)),
        unwrite: () => telling(setArchived(row.id, wasArchived)),
        did: wasArchived ? "Back in the thread" : "Archived",
        failed: wasArchived ? "Couldn't put that back" : "Couldn't archive that",
        unfailed: wasArchived ? "Couldn't archive that" : "Couldn't put that back",
      },
      toast,
      writes,
    );
  }

  function remove(row: ContentRow): void {
    setAsking(null);
    if (isProvisional(row.id)) return;
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
        write: () => telling(deleteContent(row.id)),
        // Restore is the undo for delete as well as for archive: one endpoint
        // clears `deleted_at`, `purge_after` and `archived_at` together.
        unwrite: () => telling(setArchived(row.id, false)),
        // The readme's own line, verbatim from the kit.
        did: "Deleted, gone in a moment",
        failed: "Couldn't delete that",
        unfailed: "Couldn't put that back",
      },
      toast,
      writes,
    );
  }

  /** Tick, or put it back. Any member: a thread's contents belong to everybody
   *  in it and neither direction destroys anything. The box moves at the
   *  press; the row sinks or rises with it, since the lists derive that from
   *  the row. No toast: the kits tick without one, and the box is its own
   *  undo. */
  function toggle(row: ContentRow): void {
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

  /** A row was dragged somewhere else in To do.
   *
   *  The writes are priorities, computed by the list from the rows either side
   *  of the drop, and each one goes through the same endpoint a priority has
   *  always gone through, which pins it. Usually one write; a re-spread of the
   *  list is several, and Undo puts every one of them back. */
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
    if (!thread) return;
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

  /** The notes are the thread's, and the section under the widgets draws
   *  them, so a change it draws early is written here. */
  const patchNotes = (update: (notes: Note[]) => Note[]): void =>
    setThread((current) => (current ? { ...current, notes: update(current.notes) } : current));

  /** Something typed straight into a section, or into a day on the rail.
   *
   *  **The row is drawn at the press**, with the words as its title and the
   *  same spinner a typed-in row carries while offload reads it, which is what
   *  it will be the moment the server has it. The server's id replaces the
   *  made-up one when the write lands; if it does not, the row goes and the
   *  toast offers the same words again. A section with no widget type to
   *  start as, Files, writes a note, so its row is drawn among the notes. */
  function add(text: string, section: string, day?: string): void {
    if (!thread) return;
    const you = thread.members.find((member) => member.isYou) ?? null;
    const author = { accountId: you?.accountId ?? null, displayName: you?.displayName ?? "you" };
    const type = startsAs(section);
    const row = type ? provisionalRow(text, type, author, day) : null;
    const note = type ? null : provisionalNote(text, author.accountId);
    void perform(
      {
        apply: () => {
          if (row) setRows((current) => [row, ...current]);
          if (note) patchNotes((current) => [...current, note]);
        },
        revert: () => {
          if (row) dropRow(row.id);
          if (note) patchNotes((current) => current.filter((one) => one.id !== note.id));
        },
        // The request is made here rather than outside, so Retry sends it
        // again rather than awaiting the refusal it already has.
        write: async () => {
          const landed = await quickAdd(id, text, section, day ? { day } : undefined);
          if (!landed) return false;
          if (row) patchRow(row.id, { id: landed.id });
          if (note) patchNotes((current) => current.map((one) => (one.id === note.id ? { ...one, id: landed.id } : one)));
          return true;
        },
        failed: "Couldn't add that",
      },
      toast,
      writes,
    );
  }

  // ------------------------------------------------------------- 025 labels

  /** Reread the bundle and the page, for the labels' counts and the filter,
   *  once a label write has landed. */
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
            const result = await createLabel(id, { name });
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
    setListLine(null);
    if (label === null) {
      const rows = { content: save.add.content, notes: save.add.notes };
      const result = await createLabel(id, { name: save.name, ...(save.colour ? { colour: save.colour } : {}), rows });
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

  async function saveName(): Promise<void> {
    const name = nameDraft.trim();
    setRenaming(false);
    if (!thread || !name || name === thread.name) return;

    const result = await renameThread(id, name);
    if (!result) return;
    await load();
    onChanged();
    toast.show("Renamed", {
      label: "Undo",
      onPress: async () => {
        await renameThread(id, result.previous.name);
        await load();
        onChanged();
      },
    });
  }

  if (!thread) return <div className={styles.paneBody} />;

  // What the widgets took. A piece of content appears once on this screen: if
  // a task is in the to-do list and a place is on the map, printing them again
  // below is the same information twice and makes the list look longer than
  // the thread is.
  const inWidgets = showArchived
    ? new Set<string>()
    : new Set(
        widgetsFor(rows, thread.preference.widgets).flatMap((widget) =>
          widget.rows.map((row) => row.id)
        )
      );
  // **Anything with a date already has a home, so this does not repeat it.**
  // The rail above draws every dated row and its day lists them, which is where
  // an event belongs; showing it again in the leftover list is the same row in
  // two places on one screen. Taken from what the rail actually draws rather
  // than from a type check, so the two cannot disagree about what is on it.
  //
  // **Only while the rail is on screen.** The archived view hides it, and
  // taking dated rows out of a list that is the only list there makes an
  // archived event invisible. The two have to be decided together, which is
  // why this reads the same flag the rail does.
  // **And the rail is earned.** With nothing dated there is no rail at all,
  // which 015's own opening paragraph said and its AC-1 contradicted; a week of
  // empty cells above a list is a calendar for nothing. Computed once, so the
  // rail and the list agree about what is on it.
  // 025. The notes are all in the bundle, so they are narrowed here; the rows
  // came narrowed from the server.
  const filtering = !isAll(pick);
  const notes = filtering
    ? thread.notes.filter((note) =>
        note.labels.length === 0 ? pick.none : note.labels.some((labelId) => pick.labels.includes(labelId)),
      )
    : thread.notes;
  const pickedNames = thread.labels.filter((label) => pick.labels.includes(label.id)).map((label) => label.name);
  const dated = showArchived ? [] : datedFor(rows, notes, zone);
  const onRail = new Set(dated.map((one) => one.rowId));
  // 019. A pick earns the rail on its own: a thread with a calendar and
  // nothing dated shows this week, with the calendar's events on it.
  // A calendar's events carry no labels, so under a filter they are not shown.
  const railEarned = dated.length > 0 || (!filtering && thread.calendars?.anyPicked === true);

  // **A repeating thing is one row here, not thirty.** A weekly class filed as
  // thirty occurrences spends thirty rows saying what the row above said, and
  // pushes everything that happened once off the bottom. The rail draws every
  // occurrence, because a calendar has a cell per day already and repetition
  // there is free; a list has no grid, so it collapses and says how often.
  //
  // *This was the timeline widget's job until 015 deleted the widget, and the
  // main list kept all thirty. It is the list's job now, which is what the rule
  // was always about.*
  const { once, repeating } = splitRepeating(
    rows.filter((row) => !inWidgets.has(row.id) && !onRail.has(row.id))
  );
  const rest = once;

  // "Everything else" once something has been lifted out, "Everything in here"
  // when nothing has: else what, otherwise.
  /** Everything a row needs from this page, in one place, so the list and the
   *  widgets cannot end up offering different controls on the same row. */
  const handlers: RowHandlers = {
    editing,
    draft,
    asking,
    arrived,
    onDraft: setDraft,
    // 023. A content row edits in the modal, which holds the title, the
    // details and the when field; the inline field stays for a thread's name.
    onEdit: (row) => {
      if (isProvisional(row.id)) return;
      setEditRow(row);
    },
    onSaveTitle: saveTitle,
    onStopEditing: () => setEditing(null),
    onArchive: archive,
    onAsk: (rowId) => setAsking(rowId && isProvisional(rowId) ? null : rowId),
    onDelete: remove,
    // 020. A photo row's tile, and a tile in Files, open the viewer.
    onOpenPhoto: (row) => setViewing(row.id),
    // 025. The marks, the tag tool and a mark's list.
    labels: new Map(thread.labels.map((label) => [label.id, label])),
    onLabel: (row, anchor) => setLabelling({ row, anchor }),
    onOpenLabel: (labelId) => {
      const label = thread.labels.find((one) => one.id === labelId);
      if (label) {
        setListLine(null);
        setListing({ label });
      }
    },
  };

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

  const restHeading =
    inWidgets.size > 0 ? "Everything else" : "Everything in here";

  const others = thread.members.filter((member) => !member.isYou);

  return (
    <>
      <PaneHead
        title={
          renaming ? (
            <input
              ref={input}
              className={styles.titleInput}
              value={nameDraft}
              autoFocus
              onChange={(event) => setNameDraft(event.target.value)}
              onBlur={() => void saveName()}
              onKeyDown={(event) => {
                if (event.key === "Enter") void saveName();
                if (event.key === "Escape") setRenaming(false);
              }}
              aria-label="Thread name"
            />
          ) : (
            thread.name
          )
        }
        // The line My threads draws, from the server (2026-09-29).
        sub={thread.line || undefined}
        fullHref={`/threads/${id}`}
        aside={
          <>
            {/* Who is already in, then the share control: the same order as
                the phones, and the order WPaneHead's `aside` puts them in. */}
            {/* 022. The others' marks, without you, as `WFaces` draws them,
                each a door to the person. */}
            <div className={styles.faces}>
              {others.map((member) => (
                <Link key={member.accountId} href={`/people/${member.accountId}`} className={styles.faceDoor} title={member.displayName}>
                  <Avatar uid={member.accountId} initials={member.initials} name={member.displayName} size={36} />
                </Link>
              ))}
            </div>

            {/* 022. Alive, except on the default thread, where it is not
                drawn: every dump with no obvious home lands there. */}
            {thread.shareable ? (
              <button type="button" className={styles.shareButton} onClick={() => setSharing(true)}>
                <Icon name="share-2" size={15} />
                Share
              </button>
            ) : null}
          </>
        }
        tools={
          <>
            {/* 2026-09-29. Labels' way in while the thread has none: it changes
                what the pane shows, which is the head's criterion. The filter
                bar's plus takes over once there is one. */}
            {showArchived || thread.labels.length > 0 ? null : (
              <button
                type="button"
                className={styles.tool}
                aria-label="Group with labels"
                title="Group with labels"
                onClick={() => {
                  setListLine(null);
                  setListing({ label: null });
                }}
              >
                <Icon name="tag" size={16} />
              </button>
            )}
            {/* 019. Drawn whenever the account has a calendar connection at
                all; with none there is nothing to open. */}
            {thread.calendars ? (
              <CalendarsTool
                threadId={id}
                threadName={thread.name}
                members={thread.members.length}
                counts={thread.calendars}
                open={calendarsOpen}
                onOpenChange={setCalendarsOpen}
                onChanged={() => {
                  setCalendarsVersion((v) => v + 1);
                  void fetchThread(id).then((bundle) => {
                    if (bundle) setThread(bundle);
                  });
                }}
              />
            ) : null}
          </>
        }
        more={[
          {
            label: "Rename thread",
            icon: "pencil",
            onSelect: () => {
              setNameDraft(thread.name);
              setRenaming(true);
            },
          },
          {
            label: "Add a note",
            icon: "brain",
            onSelect: () => {
              setShowArchived(false);
              setAddingNote(true);
            },
          },
          // 019. Reachable both ways: the tool on the head and a row here.
          ...(thread.calendars
            ? [
                {
                  label: "Calendars in this thread",
                  icon: "calendar",
                  onSelect: () => setCalendarsOpen(true),
                },
              ]
            : []),
          // 022. Leave, on a thread with more than one member, confirmed. It
          // does what My threads' Delete does on a shared thread, Undo
          // included; alone in a thread, that Delete is the whole story.
          ...(thread.members.length > 1 ? [{ label: "Leave this thread", icon: "x", onSelect: () => setLeaving(true) }] : []),
        ]}
      />
      {sharing ? (
        <ShareModal
          threadId={id}
          threadName={thread.name}
          viewerId={thread.members.find((m) => m.isYou)?.accountId ?? null}
          onClose={() => setSharing(false)}
          onChanged={() => {
            void fetchThread(id).then((bundle) => {
              if (bundle) setThread(bundle);
            });
          }}
        />
      ) : null}
      {leaving ? (
        <ConfirmModal
          title={`Leave ${thread.name}?`}
          body="Your membership and your access go. What you added stays with the others, and the thread is theirs to keep."
          action="Leave"
          danger
          busy={leaveBusy}
          failed={leaveFailed}
          onConfirm={() => void leave()}
          onClose={() => setLeaving(false)}
        />
      ) : null}

      <div className={styles.paneBody}>
        {/* 025. The filter bar, sticky under the pane head. Not on the
            archived view, which is its own list. */}
        {showArchived ? null : (
          <FilterBar
            labels={thread.labels}
            unlabelled={thread.counts.unlabelled}
            pick={pick}
            onPick={setPick}
            onNew={() => {
              setListLine(null);
              setListing({ label: null });
            }}
            onOpen={(labelId) => handlers.onOpenLabel?.(labelId)}
          />
        )}
        {filtering && !showArchived && rows.length === 0 && notes.length === 0 ? (
          <p className={labelStyles.nothing}>
            {pickedNames.length > 0 ? `Nothing under ${nameList(pickedNames)} yet.` : "Nothing without a label yet."}
          </p>
        ) : null}
        {labelling ? (
          <LabelPopover
            anchor={labelling.anchor}
            title={labelling.row.title}
            labels={thread.labels}
            carried={labelling.row.labels}
            onDone={(choice) => labelRow(labelling.row, choice)}
            onClose={() => setLabelling(null)}
          />
        ) : null}
        {listing ? (
          <LabelList
            key={listing.label?.id ?? "new"}
            threadId={id}
            label={listing.label}
            labels={thread.labels}
            notes={thread.notes}
            widgets={thread.preference.widgets}
            freeColour={Array.from({ length: 10 }, (_, i) => i + 1).find((c) => !thread.labels.some((l) => l.colour === c)) ?? 1}
            line={listLine}
            onSave={(save) => void saveList(listing.label, save)}
            onDelete={() => listing.label && void removeLabel(listing.label)}
            onClose={() => setListing(null)}
          />
        ) : null}
        {/* No summary, nothing drawn. `WThing.jsx` has `{st ? ... : null}` and
            it is right: a line saying offload has not done something is not
            information, it is an apology taking up the most prominent space on
            the screen. Nothing writes summaries yet, so today this is always
            absent, and the day one lands the block appears with something in
            it. The phones draw a placeholder and should stop. */}
        {thread.standing ? (
          <>
            <p className={styles.standing}>{thread.standing}</p>
            <p className={styles.wrote}>
              <Icon name="sparkles" size={13} />
              offload wrote this
            </p>
          </>
        ) : null}

        {/* Widgets first, then everything. A widget is a view over the same
            rows the list below shows, so a piece removed from one is gone from
            both, and nothing here costs a second query. */}
        {/* The rail is above the widgets, and only on a thread with something
            dated. It is not a widget: it lists every kind with a date rather
            than one, which is why 015 took it out of the widget set. */}
        {showArchived || !railEarned ? null : (
          <Timeline
            // Keyed by the thread, so the day you were reading and the gaps you
            // opened do not follow you into the next one. Without it, opening a
            // thread after picking 3 October in another one lands on 3 October
            // rather than on today.
            key={id}
            threadId={id}
            rows={rows}
            notes={notes}
            handlers={handlers}
            onToggle={toggle}
            onAdd={(text, day) => add(text, "timeline", day)}
            calendars={{ anyPicked: !filtering && thread.calendars?.anyPicked === true, version: calendarsVersion }}
          />
        )}

        {viewerIndex >= 0 ? (
          <PhotoViewer
            photos={viewerSet}
            index={viewerIndex}
            threadId={id}
            onIndex={(index) => setViewing(photoRows[index]?.id ?? null)}
            onClose={() => setViewing(null)}
            actions={{
              onRename: (row, title) => rename(row, title),
              onMove: (row, thread) => move(row, thread.id),
              onArchive: (row) => {
                setViewing(null);
                return archive(row);
              },
              onDelete: (row) => {
                setViewing(null);
                return remove(row);
              },
            }}
          />
        ) : null}

        {editRow ? (
          <EditModal
            key={editRow.id}
            row={editRow}
            onClose={() => setEditRow(null)}
            onSave={(row, patch) => {
              setEditRow(null);
              edit(row, patch);
            }}
          />
        ) : null}

        {showArchived ? null : (
          <Widgets
            rows={rows}
            preference={thread.preference}
            handlers={handlers}
            onAdd={add}
            onToggle={toggle}
            onFold={fold}
            onReorder={reorder}
          />
        )}

        {/* Notes sit between the widgets and the list, not at the foot.
            "Everything in here" has no cap and no pagination, so a section
            under it becomes undiscoverable on exactly the threads with most to
            say. A bounded set belongs next to the other bounded thing on the
            page. */}
        {showArchived ? null : (
          <Notes
            threadId={id}
            notes={notes}
            counts={thread.noteCounts}
            members={thread.members}
            arrived={arrived}
            adding={addingNote}
            onAdding={setAddingNote}
            onNotes={patchNotes}
            writes={writes}
          />
        )}

        {/* A heading with nothing under it is a section announcing its own
            absence, and there is no exception: the way to the archived pile is
            a row below the list, so the heading never has to survive in order
            to carry it. */}
        {rest.length === 0 ? null : (
          <h2 className={styles.section}>
            {showArchived ? "Archived" : restHeading}
            {/* The count is what is in this list, so it is only shown once the
                whole list is loaded. A number that counts one page is a number
                that disagrees with the list under it the moment somebody
                scrolls. */}
            {cursor ? null : (
              <em className={styles.sectionCount} data-tone="accent">
                {rest.length + repeating.length}
              </em>
            )}
          </h2>
        )}

        {/* "Everything in this thread is above" is a line with nothing under
            it saying so, which is the same noise an empty heading was. The
            content is visibly above; the sentence adds a row to say so. What
            stays is the genuinely empty thread, which has nothing else on the
            screen and does need telling. */}
        {rest.length === 0 && (showArchived || inWidgets.size === 0) ? (
          filtering && !showArchived ? null : <p className={styles.empty}>
            {showArchived
              ? "Nothing archived here."
              : "Nothing in this one yet. Dump something on Today and offload will file it."}
          </p>
        ) : rest.length === 0 && repeating.length === 0 ? null : (
          [
            // One row per series, standing for all of its occurrences, with
            // how often and how many held where its own date would be. **The
            // occurrences are counted, never hidden**, and the rail still draws
            // every one of them.
            ...repeating.map((series) => (
              <ContentRowView
                key={series.ref}
                row={series.row}
                handlers={handlers}
                lead={
                  <span className={styles.rowIcon}>
                    <Icon name={rowIcon(series.row.type)} size={18} />
                  </span>
                }
                meta={
                  <span className={styles.rowMeta}>
                    {cadenceLabel(series.everyDays) ?? `${series.count} dates`}
                    {cadenceLabel(series.everyDays) ? ` · ${series.count} held` : ""}
                  </span>
                }
              />
            )),
            ...rest.map((row) => (
            <ContentRowView
              key={row.id}
              row={row}
              handlers={handlers}
              lead={
                <span className={styles.rowIcon}>
                  <Icon name={rowIcon(row.type)} size={18} />
                </span>
              }
              // 2026-09-29. No author and date on a live row: "you" is most
              // rows and says nothing, and the phones never drew it. An
              // archived row keeps when it was archived, which is the one
              // date there that is useful.
              meta={
                row.archivedAt ? (
                  <span className={styles.rowMeta}>
                    archived{" "}
                    {new Date(row.archivedAt).toLocaleDateString(undefined, {
                      day: "numeric",
                      month: "short",
                    })}
                  </span>
                ) : null
              }
            />
            )),
          ]
        )}

        {cursor ? (
          <button type="button" className={styles.showMore} onClick={() => void more()}>
            Show more
          </button>
        ) : null}

        {/* The way to the archived pile, and the way back: a row under
            everything live rather than a toggle on the pane head. The archive
            is a place you go, and the count reads without hunting for a
            highlighted icon. */}
        {showArchived ? (
          <button
            type="button"
            className={styles.archivedRow}
            onClick={() => setShowArchived(false)}
          >
            <Icon name="chevron-left" size={15} />
            Back to the list
          </button>
        ) : thread.counts.archived > 0 ? (
          <button
            type="button"
            className={styles.archivedRow}
            onClick={() => setShowArchived(true)}
          >
            {thread.counts.archived} archived
            <span className={styles.archivedChevron}>
              <Icon name="chevron-right" size={15} />
            </span>
          </button>
        ) : null}
      </div>
    </>
  );
}

/** The glyph for a piece of content, from its type. The kit's own mapping:
 *  a pin for a place, a link for a link, a picture for a picture. */
export function rowIcon(type: string): string {
  switch (type) {
    case "location":
      return "map-pin";
    case "link":
      return "link";
    case "image":
    case "screenshot":
      return "image";
    case "file":
      return "paperclip";
    case "voice":
      return "mic";
    case "task":
      return "square-check-big";
    case "event":
      return "calendar";
    default:
      return "text-quote";
  }
}
