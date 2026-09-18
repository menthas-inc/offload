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
  useMemo,
  useRef,
  useState,
} from "react";
import { AppState, type AppStateStatus } from "react-native";
import { plainText } from "@offload/markup";
import {
  answerQuestion,
  awaitAnswer,
  cancelTurn,
  endConversation,
  fetchCurrent,
  resumeDump,
  sendDump,
  undoTurn,
  uploadPhoto,
  refusePhoto,
  PhotoRefused,
  UnknownBlob,
  MAX_PHOTOS,
  type FoundResult,
  type FoundRow,
  type MessageState,
  type PhotoOnWire,
  type QuestionOnWire,
  type Source,
  type TouchedThread,
} from "../../lib/dump";
import type { ChipError } from "./AttachChip";
import { addNote, completeContent, quickAdd } from "../../lib/threads";
import { failed } from "../../lib/log";

/** What a `+` pinned the composer to. Set only by a `+`, never chosen from
 *  inside the field: a section's `+` writes to that section in that thread and
 *  nowhere else, which is the whole difference between this and an ordinary
 *  dump.
 *
 *  **The caller owns every word.** `title`, `placeholder` and `charLimit` come
 *  from whichever `+` raised this, because a widget's quick add and a note
 *  each already had their own copy and their own cap before this existed, and
 *  the composer is the input now, not a second opinion about either. */
export interface Pin {
  threadId: string;
  threadName: string;
  write: "quickAdd" | "note";
  /** The widget's own kind, e.g. `"todo"`. Required for `quickAdd`, absent
   *  for a note, which has no section. */
  section?: string;
  /** The header's own line, e.g. "Add to To do" or "Add a note". */
  title: string;
  placeholder: string;
  charLimit: number;
  /** Whether the cap is tight enough to want a running count. Quick add's 500
   *  never showed one; a note's 200 always did. */
  showCounter?: boolean;
  /** The rail's own day, `YYYY-MM-DD`, when the + was on a day heading.
   *
   *  Structured rather than left to the words: offload's only tool on this row
   *  afterwards is `edit_content`, which carries no date, so the day has to be
   *  right from here. */
  day?: string;
}

export interface Turn {
  id: string;
  from: "you" | "offload";
  text: string;
  state?: MessageState;
  turnId?: string;
  threads?: TouchedThread[];
  /** 016. Where a fact in this turn came from, for the chips in its footer.
   *  Empty on every turn that read nothing, which is nearly all of them. */
  sources?: Source[];
  /** Whether the turn actually did something, from the record rather than the
   *  reply. A tick that means "the turn ended" says Done about a refusal. */
  did?: boolean;
  /** A calendar write this turn proposed and nobody has answered yet.
   *
   *  **The reply carries its own control.** offload saying it will add
   *  something once you confirm, with nothing to confirm, is the dead end this
   *  exists to close: the proposal expires in an hour having done nothing. */
  waiting?: { id: string; because: string } | null;
  /** 018. The question this turn asked back, on the message that was sent,
   *  while it is open. Drawn inside the reply's bubble when there is one and
   *  in a bubble of its own when the turn filed silently. */
  question?: QuestionOnWire | null;
  /** What an answer showed.
   *
   *  Only ever set on an answering turn, and empty on a dump. Resolved by the
   *  server on every read, so a row ticked or deleted elsewhere is never stale
   *  inside a reply from last week. */
  found?: FoundResult[];
  /** 020. The photos this message carried. Only ever on a message you sent. */
  photos?: PhotoOnWire[];
}

/** 020. A photo waiting in the composer. The key belongs to the draft until
 *  it sends, so a retry finds the upload the server already made. */
export interface DraftPhoto {
  key: string;
  uri: string;
  name: string;
  type: string | null;
  error: ChipError;
  /** Set once the server has it. A retry skips what already landed. */
  uploaded?: { blobId: string; width: number; height: number };
}

