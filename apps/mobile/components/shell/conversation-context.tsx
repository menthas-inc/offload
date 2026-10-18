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
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { runOnJS, runOnUI, useSharedValue, withSpring, withTiming, type SharedValue } from "react-native-reanimated";
import { closeSpring, openSpring, plateAway } from "../../lib/motion";
import { PAST, startsFresh } from "../../lib/sheet";
import { raisedOf, settled } from "../../lib/conversation-sheet";
import { AppState, Linking, type AppStateStatus } from "react-native";
import { useAudioRecorder } from "expo-audio";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { openPdf as openPdfOnPhone, sharePdf, sweepPdfs } from "../../lib/pdf-open";
import { onClaimed } from "../../lib/device-data";
import { tailAsker } from "../../lib/conversation-tail";
import { plainText } from "@offload/markup";
import {
  DailyLimit,
  DumpTooLong,
  answerQuestion,
  awaitAnswer,
  cancelTurn,
  endConversation,
  fetchCurrent,
  type TailMessage,
  resumeDump,
  sendDump,
  undoTurn,
  uploadPhoto,
  uploadVoice,
  refuseFile,
  settledPhotos,
  draftName,
  PhotoRefused,
  VoiceRefused,
  UnknownBlob,
  type VoiceOnWire,
  type FoundResult,
  type FoundRow,
  type MessageState,
  type PhotoOnWire,
  type QuestionOnWire,
  type Source,
  type TouchedThread,
  type WaitingOn,
} from "../../lib/dump";
import type { ChipError } from "./AttachChip";
import { addNote, completeContent, fetchThread, provisionalId, quickAdd } from "../../lib/threads";
import { MAX_PDFS, MAX_PHOTOS, answeredWaiting, isPdf, labelQuery, stayedForgotten, takeFiles, turnDid, turnUndoable, undoShown, withReply } from "@offload/widgets";
import type { Label } from "../../lib/labels";
import { failed } from "../../lib/log";
import { fetchPeople, nameOf, type Person } from "../../lib/people";
import { mentionQuery, withMention } from "../people/MentionList";
import {
  RECORDING_OPTIONS,
  Session,
  deleteRecording,
  mmss,
  sweepRecordings,
  type Recording,
} from "../../lib/recorder";
import { putKeyboardAway } from "../../lib/keyboard";
import { useMe } from "../../lib/me";
import { closedForTheDay } from "../../lib/composer";

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
  /** 025. The labels the turn applied, for the footer's marks. */
  labels?: { id: string; name: string; colour: number }[];
  /** Whether the turn actually did something, from the record rather than the
   *  reply. A tick that means "the turn ended" says Done about a refusal. */
  did?: boolean;
  /** A calendar write this turn proposed and nobody has answered yet.
   *
   *  **The reply carries its own control.** offload saying it will add
   *  something once you confirm, with nothing to confirm, is the dead end this
   *  exists to close: the proposal expires in an hour having done nothing. */
  waiting?: WaitingOn | null;
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
  /** 021. The voice note it carried, with its transcript once written. */
  voice?: VoiceOnWire | null;
  /** 026. A forwarded email: its subject heads the bubble. */
  mail?: { subject: string; note: string } | null;
  /** The send itself did not land, so nothing on the server knows this turn.
   *  Drawn as the failed state with different words: the dump is not saved,
   *  and Try again puts the words back in the field. Local only, never on the
   *  wire, which is why it is not a `MessageState`. */
  unsent?: boolean;
}

/** A `+`'s write that has left the composer and not yet settled.
 *
 *  The composer goes away at the press and the thread screen draws the row
 *  from this, with the words as its title, before the server has it. Once it
 *  lands `landedId` is set, and the screen keeps drawing the row under that id
 *  until its own reload brings the real one, then adopts the entry. If it does
 *  not land the entry goes and the shell's toast offers the words again. */
export interface ProvisionalWrite {
  key: string;
  threadId: string;
  write: "quickAdd" | "note";
  section?: string;
  day?: string;
  text: string;
  landedId?: string;
}

/** A word for the shell's toast, with at most one way forward. Stamped so the
 *  shell shows each one once. */
export interface Notice {
  at: number;
  message: string;
  action?: { label: string; onPress: () => void | Promise<void> };
}

/** 020. A photo waiting in the composer. The key belongs to the draft until
 *  it sends, so a retry finds the upload the server already made. */
