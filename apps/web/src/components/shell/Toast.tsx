"use client";

// One message above the composer, with at most one action.
//
// The `Toast` contract: an ink bar, one action, floated above the composer.
// The kit draws exactly one, owned by the shell, and for a while this app had
// three: the composer's own for a turn's Undo, My threads' own for a deleted
// thread, and a prop on the thread pane wired to nothing, so a ticked row on
// the web never offered its way back. This is the one the kit draws. The state
// lives in the shell, and the bar itself is rendered by the composer, which is
// the thing it floats above and the thing that knows how tall that is.
//
// Eight seconds, matching the Undo window everything in the product uses, so
// a toast never outlives the thing it is offering to take back. Showing a new
// one replaces the old, which is what lets a write that fails replace its own
// Undo with a Retry.
//
// **A word with a place is not a toast** (2026-10-18). An Undo, and the
// failure that replaces it, is drawn where the change is, by `UndoLine`; the
// toast keeps what has no Undo and a conversation's own report. Tapping the
// toast's body fades it out, so it never sits over something you want.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Place } from "@offload/widgets";
import { undoStore } from "../../lib/undo";
import { useReducedMotion } from "../../lib/reduced-motion";
import styles from "../../app/(shell)/composer.module.css";

const VISIBLE_MS = 8000;

export interface ToastAction {
  label: string;
  onPress: () => void | Promise<void>;
}

interface Showing {
  message: string;
  action?: ToastAction;
}

export interface ToastState {
  showing: Showing | null;
  show: (message: string, action?: ToastAction, place?: Place) => void;
  hide: () => void;
}

const ToastContext = createContext<ToastState | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [showing, setShowing] = useState<Showing | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hide = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setShowing(null);
  }, []);

  const show = useCallback((message: string, action?: ToastAction, place?: Place) => {
    if (place) return undoStore.put(place, message, action);
    if (timer.current) clearTimeout(timer.current);
    setShowing({ message, ...(action ? { action } : {}) });
    timer.current = setTimeout(() => setShowing(null), VISIBLE_MS);
  }, []);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const value = useMemo(() => ({ showing, show, hide }), [showing, show, hide]);
  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}

export function useToast(): ToastState {
  const value = useContext(ToastContext);
  if (!value) throw new Error("useToast outside its provider");
  return value;
}

/** Draws the toast when there is one. Rendered by the composer, inside the
 *  block it floats above. */
export function ToastHost() {
  const state = useToast();
  const still = useReducedMotion();
  const [leaving, setLeaving] = useState<Showing | null>(null);
  if (!state.showing) return null;
  const { message, action } = state.showing;

  // The readme's split: an Undo announces politely, a failure interrupts.
  // Retry and Try again are the failure forms, and the only actions that are.
  const failure = action?.label === "Retry" || action?.label === "Try again";
  const fading = leaving === state.showing;
  return (
    <div
      className={styles.toast}
      role={failure ? "alert" : "status"}
      data-leaving={fading || undefined}
      // The body, not the action: tapping it fades it out.
      onClick={() => (still ? state.hide() : setLeaving(state.showing))}
      onAnimationEnd={() => {
        if (fading) state.hide();
      }}
    >
      <span className={styles.toastMessage}>{message}</span>
      {action ? (
        <button
          type="button"
          className={styles.toastAction}
          onClick={(event) => {
            event.stopPropagation();
            state.hide();
            void action.onPress();
          }}
        >
          {action.label}
        </button>
      ) : null}
    </div>
  );
}