/** 020. A photo as a picker or the share sheet hands it over. */
export interface PickedPhoto {
  uri: string;
  name: string | null;
  type: string | null;
  size: number | null;
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
  /** Whether the sheet should be up: a live conversation that is not folded,
   *  or a pin, which never folds. Computed once here rather than at each of
   *  the sheet, its scrim and the plate, because the three disagreeing is
   *  exactly how a pin ended up with two composers on screen at once during
   *  this feature's own build. */
  raised: boolean;
  turns: Turn[];
  writing: boolean;
  /** 017. The turn in flight, if one is: what offload is doing and how long it
   *  has been at it, so the sheet can draw the line and, past ten seconds, the
   *  way out. Null the rest of the time, which is nearly always. */
  working: { messageId: string; turnId: string; since: number; step: string | null } | null;
  /** Stop the turn in flight. Returns the screen immediately. */
  stop: () => void;
  draft: string;
  undoable: Undoable | null;
  /** Set only by a `+`. While it holds, the sheet shows what it is pinned to
   *  instead of turns, and submit writes straight there instead of dumping. */
  pin: Pin | null;
  /** The thread screen that is open, if one is.
   *
   *  A filing default, and a much weaker claim than a pin: it goes with the
   *  dump so the model files there without anybody saying so twice, and words
   *  naming another thread override it. Set by the thread screen on focus and
   *  cleared when it goes, because the composer belongs to the shell and has no
   *  other way to know where somebody is. */
  onScreen: { id: string; name: string } | null;
  setDraft: (value: string) => void;
  submit: () => Promise<void>;
  /** 020. The photos in the draft, and the ways in and out. `addPhotos` from
   *  the picker or the share sheet; `line` is the one clause under the
   *  composer when a send did not go, with Retry when that is the way forward. */
  photos: DraftPhoto[];
  addPhotos: (picked: PickedPhoto[], via?: "picker" | "share") => void;
  removePhoto: (key: string) => void;
  line: { text: string; retry?: boolean } | null;
  clearLine: () => void;
  /** 020. The photo of a sent message open in the viewer, which the shell
   *  mounts above the sheet. */
  photoOpen: { turnId: string; index: number } | null;
  openPhoto: (turnId: string, index: number) => void;
  closePhoto: () => void;
  /** 020. A share sheet arrival wants the field focused and the keyboard up,
   *  which only the mounted composer can do. Bumped per arrival; the composer
   *  consumes it. */
  focusRequest: number;
  fold: () => void;
  raise: () => void;
  /** A `+` raising the composer pinned to its own thread and write. */
  raiseFor: (pin: Pin) => void;
  /** A thread screen saying it is open, or null as it leaves. */
  setOnScreen: (thread: { id: string; name: string } | null) => void;
  /** Whether a screen has a sheet of its own up.
   *
   *  **The plate is mounted above the router**, so anything a screen anchors to
   *  the bottom of itself is painted under it. A long press opened the row
   *  actions and all you could see was the first one, which is why deleting a
   *  task looked impossible. Counted rather than a boolean: two sheets can
   *  overlap for the length of one animation, and the last one to close would
   *  otherwise bring the plate back under the first. */
  sheetOpen: boolean;
  openSheet: () => void;
  closeSheet: () => void;
  /** Put the pinned composer away without writing anything. Never touches the
   *  server: nothing was said, so there is nothing to end. */
  dismissPin: () => void;
  close: () => void;
  undo: () => Promise<void>;
  finish: (messageId: string) => Promise<void>;
  /** A proposed calendar write has been answered, so the control goes.
   *
   *  Local only: the server already knows, and re-fetching the conversation to
   *  learn something this client just decided is a round trip for nothing. */
  resolveWaiting: (turnId: string) => void;
  /** 018. The one open question in the conversation, which owns the
   *  composer's placeholder while it is open. */
  openQuestion: QuestionOnWire | null;
  /** 018. Answer the open question with a tap. "gone" when the server
   *  refused it (closed, answered elsewhere): the chips go. "failed" when the
   *  request did not land: the chips stay beside the line that offers again.
   *  When the server wrote the words as a turn, that turn appears, and a
   *  country re-run is waited for exactly as a dump is. */
  answerOpen: (turnId: string, option: number) => Promise<"answered" | "gone" | "failed">;
  /** Tick a row from inside an answer. The only write an answer can do. */
  tickFound: (turnId: string, row: FoundRow) => Promise<void>;
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
  // 020. The photos in the draft, the draft's own key, whether they came
  // through the share sheet, and the one line under the composer.
  const [photos, setPhotos] = useState<DraftPhoto[]>([]);
  const draftKey = useRef<string | null>(null);
  const viaShare = useRef(false);
  const [line, setLine] = useState<{ text: string; retry?: boolean } | null>(null);
  const [photoOpen, setPhotoOpen] = useState<{ turnId: string; index: number } | null>(null);
  const [focusRequest, setFocusRequest] = useState(0);
  // 020. A share that lands while a send is out waits for it: the chips
  // appear when the send finishes, rather than being wiped by it.
  const heldShare = useRef<PickedPhoto[]>([]);
  const [pin, setPin] = useState<Pin | null>(null);
  const [onScreen, setOnScreen] = useState<{ id: string; name: string } | null>(null);
  const [sheets, setSheets] = useState(0);
  const openSheet = useCallback(() => setSheets((open) => open + 1), []);
  const closeSheet = useCallback(() => setSheets((open) => Math.max(0, open - 1)), []);