export interface DraftPhoto {
  key: string;
  uri: string;
  /** 041. A photo or a PDF, from the file's own type or name. */
  kind: "image" | "pdf";
  name: string;
  /** Whether the name is the file's own, for counting "PDF 2". */
  named: boolean;
  type: string | null;
  error: ChipError;
  /** Set once the server has it. A retry skips what already landed. */
  uploaded?: { blobId: string; kind: "image" | "pdf"; width?: number; height?: number; pages?: number };
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
  /** Whether the sheet is up: a live conversation that is open, or a pin.
   *  Computed once here rather than at each of the sheet, its scrim and the
   *  plate, because the three disagreeing is exactly how a pin ended up with
   *  two composers on screen at once during this feature's own build.
   *
   *  **It follows the animation, never leads it** (30 September 2026). A
   *  close from the grabber, the scrim or back runs the sheet to the edge
   *  first and only then sets this false. */
  raised: boolean;
  /** The sheet's one position, in pixels on the UI thread: 0 is open, its
   *  travel closed. The sheet, its scrim, the page behind and the tab bar
   *  all read it, so a finger moves all of them in the same frame. */
  sheetY: SharedValue<number>;
  sheetTravel: SharedValue<number>;
  /** Where the sheet was last sent, so a change of `raised` from anywhere
   *  animates it once and never restarts a spring already heading there. */
  sheetGoal: SharedValue<number>;
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
  /** 022. Who an @ in the draft picked, kept while their name is still in
   *  the text, and the connections the @ list offers, read once. */
  mentions: { accountId: string; name: string }[];
  mentionPeople: Person[] | null;
  pickMention: (person: Person) => void;
  /** 025. The labels of the thread on screen, read the first time a # is
   *  typed there, and a pick, kept while its #Name is in the text. */
  hashLabels: Label[] | null;
  pickHash: (name: string, id?: string) => void;
  submit: () => Promise<void>;
  /** 020. The photos in the draft, and the ways in and out. `addPhotos` from
   *  the picker or the share sheet; `line` is the one clause under the
   *  composer when a send did not go, with Retry when that is the way forward. */
  photos: DraftPhoto[];
  addPhotos: (picked: PickedPhoto[], via?: "picker" | "share") => void;
  removePhoto: (key: string) => void;
  /** 020, per the 21 September design: the product's own sheet, library
   *  first, no Cancel row. Raised by the composer's camera and drawn by the
   *  shell, above the plate, where a sheet raised inside the composer's own
   *  box could not reach. */
  photoSheet: boolean;
  offerPhoto: () => void;
  closePhotoSheet: () => void;
  pickPhotos: (from: "library" | "camera") => Promise<void>;
  /** 041. The platform's document picker, PDFs only. */
  pickPdfs: () => Promise<void>;
  /** 041. Open a PDF in the platform's viewer, saying what happened when it
   *  did not open, with its way forward. */
  openPdf: (pdf: { blobId: string; openable?: boolean; unreadable?: boolean }, title: string | null) => void;
  line: { text: string; action?: { label: string; onPress: () => void } } | null;
  clearLine: () => void;
  /** The day's model budget is spent or its turns are used: the composer is
   *  closed, said by the account on load or learned from a refusal. */
  dayUsed: boolean;
  /** A line under the composer: one clause, and the way forward beside it. */
  sayLine: (line: { text: string; action?: { label: string; onPress: () => void } }) => void;
  /** 021. The voice note in the composer: recording, or stopped and waiting
   *  for Send or Discard, as the same row with no dot. Lives here beside
   *  `draft` and `photos` so the sheet and the plate share it and folding
   *  mid-recording carries the row. The live window and the running time
   *  are not state here: they change ten times a second, and every consumer
   *  of this context would re-render with them, so the row reads them from
   *  `liveSamples` on its own clock. */
  recording: boolean;
  note: Recording | null;
  liveSamples: { current: { live: number[]; elapsedMs: number } };
  /** Tap the microphone: ask once, then record. The refusal is the one line. */
  startRecording: () => Promise<void>;
  /** Stop and keep nothing; past a minute the note waits under the toast. */
  discardRecording: () => Promise<void>;
  /** 020. The photo of a sent message open in the viewer, which the shell
   *  mounts above the sheet. */
  photoOpen: { turnId: string; index: number } | null;
  openPhoto: (turnId: string, index: number) => void;
  closePhoto: () => void;
  /** 020. A share sheet arrival wants the field focused and the keyboard up,
   *  which only the mounted composer can do. Bumped per arrival; the composer
   *  consumes it. */
  focusRequest: number;
  /** Bring the conversation back, from a tap on the plate's composer.
   *  False when there is none to bring back: never one, or one put away for
   *  thirty minutes, which this ends so the next dump starts a new one. */
  raise: (options?: { focus?: boolean }) => boolean;
  /** 027. Today's Answer made the conversation that asked a question the
   *  current one: load it in place of whatever was here and open it with the
   *  field focused, where the question's invitation is. False when there was
   *  nothing to load. */
  resumeConversation: () => Promise<boolean>;
  /** Put the sheet away, keeping the conversation: the thread pill, an
   *  answer's thread. A pin goes, since a pin put away is a pin dismissed. */
  lower: () => void;
  /** The sheet reached its closed edge under a finger or back. */
  settle: () => void;
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
  /** The same count on the UI thread, for the plate's slide: through React it
   *  arrived a few hundred milliseconds after the sheet, by which time the
   *  sheet's keyboard had carried the plate up over it. */
  sheetCount: SharedValue<number>;
  /** 1 while the plate's own field has the keyboard: the plate rides the
   *  keyboard then and at no other time. Set by the field's focus, cleared by
   *  the shell once that keyboard has gone, and by anything that takes the
   *  plate's place (the conversation, a screen sheet). */
  composerFocused: SharedValue<number>;
  /** The plate's tabs and the inset under them: what the keyboard covers
   *  before it reaches the composer. */
  plateFoot: SharedValue<number>;
  /** The native tag of the plate's field, so the shell can tell on the UI
   *  thread, from the keyboard's own event, whether a keyboard is the
   *  plate's. */
  plateInput: SharedValue<number>;
  /** When the last screen sheet closed. Android hands a closing sheet's focus
   *  to the composer, and the composer gives it straight back. */
  sheetClosedAt: { current: number };
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
  resolveWaiting: (turn: { id: string; turnId?: string }, agreed: boolean) => void;
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
  /** A send that did not land: the turn goes and the words come back. */
  retry: (messageId: string) => void;
  /** The `+` writes in flight, for the thread screen to draw. */
  provisional: ProvisionalWrite[];
  /** The screen's own reload has the real row now, so the entry can go. */
  adoptProvisional: (key: string) => void;
  /** Something for the shell's toast to say. */
  notice: Notice | null;
  /** 022. Say it from a screen that is about to go: Leave from a thread's
   *  More pops the screen, and the toast has to outlive it. */
  notify: (message: string, action?: Notice["action"]) => void;
}

