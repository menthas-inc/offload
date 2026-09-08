// The live conversation, held above every screen.
//
// It lives here rather than in a screen because it outlives all of them: you
// dump from My threads, walk into a thread while offload is still writing, and
// the conversation is still yours. The kit's sheet folds into a header rather
// than closing for the same reason.
//
// **Turns and draft live above the sheet's own state**, so folding cannot lose
// them, and a live Undo toast survives it too: an eight second window that
// disappears because somebody tidied the screen was not eight seconds.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { AppState, type AppStateStatus } from "react-native";
import {
  awaitAnswer,
  endConversation,
  fetchCurrent,
  resumeDump,
  sendDump,
  undoTurn,
  type MessageState,
  type TouchedThread,
} from "../../lib/dump";
import { failed } from "../../lib/log";

export interface Turn {
  id: string;
  from: "you" | "offload";
  text: string;
  state?: MessageState;
  turnId?: string;
  threads?: TouchedThread[];
  /** Whether the turn actually did something, from the record rather than the
   *  reply. A tick that means "the turn ended" says Done about a refusal. */
  did?: boolean;
  /** A calendar write this turn proposed and nobody has answered yet.
   *
   *  **The reply carries its own control.** offload saying it will add
   *  something once you confirm, with nothing to confirm, is the dead end this
   *  exists to close: the proposal expires in an hour having done nothing. */
  waiting?: { id: string; because: string } | null;
}

interface Live {
  title: string;
}

interface Undoable {
  turnId: string;
  message: string;
}

export interface Conversation {
  live: Live | null;
  folded: boolean;
  turns: Turn[];
  writing: boolean;
  draft: string;
  undoable: Undoable | null;
  setDraft: (value: string) => void;
  submit: () => Promise<void>;
  fold: () => void;
  raise: () => void;
  close: () => void;
  undo: () => Promise<void>;
  finish: (messageId: string) => Promise<void>;
  /** A proposed calendar write has been answered, so the control goes.
   *
   *  Local only: the server already knows, and re-fetching the conversation to
   *  learn something this client just decided is a round trip for nothing. */
  resolveWaiting: (turnId: string) => void;
  /** What the turn wrote to, so an open thread can catch up on its own. */
  filed: { threadIds: string[]; at: number } | null;
}

const UNDO_MS = 8000;

const ConversationContext = createContext<Conversation | null>(null);

export const useConversation = (): Conversation => {
  const value = useContext(ConversationContext);
  if (!value) throw new Error("useConversation outside its provider");
  return value;
};

