"use client";

// My threads, as a grid (2026-10-29, `APPLY-2026-10-29-threads-grid.md`).
//
// Three columns of tiles at 1.6 : 1, newest made first, until the person drags
// one; then the grid is in their order, which the chip beside the title
// switches back from without losing it. Activity never moves a tile, and Older
// threads went with the list. Not in a thread is one row above the grid.
//
// A press and a move of 5px drags; a click opens; a right click opens the
// tile's menu. By keyboard a tile is a button: Enter opens, Space picks it up,
// the arrows move it a place (up and down by a row), Space drops it and Escape
// puts it back, with the move said in a live region. A drop is drawn at once
// and written after, with Undo.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  DEFAULT_THREAD_ICON,
  leaveAsk,
  leastUsedHue,
  moveThread,
  ORDER_COPY,
  orderThreads,
  staysWith,
  type Layout,
  type ThreadSort,
} from "@offload/widgets";
import { Icon } from "../Icon";
import { QuietEmpty } from "./QuietEmpty";
import { ThreadTile } from "../ThreadTile";
import { useToast } from "../shell/Toast";
import { InPlace } from "../shell/InPlace";
import { Returned } from "../shell/UndoLine";
import { useThreads } from "../shell/threads-context";
import styles from "../../app/(shell)/shell.module.css";
import page from "./MyThreads.module.css";
import { EditThread } from "./EditThread";
import {
  createThread,
  deleteThread,
  editThread,
  fetchThread,
  putThreadOrder,
  restoreThread,
  type ThreadBundle,
  type ThreadGroup,
  type ThreadOrder,
  type ThreadRow,
} from "../../lib/threads";
import { perform, useWrites } from "../../lib/optimistic";
import { useReducedMotion } from "../../lib/reduced-motion";
import type { Invitation } from "../../lib/people";
import { InvitationStrip } from "../people/InvitationStrip";
import { InvitationModal } from "../people/InvitationModal";
import { ShareModal } from "../people/ShareModal";
import { ConfirmModal } from "../people/Modal";
import type { LooseSummary } from "../../lib/loose";

interface Props {
  groups: ThreadGroup[];
  /** 028. What is not in a thread. Null draws no row. */
  loose?: LooseSummary | null;
  /** 022. Waiting shares, one strip each at the top. */
  invitations?: Invitation[];
  /** 2026-10-29. How the grid is ordered. */
  order?: ThreadOrder;
  loading: boolean;
  /** Refetch the list. */
  onChanged?: () => void;
}

const NEWEST: ThreadOrder = { sort: "newest", ids: [] };
const DRAG_PX = 5;
const EDGE_PX = 64;

/** The grid's columns as laid out, which a container query sets. */
const columnsOf = (el: HTMLElement | null): number =>
  el
    ? Math.max(
        1,
        getComputedStyle(el).gridTemplateColumns.split(" ").filter(Boolean)
          .length,
      )
    : 3;