/** The tail as turns, for the load and for Today's Answer. */
function turnsOfTail(tail: TailMessage[]): Turn[] {
  return tail.map((message) => ({
    id: message.id,
    from: message.role === "person" ? "you" : "offload",
    text: message.text ?? "",
    photos: message.photos ?? [],
    voice: message.voice ?? null,
    mail: message.mail ?? null,
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
    labels: message.labels ?? [],
    did: turnDid(message),
  }));
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
  // Whether the conversation's sheet is up. There is no fold any more (30
  // September 2026): a conversation is raised or put away, and put away it
  // keeps its turns and its draft here.
  const [open, setOpen] = useState(false);
  // When it was put away, for the thirty minute rule. Null while it is up.
  const closedAt = useRef<number | null>(null);
  // A stale conversation's end, awaited by the next dump so the server has
  // closed it before the dump asks which conversation it joins.
  const stopping = useRef<Promise<void> | null>(null);
  const sheetY = useSharedValue(10_000);
  const sheetTravel = useSharedValue(0);
  const sheetGoal = useSharedValue(10_000);
  const [turns, setTurns] = useState<Turn[]>([]);
  // The turns as drawn, for an Undo pressed after they changed.
  const shownTurns = useRef(turns);
  shownTurns.current = turns;
  // 020. The photos in the draft, the draft's own key, whether they came
  // through the share sheet, and the one line under the composer.
  const [photos, setPhotos] = useState<DraftPhoto[]>([]);
  const draftKey = useRef<string | null>(null);
  const viaShare = useRef(false);
  const [line, setLine] = useState<{ text: string; action?: { label: string; onPress: () => void } } | null>(null);
  const me = useMe();
  const [refusedToday, setRefusedToday] = useState(false);
  const [photoOpen, setPhotoOpen] = useState<{ turnId: string; index: number } | null>(null);
  const [focusRequest, setFocusRequest] = useState(0);
  // 020. A share that lands while a send is out waits for it: the chips
  // appear when the send finishes, rather than being wiped by it.
  const heldShare = useRef<PickedPhoto[]>([]);
  // 021. One recorder for the app's life, driven per note by a `Session`;
  // the note once stopped; the upload it may already have made under the
  // draft's key; and the notes of sends that never landed, keyed by the
  // turn they were drawn under, so Try again puts one back in the row.
  const recorder = useAudioRecorder(RECORDING_OPTIONS);
  const session = useRef<Session | null>(null);
  // Set before the first await of a start and cleared after, so a second
  // call in that window is a no-op. A cold launch from the Record shortcut
  // delivers the action twice, once as the launching intent and once to the
  // listener, and the second start found no session yet, prepared a
  // recorder that was already recording, and drew the microphone line over
  // a recording that was running.
  const starting = useRef(false);
  const [recording, setRecording] = useState(false);
  const liveSamples = useRef({ live: [] as number[], elapsedMs: 0 });
  const [note, setNote] = useState<Recording | null>(null);

  const noteUploaded = useRef<{ blobId: string } | null>(null);
  const sentNotes = useRef<Map<string, Recording>>(new Map());
  useEffect(() => sweepRecordings(), []);
  const [pin, setPin] = useState<Pin | null>(null);
  // 032. A section's + writes a row as typed and no model reads it, so the
  // day's limit never closes the field it raises.
  const dayUsed = closedForTheDay(me, refusedToday, pin !== null);
  // Read through a ref by the shortcut's arrival, which releases a pin and
  // records in the same tick, before the closure could see the pin go.
  const pinRef = useRef<Pin | null>(null);
  useEffect(() => {
    pinRef.current = pin;
  }, [pin]);
  const [onScreen, setOnScreen] = useState<{ id: string; name: string } | null>(null);
  const [sheets, setSheets] = useState(0);
  const sheetCount = useSharedValue(0);
  const composerFocused = useSharedValue(0);
  const plateFoot = useSharedValue(0);
  const plateInput = useSharedValue(-1);
  const sheetClosedAt = useRef(0);
  const openSheet = useCallback(() => setSheets((open) => open + 1), []);
  const closeSheet = useCallback(() => setSheets((open) => Math.max(0, open - 1)), []);

  const [provisional, setProvisional] = useState<ProvisionalWrite[]>([]);
  const [notice, setNotice] = useState<Notice | null>(null);
  const notify = useCallback((message: string, action?: Notice["action"]) => {
    setNotice({ at: Date.now(), message, ...(action ? { action } : {}) });
  }, []);

  const resolveWaiting = useCallback((turn: { id: string; turnId?: string }, agreed: boolean) => {
    setTurns((current) => answeredWaiting(current, turn, agreed));
    // The write happened on the press, so Today reads again.
    if (agreed) setFiled({ threadIds: [], at: Date.now() });
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
  const tickFound = useCallback(async function tickFound(turnId: string, row: FoundRow) {
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
      notify(next ? "Couldn't tick that off" : "Couldn't put that back", {
        label: "Retry",
        onPress: () => tickFound(turnId, row),
      });
      return;
    }
    // The thread screen behind this sheet is now stale. The same signal a dump
    // fires, for the same reason: a screen already showing that thread updates
    // itself rather than quietly disagreeing with the answer.
    setFiled({ threadIds: [row.threadId], at: Date.now() });
  }, [notify]);

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
  const [mentions, setMentions] = useState<{ accountId: string; name: string }[]>([]);
  const [mentionPeople, setMentionPeople] = useState<Person[] | null>(null);
  // 022. The list, read the first time an @ is typed and kept for the
  // session: three people do not change while somebody is typing.
  useEffect(() => {
    if (mentionPeople !== null || mentionQuery(draft) === null) return;
    let live = true;
    void fetchPeople().then((page) => {
      if (live) setMentionPeople(page?.connections ?? []);
    });
    return () => {
      live = false;
    };
  }, [draft, mentionPeople]);
  // 025. What a # picked, and the labels of the thread on screen.
  const [hashPicks, setHashPicks] = useState<({ id: string; name: string } | { name: string })[]>([]);
  const [hashFor, setHashFor] = useState<{ threadId: string; labels: Label[] } | null>(null);
  useEffect(() => {
    if (!onScreen || labelQuery(draft) === null || hashFor?.threadId === onScreen.id) return;
    let live = true;
    const threadId = onScreen.id;
    void fetchThread(threadId).then((bundle) => {
      if (live && bundle) setHashFor({ threadId, labels: bundle.labels });
    });
    return () => {
      live = false;
    };
  }, [draft, onScreen, hashFor]);
  const pickHash = useCallback((name: string, id?: string) => {
    setDraft((current) => current.replace(/(^|\s)#([\p{L}\p{N}_-]*)$/u, (_, lead: string) => `${lead}#${name.replace(/\s+/g, "")} `));
    setHashPicks((current) => [
      ...current.filter((one) => one.name.toLowerCase() !== name.toLowerCase()),
      id ? { id, name } : { name },
    ]);
  }, []);
  const pickMention = useCallback((person: Person) => {
    const name = nameOf(person);
    setDraft((current) => withMention(current, name));
    setMentions((current) => [...current.filter((m) => m.accountId !== person.accountId), { accountId: person.accountId, name }]);
  }, []);
  const [undoable, setUndoable] = useState<Undoable | null>(null);
  const [filed, setFiled] = useState<{
    threadIds: string[];
    at: number;
  } | null>(null);

  const polls = useRef(new Map<string, ReturnType<typeof awaitAnswer>>());
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);


  const dismissPin = useCallback(() => {
    // Synchronously, so the shortcut's "release the pin, then record" in one
    // tick sees it gone; the effect above keeps the ref right everywhere else.
    pinRef.current = null;
    setPin(null);
  }, []);

  const raised = raisedOf({ pinned: pin !== null, live: live !== null, open });
  // For callbacks that run after a render has moved on: a spring's end, a
  // share arriving in the same tick as the call that raises for it.
  const raisedRef = useRef(raised);
  raisedRef.current = raised;
  const liveRef = useRef(live);
  liveRef.current = live;

  /** Send the sheet open or closed, on the UI thread. Idempotent: a spring
   *  already heading there is left alone, so a state change arriving after
   *  the finger has done the work does not restart anything. `after` runs
   *  once it is closed. */
  const springTo = useCallback(
    (up: boolean, after?: () => void) => {
      runOnUI((toOpen: boolean) => {
        "worklet";
        const travel = sheetTravel.value;
        const goal = toOpen ? 0 : travel + PAST;
        // Already down: say so, even if the goal says it was sent there, so a
        // close asked for again always settles.
        if (!toOpen && (travel <= 0 || sheetY.value >= travel)) {
          sheetGoal.value = goal;
          if (after) runOnJS(after)();
          return;
        }
        if (sheetGoal.value === goal) return;
        sheetGoal.value = goal;
        // Never from further away than its own height: the first raise
        // starts from well off the screen.
        if (toOpen && sheetY.value > travel) sheetY.value = travel;
        sheetY.value = withSpring(goal, toOpen ? openSpring : closeSpring, (done) => {
          if (done && !toOpen && after) runOnJS(after)();
        });
      })(up);
    },
    [sheetGoal, sheetTravel, sheetY],
  );

  // Whatever changed `raised`, the sheet follows it. Before paint, so the
  // spring starts in the frame that shows the change.
  useLayoutEffect(() => {
    springTo(raised);
    // The plate is under the sheet now, and its field hands the keyboard on.
    if (raised) composerFocused.value = withTiming(0, plateAway);
  }, [raised, springTo, composerFocused]);

  /** End the conversation: this subject is over, so the next dump starts a
   *  new one however soon it arrives. Since 30 September nothing on screen
   *  does this; a conversation put away for thirty minutes ends itself on
   *  the next tap into the composer or the next dump. */
  const end = useCallback(() => {
    setLive(null);
    setTurns([]);
    setOpen(false);
    closedAt.current = null;
    const request = endConversation().finally(() => {
      if (stopping.current === request) stopping.current = null;
    });
    stopping.current = request;
  }, []);

  // **Both start the sheet from the press**, before React has rendered the
  // change, as the handoff asks. Left to the effect, the rise waited on a
  // render that took a quarter of a second in a development build, and a sheet
  // leaving on the UI thread (the action that raised a pin) left a gap with no
  // scrim between the two.
  const raiseFor = useCallback(
    (next: Pin) => {
      setDraft("");
      setPin(next);
      springTo(true);
    },
    [springTo],
  );

  /** Open the conversation if there is one to open. */
  const bringBack = useCallback((): boolean => {
    if (startsFresh(closedAt.current, Date.now())) {
      end();
      return false;
    }
    if (liveRef.current === null) return false;
    closedAt.current = null;
    setOpen(true);
    // From the press, and mid-close too, where `raised` is still true and
    // would not change.
    springTo(true);
    return true;
  }, [end, springTo]);

  const raise = useCallback(
    (options?: { focus?: boolean }): boolean => {
      const back = bringBack();
      if (back && options?.focus) setFocusRequest((n) => n + 1);
      return back;
    },
    [bringBack],
  );

  const resumeConversation = useCallback(async (): Promise<boolean> => {
    const tail = await fetchCurrent().catch(() => null);
    if (!tail || tail.length === 0) return false;
    // The conversation on screen goes whole, its polls with it: one landing
    // later would write its answer over the turns loaded here.
    for (const poll of polls.current.values()) poll.cancel();
    polls.current.clear();
    setWorking(null);
    setWriting(false);
    setTurns(turnsOfTail(tail));
    setLive((current) => current ?? { title: "" });
    closedAt.current = null;
    setOpen(true);
    springTo(true);
    setFocusRequest((n) => n + 1);
    return true;
  }, [springTo]);

  /** The sheet is at its closed edge: now say so. Both reasons it was up end
   *  together (`settled`): clearing only the pin once left a conversation
   *  that had opened underneath it "up" with the sheet off the screen. */
  const settle = useCallback(() => {
    const was = { pinned: pinRef.current !== null, live: liveRef.current !== null, open: true };
    const next = settled(was);
    if (!next.pinned && was.pinned) dismissPin();
    setOpen(next.open);
    if (was.live) closedAt.current = Date.now();
  }, [dismissPin]);

  const lower = useCallback(() => {
    putKeyboardAway();
    springTo(false, settle);
  }, [settle, springTo]);

  // The conversation as the database has it, so reopening the app does not look
  // like a fresh account. Asked on mount and again when launch claims the
  // phone: after a sign-out this mounts with nobody signed in, and the person
  // who signs in next would otherwise find their conversation empty until a
  // relaunch (`lib/conversation-tail.ts`).
  const [askTail] = useState(() =>
    tailAsker(async () => {
      try {
        const tail = await fetchCurrent();
        if (tail === null) return false;
        if (tail.length === 0) return true;
        setTurns(turnsOfTail(tail));
        // A conversation to come back to, put away as of its last message:
        // the thirty minute rule reads this after a cold start.
        setLive((current) => current ?? { title: "" });
        const last = tail[tail.length - 1]?.createdAt;
        if (closedAt.current === null) closedAt.current = last ? Date.parse(last) : Date.now();
        return true;
      } catch (error) {
        failed("conversation.tail", error);
        return false;
      }
    }),
  );
  useEffect(() => {
    askTail();
    return onClaimed(() => askTail());
  }, [askTail]);

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

        const did = turnDid(answer);
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
                  labels: answer.labels ?? [],
                  question: answer.question ?? null,
                  // 020. The renditions are made before the model reads the
                  // photos, so a settled turn's thumbnails exist; one that
                  // could not be opened draws the glyph when its fetch fails.
                  // 041. And the answer says which PDFs can be opened.
                  photos: settledPhotos(turn.photos, answer.photos),
                  // 021. The transcript, as the settled read has it.
                  voice: answer.voice
                    ? {
                        ...turn.voice,
                        ...answer.voice,
                        ...(turn.voice?.localUri ? { localUri: turn.voice.localUri } : {}),
                      }
                    : (turn.voice ?? null),
                }
              : // 018. The next turn closes the last question whatever it says.
                { ...turn, question: null },
          );
          if (!answer.reply) return next;
          // A resumed or re-read turn already has a reply on screen.
          return withReply<Turn>(next, {
            id: `${messageId}-reply`,
            from: "offload" as const,
            text: answer.reply,
            turnId,
            waiting: answer.waiting ?? null,
            found: answer.found ?? [],
          });
        });

        // `changed`, not `threads`: a turn that moved a piece out of the thread
        // you are looking at changed it without filing anything into it, and
        // `threads` is only where things went. That gap left a moved row on
        // screen in a thread it was no longer in.
        //
        // And a turn that only changed a calendar names no thread at all: a
        // removed event stayed on Today until the screen was opened again.
        const acted = turnUndoable(answer);
        if (acted) setFiled({ threadIds: answer.changed, at: Date.now() });
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
        // 021. Drawn the moment the poll finds it, ahead of the reply. A
        // conversation that opened with the note takes its words as its
        // title, as the web's header does.
        (transcript) => {
          setTurns((current) =>
            current.map((turn) =>
              turn.id === messageId && turn.voice
                ? { ...turn, voice: { ...turn.voice, transcript, transcribed: true } }
                : turn,
            ),
          );
          const words = transcript.replace(/\s+/g, " ").trim();
          if (words)
            setLive((current) =>
              current?.title.startsWith("Voice note, ")
                ? { title: words.length > 40 ? `${words.slice(0, 40)}...` : words }
                : current,
            );
        },
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
   *  them does not change that.
   *
   *  **The composer goes away at the press.** The write joins `provisional` and
   *  the thread screen draws the row from it; the server's id is noted on the
   *  entry when it lands, and the entry goes once the screen's own reload has
   *  the real row, or after a while if no screen is there to adopt it. If it
   *  does not land, the entry goes at once and the shell's toast offers the
   *  words again. */
  const submitPin = useCallback(
    async function submitPin(target: Pin, text: string): Promise<void> {
      setDraft("");
      setPin(null);
      const key = provisionalId();
      setProvisional((current) => [
        ...current,
        {
          key,
          threadId: target.threadId,
          write: target.write,
          text,
          ...(target.section ? { section: target.section } : {}),
          ...(target.day ? { day: target.day } : {}),
        },
      ]);

      const landed =
        target.write === "note"
          ? await addNote(target.threadId, text).then((result) =>
              result !== null && !("tooLong" in result) ? result.note.id : null,
            )
          : await quickAdd(target.threadId, text, target.section ?? "", {
              ...(target.day ? { day: target.day } : {}),
            }).then((written) => written?.id ?? null);

      if (!landed) {
        setProvisional((current) => current.filter((one) => one.key !== key));
        notify("Couldn't add that", { label: "Retry", onPress: () => submitPin(target, text) });
        return;
      }
      setProvisional((current) =>
        current.map((one) => (one.key === key ? { ...one, landedId: landed } : one)),
      );
      setFiled({ threadIds: [target.threadId], at: Date.now() });
      // The backstop for a screen that is not there to adopt it.
      setTimeout(() => setProvisional((current) => current.filter((one) => one.key !== key)), 15000);
    },
    [notify],
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
        // Into the conversation if there is one to go back to, into the
        // plate's composer if not; the focus goes to whichever is on top.
        bringBack();
        setFocusRequest((n) => n + 1);
      }
      setPhotos((current) => {
        // 041. Ten in all, two of them PDFs, and the line for what was left.
        const { taken, line } = takeFiles(current, picked);
        if (line) setLine({ text: line });
        const added: DraftPhoto[] = [];
        for (const [at, file] of taken.entries()) {
          // The file's own name, or "Photo", "Photo 2", "PDF", "PDF 2".
          const name = draftName(file, [...current, ...added]);
          added.push({
            key: `${Date.now()}-${current.length + at}-${Math.random().toString(36).slice(2, 8)}`,
            uri: file.uri,
            kind: isPdf(file) ? "pdf" : "image",
            name,
            named: Boolean(file.name),
            type: file.type,
            error: refuseFile({ type: file.type, name: file.name ?? "", size: file.size }),
          });
        }
        return [...current, ...added];
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

  const [photoSheet, setPhotoSheet] = useState(false);
  /** The picker or the camera. The picker needs no permission on either
   *  platform; the camera does, and a refusal is the one line with the way
   *  to the settings beside it. */
  const pickPhotos = useCallback(
    async (from: "library" | "camera"): Promise<void> => {
      const room = MAX_PHOTOS - photos.length;
      if (room <= 0) return addPhotos([]);
      let result: ImagePicker.ImagePickerResult;
      if (from === "camera") {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          setLine({
            text: "Camera is off for offload.",
            action: { label: "Open settings", onPress: () => void Linking.openSettings() },
          });
          return;
        }
        result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 1 });
      } else {
        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ["images"],
          allowsMultipleSelection: true,
          selectionLimit: room,
          quality: 1,
        });
      }
      if (result.canceled) return;
      const picked: PickedPhoto[] = result.assets.map((asset) => ({
        uri: asset.uri,
        // The Android picker names a file by its media id, `64349.jpg`, which
        // is an identifier and not a name: the chip says "Photo" instead.
        name: asset.fileName && !/^\d+\.\w+$/.test(asset.fileName) ? asset.fileName : null,
        type: asset.mimeType ?? null,
        size: asset.fileSize ?? null,
      }));
      addPhotos(picked, "picker");
      setFocusRequest((n) => n + 1);
    },
    [photos.length, addPhotos],
  );

  /** 041. The platform's document picker, PDFs only, several at once. It
   *  copies what is picked into the app's cache, which is what the upload
   *  reads. */
  const pickPdfs = useCallback(async (): Promise<void> => {
    if (photos.filter((photo) => photo.kind === "pdf").length >= MAX_PDFS) {
      setLine({ text: "Two PDFs at a time." });
      return;
    }
    const result = await DocumentPicker.getDocumentAsync({
      type: "application/pdf",
      multiple: true,
      copyToCacheDirectory: true,
    });
    if (result.canceled) return;
    addPhotos(
      result.assets.map((asset) => ({
        uri: asset.uri,
        name: asset.name || null,
        type: asset.mimeType ?? "application/pdf",
        size: asset.size ?? null,
      })),
      "picker",
    );
    setFocusRequest((n) => n + 1);
  }, [photos, addPhotos]);

  /** 041. A PDF opened from a tile or a thumbnail, and each way it may not
   *  open said in one line with what acts on it. */
  const openPdf = useCallback(
    (pdf: { blobId: string; openable?: boolean; unreadable?: boolean }, title: string | null) => {
      void openPdfOnPhone(pdf, title).then((outcome) => {
        if (outcome === "never") notify("Can't open this one.");
        else if (outcome === "not_yet") notify("Not here yet.", { label: "Retry", onPress: () => openPdf(pdf, title) });
        else if (outcome === "failed") notify("Did not open.", { label: "Retry", onPress: () => openPdf(pdf, title) });
        else if (outcome === "no_viewer") notify("Did not open.", { label: "Share", onPress: () => sharePdf(pdf.blobId, title) });
      });
    },
    [notify],
  );

  // 041. A copy a kill or a viewer left behind goes on launch; a session's
  // end takes the folder with the rest of the account (`device-data.ts`).
  useEffect(() => sweepPdfs(), []);

  const removePhoto = useCallback((key: string) => {
    setPhotos((current) => current.filter((photo) => photo.key !== key));
  }, []);

  const clearLine = useCallback(() => setLine(null), []);

  const adoptProvisional = useCallback((key: string) => {
    setProvisional((current) => current.filter((one) => one.key !== key));
  }, []);

  /** A send that did not land. The turn goes and the words come back, in the
   *  field, where the next press sends them again. */
  const retry = useCallback((messageId: string) => {
    setTurns((current) => {
      const turn = current.find((one) => one.id === messageId);
      if (!turn) return current;
      setDraft(turn.text);
      // 021. The note comes back to its row, stopped and sendable, beside
      // the words and the chips.
      const spoken = sentNotes.current.get(messageId);
      if (spoken) {
        sentNotes.current.delete(messageId);
        setNote(spoken);
      }
      return current.filter((one) => one.id !== messageId);
    });
  }, []);

  // 021. Tap the microphone. The pinned + is a line of text and does not
  // record; a note in the row already means nothing more happens.
  const startRecording = useCallback(async (): Promise<void> => {
    if (starting.current || session.current || note || pinRef.current) return;
    starting.current = true;
    setLine(null);
    try {
      const started = await Session.start(
        recorder,
        (live, elapsedMs) => {
          liveSamples.current = { live, elapsedMs };
        },
        () => {
          // Stopped on its own: the cap, a call, the app leaving the screen.
          // The note stays in the row.
          const ended = session.current;
          session.current = null;
          void ended?.take().then((taken) => {
            setRecording(false);
            setNote(taken);
          });
        },
      );
      session.current = started;
      liveSamples.current = { live: [], elapsedMs: 0 };
      setRecording(true);
    } catch (error) {
      // The line, with the way forward beside it, as the camera's refusal
      // has. Only a refused microphone names the microphone; anything else
      // that stopped the start is said without a guess at why.
      if (error instanceof Error && error.message === "microphone refused") {
        setLine({
          text: "Microphone is off for offload.",
          action: { label: "Open settings", onPress: () => void Linking.openSettings() },
        });
      } else {
        setLine({ text: "Couldn't start recording.", action: { label: "Try again", onPress: () => void startRecording() } });
      }
    } finally {
      starting.current = false;
    }
  }, [note, recorder]);

  const discardRecording = useCallback(async (): Promise<void> => {
    const current = session.current;
    session.current = null;
    const taken = current ? await current.take() : note;
    setRecording(false);
    setNote(null);
    noteUploaded.current = null;
    if (!taken) return;
    if (taken.durationMs > 60_000) {
      // Discard sits a thumb's width from Send. Past a minute the note is
      // parked under the toast for eight seconds and deleted after.
      notify("Discarded", { label: "Undo", onPress: () => setNote(taken) });
      setTimeout(() => {
        setNote((held) => {
          if (held?.uri === taken.uri) return held;
          deleteRecording(taken.uri);
          return held;
        });
      }, 8_500);
    } else deleteRecording(taken.uri);
  }, [note, notify]);

  // Never in the background: the app leaving the screen stops the note.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") void session.current?.stop();
    });
    return () => sub.remove();
  }, []);

  const submit = useCallback(async (): Promise<void> => {
    if (dayUsed) return;
    const text = draft.trim();
    const sendable = photos.filter((photo) => !photo.error);
    const holdsNote = session.current !== null || note !== null;
    if (text.length === 0 && sendable.length === 0 && !holdsNote) return;
    // A chip the device refused holds the send: its remove control is the way
    // forward, and a send that quietly skipped it would file half a draft.
    if (photos.some((photo) => photo.error)) return;

    if (pin) {
      if (text.length === 0) return;
      await submitPin(pin, text);
      return;
    }

    // 021. Send stops the recording and sends it. Taken ahead of the bubble,
    // so the bubble draws the note's final bars.
    const ending = session.current;
    session.current = null;
    const spoken = ending ? await ending.take() : note;
    setRecording(false);
    setNote(null);

    setLine(null);
    setWriting(true);
    // A conversation put away for thirty minutes is over: end it, and wait
    // for the end to land so this dump cannot join it on the server.
    const fresh = !raisedRef.current && startsFresh(closedAt.current, Date.now());
    if (fresh) end();
    if (stopping.current) await stopping.current;
    if (!live || fresh) {
      // One line in the header, whatever the dump's own breaks.
      const line = (
        text ||
        (spoken
          ? `Voice note, ${mmss(spoken.durationMs)}`
          : sendable.length === 1
            ? "A photo"
            : `${sendable.length} photos`)
      )
        .replace(/\s+/g, " ")
        .trim();
      setLive({ title: line.length > 40 ? `${line.slice(0, 40)}...` : line });
    }
    closedAt.current = null;
    setOpen(true);

    // **The bubble appears at the press.** The send takes a second or more on
    // a phone, and for that second the conversation used to show nothing,
    // which read as a button that had not worked. The turn joins under an id
    // only this app knows and the server's replaces it when the send lands.
    // If it does not, the bubble takes the failed state with its own words,
    // since nothing is saved, and Try again puts the text back.
    const pressed = Date.now();
    // 020. The key belongs to the draft until it sends, and so does each
    // photo's, so a retry finds what the server already made.
    const clientKey = draftKey.current ?? (draftKey.current = `${pressed}`);
    const provisional = `unsent:${clientKey}`;
    setDraft("");
    // The photos as they are drawn until the server's copies exist: the file
    // itself, under the chip's key until the upload gives it a blob.
    const shown: PhotoOnWire[] = sendable.map((photo) =>
      photo.kind === "pdf"
        ? // 041. A PDF has no picture of its own until page 1 is drawn.
          { blobId: photo.uploaded?.blobId ?? photo.key, kind: "pdf", name: photo.name, ready: false, openable: false }
        : {
            blobId: photo.uploaded?.blobId ?? photo.key,
            kind: "image",
            name: photo.name,
            width: photo.uploaded?.width ?? 0,
            height: photo.uploaded?.height ?? 0,
            ready: false,
            localUri: photo.uri,
          },
    );
    const shownVoice: VoiceOnWire | null = spoken
      ? {
          blobId: noteUploaded.current?.blobId ?? `${clientKey}-voice`,
          durationMs: spoken.durationMs,
          waveform: spoken.waveform,
          transcript: null,
          transcribed: false,
          localUri: spoken.uri,
        }
      : null;
    if (spoken) sentNotes.current.set(provisional, spoken);
    setTurns((current) => [
      // 018. Chips leave with the next turn. The server decides whether the
      // words answered the question; the screen only knows it is no longer
      // open for a tap.
      ...current.map((turn) => (turn.question ? { ...turn, question: null } : turn)),
      { id: provisional, from: "you", text, photos: shown, voice: shownVoice, state: "queued" },
    ]);
    /** The bubble goes and the words come back, for a refusal that is fixed
     *  in the draft. The photos never left their chips; the note comes back
     *  to its row. */
    const takeBack = (): void => {
      setWriting(false);
      setTurns((current) => current.filter((turn) => turn.id !== provisional));
      setDraft(text);
      if (spoken) setNote(spoken);
    };
    const unsent = (): void => {
      setWriting(false);
      setTurns((current) =>
        current.map((turn) =>
          turn.id === provisional ? { ...turn, state: "failed" as const, unsent: true } : turn,
        ),
      );
    };

    try {
      // Each photo first, on its own, held unclaimed until the message claims
      // it. One that already landed on an earlier try is not sent again.
      const sentPhotos: PhotoOnWire[] = [];
      for (const photo of sendable) {
        const uploaded =
          photo.uploaded ??
          (await uploadPhoto({ uri: photo.uri, name: photo.name, type: photo.type }, photo.key));
        setPhotos((current) => current.map((p) => (p.key === photo.key ? { ...p, uploaded } : p)));
        sentPhotos.push(
          photo.kind === "pdf"
            ? {
                blobId: uploaded.blobId,
                kind: "pdf",
                name: photo.name,
                ...(uploaded.pages !== undefined ? { pages: uploaded.pages } : {}),
                ready: false,
                openable: false,
              }
            : {
                blobId: uploaded.blobId,
                kind: "image",
                name: photo.name,
                width: uploaded.width ?? 0,
                height: uploaded.height ?? 0,
                ready: false,
                // The file itself, until the server's copy exists.
                localUri: photo.uri,
              },
        );
      }
      // 021. The voice note the same way, under the draft's own key with a
      // suffix, so a retry finds the upload the server already made.
      let sentVoice: VoiceOnWire | null = null;
      if (spoken) {
        const uploaded =
          noteUploaded.current ??
          (await uploadVoice(spoken.uri, `${clientKey}-voice`, spoken.durationMs, spoken.waveform));
        noteUploaded.current = uploaded;
        // Without the device file: once the send lands the bubble plays
        // from the server, and the file goes below.
        const { localUri: _local, ...shownWithoutFile } = shownVoice!;
        sentVoice = { ...shownWithoutFile, blobId: uploaded.blobId };
      }
      const blobIds = [...sentPhotos.map((p) => p.blobId), ...(sentVoice ? [sentVoice.blobId] : [])];
      // 022. A mention whose name is no longer in the text was deleted by
      // hand and goes with the words.
      const named = mentions.filter((m) => text.includes(m.name));
      // 025. A # pick whose #Name was deleted by hand goes with the words.
      const hashed = hashPicks
        .filter((one) => text.toLowerCase().includes(`#${one.name.replace(/\s+/g, "").toLowerCase()}`))
        .map((one) => ("id" in one ? { id: one.id } : { name: one.name }));
      const sent = await sendDump(
        text,
        clientKey,
        onScreen?.id,
        blobIds.length ? { blobIds, viaShare: viaShare.current } : undefined,
        named,
        hashed,
      );
      if (!sent) return unsent();
      // Only what went: a photo added while the send was out stays for the
      // next one.
      const went = new Set(sendable.map((photo) => photo.key));
      setPhotos((current) => current.filter((photo) => !went.has(photo.key)));
      draftKey.current = null;
      viaShare.current = false;
      noteUploaded.current = null;
      setMentions([]);
      setHashPicks([]);
      setHashFor(null);
      sentNotes.current.delete(provisional);
      setTurns((current) =>
        current.map((turn) =>
          turn.id === provisional
            ? { ...turn, id: sent.messageId, photos: sentPhotos, voice: sentVoice, state: sent.state, turnId: sent.turnId }
            : turn,
        ),
      );
      // The note on the device goes with the send: the settled bubble plays
      // from the server, and a failed turn resumes rather than re-sends.
      if (spoken) deleteRecording(spoken.uri);
      watch(sent.messageId, sent.turnId, pressed);
    } catch (error) {
      if (error instanceof DumpTooLong) {
        // The server's own refusal, and the words go straight back: there is
        // nothing to retry until they are shorter.
        takeBack();
      } else if (error instanceof DailyLimit) {
        // The day's turns or budget: the composer closes rather than refusing
        // every send after this one.
        takeBack();
        setRefusedToday(true);
      } else if (error instanceof PhotoRefused && error.reason === "daily_limit") {
        takeBack();
        setLine({ text: "Enough for today." });
      } else if (error instanceof PhotoRefused && error.reason === "storage_full") {
        // 036. The draft comes back as it was: a chip's remove control is the
        // way forward, and the words can still go on their own.
        takeBack();
        setLine({ text: "Your storage is full." });
      } else if (
        error instanceof PhotoRefused &&
        (error.reason === "too_big" || error.reason === "not_a_photo" || error.reason === "locked_pdf")
      ) {
        // The server disagreed with the device about one of them. Mark the
        // first chip not yet landed; the remove control is the way forward.
        takeBack();
        const reason: ChipError = error.reason;
        setPhotos((current) => {
          const at = current.findIndex((p) => !p.error && !p.uploaded);
          return current.map((p, i) => (i === at ? { ...p, error: reason } : p));
        });
      } else if (error instanceof PhotoRefused && error.reason === "unavailable") {
        // No object store behind the API. A retry cannot help, so none.
        takeBack();
        setLine({ text: "Not taking photos yet." });
      } else if (error instanceof VoiceRefused && error.reason === "daily_limit") {
        takeBack();
        setLine({ text: "Enough for today." });
      } else if (error instanceof VoiceRefused && error.reason === "storage_full") {
        // 036. Discard on the note is the way forward.
        takeBack();
        setLine({ text: "Your storage is full." });
      } else if (error instanceof VoiceRefused && error.reason === "too_big") {
        // Our own recorder cannot produce this; the line is for a client
        // that is not ours, and Discard is the way forward.
        takeBack();
        setLine({ text: "Too big to send." });
      } else if (error instanceof VoiceRefused) {
        takeBack();
        setLine({ text: "Not taking voice notes yet." });
      } else {
        if (error instanceof UnknownBlob) {
          // The server no longer has one of the uploads: an hour passed and
          // the sweep took it. Forget what landed, so Try again uploads again.
          setPhotos((current) => current.map(({ uploaded: _gone, ...p }) => p));
          noteUploaded.current = null;
        } else failed("dump.send", error);
        unsent();
      }
    }
  }, [dayUsed, draft, photos, note, live, onScreen, pin, submitPin, watch]);

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
            did: turnDid(sent),
            // 019. A tapped calendar that needs the person's say-so: the
            // proposal sits on their own turn, since nothing replied to it.
            waiting: sent.waiting ?? null,
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
      // 022. Nor for a person: the answer was the share, a message to
      // somebody, and its way back is the sheet's x rather than an Undo.
      if (asked.field !== "country" && asked.field !== "person") offerUndo(sent.turnId, picked.label);
      return "answered";
    },
    [turns, watch, offerUndo],
  );

  // The turn goes on the press and comes back if the server refuses, since
  // what it filed is still filed.
  const undoTurnShown = useCallback(
    async function again(turnId: string): Promise<void> {
      const stayed = await undoShown(turnId, shownTurns.current, setTurns, undoTurn);
      if (!stayed) return notify("Couldn't put that back", { label: "Retry", onPress: () => again(turnId) });
      setFiled({ threadIds: [], at: Date.now() });
      const line = stayedForgotten(stayed);
      if (line) notify(line);
    },
    [notify],
  );

  const undo = useCallback(async (): Promise<void> => {
    if (!undoable) return;
    const { turnId } = undoable;
    setUndoable(null);
    if (undoTimer.current) clearTimeout(undoTimer.current);
    await undoTurnShown(turnId);
  }, [undoable, undoTurnShown]);

  const finish = useCallback(
    async function again(messageId: string): Promise<void> {
      const sent = await resumeDump(messageId);
      if (sent === "daily_limit") return setRefusedToday(true);
      if (sent === "failed") return notify("Couldn't finish that", { label: "Retry", onPress: () => void again(messageId) });
      if (sent === "not_finishable") {
        // Settled elsewhere: ask what it is now. Every shown turn carries a
        // turnId (the tail requires one), so none means it left the screen
        // and there is nothing on it to correct.
        const turnId = shownTurns.current.find((turn) => turn.id === messageId)?.turnId;
        if (turnId) watch(messageId, turnId);
        return;
      }
      setWriting(true);
      watch(sent.messageId, sent.turnId);
    },
    [watch, notify],
  );

  const close = end;

  return (
    <ConversationContext.Provider
      value={{
        live,
        raised,
        sheetY,
        sheetTravel,
        sheetGoal,
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
        sheetCount,
        composerFocused,
        plateFoot,
        plateInput,
        sheetClosedAt,
        openSheet,
        closeSheet,
        setDraft,
        submit,
        photos,
        addPhotos,
        removePhoto,
        photoSheet,
        offerPhoto: () => setPhotoSheet(true),
        closePhotoSheet: () => setPhotoSheet(false),
        pickPhotos,
        pickPdfs,
        openPdf,
        line,
        clearLine,
        dayUsed,
        sayLine: setLine,
        recording,
        note,
        liveSamples,
        startRecording,
        discardRecording,
        photoOpen,
        openPhoto: (turnId, index) => setPhotoOpen({ turnId, index }),
        closePhoto: () => setPhotoOpen(null),
        focusRequest,
        raise,
        resumeConversation,
        lower,
        settle,
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
        retry,
        provisional,
        adoptProvisional,
        notice,
        notify,
        mentions,
        mentionPeople,
        pickMention,
        hashLabels: hashFor && onScreen && hashFor.threadId === onScreen.id ? hashFor.labels : null,
        pickHash,
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
  const { openSheet, closeSheet, sheetCount, sheetClosedAt, composerFocused } = useConversation();
  // Before the sheet's first frame, so the plate starts leaving with it.
  useLayoutEffect(() => {
    if (!open) return;
    // **Counted on the UI thread, never read and written from JS.** One sheet
    // leaving as the next arrives, an action opening the edit sheet, is two
    // changes in one tick; read on JS the second saw the value before the
    // first had landed, the count ended one high, and the plate stayed off
    // the screen for good.
    runOnUI(() => {
      "worklet";
      sheetCount.value += 1;
    })();
    // A sheet's keyboard is not the plate's, even if the plate had it.
    composerFocused.value = withTiming(0, plateAway);
    openSheet();
    // A sheet takes its keyboard with it. Left up, Android handed the closing
    // field's focus to the composer and the keyboard stayed for it.
    return () => {
      putKeyboardAway();
      sheetClosedAt.current = Date.now();
      runOnUI(() => {
        "worklet";
        sheetCount.value = Math.max(0, sheetCount.value - 1);
      })();
      closeSheet();
    };
  }, [open, openSheet, closeSheet, sheetCount, sheetClosedAt, composerFocused]);
}