  const resolveWaiting = useCallback((turnId: string) => {
    setTurns((current) =>
      current.map((turn) =>
        turn.id === turnId ? { ...turn, waiting: null } : turn,
      ),
    );
  }, []);
  /** Tick a row an answer showed.
   *
   *  The ordinary per-row endpoint, not the turn Undo: the model wrote nothing
   *  and a person tapped a checkbox. Permission is re-checked on the server at
   *  the tap, so a result that has gone stale is refused rather than trusted.
   *
   *  Optimistic, and put back if the server refuses. A checkbox that waits for
   *  a round trip before it moves reads as broken on a slow connection.
   */
  const tickFound = useCallback(async (turnId: string, row: FoundRow) => {
    const next = !row.done;
    const apply = (done: boolean) =>
      setTurns((current) =>
        current.map((turn) =>
          turn.id === turnId
            ? {
                ...turn,
                // `?? []` rather than the optional chain's undefined:
                // `exactOptionalPropertyTypes` makes an absent prop and one set
                // to undefined different types, and a spread produces the
                // second.
                found: (turn.found ?? []).map((result) => ({
                  ...result,
                  rows: result.rows.map((r) =>
                    r.contentId === row.contentId ? { ...r, done } : r,
                  ),
                })),
              }
            : turn,
        ),
      );

    apply(next);
    const ok = await completeContent(row.contentId, next);
    if (!ok) {
      apply(row.done);
      return;
    }
    // The thread screen behind this sheet is now stale. The same signal a dump
    // fires, for the same reason: a screen already showing that thread updates
    // itself rather than quietly disagreeing with the answer.
    setFiled({ threadIds: [row.threadId], at: Date.now() });
  }, []);

  const [writing, setWriting] = useState(false);
  // 017. What offload is doing, and which turn is still in flight so it can be
  // stopped. One at a time, because the composer only ever has one turn waiting:
  // a second dump lands as its own turn and the first one's line is gone by then.
  const [working, setWorking] = useState<{
    messageId: string;
    turnId: string;
    since: number;
    step: string | null;
  } | null>(null);
  const [draft, setDraft] = useState("");
  const [undoable, setUndoable] = useState<Undoable | null>(null);
  const [filed, setFiled] = useState<{
    threadIds: string[];
    at: number;
  } | null>(null);