export function MyThreads({
  groups,
  loose = null,
  invitations = [],
  order = NEWEST,
  loading,
  onChanged,
}: Props) {
  const toast = useToast();
  const router = useRouter();
  const { viewerId } = useThreads();
  const reduced = useReducedMotion();
  const [looking, setLooking] = useState<Invitation | null>(null);
  const [making, setMaking] = useState(false);
  // The order as drawn at the press, until the list read after the write lands.
  const [drawnOrder, setDrawnOrder] = useState<ThreadOrder | null>(null);
  // A move in progress, by pointer or keyboard: the list as it stands.
  const [moving, setMoving] = useState<{
    id: string;
    ids: string[];
    by: "pointer" | "keys";
  } | null>(null);
  const [said, setSaid] = useState("");
  const [menu, setMenu] = useState<string | null>(null);
  const [chipOpen, setChipOpen] = useState(false);
  const [editing, setEditing] = useState<ThreadBundle | null>(null);
  const [sharing, setSharing] = useState<ThreadRow | null>(null);
  const [leaving, setLeaving] = useState<ThreadRow | null>(null);
  const writes = useWrites(async () => onChanged?.());

  // A fresh read takes over from the drawn order, unless a write is still
  // travelling and the read is from before it.
  const idle = writes.idle;
  useEffect(() => {
    if (idle()) setDrawnOrder(null);
  }, [groups, order, idle]);

  const current = drawnOrder ?? order;
  const all = groups.flatMap((group) => group.threads);
  const ordered = all.every((thread) => thread.createdAt)
    ? orderThreads(
        all as (ThreadRow & { createdAt: string })[],
        current.sort,
        current.ids,
      )
    : all;
  const byId = new Map(ordered.map((thread) => [thread.id, thread]));
  const threads = moving
    ? moving.ids.flatMap((id) => byId.get(id) ?? [])
    : ordered;

  const gridRef = useRef<HTMLDivElement>(null);
  const tileRefs = useRef(new Map<string, HTMLElement>());
  const press = useRef<{
    id: string;
    x: number;
    y: number;
    pointer: number;
  } | null>(null);
  const dragged = useRef(false);
  const [float, setFloat] = useState<{
    x: number;
    y: number;
    w: number;
    h: number;
    dx: number;
    dy: number;
  } | null>(null);

  // The others slide to their new places when the order changes. Each cell's
  // place is its layout offset, which neither a scroll nor a slide still
  // running moves: a box read from the screen does, and sliding from that
  // restarted every tile on every pointer move, so the grid jumped. Reduced
  // motion moves them without it.
  const cellRefs = useRef(new Map<string, HTMLElement>());
  const places = useRef<{ key: string; at: Map<string, { x: number; y: number }> }>({ key: "", at: new Map() });
  const orderKey = threads.map((thread) => thread.id).join();
  useLayoutEffect(() => {
    const at = new Map<string, { x: number; y: number }>();
    cellRefs.current.forEach((el, id) => at.set(id, { x: el.offsetLeft, y: el.offsetTop }));
    if (!reduced && places.current.key && places.current.key !== orderKey) {
      at.forEach((now, id) => {
        const was = places.current.at.get(id);
        const el = cellRefs.current.get(id);
        if (!was || !el?.animate || (was.x === now.x && was.y === now.y)) return;
        el.getAnimations?.().forEach((running) => running.cancel());
        el.animate([{ transform: `translate(${was.x - now.x}px, ${was.y - now.y}px)` }, { transform: "none" }], {
          duration: 260,
          easing: "cubic-bezier(0.32, 0.72, 0, 1)",
        });
      });
    }
    places.current = { key: orderKey, at };
  });

  function open(thread: ThreadRow): void {
    router.push(`/threads/${thread.id}?from=threads`);
  }

  const ORDER_PLACE = {
    id: "threads:order",
    icon: "grip-vertical",
    form: "plate",
  } as const;

  function drop(ids: string[]): void {
    const before = current;
    setMoving(null);
    if (ids.join() === ordered.map((thread) => thread.id).join()) return;
    void perform(
      {
        apply: () => setDrawnOrder({ sort: "mine", ids }),
        revert: () => setDrawnOrder(before),
        write: () => putThreadOrder("mine", ids),
        unwrite: () => putThreadOrder(before.sort, before.ids),
        did: ORDER_COPY.did,
        failed: ORDER_COPY.failed,
        place: ORDER_PLACE,
      },
      toast,
      writes,
    );
  }

  function sortBy(sort: ThreadSort): void {
    setChipOpen(false);
    if (sort === current.sort) return;
    const before = current;
    void perform(
      {
        apply: () => setDrawnOrder({ ...before, sort }),
        revert: () => setDrawnOrder(before),
        write: () => putThreadOrder(sort),
        failed: ORDER_COPY.failed,
        place: ORDER_PLACE,
      },
      toast,
      writes,
    );
  }

  function onKey(thread: ThreadRow, event: React.KeyboardEvent): void {
    const held = moving?.by === "keys" && moving.id === thread.id;
    if (event.key === " ") {
      event.preventDefault();
      if (held) drop(moving.ids);
      else
        setMoving({
          id: thread.id,
          ids: ordered.map((one) => one.id),
          by: "keys",
        });
      return;
    }
    if (!held) return;
    const columns = columnsOf(gridRef.current);
    const by = (
      {
        ArrowLeft: -1,
        ArrowRight: 1,
        ArrowUp: -columns,
        ArrowDown: columns,
      } as Record<string, number>
    )[event.key];
    if (by !== undefined) {
      event.preventDefault();
      const ids = moveThread(
        moving.ids,
        thread.id,
        moving.ids.indexOf(thread.id) + by,
      );
      setSaid(ORDER_COPY.moved(ids.indexOf(thread.id) + 1, ids.length));
      setMoving({ ...moving, ids });
    } else if (event.key === "Escape") {
      event.preventDefault();
      setMoving(null);
      setSaid("");
    }
  }

  // Which place the pointer is over: the cells are one size, so it is
  // arithmetic on the grid's box.
  function placeAt(x: number, y: number, count: number): number {
    const box = gridRef.current!.getBoundingClientRect();
    const first = tileRefs.current
      .values()
      .next()
      .value?.getBoundingClientRect();
    if (!first) return 0;
    const columns = columnsOf(gridRef.current);
    const gap = parseFloat(getComputedStyle(gridRef.current!).columnGap) || 0;
    const column = Math.min(
      columns - 1,
      Math.max(0, Math.floor((x - box.left) / (first.width + gap))),
    );
    const row = Math.max(0, Math.floor((y - box.top) / (first.height + gap)));
    return Math.min(count - 1, row * columns + column);
  }

  function onPointerDown(thread: ThreadRow, event: React.PointerEvent): void {
    if (event.button !== 0) return;
    press.current = {
      id: thread.id,
      x: event.clientX,
      y: event.clientY,
      pointer: event.pointerId,
    };
    dragged.current = false;
  }

  function onPointerMove(event: React.PointerEvent): void {
    const held = press.current;
    if (!held) return;
    if (!moving) {
      if (Math.hypot(event.clientX - held.x, event.clientY - held.y) < DRAG_PX)
        return;
      const rect = tileRefs.current.get(held.id)?.getBoundingClientRect();
      if (!rect) return;
      gridRef.current?.setPointerCapture?.(held.pointer);
      dragged.current = true;
      setMenu(null);
      setMoving({
        id: held.id,
        ids: ordered.map((one) => one.id),
        by: "pointer",
      });
      setFloat({
        x: event.clientX,
        y: event.clientY,
        w: rect.width,
        h: rect.height,
        dx: held.x - rect.left,
        dy: held.y - rect.top,
      });
      return;
    }
    if (moving.by !== "pointer") return;
    setFloat((was) =>
      was ? { ...was, x: event.clientX, y: event.clientY } : was,
    );
    // Near the top or bottom the pane scrolls.
    const body = gridRef.current?.closest(`.${styles.paneBody}`);
    const edge = body?.getBoundingClientRect();
    if (body && edge) {
      if (event.clientY < edge.top + EDGE_PX) body.scrollBy(0, -12);
      else if (event.clientY > edge.bottom - EDGE_PX) body.scrollBy(0, 12);
    }
    const to = placeAt(event.clientX, event.clientY, moving.ids.length);
    if (moving.ids.indexOf(moving.id) !== to)
      setMoving({ ...moving, ids: moveThread(moving.ids, moving.id, to) });
  }

  function onPointerUp(): void {
    press.current = null;
    setFloat(null);
    if (moving?.by === "pointer") drop(moving.ids);
  }

  // Clicking away or Escape closes a menu.
  useEffect(() => {
    if (!menu && !chipOpen) return;
    const away = (event: MouseEvent): void => {
      if (!(event.target as Element).closest?.("[data-menu]")) {
        setMenu(null);
        setChipOpen(false);
      }
    };
    const escape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        setMenu(null);
        setChipOpen(false);
      }
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", escape);
    };
  }, [menu, chipOpen]);

  async function remove(thread: ThreadRow): Promise<void> {
    const leaves = (thread.others ?? []).length > 0;
    const result = await deleteThread(thread.id);
    if (!result) {
      toast.show(
        leaves ? "Couldn't leave that thread" : "Couldn't delete that thread",
        { label: "Try again", onPress: () => void remove(thread) },
        { id: thread.id, icon: leaves ? "log-out" : "trash-2", form: "slot" },
      );
      return;
    }
    // The eight seconds are real: the thread is soft-deleted with a
    // `purge_after`. Which of the two happened is said, because leaving
    // destroys nothing.
    toast.show(
      result.deleted ? "Thread deleted" : "You left the thread",
      {
        label: "Undo",
        onPress: async () => {
          await restoreThread(thread.id);
          onChanged?.();
        },
      },
      {
        id: thread.id,
        icon: result.deleted ? "trash-2" : "log-out",
        form: "slot",
      },
    );
    onChanged?.();
  }

  async function edit(thread: ThreadRow): Promise<void> {
    setMenu(null);
    const bundle = await fetchThread(thread.id);
    if (bundle) setEditing(bundle);
    else
      toast.show("Couldn't open that thread", {
        label: "Try again",
        onPress: () => void edit(thread),
      });
  }

  async function saveEdit(
    id: string,
    change: Parameters<typeof editThread>[1],
  ): Promise<void> {
    setEditing(null);
    const result = await editThread(id, change);
    if (!result || "labelsFull" in result)
      toast.show("Couldn't save that", {
        label: "Try again",
        onPress: () => void saveEdit(id, change),
      });
    onChanged?.();
  }

  // 2026-10-07. A thread made by hand: Edit thread as New thread, its colour
  // the one least used here, and the pane opens on it once it is made.
  async function make(
    shown: { name: string; icon: string; hue: number },
    layout?: Layout,
  ): Promise<void> {
    const made = await createThread({
      ...shown,
      ...(layout && layout !== "default" ? { layout } : {}),
    });
    if (!made) {
      toast.show("Couldn't make that thread", {
        label: "Try again",
        onPress: () => void make(shown, layout),
      });
      return;
    }
    onChanged?.();
    router.push(`/threads/${made.id}?from=threads`);
  }

  const strips = invitations.map((invitation) => (
    <InvitationStrip
      key={invitation.memberId}
      invitation={invitation}
      onLook={() => setLooking(invitation)}
    />
  ));
  const modals = (
    <>
      {looking ? (
        <InvitationModal
          invitation={looking}
          onClose={() => {
            setLooking(null);
            onChanged?.();
          }}
          onGone={() => onChanged?.()}
        />
      ) : null}
      {sharing ? (
        <ShareModal
          threadId={sharing.id}
          threadName={sharing.name}
          viewerId={viewerId}
          onClose={() => setSharing(null)}
          onChanged={() => onChanged?.()}
        />
      ) : null}
      {leaving ? (
        <ConfirmModal
          title={leaveAsk(leaving.name)}
          body={staysWith(leaving.others ?? [])}
          action="Leave"
          danger
          onConfirm={() => {
            const held = leaving;
            setLeaving(null);
            void remove(held);
          }}
          onClose={() => setLeaving(null)}
        />
      ) : null}
    </>
  );

  const newThread = (
    <span className={`${styles.paneTools} ${styles.paneToolsAnchor}`}>
      <button
        type="button"
        className={styles.tool}
        aria-label="New thread"
        title="New thread"
        aria-haspopup="dialog"
        onClick={() => setMaking(true)}
      >
        <Icon name="plus" size={16} />
      </button>
      {making ? (
        <EditThread
          thread={{
            id: "new",
            name: "",
            icon: DEFAULT_THREAD_ICON,
            hue: leastUsedHue(all.map((thread) => thread.hue)),
            iconSetBy: "offload",
          }}
          from="name"
          heading="New thread"
          action="Create"
          align="end"
          onSave={(change, shown) => void make(shown, change.layout)}
          onClose={() => setMaking(false)}
        />
      ) : null}
    </span>
  );

  if (!loading && all.length === 0 && (loose?.count ?? 0) === 0) {
    // The kit's own line: nobody makes a thread, they appear once enough has
    // landed in one place to be one.
    return (
      <>
        {strips.length > 0 ? (
          <div className={styles.paneBody}>{strips}</div>
        ) : null}
        <QuietEmpty
          title="My threads"
          line="Threads appear here on their own, once there is enough in one place to be one."
          tools={newThread}
        />
        {modals}
      </>
    );
  }

  const chip = (
    <span className={`${styles.moreWrap} ${page.chipWrap}`} data-menu>
      <button
        type="button"
        className={page.chip}
        aria-haspopup="menu"
        aria-expanded={chipOpen}
        onClick={() => setChipOpen((was) => !was)}
      >
        {ORDER_COPY[current.sort]}
        <Icon name="chevron-down" size={14} />
      </button>
      {chipOpen ? (
        <span className={`${styles.moreMenu} ${page.chipMenu}`} role="menu">
          {(["newest", "mine"] as const).map((sort) => (
            <button
              key={sort}
              type="button"
              role="menuitemradio"
              aria-checked={current.sort === sort}
              className={styles.moreItem}
              disabled={sort === "mine" && current.ids.length === 0}
              onClick={() => sortBy(sort)}
            >
              <span className={page.check}>
                {current.sort === sort ? <Icon name="check" size={15} /> : null}
              </span>
              {ORDER_COPY[sort]}
            </button>
          ))}
          <span className={page.caption}>{ORDER_COPY.caption}</span>
        </span>
      ) : null}
    </span>
  );

  const keep = (id: string) => (el: HTMLElement | null) => {
    if (el) tileRefs.current.set(id, el);
    else tileRefs.current.delete(id);
  };

  return (
    <>
      <div className={`${styles.paneHead} ${page.wide}`}>
        <div className={page.titleRow}>
          <h1 className={`${styles.paneTitle} ${styles.paneTitleBig}`}>
            My threads
          </h1>
          {loading ? null : chip}
        </div>
        {newThread}
      </div>

      <div className={`${styles.paneBody} ${page.wide} ${page.body}`}>
        {strips}
        {loading ? null : (
          <>
            {loose && loose.count > 0 ? (
              <Link href="/threads/loose" className={page.loose}>
                <Icon name="inbox" size={18} />
                <span className={page.looseName}>Not in a thread</span>
                <span className={page.looseCount}>{loose.count}</span>
                <Icon name="chevron-right" size={16} />
              </Link>
            ) : null}
            <div className={page.frame}>
              <div
                ref={gridRef}
                className={page.grid}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
              >
                {/* 2026-10-18. A thread that goes keeps its tile's place for its
                  line, from the press, before the list is read again. */}
                <InPlace items={threads} idOf={(thread) => thread.id}>
                  {(thread, line, entry) =>
                    entry && entry.form === "slot" && !entry.failed ? (
                      <div className={page.cell}>{line}</div>
                    ) : (
                      <div
                        className={page.cell}
                        ref={(el) => {
                          if (el) cellRefs.current.set(thread.id, el);
                          else cellRefs.current.delete(thread.id);
                        }}
                        data-menu={
                          menu === thread.id ||
                          editing?.id === thread.id ||
                          undefined
                        }
                      >
                        <Returned id={thread.id}>
                          {moving?.by === "pointer" &&
                          moving.id === thread.id ? (
                            <div className={page.slot} ref={keep(thread.id)} />
                          ) : (
                            <ThreadTile
                              ref={keep(thread.id)}
                              data-tile=""
                              thread={thread}
                              lifted={
                                moving?.by === "keys" && moving.id === thread.id
                              }
                              aria-pressed={
                                moving?.by === "keys" && moving.id === thread.id
                                  ? true
                                  : undefined
                              }
                              onPointerDown={(event) =>
                                onPointerDown(thread, event)
                              }
                              onClick={() => {
                                if (dragged.current) dragged.current = false;
                                else if (!moving) open(thread);
                              }}
                              onKeyDown={(event) => {
                                if (event.key === "Enter" && !moving) {
                                  event.preventDefault();
                                  open(thread);
                                } else onKey(thread, event);
                              }}
                              onContextMenu={(event) => {
                                event.preventDefault();
                                setMenu(thread.id);
                              }}
                            />
                          )}
                          {menu === thread.id ? (
                            <TileMenu
                              thread={thread}
                              onEdit={() => void edit(thread)}
                              onShare={() => {
                                setMenu(null);
                                setSharing(thread);
                              }}
                              onRemove={() => {
                                setMenu(null);
                                if ((thread.others ?? []).length > 0)
                                  setLeaving(thread);
                                else void remove(thread);
                              }}
                            />
                          ) : null}
                          {editing?.id === thread.id ? (
                            <EditThread
                              thread={editing}
                              from="name"
                              onSave={(change) =>
                                void saveEdit(thread.id, change)
                              }
                              onClose={() => setEditing(null)}
                            />
                          ) : null}
                        </Returned>
                        {line}
                      </div>
                    )
                  }
                </InPlace>
              </div>
            </div>
            {float && moving?.by === "pointer" && byId.get(moving.id) ? (
              <ThreadTile
                thread={byId.get(moving.id)!}
                lifted
                tabIndex={-1}
                aria-hidden="true"
                className={page.floating}
                style={{
                  left: float.x - float.dx,
                  top: float.y - float.dy,
                  width: float.w,
                  height: float.h,
                }}
              />
            ) : null}
            <p className={page.said} aria-live="polite">
              {said}
            </p>
          </>
        )}
      </div>
      {modals}
    </>
  );
}

function TileMenu({
  thread,
  onEdit,
  onShare,
  onRemove,
}: {
  thread: ThreadRow;
  onEdit: () => void;
  onShare: () => void;
  onRemove: () => void;
}) {
  const leaves = (thread.others ?? []).length > 0;
  return (
    <span
      className={`${styles.moreMenu} ${page.tileMenu}`}
      role="menu"
      aria-label={thread.name}
    >
      <button
        type="button"
        role="menuitem"
        className={styles.moreItem}
        onClick={onEdit}
      >
        <Icon name="pencil" size={15} />
        Edit thread
      </button>
      <button
        type="button"
        role="menuitem"
        className={styles.moreItem}
        onClick={onShare}
      >
        <Icon name="share-2" size={15} />
        Share
      </button>
      <button
        type="button"
        role="menuitem"
        className={`${styles.moreItem} ${page.danger}`}
        onClick={onRemove}
      >
        <Icon name={leaves ? "log-out" : "trash-2"} size={15} />
        {leaves ? "Leave thread" : "Delete thread"}
      </button>
    </span>
  );
}
