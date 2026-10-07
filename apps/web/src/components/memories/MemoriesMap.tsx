"use client";

// 040 part D. The same memories in space: each kind a cloud of its hue, and
// inside it memories that mean similar things near each other, one row each.
//
// From ui_kits/memories_tab's `mapH`, drawn in the DOM: the camera is state,
// and every cloud, dot, pill and label is placed in screen pixels from it, as
// the kit places them. Where each memory sits is the server's (`place`, laid
// out nightly); where each kind sits is `memoryWorld` in @offload/widgets, so
// the phones place them identically. The shape, tall or wide, is picked once
// from the map's own size when it first opens and never reshuffles.
//
// Below zoom 0.55 a memory is a dot, from 0.55 its sentence, with type that
// grows with the zoom. Every dot and pill is a button named by its sentence
// and kind, in list order, so the map is never only a picture.

import { useEffect, useMemo, useRef, useState } from "react";
import {
  MAP_LOOK,
  MAP_ZOOM,
  MEMORY_COPY,
  MEMORY_KINDS,
  mapOpening,
  matchesMemory,
  memoryAt,
  memorySections,
  memoryWorld,
  sentenceLines,
  sentenceSize,
  type MemoryKindId,
  type MemoryView,
} from "@offload/widgets";
import { Icon } from "../Icon";
import styles from "../../app/(shell)/memories.module.css";

interface Camera {
  cx: number;
  cy: number;
  z: number;
}

/** A flight's length: the map camera's motion token, read when it flies. */
function flightMs(): number {
  if (typeof window === "undefined") return 280;
  const ms = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--duration-slow").trim());
  return Number.isFinite(ms) && ms > 0 ? ms : 280;
}

function reducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function MemoriesMap({
  memories,
  query,
  openId,
  onOpen,
  onFocusKind,
}: {
  memories: MemoryView[];
  query: string;
  openId: string | null;
  onOpen: (id: string) => void;
  /** The kind the camera is zoomed into, or null: a new memory from the map is that kind. */
  onFocusKind: (kind: MemoryKindId | null) => void;
}) {
  const field = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    const el = field.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth || 800, h: el.clientHeight || 600 });
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Picked once, when the map first has a size, and kept: opening the editor
  // pane or resizing the window never reshuffles it.
  const [wide, setWide] = useState<boolean | null>(null);
  useEffect(() => {
    if (size && wide === null) setWide(size.w > size.h * MAP_LOOK.widePast);
  }, [size, wide]);

  const world = useMemo(() => memoryWorld(memories, wide ?? true), [memories, wide]);
  const ordered = useMemo(() => memorySections(memories, "kind").flatMap((s) => s.rows), [memories]);

  const [camera, setCamera] = useState<Camera | null>(null);
  const [min, setMin] = useState<number>(MAP_ZOOM.min);
  useEffect(() => {
    if (!size || wide === null || camera) return;
    const open = mapOpening(world, size.w, size.h, memories.length);
    setMin(open.min);
    setCamera({ cx: open.cx, cy: open.cy, z: open.z });
  }, [size, wide, camera, world, memories.length]);

  const flight = useRef(0);
  useEffect(() => () => cancelAnimationFrame(flight.current), []);

  const clamp = (c: Camera): Camera => ({
    z: Math.min(MAP_ZOOM.max, Math.max(min, c.z)),
    cx: Math.min(world.width, Math.max(0, c.cx)),
    cy: Math.min(world.height, Math.max(0, c.cy)),
  });

  const fly = (to: Camera) => {
    cancelAnimationFrame(flight.current);
    if (!camera || reducedMotion()) return setCamera(to);
    const from = camera;
    const started = performance.now();
    const ms = flightMs();
    const step = (now: number) => {
      const p = Math.min(1, (now - started) / ms);
      const e = 1 - (1 - p) ** 3;
      setCamera({ cx: from.cx + (to.cx - from.cx) * e, cy: from.cy + (to.cy - from.cy) * e, z: from.z * (to.z / from.z) ** e });
      if (p < 1) flight.current = requestAnimationFrame(step);
    };
    flight.current = requestAnimationFrame(step);
  };

  const near = (camera?.z ?? 0) >= MAP_ZOOM.sentences;
  useEffect(() => {
    if (!camera || !near) return onFocusKind(null);
    let best: MemoryKindId | null = null;
    let distance = Number.POSITIVE_INFINITY;
    for (const k of world.kinds) {
      const d = Math.hypot(k.cx - camera.cx, k.cy - camera.cy);
      if (d < distance) [best, distance] = [k.kind, d];
    }
    onFocusKind(best);
  }, [camera, near, world, onFocusKind]);

  const local = (event: { clientX: number; clientY: number }): [number, number] => {
    const box = field.current!.getBoundingClientRect();
    return [event.clientX - box.left, event.clientY - box.top];
  };
  const zoomAbout = (c: Camera, px: number, py: number, z: number): Camera => {
    if (!size) return c;
    const wx = c.cx + (px - size.w / 2) / c.z;
    const wy = c.cy + (py - size.h / 2) / c.z;
    const nz = Math.min(MAP_ZOOM.max, Math.max(min, z));
    return clamp({ z: nz, cx: wx - (px - size.w / 2) / nz, cy: wy - (py - size.h / 2) / nz });
  };

  // The wheel zooms about the pointer. Not passive, so the page never scrolls.
  const zoomRef = useRef(zoomAbout);
  zoomRef.current = zoomAbout;
  useEffect(() => {
    const el = field.current;
    if (!el) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      cancelAnimationFrame(flight.current);
      const box = el.getBoundingClientRect();
      const x = event.clientX - box.left;
      const y = event.clientY - box.top;
      setCamera((c) => (c ? zoomRef.current(c, x, y, c.z * Math.exp(-event.deltaY * (event.ctrlKey ? 0.012 : 0.0022))) : c));
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, []);

  // Drag pans and two pointers pinch.
  const pointers = useRef(new Map<number, [number, number]>());
  const gesture = useRef<{ camera: Camera; at: [number, number]; pinch: number | null; mid: [number, number] } | null>(null);
  const moved = useRef(false);

  if (!size || !camera) return <div className={styles.map} ref={field} />;

  const X = (x: number) => (x - camera.cx) * camera.z + size.w / 2;
  const Y = (y: number) => (y - camera.cy) * camera.z + size.h / 2;
  const fs = sentenceSize(camera.z);
  const lines = sentenceLines(camera.z);
  const matches = ordered.filter((m) => matchesMemory(m, query));
  const fit = Math.min(size.w / world.width, size.h / world.height) * 0.94;
  const level = Math.max(0, Math.min(1, Math.log(camera.z / min) / Math.log(MAP_ZOOM.max / min)));

  const dock: React.ReactNode[] = [];
  const labels = world.kinds.map((k) => {
    const info = MEMORY_KINDS.find((x) => x.kind === k.kind)!;
    const x = X(k.cx);
    const y = Y(k.cy - k.radius * (near ? MAP_LOOK.labelUp.near : MAP_LOOK.labelUp.far));
    const name = `Go to ${info.name}, ${k.count}`;
    const flight = MAP_LOOK.kindFlight;
    const go = () =>
      fly(clamp({ cx: k.cx, cy: k.cy, z: Math.min(flight.most, Math.max(flight.least, size.w / (k.radius * flight.across))) }));
    if (x > -10 && x < size.w + 10 && y > -10 && y < size.h + 10) {
      return (
        <button key={k.kind} type="button" className={styles.label} data-k={k.kind} style={{ left: x, top: y }} aria-label={name} onClick={go}>
          <Icon name={info.glyph} size={14} />
          {info.name}
          <u>{k.count}</u>
        </button>
      );
    }
    if (near) {
      // Off screen: one row along the top, an arrow turned towards the cloud.
      const turn = (Math.atan2(Y(k.cy) - size.h / 2, X(k.cx) - size.w / 2) * 180) / Math.PI + 90;
      dock.push(
        <button key={k.kind} type="button" className={styles.dockLabel} data-k={k.kind} aria-label={name} onClick={go}>
          {info.name}
          <span className={styles.dockArrow} style={{ transform: `rotate(${turn.toFixed(0)}deg)` }}>
            <Icon name="arrow-up" size={13} />
          </span>
        </button>,
      );
    }
    return null;
  });

  const release = (event: React.PointerEvent) => {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size === 0) gesture.current = null;
  };

  return (
    <div
      className={styles.map}
      ref={field}
      role="group"
      aria-label="Map of memories"
      style={{ ["--dimmed" as string]: MAP_LOOK.dimmed }}
      onPointerDown={(event) => {
        if ((event.target as HTMLElement).closest("[data-map-control]")) return;
        // A drag released outside the map still ends here.
        event.currentTarget.setPointerCapture?.(event.pointerId);
        moved.current = false;
        cancelAnimationFrame(flight.current);
        pointers.current.set(event.pointerId, local(event));
        const points = [...pointers.current.values()];
        const two = points.length === 2;
        gesture.current = {
          camera,
          at: local(event),
          pinch: two ? Math.hypot(points[0]![0] - points[1]![0], points[0]![1] - points[1]![1]) : null,
          mid: two ? [(points[0]![0] + points[1]![0]) / 2, (points[0]![1] + points[1]![1]) / 2] : local(event),
        };
      }}
      onPointerMove={(event) => {
        const g = gesture.current;
        if (!g || !pointers.current.has(event.pointerId)) return;
        pointers.current.set(event.pointerId, local(event));
        const points = [...pointers.current.values()];
        if (points.length === 2 && g.pinch) {
          moved.current = true;
          const d = Math.hypot(points[0]![0] - points[1]![0], points[0]![1] - points[1]![1]);
          setCamera(zoomAbout(g.camera, g.mid[0], g.mid[1], (g.camera.z * d) / g.pinch));
          return;
        }
        const [x, y] = local(event);
        const dx = x - g.at[0];
        const dy = y - g.at[1];
        if (Math.hypot(dx, dy) > 5) moved.current = true;
        if (moved.current) setCamera(clamp({ ...g.camera, cx: g.camera.cx - dx / g.camera.z, cy: g.camera.cy - dy / g.camera.z }));
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onClickCapture={(event) => {
        // A drag that ends over a sentence is a drag, not a tap.
        if (moved.current) {
          event.stopPropagation();
          moved.current = false;
        }
      }}
    >
      <span className={styles.ground} aria-hidden="true" />
      {world.kinds.map((k) => {
        const r = k.radius * camera.z * MAP_LOOK.cloudReach;
        return (
          <span
            key={k.kind}
            data-cloud={k.kind}
            data-k={k.kind}
            className={styles.cloud}
            style={{ left: X(k.cx) - r, top: Y(k.cy) - r, width: r * 2, height: r * 2 }}
            aria-hidden="true"
          />
        );
      })}

      {ordered.map((m) => {
        const at = memoryAt(world, m);
        const sx = X(at.x);
        const sy = Y(at.y);
        if (sx < -MAP_LOOK.cull.x || sx > size.w + MAP_LOOK.cull.x || sy < -MAP_LOOK.cull.y || sy > size.h + MAP_LOOK.cull.y) return null;
        const info = MEMORY_KINDS.find((k) => k.kind === m.kind)!;
        const shared = {
          "data-memory": m.id,
          "data-k": m.kind,
          "data-dim": matchesMemory(m, query) ? undefined : true,
          "aria-label": `${m.text}, ${info.name}`,
        };
        if (!near) {
          return (
            <button
              key={m.id}
              type="button"
              {...shared}
              data-shape="dot"
              data-learned={m.origin === "learned" || undefined}
              className={styles.dot}
              style={{ left: X(at.x), top: Y(at.y) }}
              onClick={() => fly(clamp({ cx: at.x, cy: at.y, z: Math.max(MAP_ZOOM.flyTo, camera.z) }))}
            />
          );
        }
        return (
          <button
            key={m.id}
            type="button"
            {...shared}
            data-shape="sentence"
            aria-current={openId === m.id || undefined}
            className={styles.pill}
            style={{
              left: X(at.x),
              top: Y(at.y),
              fontSize: `${fs.toFixed(1)}px`,
              maxWidth: Math.round(fs * 17),
              padding: `${(fs * 0.45).toFixed(1)}px ${(fs * 0.75).toFixed(1)}px`,
              borderRadius: `${(fs * 1.1).toFixed(1)}px`,
            }}
            onClick={() => onOpen(m.id)}
          >
            {m.origin === "learned" ? <Icon name="sparkles" size={Math.round(fs * 0.8)} /> : null}
            <span style={{ WebkitLineClamp: lines }}>{m.text}</span>
          </button>
        );
      })}

      {labels}
      {dock.length ? (
        <div className={styles.dock} data-map-control>
          {dock}
        </div>
      ) : null}

      {query.trim() && matches.length === 0 ? <p className={styles.mapNothing}>{MEMORY_COPY.nothingSays(query.trim())}</p> : null}

      <span className={styles.zoom} data-map-control>
        <button type="button" aria-label="Zoom in" onClick={() => fly(clamp({ ...camera, z: camera.z * MAP_LOOK.zoomStep }))}>
          +
        </button>
        <b aria-hidden="true">
          <i style={{ height: `${Math.max(6, level * 100).toFixed(0)}%` }} />
        </b>
        <button type="button" aria-label="Zoom out" onClick={() => fly(clamp({ ...camera, z: camera.z / MAP_LOOK.zoomStep }))}>
          {"−"}
        </button>
      </span>
      {camera.z > fit * MAP_LOOK.everythingPast ? (
        <button
          type="button"
          className={styles.everything}
          data-map-control
          onClick={() => fly(clamp({ cx: world.width / 2, cy: world.height / 2, z: Math.max(min, fit) }))}
        >
          Everything
        </button>
      ) : null}
    </div>
  );
}