  const polls = useRef(new Map<string, ReturnType<typeof awaitAnswer>>());
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const raiseFor = useCallback((next: Pin) => {
    setDraft("");
    setPin(next);
  }, []);

  const dismissPin = useCallback(() => setPin(null), []);

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
            photos: message.photos ?? [],
            state: message.state,
            turnId: message.turnId,
            // Survives a reload, which is the point: somebody who backgrounds
            // the app mid-decision comes back to the same question rather than
            // to a reply about something that never happened.
            waiting: message.waiting ?? null,
            question: message.question ?? null,
            // Same reason. An answer reopened tomorrow draws the rows as they
            // are now, because the server resolves them rather than storing a
            // copy taken when the answer was written.
            found: message.found ?? [],
            // **And the footer, which a cold start used to empty.** Every
            // settled turn came back with no Done mark, no thread pill and no
            // source chip, because the tail carried none of the three. `did` is
            // derived here from the same record the pills come from, never from
            // the reply.
            threads: message.threads ?? [],
            sources: message.sources ?? [],
            did: (message.threads?.length ?? 0) > 0,
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
    // `since` is when the person pressed send, not when the server answered
    // it: the dump request takes a second or more, and a clock stamped after
    // it held the first step back and put Stop late by the same amount.
    (messageId: string, turnId: string, since: number = Date.now()) => {
      const poll = awaitAnswer(
        messageId,
        (answer) => {
        polls.current.delete(messageId);
        setWriting(false);
        setWorking((current) => (current?.messageId === messageId ? null : current));

        const did = answer.threads.length > 0;
        setTurns((current) => {
          const next = current.map((turn) =>
            turn.id === messageId
              ? {
                  ...turn,
                  state: answer.state,
                  did,
                  // **Always, not only when there is no reply.** The footer
                  // belongs to the turn rather than to either bubble, so the
                  // pills and the sources land here whether or not offload said
                  // anything, and the reply no longer draws them.
                  threads: answer.threads,
                  sources: answer.sources,
                  question: answer.question ?? null,
                  // 020. The renditions are made before the model reads the
                  // photos, so a settled turn's thumbnails exist; one that
                  // could not be opened draws the glyph when its fetch fails.
                  photos: (turn.photos ?? []).map((photo) => ({ ...photo, ready: true })),
                }
              : // 018. The next turn closes the last question whatever it says.
                { ...turn, question: null },
          );
          if (!answer.reply) return next;
          return [
            ...next,
            {
              id: `${messageId}-reply`,
              from: "offload" as const,
              text: answer.reply,
              turnId,
              waiting: answer.waiting ?? null,
              found: answer.found ?? [],
            },
          ];
        });

        // `changed`, not `threads`: a turn that moved a piece out of the thread
        // you are looking at changed it without filing anything into it, and
        // `threads` is only where things went. That gap left a moved row on
        // screen in a thread it was no longer in.
        if (answer.changed.length > 0)
          setFiled({ threadIds: answer.changed, at: Date.now() });
        // **A turn offers a way back only when it changed something.**
        // Undo reverses writes, and an answer writes nothing: offering it after
        // "I could not find that" is a control that would do nothing, sitting
        // under a sentence that already said nothing happened. `threads` is
        // where things went and `changed` is everywhere a screen has to reload,
        // so between them they are the whole of what a turn did.
        //
        // Only a finished turn, too. A partial one offers a way forward, and
        // both at once asks somebody to choose between finishing and undoing
        // inside eight seconds.
        const acted = did || answer.changed.length > 0;
        if (answer.state === "answered" && answer.reply && acted)
          // Markers stripped rather than drawn. A toast is one line with a
          // control beside it, so a list has nowhere to go, and the raw
          // characters were showing.
          offerUndo(turnId, plainText(answer.reply));
        },
        // 017. Only on a change, and only for the turn still in flight.
        (step) =>
          setWorking((current) =>
            current?.messageId === messageId ? { ...current, step } : current,
          ),
      );
      polls.current.set(messageId, poll);
      setWorking({ messageId, turnId, since, step: null });
    },
    [offerUndo],
  );

  /** Stop the turn in flight. 017.
   *
   *  **The screen comes back on the press, not on the reply** (AC-8). The state
   *  is cleared here and the request goes out unawaited, because a stop that
   *  waits for a round trip looks broken on exactly the connection where
   *  somebody most wants to stop something.
   *
   *  The poll is stopped too. Without that it would keep asking about a turn
   *  nobody is working on, and would eventually draw the answer the person had
   *  already decided they did not want to wait for. */
  const stop = useCallback(() => {
    const turn = working;
    if (!turn) return;

    polls.current.get(turn.messageId)?.cancel();
    polls.current.delete(turn.messageId);
    setWorking(null);
    setWriting(false);
    // The turn reads as stopped straight away rather than when the worker
    // notices. The server settles it to the same state through the ordinary
    // path, so a reload agrees with what is already on screen.
    setTurns((current) =>
      current.map((t) => (t.id === turn.messageId ? { ...t, state: "cancelled" as const } : t)),
    );

    void cancelTurn(turn.turnId);
  }, [working]);

  /** A `+`'s own write. It never leaves the thread it was pinned to and it
   *  never becomes a turn: a section's `+` writing straight in and a note
   *  leave no trace in the conversation today, and pinning the composer to
   *  them does not change that. */
  const submitPin = useCallback(
    async (target: Pin, text: string): Promise<void> => {
      setDraft("");
      const ok =
        target.write === "note"
          ? await addNote(target.threadId, text).then(
              (result) => result !== null && !("tooLong" in result),
            )
          : await quickAdd(target.threadId, text, target.section ?? "", {
              ...(target.day ? { day: target.day } : {}),
            }).then((written) => written !== null);

      if (!ok) {
        // The words go back rather than vanishing into a failed request. The
        // field's own cap is the only refusal a note or a quick add ever had.
        setDraft(text);
        return;
      }
      setFiled({ threadIds: [target.threadId], at: Date.now() });
      setPin(null);
    },
    [],
  );

  // 020. Photos into the draft, from the picker or the share sheet. The
  // ordinary refusals happen here, on the device, so they never cost a
  // request; the server checks the same things again. A share releases a
  // pinned + first: a photo is a dump, and a + is a line of text.
  const addPhotos = useCallback(
    (picked: PickedPhoto[], via: "picker" | "share" = "picker") => {
      if (picked.length === 0) return;
      if (via === "share") {
        if (writing) {
          heldShare.current = [...heldShare.current, ...picked];
          return;
        }
        viaShare.current = true;
        setPin(null);
        setFolded(false);
        setFocusRequest((n) => n + 1);
      }
      setPhotos((current) => {
        const room = MAX_PHOTOS - current.length;
        if (room <= 0 || picked.length > room) setLine({ text: "Ten at a time." });
        const taken = picked.slice(0, Math.max(0, room)).map((file, at) => ({
          key: `${Date.now()}-${current.length + at}-${Math.random().toString(36).slice(2, 8)}`,
          uri: file.uri,
          // The file's own name, or "Photo", "Photo 2".
          name: file.name || (current.length + at === 0 ? "Photo" : `Photo ${current.length + at + 1}`),
          type: file.type,
          error: refusePhoto({ type: file.type, name: file.name ?? "", size: file.size }),
        }));
        return [...current, ...taken];
      });
    },
    [writing],
  );

  // The share that waited, once the send is done.
  useEffect(() => {
    if (writing || heldShare.current.length === 0) return;
    const held = heldShare.current;
    heldShare.current = [];
    addPhotos(held, "share");
  }, [writing, addPhotos]);

  const removePhoto = useCallback((key: string) => {
    setPhotos((current) => current.filter((photo) => photo.key !== key));
  }, []);

  const clearLine = useCallback(() => setLine(null), []);

  const submit = useCallback(async (): Promise<void> => {
    const text = draft.trim();
    const sendable = photos.filter((photo) => !photo.error);
    if (text.length === 0 && sendable.length === 0) return;
    // A chip the device refused holds the send: its remove control is the way
    // forward, and a send that quietly skipped it would file half a draft.
    if (photos.some((photo) => photo.error)) return;

    if (pin) {
      if (text.length === 0) return;
      await submitPin(pin, text);
      return;
    }

    setLine(null);
    setWriting(true);
    if (!live) {
      // One line in the header, whatever the dump's own breaks.
      const line = (text || (sendable.length === 1 ? "A photo" : `${sendable.length} photos`))
        .replace(/\s+/g, " ")
        .trim();
      setLive({ title: line.length > 40 ? `${line.slice(0, 40)}...` : line });
    }
    setFolded(false);

    const pressed = Date.now();
    // 020. The key belongs to the draft until it sends, and so does each
    // photo's, so a retry finds what the server already made.
    const clientKey = draftKey.current ?? (draftKey.current = `${pressed}`);
    try {
      // Each photo first, on its own, held unclaimed until the message claims
      // it. One that already landed on an earlier try is not sent again.
      const sentPhotos: PhotoOnWire[] = [];
      for (const photo of sendable) {
        const uploaded =
          photo.uploaded ??
          (await uploadPhoto({ uri: photo.uri, name: photo.name, type: photo.type }, photo.key));
        setPhotos((current) => current.map((p) => (p.key === photo.key ? { ...p, uploaded } : p)));
        sentPhotos.push({
          blobId: uploaded.blobId,
          name: photo.name,
          width: uploaded.width,
          height: uploaded.height,
          ready: false,
          // The file itself, until the server's copy exists.
          localUri: photo.uri,
        });
      }
      const sent = await sendDump(
        text,
        clientKey,
        onScreen?.id,
        sentPhotos.length ? { blobIds: sentPhotos.map((p) => p.blobId), viaShare: viaShare.current } : undefined,
      );
      if (!sent) {
        setWriting(false);
        setLine({ text: "Did not send.", retry: true });
        return;
      }
      setDraft("");
      // Only what went: a photo added while the send was out stays for the
      // next one.
      const went = new Set(sendable.map((photo) => photo.key));
      setPhotos((current) => current.filter((photo) => !went.has(photo.key)));
      draftKey.current = null;
      viaShare.current = false;
      setTurns((current) => [
        // 018. Chips leave with the next turn. The server decides whether the
        // words answered the question; the screen only knows it is no longer
        // open for a tap.
        ...current.map((turn) => (turn.question ? { ...turn, question: null } : turn)),
        {
          id: sent.messageId,
          from: "you",
          text,
          photos: sentPhotos,
          state: sent.state,
          turnId: sent.turnId,
        },
      ]);
      watch(sent.messageId, sent.turnId, pressed);
    } catch (error) {
      setWriting(false);
      if (error instanceof PhotoRefused && error.reason === "daily_limit") {
        setLine({ text: "Enough for today." });
      } else if (
        error instanceof PhotoRefused &&
        (error.reason === "too_big" || error.reason === "not_a_photo")
      ) {
        // The server disagreed with the device about one of them. Mark the
        // first chip not yet landed; the remove control is the way forward.
        const reason: ChipError = error.reason;
        setPhotos((current) => {
          const at = current.findIndex((p) => !p.error && !p.uploaded);
          return current.map((p, i) => (i === at ? { ...p, error: reason } : p));
        });
      } else if (error instanceof PhotoRefused && error.reason === "unavailable") {
        // No object store behind the API. A retry cannot help, so none.
        setLine({ text: "Not taking photos yet." });
      } else if (error instanceof UnknownBlob) {
        // The server no longer has one of the uploads: an hour passed and
        // the sweep took it. Forget what landed, so Retry uploads again.
        setPhotos((current) => current.map(({ uploaded: _gone, ...p }) => p));
        setLine({ text: "Did not send.", retry: true });
      } else {
        setLine({ text: "Did not send.", retry: true });
        failed("dump.send", error);
      }
    }
  }, [draft, photos, live, onScreen, pin, submitPin, watch]);

  // 018. One open question per conversation.
  const openQuestion = useMemo(
    () => turns.find((turn) => turn.question)?.question ?? null,
    [turns],
  );

  const answerOpen = useCallback(
    async (turnId: string, option: number): Promise<"answered" | "gone" | "failed"> => {
      const asked = turns.find((turn) => turn.id === turnId)?.question;
      const picked = asked?.options[option];
      if (!asked || !picked) return "gone";
      const { status, sent } = await answerQuestion(asked.id, option);
      // 404 means closed, answered elsewhere or gone: the chips leave and
      // there is nothing to retry. Anything else is the network or the
      // server, and the chips stay.
      if (!sent && status !== 404) return "failed";
      setTurns((current) => {
        const cleared = current.map((turn) =>
          turn.id === turnId ? { ...turn, question: null } : turn,
        );
        if (!sent) return cleared;
        return [
          ...cleared,
          {
            id: sent.messageId,
            from: "you" as const,
            text: picked.label,
            state: sent.state,
            turnId: sent.turnId,
            // The turn's second question, if the first had one behind it.
            question: sent.question ?? null,
            // The thread the answer changed: the Done mark and the pill, now
            // rather than after a reload.
            threads: sent.threads ?? [],
            did: (sent.threads?.length ?? 0) > 0,
          },
        ];
      });
      if (!sent) return "gone";
      if (sent.state === "seen") watch(sent.messageId, sent.turnId);
      // The way out changed nothing, so nothing reloads and nothing is undone.
      if (picked.kind !== "value") return "answered";
      // A value landed on a row somewhere. An empty list is "something
      // changed, work out what", the same signal Undo sends. And the eight
      // seconds: the answer is a turn of its own, and Undo puts the field back.
      setFiled({ threadIds: [], at: Date.now() });
      if (asked.field !== "country") offerUndo(sent.turnId, picked.label);
      return "answered";
    },
    [turns, watch, offerUndo],
  );

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
        raised: pin !== null || (live !== null && !folded),
        turns,
        writing,
        working,
        stop,
        draft,
        undoable,
        pin,
        onScreen,
        setOnScreen,
        sheetOpen: sheets > 0,
        openSheet,
        closeSheet,
        setDraft,
        submit,
        photos,
        addPhotos,
        removePhoto,
        line,
        clearLine,
        photoOpen,
        openPhoto: (turnId, index) => setPhotoOpen({ turnId, index }),
        closePhoto: () => setPhotoOpen(null),
        focusRequest,
        fold: () => setFolded(true),
        raise: () => setFolded(false),
        raiseFor,
        dismissPin,
        close,
        undo,
        finish,
        filed,
        resolveWaiting,
        openQuestion,
        answerOpen,
        tickFound,
      }}
    >
      {children}
    </ConversationContext.Provider>
  );
}


/** A screen sheet saying it is up, for as long as it is.
 *
 *  Anything a screen anchors to the bottom of itself is under the plate, which
 *  is mounted above the router. Call this from the sheet rather than from its
 *  caller: a sheet that closes itself would otherwise leave the plate hidden.
 */
export function useScreenSheet(open: boolean): void {
  const { openSheet, closeSheet } = useConversation();
  useEffect(() => {
    if (!open) return;
    openSheet();
    return closeSheet;
  }, [open, openSheet, closeSheet]);
}