export function ConversationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [live, setLive] = useState<Live | null>(null);
  const [folded, setFolded] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);

  const resolveWaiting = useCallback((turnId: string) => {
    setTurns((current) =>
      current.map((turn) =>
        turn.id === turnId ? { ...turn, waiting: null } : turn,
      ),
    );
  }, []);
  const [writing, setWriting] = useState(false);
  const [draft, setDraft] = useState("");
  const [undoable, setUndoable] = useState<Undoable | null>(null);
  const [filed, setFiled] = useState<{
    threadIds: string[];
    at: number;
  } | null>(null);

  const polls = useRef(new Map<string, ReturnType<typeof awaitAnswer>>());
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The conversation as the database has it, so reopening the app does not look
  // like a fresh account.
  useEffect(() => {
    void (async () => {
      try {
        const tail = await fetchCurrent();
        if (tail.length === 0) return;
        setTurns(
          tail.map((message) => ({
            id: message.id,
            from: message.role === "person" ? "you" : "offload",
            text: message.text ?? "",
            state: message.state,
            turnId: message.turnId,
            // Survives a reload, which is the point: somebody who backgrounds
            // the app mid-decision comes back to the same question rather than
            // to a reply about something that never happened.
            waiting: message.waiting ?? null,
          })),
        );
      } catch (error) {
        failed("conversation.tail", error);
      }
    })();
  }, []);

  // The poll stops when the app goes away and asks at once when it comes back.
  // Otherwise every backgrounded turn pays a full interval before the tick
  // becomes Done, which is a delay somebody can see.
  useEffect(() => {
    const onChange = (state: AppStateStatus): void => {
      for (const poll of polls.current.values()) {
        if (state === "active") poll.now();
        else poll.cancel();
      }
    };
    const sub = AppState.addEventListener("change", onChange);
    return () => sub.remove();
  }, []);

  useEffect(
    () => () => {
      for (const poll of polls.current.values()) poll.cancel();
      if (undoTimer.current) clearTimeout(undoTimer.current);
    },
    [],
  );

  const offerUndo = useCallback((turnId: string, message: string) => {
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setUndoable({ turnId, message });
    undoTimer.current = setTimeout(() => setUndoable(null), UNDO_MS);
  }, []);

  const watch = useCallback(
    (messageId: string, turnId: string) => {
      const poll = awaitAnswer(messageId, (answer) => {
        polls.current.delete(messageId);
        setWriting(false);

        const did = answer.threads.length > 0;
        setTurns((current) => {
          const next = current.map((turn) =>
            turn.id === messageId
              ? { ...turn, state: answer.state, did }
              : turn,
          );
          if (!answer.reply) return next;
          return [
            ...next,
            {
              id: `${messageId}-reply`,
              from: "offload" as const,
              text: answer.reply,
              turnId,
              threads: answer.threads,
              waiting: answer.waiting ?? null,
            },
          ];
        });

        // `changed`, not `threads`: a turn that moved a piece out of the thread
        // you are looking at changed it without filing anything into it, and
        // `threads` is only where things went. That gap left a moved row on
        // screen in a thread it was no longer in.
        if (answer.changed.length > 0)
          setFiled({ threadIds: answer.changed, at: Date.now() });
        // Only a finished turn offers a way back. A partial one offers a way
        // forward, and both at once asks somebody to choose between finishing
        // and undoing inside eight seconds.
        if (answer.state === "answered" && answer.reply)
          offerUndo(turnId, answer.reply);
      });
      polls.current.set(messageId, poll);
    },
    [offerUndo],
  );

  const submit = useCallback(async (): Promise<void> => {
    const text = draft.trim();
    if (text.length === 0) return;

    setDraft("");
    setWriting(true);
    if (!live)
      setLive({ title: text.length > 40 ? `${text.slice(0, 40)}...` : text });
    setFolded(false);

    try {
      const sent = await sendDump(text, `${Date.now()}`);
      if (!sent) {
        setWriting(false);
        return;
      }
      setTurns((current) => [
        ...current,
        {
          id: sent.messageId,
          from: "you",
          text,
          state: sent.state,
          turnId: sent.turnId,
        },
      ]);
      watch(sent.messageId, sent.turnId);
    } catch (error) {
      setWriting(false);
      failed("dump.send", error);
    }
  }, [draft, live, watch]);

  const undo = useCallback(async (): Promise<void> => {
    if (!undoable) return;
    const { turnId } = undoable;
    setUndoable(null);
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setTurns((current) => current.filter((turn) => turn.turnId !== turnId));
    await undoTurn(turnId);
    setFiled({ threadIds: [], at: Date.now() });
  }, [undoable]);

  const finish = useCallback(
    async (messageId: string): Promise<void> => {
      const sent = await resumeDump(messageId);
      if (!sent) return;
      setWriting(true);
      watch(sent.messageId, sent.turnId);
    },
    [watch],
  );

  const close = useCallback(() => {
    // Closing is a statement, not a tidy-up: this subject is over, so the next
    // dump starts a conversation rather than joining this one however soon it
    // arrives. Folding is the opposite and says nothing to the server.
    setLive(null);
    setFolded(false);
    void endConversation();
  }, []);

  return (
    <ConversationContext.Provider
      value={{
        live,
        folded,
        turns,
        writing,
        draft,
        undoable,
        setDraft,
        submit,
        fold: () => setFolded(true),
        raise: () => setFolded(false),
        close,
        undo,
        finish,
        filed,
        resolveWaiting,
      }}
    >
      {children}
    </ConversationContext.Provider>
  );
}
