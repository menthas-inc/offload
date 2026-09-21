"use client";

// The composer, under every pane and belonging to none of them.
//
// The kit says it plainly: "one composer, under both panes, spanning the
// window. It never belongs to a pane." The reason is in the readme rather than
// the kit: **the composer is a tool rather than a chat**, and any UI task in
// offload can be said instead of tapped. A place you can say things cannot be
// one tab, because then half the app has no way to be spoken to.
//
// Everything here was on Today until 005 gave the app a shell. The dump, the
// the failed and partial states, the resume and the Undo all work
// exactly as 003 and 004 built them; what changed is where they live and that
// the reply now links to the threads offload actually wrote to.

import { Fragment, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  awaitAnswer,
  answerPending,
  answerQuestion,
  invitation,
  DumpTooLong,
  endConversation,
  fetchCurrent,
  resumeDump,
  sendDump,
  undoTurn,
  cancelTurn,
  uploadPhoto,
  refusePhoto,
  PhotoRefused,
  UnknownBlob,
  MAX_PHOTOS,
  type Answer,
  type FoundResult,
  type FoundRow,
  type MessageState,
  type PhotoOnWire,
  type QuestionOnWire,
  type Sent,
  type WaitingOn,
  type TouchedThread,
  uploadVoice,
  VoiceRefused,
  type VoiceOnWire,
} from "../../lib/dump";
import { QuickReplies } from "./QuickReplies";
import { AttachChip, type ChipError } from "./AttachChip";
import { SentPhoto } from "./SentPhoto";
import { VoiceNotePlayer, mmss } from "./SentVoice";
import { BAR_PITCH_PX, Recorder, recorderSupported, type Recording } from "../../lib/recorder";
import { Mentions, mentionQuery, withMention } from "../people/Mentions";
import { SHARE_LINE, answerShare, fetchPeople, nameOf, type Person } from "../../lib/people";
import { PhotoViewer, type ViewerPhoto } from "./PhotoViewer";
import { Icon } from "../Icon";
import { TurnFooter, type TurnSource } from "./TurnFooter";
import { AnswerResults } from "./AnswerResult";
import { Reply } from "./Reply";
import { isRich, plainText } from "@offload/markup";
import { completeContent } from "../../lib/threads";
import { Logo } from "../Logo";
import { FILL_COMPOSER } from "../panes/Today";
import { ToastHost, useToast } from "./Toast";
import styles from "../../app/(shell)/composer.module.css";

interface Turn {
  id: string;
  from: "you" | "offload";
  text: string;
  state?: MessageState;
  turnId?: string;
  /** Where offload actually filed things, from the record rather than from the
   *  sentence. This is what makes the reply's thread names clickable and what
   *  makes them true. */
  threads?: TouchedThread[];
  /** 016. Where a fact in this turn came from, for the chips in its footer.
   *  Empty on every turn that read nothing, which is nearly all of them. */
  sources?: TurnSource[];
  /** 017. When this turn started waiting, for the two thresholds. On a turn
   *  loaded from the tail it is when the page loaded rather than when the dump
   *  was sent, which is the conservative reading: the turn has been in flight at
   *  least that long, so the way out arrives late rather than never. */
  since?: number;
  /** A calendar write offload proposed and nobody has answered yet. The reply
   *  carries the control that answers it, for the same reason it carries its
   *  own thread links and its own retry: a sentence cannot be clicked. */
  waiting?: WaitingOn | null;
  /** 018. The question this turn asked back, on the message that was sent,
   *  while it is open. Drawn inside the reply's bubble when there is one and
   *  in a bubble of its own when the turn filed silently. */
  question?: QuestionOnWire | null;
  /** Whether the turn actually did something, as opposed to answering.
   *
   *  From the same record the reply's links come from, never from the reply
   *  text: a sentence saying it did something is exactly what this exists to
   *  check rather than to trust. */
  did?: boolean;
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
  /** The send itself did not land, so nothing on the server knows this turn.
   *  Drawn as the failed state, with different words: the dump is not saved,
   *  and Try again puts the words back in the field. Local only, never on the
   *  wire, which is why it is not a `MessageState`. */
  unsent?: boolean;
}

/** 020. A photo waiting in the composer. The key belongs to the draft until
 *  it sends, so a retry finds the upload the server already made. */
interface DraftPhoto {
  key: string;
  file: File;
  name: string;
  error: ChipError;
  /** Set once the server has it. A retry skips what already landed. */
  uploaded?: { blobId: string; width: number; height: number };
}

export function Composer({
  onFiled,
  inThread,
}: {
  /** The thread on screen, if one is. Sent with the dump as a filing default
   *  and shown in front of the field, so somebody typing inside a thread does
   *  not have to name it. Anything they write that names another thread wins,
   *  which is decided in the prompt rather than here. */
  inThread?: { id: string; name: string } | null;
  /** Called with the threads the turn actually wrote to, from the content rows
   *  it produced rather than from parsing the reply. The shell reloads the
   *  sidebar and hands the ids down so a screen already showing one of those
   *  threads updates itself instead of going stale behind a truthful reply. */
  onFiled: (threadIds: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  // 022. Who an @ picked, kept while the name is still in the text, and the
  // connections the @ list offers, read the first time an @ is typed.
  const [mentions, setMentions] = useState<{ accountId: string; name: string }[]>([]);
  const [mentionPeople, setMentionPeople] = useState<Person[] | null>(null);
  const mentionAt = mentionQuery(draft);
  useEffect(() => {
    if (mentionPeople !== null || mentionAt === null) return;
    let live = true;
    void fetchPeople().then((page) => {
      if (live) setMentionPeople(page?.connections ?? []);
    });
    return () => {
      live = false;
    };
  }, [mentionAt, mentionPeople]);
  function pickMention(person: Person) {
    const name = nameOf(person);
    setDraft((current) => withMention(current, name));
    setMentions((current) => [...current.filter((m) => m.accountId !== person.accountId), { accountId: person.accountId, name }]);
    input.current?.focus();
  }
  const [turns, setTurns] = useState<Turn[]>([]);
  // Only while a send is out, and only to hold the photos still: the words
  // leave the field at the press, but a chip removed mid-send would still go.
  const [sending, setSending] = useState(false);
  // 020. The photos in the draft, the draft's own key, one line under the
  // composer, and the viewer when a thumbnail was opened.
  const [photos, setPhotos] = useState<DraftPhoto[]>([]);
  const draftKey = useRef<string | null>(null);
  const [line, setLine] = useState<{ text: string } | null>(null);
  const [viewer, setViewer] = useState<{ turnId: string; index: number } | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  // 021. The recorder while it records, the live window it draws, and the
  // note once it has stopped: the same row with no dot, waiting for Send or
  // Discard. A note that went with a send that never landed comes back here.
  const [rec, setRec] = useState<Recorder | null>(null);
  const [recLive, setRecLive] = useState<{ bars: number[]; elapsedMs: number }>({ bars: [], elapsedMs: 0 });
  const [note, setNote] = useState<Recording | null>(null);
  const noteUploaded = useRef<{ blobId: string } | null>(null);
  const sentNotes = useRef<Map<string, Recording>>(new Map());
  const sendButton = useRef<HTMLButtonElement>(null);
  const recording = rec !== null;
  const holdsNote = recording || note !== null;
  // Leaving the shell mid-recording lets the microphone go with it.
  useEffect(() => () => void rec?.discard(), [rec]);
  // The window of bars is as many as the row's width holds at the kit's
  // pitch, measured rather than fixed, so a wide card is not 160px of bars
  // flush right with nothing beside them.
  const wave = useRef<HTMLSpanElement>(null);
  const [waveBars, setWaveBars] = useState(32);
  useEffect(() => {
    const el = wave.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const measure = () => setWaveBars(Math.max(8, Math.floor(el.clientWidth / BAR_PITCH_PX)));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [holdsNote]);
  // A screen reader hears "Recording" once and "Stopped, 0:14" once, never
  // the running seconds.
  const [announced, setAnnounced] = useState("");
  useEffect(() => {
    if (recording) setAnnounced("Recording");
    else if (note) setAnnounced(`Stopped, ${mmss(note.durationMs)}`);
    else setAnnounced("");
  }, [recording, note]);
  // 017. What offload is doing, on the turn in flight.
  const [step, setStep] = useState<string | null>(null);
  const [tooLong, setTooLong] = useState<number | null>(null);
  const toast = useToast();
  const input = useRef<HTMLTextAreaElement>(null);
  // Focus returns to the field once it is back, after a discard.
  useEffect(() => {
    if (!holdsNote) input.current?.focus();
  }, [holdsNote]);
  // The field grows with the text and then scrolls, to the kit's number. A
  // one-line dump keeps the pill; past a line the corners open up and the
  // controls drop to the bottom edge, beside the last line.
  // "Taller than one line" is measured against the shortest height the field
  // has reported, which is one line of the type as this browser sets it, and
  // not against a number: the body size is 16px, or 18px at the larger text
  // size, and 16 with its leading and padding is 31.2, one past the 30 this
  // held for a week. That only rounded the corners then; since 020 it opens
  // the box and drops the controls under the field, and an empty composer was
  // opening as two rows. The phones had the same bug the same day.
  const [tall, setTall] = useState(false);
  const oneLine = useRef<number | null>(null);
  useEffect(() => {
    const el = input.current;
    if (!el) return;
    el.style.height = "auto";
    const height = Math.min(el.scrollHeight, MAX_FIELD_HEIGHT);
    el.style.height = `${height}px`;
    oneLine.current = oneLine.current === null ? height : Math.min(oneLine.current, height);
    setTall(height > oneLine.current + 4);
    // And when the field comes back after a note left the row.
  }, [draft, holdsNote]);
  const turnsBox = useRef<HTMLDivElement>(null);
  // Keyed by message, so a settled stream drops its own entry. A plain array
  // grew for the life of the tab.
  const cancels = useRef<Map<string, () => void>>(new Map());

  useEffect(() => {
    const list = cancels.current;
    return () => {
      for (const cancel of list.values()) cancel();
      list.clear();
    };
  }, []);

  // A new turn scrolls the conversation to the bottom. Without it the reply
  // arrives below the fold and the composer looks like it did nothing, which is
  // the same failure as not delivering it at all.
  useEffect(() => {
    const box = turnsBox.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [turns]);

  // Today's examples fill the field rather than submitting it, and they reach
  // it through an event because the composer is nobody's child any more. One
  // message crosses this boundary; a store would be scaffolding for one
  // message, and building it before there is a second is how a codebase grows
  // machinery nobody needs.
  useEffect(() => {
    const fill = (event: Event) => {
      setDraft((event as CustomEvent<string>).detail);
      input.current?.focus();
    };
    window.addEventListener(FILL_COMPOSER, fill);
    return () => window.removeEventListener(FILL_COMPOSER, fill);
  }, []);

  // Rebuild the conversation on load and pick up anything still unanswered. A
  // dump sent just before the tab closed is in the database either way; this is
  // what makes it visible again.
  useEffect(() => {
    let live = true;
    void fetchCurrent().then((messages) => {
      if (!live || messages.length === 0) return;
      setTurns(
        messages.map((message) => ({
          id: message.id,
          from: message.role === "person" ? "you" : "offload",
          text: message.text ?? "",
          photos: message.photos ?? [],
          voice: message.voice ?? null,
          state: message.state,
          turnId: message.turnId,
          since: Date.now(),
          // **Both of these were dropped here, and the server had always sent
          // them.** A reload turned an answer back into its sentence with no
          // rows beside it, and left a reply saying offload is waiting with
          // nothing to answer it, which is the dead end 012 exists to remove.
          // The phones drew the same answer correctly, which is what made this
          // a web bug rather than a server one.
          found: message.found,
          waiting: message.waiting,
          question: message.question ?? null,
          // **And the footer.** Same sentence as the two above: the server has
          // always resolved these on the other two reads, and a reload emptied
          // every settled turn's footer without them. `did` comes from the
          // record the pills come from, never from the reply.
          threads: message.threads,
          sources: message.sources,
          did: message.threads.length > 0,
        })),
      );
      // No toast on hydration. The eight seconds belongs to the moment offload
      // answered, and a reload an hour later is not that moment.
      for (const message of messages) {
        if (message.role !== "person" || message.state !== "seen") continue;
        watch(message.id, message.turnId);
      }
    });
    return () => {
      live = false;
    };
    // Mount only, deliberately. This rebuilds the conversation once; rerunning
    // it on any dependency would refetch the tail and re-attach streams to
    // messages already being watched.
  }, []);

  function offerUndo(turnId: string | undefined, reply: string): void {
    if (!turnId) return;
    toast.show(reply, { label: "Undo", onPress: () => undo(turnId) });
  }

  /** Wait for one message's answer, wherever the waiting started.
   *
   *  Written once. This block existed twice, identical apart from the id it
   *  closed over, which is how the two would have drifted. */
  function watch(messageId: string, turnId: string | undefined): void {
    cancels.current.set(
      messageId,
      awaitAnswer(
        messageId,
        (answer: Answer) => {
        cancels.current.delete(messageId);
        setTurns((current) => {
          const filed = (answer.threads?.length ?? 0) > 0;
          const next = current.map((turn) =>
            turn.id === messageId
              ? {
                  ...turn,
                  state: answer.state,
                  did: filed,
                  // **Always, not only when there is no reply.** The footer
                  // belongs to the turn rather than to either bubble, so the
                  // pills and the sources land here whether or not offload
                  // said anything, and the reply no longer draws them.
                  threads: answer.threads,
                  sources: answer.sources,
                  question: answer.question ?? null,
                  // 019's proposal, and 022's. It rode the settlement and was
                  // dropped here, so a calendar proposal only ever appeared
                  // after a reload; found the night the share's arrived.
                  waiting: answer.waiting ?? null,
                  // 020. The renditions are made before the model reads the
                  // photos, so a settled turn's thumbnails exist; one that
                  // could not be opened draws the glyph when its fetch fails.
                  photos: turn.photos?.map((photo) => ({ ...photo, ready: true })),
                  // 021. The transcript, when the answer was read rather
                  // than streamed; the stream delivered it on its own event.
                  voice: answer.voice
                    ? { ...turn.voice, ...answer.voice, localUrl: turn.voice?.localUrl }
                    : turn.voice,
                }
              : // 018. The next turn closes the last question whatever it says.
                { ...turn, question: null },
          );
          return answer.reply
            ? [
                ...next,
                {
                  id: `${messageId}-reply`,
                  from: "offload" as const,
                  text: answer.reply,
                  turnId,
                  found: answer.found,
                },
              ]
            : next;
        });
        // A dump can create a thread, so the sidebar is stale the moment this
        // lands. **`changed`, not `threads`**: a turn that moved a piece out of
        // the thread you are looking at changed it without filing anything into
        // it, and `threads` is only where things went. That gap is why a move
        // left the page showing a row that was not in it any more.
        if (answer.changed && answer.changed.length > 0) onFiled(answer.changed);
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
        const did =
          (answer.threads?.length ?? 0) > 0 || (answer.changed?.length ?? 0) > 0;
        if (answer.state === "answered" && answer.reply && did)
          // Markers stripped rather than drawn. A toast is one line with a
          // control beside it, so a list has nowhere to go.
          offerUndo(turnId, plainText(answer.reply));
        },
        (text) => setStep(text),
        // 021. Drawn the moment it is written, ahead of the reply.
        (transcript) =>
          setTurns((current) =>
            current.map((turn) =>
              turn.id === messageId && turn.voice
                ? { ...turn, voice: { ...turn.voice, transcript, transcribed: true } }
                : turn,
            ),
          ),
      ),
    );
  }

  /** 021. Tap the microphone: ask once, then record. The field gives way to
   *  the row and focus moves to Send, so Enter sends and Escape discards. */
  async function startRecording(): Promise<void> {
    if (holdsNote || sending || !recorderSupported()) return;
    setLine(null);
    try {
      const started = await Recorder.start(
        (bars, elapsedMs) => setRecLive({ bars, elapsedMs }),
        () => {
          // Stopped on its own at the cap: the note stays in the row. Send
          // and Discard take the recorder out of state before they stop it,
          // so this runs for the cap alone.
          setRec((current) => {
            if (current !== started) return current;
            void started.take().then((taken) => setNote(taken));
            return null;
          });
        },
      );
      setRec(started);
      setRecLive({ bars: [], elapsedMs: 0 });
      requestAnimationFrame(() => sendButton.current?.focus());
    } catch {
      setLine({ text: "Microphone is off for offload." });
    }
  }

  /** Stop and keep nothing. Past a minute the note is parked under the
   *  toast for eight seconds, because Discard sits a thumb's width from Send. */
  async function discardRecording(): Promise<void> {
    const ending = rec;
    setRec(null);
    setNote(null);
    noteUploaded.current = null;
    const taken = ending ? await ending.take() : note;
    if (taken && taken.durationMs > 60_000) {
      toast.show("Discarded", { label: "Undo", onPress: () => setNote(taken) });
    }
  }

  /** Stop the turn in flight. 017.
   *
   *  **The screen comes back on the press, not on the reply** (AC-8). The turn is
   *  marked here and the request goes out unawaited, because a stop that waits
   *  for a round trip looks broken on exactly the connection where somebody most
   *  wants to stop something.
   *
   *  The stream is closed too. Without that it would deliver the answer the
   *  person had already decided not to wait for. */
  function stop(): void {
    if (!inFlight?.turnId) return;
    const { id, turnId } = inFlight;

    cancels.current.get(id)?.();
    cancels.current.delete(id);
    setStep(null);
    // The turn reads as stopped straight away rather than when the worker
    // notices. The server settles it to the same state through the ordinary
    // path, so a reload agrees with what is already on screen.
    setTurns((current) =>
      current.map((turn) => (turn.id === id ? { ...turn, state: "cancelled" as const } : turn)),
    );

    void cancelTurn(turnId);
  }

  /** 020. Photos into the draft, from the picker, a paste or a drop. The
   *  ordinary refusals happen here, on the device, so they never cost a
   *  request; the server checks the same things again. */
  function addFiles(files: Iterable<File>): void {
    const incoming = [...files];
    if (incoming.length === 0) return;
    setPhotos((current) => {
      const room = MAX_PHOTOS - current.length;
      if (room <= 0 || incoming.length > room) setLine({ text: "Ten at a time." });
      const taken = incoming.slice(0, Math.max(0, room)).map((file, at) => ({
        key: crypto.randomUUID(),
        file,
        name: photoName(file, current.length + at),
        error: refusePhoto(file),
      }));
      return [...current, ...taken];
    });
    input.current?.focus();
  }

  /** The file's own name, or "Photo", "Photo 2". A browser names a pasted
   *  image `image.png`, which is an identifier and not a name. */
  function photoName(file: File, at: number): string {
    const own = file.name && !/^image\.(png|jpe?g|webp|gif|heic|heif)$/i.test(file.name) ? file.name : "";
    return own || (at === 0 ? "Photo" : `Photo ${at + 1}`);
  }

  function removePhoto(key: string): void {
    setPhotos((current) => current.filter((photo) => photo.key !== key));
  }

  const sendable = photos.filter((photo) => !photo.error);
  const hasSomething = draft.trim().length > 0 || sendable.length > 0 || holdsNote;

  /** Send what is in the field.
   *
   *  **The bubble appears at the press.** The send takes a second or more on a
   *  slow connection, and with photos a good deal longer, and for that time
   *  the field used to sit there with the words still in it, which read as a
   *  button that had not worked. Now the words leave the field and join the
   *  conversation as they are pressed, the photos with them as the files
   *  themselves, under an id only this tab knows; the server's ids replace it
   *  when the send lands. If it does not, the bubble takes the failed state
   *  with its own words, since nothing is saved, and Try again puts the text
   *  back. A refusal the person can act on in the draft, a photo the server
   *  would not take or too many words, takes the bubble back itself and says
   *  so under the field, where the thing to change is. */
  async function submit(): Promise<void> {
    const text = draft.trim();
    if (!hasSomething || sending) return;
    // A chip the device refused is not sent around: the way forward is its
    // remove control.
    if (photos.some((photo) => photo.error)) return;

    // 021. Send stops the recording and sends it. The note is taken here,
    // ahead of the bubble, so the bubble draws its final bars.
    const ending = rec;
    setRec(null);
    setNote(null);
    const spoken = ending ? await ending.take() : note;

    setSending(true);
    setTooLong(null);
    setLine(null);
    setDraft("");
    // **The turn's clock starts at the press, not when the server answers the
    // send.** The dump request takes a second or more, and a clock stamped
    // after it held the first step back until four seconds after the press
    // and put Stop at eleven. Somebody waiting is waiting from the press.
    const pressed = Date.now();
    // Idempotency. A retry after the browser gave up on the response returns
    // the message the server already made rather than a second one. 020: the
    // key belongs to the draft until it sends, and so does each photo's.
    const clientKey = draftKey.current ?? (draftKey.current = crypto.randomUUID());
    const provisional = `unsent:${clientKey}`;

    // The photos as they are drawn until the server's copies exist: the file
    // itself, under the chip's key until the upload gives it a blob. Never
    // revoked: a turn keeps it for the session, and a session's worth of
    // object URLs is a few dozen.
    const shown: PhotoOnWire[] = sendable.map((photo) => ({
      blobId: photo.uploaded?.blobId ?? photo.key,
      name: photo.name,
      width: photo.uploaded?.width ?? 0,
      height: photo.uploaded?.height ?? 0,
      ready: false,
      localUrl: URL.createObjectURL(photo.file),
    }));
    const shownVoice: VoiceOnWire | null = spoken
      ? {
          blobId: noteUploaded.current?.blobId ?? `${clientKey}-voice`,
          durationMs: spoken.durationMs,
          waveform: spoken.waveform,
          transcript: null,
          transcribed: false,
          localUrl: URL.createObjectURL(spoken.audio),
        }
      : null;
    if (spoken) sentNotes.current.set(provisional, spoken);
    setTurns((current) => [
      // 018. Chips leave with the next turn. The server decides whether the
      // words answered the question; the screen only knows it is no longer
      // open for a tap.
      ...current.map((turn) => (turn.question ? { ...turn, question: null } : turn)),
      { id: provisional, from: "you", text, photos: shown, voice: shownVoice, state: "queued", since: pressed },
    ]);
    input.current?.focus();

    /** The bubble goes and the words come back, for a refusal that is fixed
     *  in the draft. The photos never left their chips; the note comes back
     *  to its row. */
    const takeBack = (): void => {
      setTurns((current) => current.filter((turn) => turn.id !== provisional));
      setDraft(text);
      if (spoken) setNote(spoken);
    };
    const unsent = (): void =>
      setTurns((current) =>
        current.map((turn) =>
          turn.id === provisional ? { ...turn, state: "failed", unsent: true } : turn,
        ),
      );

    try {
      // 020. Each photo first, on its own, held unclaimed until the message
      // claims it. One that already landed on an earlier try is not sent
      // again.
      const sentPhotos: PhotoOnWire[] = [];
      for (const [at, photo] of sendable.entries()) {
        const uploaded = photo.uploaded ?? (await uploadPhoto(photo.file, photo.key));
        setPhotos((current) => current.map((p) => (p.key === photo.key ? { ...p, uploaded } : p)));
        sentPhotos.push({
          blobId: uploaded.blobId,
          name: photo.name,
          width: uploaded.width,
          height: uploaded.height,
          ready: false,
          localUrl: shown[at]?.localUrl,
        });
      }
      // 021. The voice note the same way, under the draft's own key with a
      // suffix, so a retry finds the upload the server already made.
      let sentVoice: VoiceOnWire | null = null;
      if (spoken) {
        const uploaded =
          noteUploaded.current ??
          (await uploadVoice(spoken.audio, `${clientKey}-voice`, spoken.durationMs, spoken.waveform));
        noteUploaded.current = uploaded;
        sentVoice = { ...shownVoice!, blobId: uploaded.blobId };
      }
      const blobIds = [...sentPhotos.map((p) => p.blobId), ...(sentVoice ? [sentVoice.blobId] : [])];
      // 022. A mention whose name was deleted by hand goes with the words.
      const named = mentions.filter((m) => text.includes(m.name));
      const sent = await sendDump(text, clientKey, inThread?.id, blobIds.length ? { blobIds } : undefined, named);
      // Only what went: a photo dropped in while the send was out stays
      // for the next one.
      const went = new Set(sendable.map((photo) => photo.key));
      setPhotos((current) => current.filter((photo) => !went.has(photo.key)));
      setMentions([]);
      draftKey.current = null;
      noteUploaded.current = null;
      sentNotes.current.delete(provisional);
      setTurns((current) =>
        current.map((turn) =>
          turn.id === provisional
            ? {
                ...turn,
                id: sent.messageId,
                photos: sentPhotos,
                voice: sentVoice,
                state: sent.state,
                turnId: sent.turnId,
              }
            : turn,
        ),
      );
      watch(sent.messageId, sent.turnId);
    } catch (error) {
      if (error instanceof DumpTooLong) {
        // The server's own refusal, and the words go straight back: there is
        // nothing to retry until they are shorter.
        takeBack();
        setTooLong(error.maxChars);
      } else if (error instanceof PhotoRefused && error.reason === "daily_limit") {
        takeBack();
        setLine({ text: "Enough for today." });
      } else if (
        error instanceof PhotoRefused &&
        (error.reason === "too_big" || error.reason === "not_a_photo")
      ) {
        // The server disagreed with the device about one of them. Mark the
        // first chip not yet landed rather than guessing which; the remove
        // control is the way forward either way.
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
        }
        unsent();
      }
    } finally {
      setSending(false);
      input.current?.focus();
    }
  }

  /** 020. What the viewer shows for a message's photos: the pictures and
   *  their names. Rows are not known here, so the viewer has no tools; the
   *  Files grid is where a photo's row is. */
  function viewerPhotos(turn: Turn): ViewerPhoto[] {
    return (turn.photos ?? []).map((photo) => ({
      blobId: photo.blobId,
      ready: photo.ready,
      width: photo.width,
      height: photo.height,
      title: photo.name ?? "Photo",
      localUrl: photo.localUrl,
    }));
  }

  /** Nothing landed, so there is nothing to resume. Put the text back where
   *  they can see it. */
  /** Tick a row from inside an answer.
   *
   *  The ordinary per-row endpoint, not the turn Undo: the model wrote nothing
   *  and a person tapped a checkbox. Permission is re-checked on the server at
   *  the tap, so a result that has gone stale is refused rather than trusted.
   *
   *  Optimistic, and put back if the server refuses. A checkbox that waits for
   *  a round trip before moving reads as broken on a slow connection, and this
   *  is the one write an answer can do.
   */
  async function tick(turnId: string, row: FoundRow): Promise<void> {
    const next = !row.done;
    const apply = (done: boolean) =>
      setTurns((current) =>
        current.map((turn) =>
          turn.id === turnId
            ? {
                ...turn,
                found: turn.found?.map((result) => ({
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
      toast.show(next ? "Couldn't tick that off" : "Couldn't put that back", {
        label: "Retry",
        onPress: () => tick(turnId, row),
      });
      return;
    }
    // The thread pane beside this one is now stale. The same invalidation a
    // dump fires, for the same reason: a screen already showing that thread
    // updates itself instead of quietly disagreeing with the answer.
    onFiled([row.threadId]);
  }

  function retry(messageId: string): void {
    const failed = turns.find((turn) => turn.id === messageId);
    if (!failed) return;
    setTurns((current) => current.filter((turn) => turn.id !== messageId));
    setDraft(failed.text);
    // 021. The note comes back to its row, stopped and sendable, beside the
    // words and the chips. The upload it may already have made is kept
    // under the draft's key, so the retry does not store it twice.
    const spoken = sentNotes.current.get(messageId);
    if (spoken) {
      sentNotes.current.delete(messageId);
      setNote(spoken);
    }
    input.current?.focus();
  }

  /** Something landed and something did not. Ask offload to do the rest.
   *
   *  Not a re-send: part of it is already in a thread, and sending it again
   *  would file that part twice. */
  async function finish(messageId: string): Promise<void> {
    const sent = await resumeDump(messageId);
    if (!sent) return;
    setTurns((current) =>
      current
        .filter((turn) => turn.id !== `${messageId}-reply`)
        .map((turn) =>
          turn.id === messageId
            ? // The clock restarts with the turn. Carrying the old `since` over
              // put Stop on screen a third of a second into a resumed turn,
              // because ten seconds had already passed on the first attempt.
              { ...turn, state: sent.state, since: Date.now() }
            : turn,
        ),
    );
    watch(messageId, sent.turnId);
  }

  async function undo(turnId: string): Promise<void> {
    // Optimistic, and safe to be: the rows are soft-deleted server-side and a
    // failed call leaves the conversation as the database has it on next load.
    setTurns((current) => current.filter((turn) => turn.turnId !== turnId));
    await undoTurn(turnId);
    // Undo touches the same threads the turn did, and the screen showing one
    // of them has to lose the rows again. The ids are not carried on the undo
    // itself, so this asks every open screen to refetch rather than naming
    // them: an empty list is "something changed, work out what".
    onFiled([]);
  }

  const live = turns.length > 0;
  const waiting = turns.some((turn) => turn.from === "you" && turn.state === "seen");

  // 017. The turn in flight, if one is. Derived from the turns rather than held
  // beside them, for the reason `waiting` is: two pieces of state that have to
  // agree about the same thing are two pieces of state that will not.
  const inFlight = turns.find((turn) => turn.from === "you" && turn.state === "seen");

  /** Which reply belongs to which sent message.
   *
   *  **Matched on the turn id they share, not on the reply's own id.** The
   *  composer builds a live reply as `<messageId>-reply`, and a reply loaded
   *  from the tail has its real id instead, so a suffix rule linked them during
   *  the session and silently stopped after a reload: the footer drew under the
   *  sent bubble again, and a `replace` that found nothing to strip matched the
   *  reply against itself, so it drew twice. Both messages of a turn carry the
   *  same `turnId` on every path, which is the thing that was always true. */
  const replies = new Set<string>();
  const answered = new Map<string, Turn>();
  for (const reply of turns) {
    if (reply.from !== "offload" || !reply.turnId) continue;
    const sent = turns.find((other) => other.from === "you" && other.turnId === reply.turnId);
    if (!sent) continue;
    replies.add(sent.id);
    answered.set(reply.id, sent);
  }

  /** What the footer says about a turn, from the record rather than the reply.
   *
   *  **Done means the turn finished and did something**, which is why `answered`
   *  is in the condition and not just `did`: a partial turn that filed one row
   *  wore a Done mark and "Didn't finish that one." at the same time, which is
   *  the screen contradicting itself. */
  // 018. One open question per conversation, and it owns the placeholder.
  const openQuestion = turns.find((turn) => turn.question)?.question ?? null;

  /** A tap answered, or was refused. Either way the chips go; when the server
   *  wrote the person's words as a turn, that turn appears, and a country
   *  re-run is waited for exactly as a dump is. */
  function answeredQuestion(
    turn: Turn,
    sent: Sent | null,
    option: { label: string; kind: "value" | "plain" },
  ): void {
    const question = turn.question;
    setTurns((current) => {
      const cleared = current.map((t) => (t.id === turn.id ? { ...t, question: null } : t));
      if (!sent) return cleared;
      return [
        ...cleared,
        {
          id: sent.messageId,
          from: "you" as const,
          text: option.label,
          state: sent.state,
          turnId: sent.turnId,
          since: Date.now(),
          // The turn's second question, if the first had one behind it.
          question: sent.question ?? null,
          // The thread the answer changed: the Done mark and the pill, now
          // rather than after a reload.
          threads: sent.threads ?? [],
          did: (sent.threads?.length ?? 0) > 0,
          // 019. A tapped calendar answer that needs their say-so: the
          // proposal sits on their own turn.
          waiting: sent.waiting ?? null,
        },
      ];
    });
    if (!sent) return;
    if (sent.state === "seen") watch(sent.messageId, sent.turnId);
    // The way out changed nothing, so nothing reloads and nothing is undone.
    if (option.kind !== "value") return;
    // A value landed on a row somewhere. An empty list is "something changed,
    // work out what", the same signal Undo sends. And the eight seconds: the
    // answer is a turn of its own, and Undo puts the field back.
    onFiled([]);
    if (question?.field !== "country") offerUndo(sent.turnId, option.label);
  }

  const footerFor = (turn: Turn) => ({
    state: turn.state === "answered" && turn.did ? ("done" as const) : null,
    refs: turn.threads ?? [],
    sources: turn.sources ?? [],
  });

  return (
    <div className={styles.composer}>
      <ToastHost />

      <div className={styles.card}>
      {live ? (
        <div className={styles.liveHead}>
          {/* The kit's header for an open conversation: what it is about, and
              two ways out of it. Without these the composer grows and there is
              no way to put it back.

              The mark rather than the kit's sparkles. This is offload talking,
              and sparkles is the glyph for anything offload derived, which is a
              different claim: it belongs on a tag it inferred, not on the
              product saying something. */}
          <Logo variant="mark" size={15} />
          <b className={styles.liveTitle}>{conversationTitle(turns)}</b>
          <button
            type="button"
            className={styles.quiet}
            aria-label="Open full"
            title="A conversation of its own is not built yet"
            disabled
            aria-disabled="true"
          >
            <Icon name="maximize-2" size={16} />
          </button>
          <button
            type="button"
            className={styles.quiet}
            aria-label="Close this conversation"
            title="Close"
            disabled={recording}
            onClick={() => {
              // Closing is a statement, not a tidy-up: this subject is over,
              // so the next dump starts a conversation rather than joining
              // this one however soon it arrives.
              setTurns([]);
              void endConversation();
            }}
          >
            <Icon name="x" size={16} />
          </button>
        </div>
      ) : null}
      {live ? (
        <div className={styles.turns} ref={turnsBox}>
          {turns.map((turn) =>
            turn.from === "you" ? (
              // The bubble, then the turn's own footer beneath it. Two siblings
              // rather than one nested pair, because the footer is not part of
              // what they wrote and is not inside their bubble's width.
              <Fragment key={turn.id}>
              <div
                className={styles.turnYou}
                // The failure is carried by the turn itself, so the message you
                // wrote takes the clay border and the line sits under it.
                // **`cancelled` is deliberately not here.** The clay border
                // says something went wrong, and nothing did: somebody pressed
                // Stop.
                data-failed={
                  turn.state === "failed" || turn.state === "partial" ? true : undefined
                }
              >
                {turn.text}
                {turn.voice ? <VoiceNotePlayer voice={turn.voice} inert={recording} /> : null}
                {turn.photos?.length ? (
                  <span className={styles.sentPhotos}>
                    {turn.photos.map((photo, at) => (
                      <SentPhoto
                        key={photo.blobId}
                        photo={photo}
                        onOpen={() => setViewer({ turnId: turn.id, index: at })}
                      />
                    ))}
                  </span>
                ) : null}
                {turn.state === "failed" ? (
                  <p className={styles.turnFailed} role="alert">
                    {/* Two different failures with one treatment. An answer
                        that failed left the dump saved; a send that failed
                        left nothing anywhere, and saying it is saved would be
                        the one untrue sentence on the screen. 021: a voice
                        note that never got written down says so, and its Try
                        again runs the same turn on the same note, since the
                        audio is on the server and cannot go back in the row;
                        a voice note whose words exist resumes for the same
                        reason. */}
                    {turn.unsent
                      ? "That didn't go through. "
                      : turn.voice && !turn.voice.transcribed
                        ? "Couldn't write that one down. "
                        : "offload could not answer that one. Your dump is saved. "}
                    <button
                      type="button"
                      className={styles.retry}
                      onClick={() => (turn.voice && !turn.unsent ? void finish(turn.id) : retry(turn.id))}
                    >
                      Try again
                    </button>
                  </p>
                ) : null}
                {turn.state === "partial" ? (
                  // The same treatment as failed and for the same reason: a
                  // toast would take the only way forward with it. Different
                  // words, because some of this is already filed and saying so
                  // is what stops somebody re-sending and filing half twice.
                  <p className={styles.turnFailed} role="alert">
                    Didn't finish that one.{" "}
                    <button
                      type="button"
                      className={styles.retry}
                      onClick={() => void finish(turn.id)}
                    >
                      Finish it
                    </button>
                  </p>
                ) : null}
                {/* 017. **One word, and nothing beside it.** `partial` gets
                    Finish because offload stopped by accident and finishing is
                    what somebody wants; this one they stopped themselves, and
                    offering to undo their own decision is the product arguing
                    with them. The footer below already says what landed.

                    Not `turnFailed`: that class is clay, and nothing went
                    wrong here. */}
                {turn.state === "cancelled" ? (
                  <p className={styles.turnStopped}>Stopped.</p>
                ) : null}
              </div>
              {/* **Only when nothing answered it.** The footer belongs to the
                  turn, and the turn ends at the reply when there is one: drawn
                  here regardless, the sources for an answer sat above the answer
                  they were sources for. So a turn with a reply hangs its footer
                  off that instead, further down. */}
              {!replies.has(turn.id) ? <TurnFooter {...footerFor(turn)} /> : null}
              {/* 018. A turn that filed silently and asked back has no reply
                  bubble to hold the question, so the question gets one of its
                  own: offload's sentence and the chips, nothing else. After
                  the footer, in the turn's order: what happened, then what is
                  still open. The filing is done and the question is not. */}
              {!replies.has(turn.id) && turn.question ? (
                <div className={styles.turn}>
                  <div className={styles.turnOffload}>
                    <Question turn={turn} onAnswered={answeredQuestion} />
                  </div>
                </div>
              ) : null}
              {/* 019. A tapped calendar answer that turned into a proposal:
                  the control sits on the person's own turn, in a bubble of its
                  own, because the turn that asked has no reply to hold it. */}
              {!replies.has(turn.id) && turn.waiting ? (
                <div className={styles.turn}>
                  <div className={styles.turnOffload}>
                    <Waiting
                      waiting={turn.waiting}
                      onAnswered={() =>
                        setTurns((current) =>
                          current.map((t) => (t.id === turn.id ? { ...t, waiting: null } : t))
                        )
                      }
                    />
                  </div>
                </div>
              ) : null}
              </Fragment>
            ) : (
              <div key={turn.id} className={styles.turn}>
              <div
                className={`${styles.turnOffload} ${
                  isRich(turn.text) ? styles.turnOffloadRich : ""
                }`}
              >
                <Reply text={turn.text} />
                {/* A calendar write offload has not made yet. Without this the
                    proposal is announced and expires an hour later having done
                    nothing, which is the dead end this closes. */}
                {turn.waiting ? (
                  <Waiting
                    waiting={turn.waiting}
                    onAnswered={() =>
                      setTurns((current) =>
                        current.map((t) => (t.id === turn.id ? { ...t, waiting: null } : t))
                      )
                    }
                  />
                ) : null}
                {/* 018. The question, under the sentence and after any
                    proposal, which keeps its own life. */}
                {answered.get(turn.id)?.question ? (
                  <Question turn={answered.get(turn.id)!} onAnswered={answeredQuestion} />
                ) : null}
                {/* The pills used to be here, inside the reply. They are in
                    the turn's footer now, with the Done mark and the sources,
                    because a filing turn has all three to report and no reply
                    to put them in. Where they came from has not changed: the
                    record of what was written, never the sentence. */}
              </div>
              {/* **Below the bubble, not inside it.** A row's hover fill bleeds
                  to its pane's padded edge by one space step, and a turn's own
                  horizontal padding is that same step, so inside a bubble the
                  two cancel and a square fill runs out under an 18px corner.
                  012's confirmation stays inside because it is one fixed
                  control; this is an unbounded list with a surface of its own. */}
              {turn.found && turn.found.length > 0 ? (
                <AnswerResults found={turn.found} onToggle={(row) => void tick(turn.id, row)} />
              ) : null}

              {/* The turn's footer, under the thing it describes. The state and
                  the pills come from the message that was sent, not from this
                  reply: what offload did is a fact about the turn. */}
              {answered.get(turn.id) ? <TurnFooter {...footerFor(answered.get(turn.id)!)} /> : null}
              </div>
            ),
          )}

          {/* One live region for the whole exchange, polite, announced once per
              transition rather than per frame. */}
          <p className={styles.srOnly} role="status" aria-live="polite">
            {waiting
              ? "offload is thinking"
              : openQuestion
                ? "offload asked something"
                : turns.at(-1)?.from === "offload"
                  ? "offload answered"
                  : ""}
          </p>

          {waiting ? <Working step={step} since={inFlight?.since ?? null} onStop={stop} /> : null}
        </div>
      ) : null}

      {mentionAt !== null && !holdsNote && mentionPeople && mentionPeople.length > 0 ? (
        <Mentions people={mentionPeople} query={mentionAt} onPick={pickMention} />
      ) : null}
      <div
        className={styles.composerInner}
        data-tall={tall ? true : undefined}
        // 021. A recording alone keeps the pill, as the kit's does; words
        // above the row or chips beside it open the box.
        data-expanded={tall || photos.length > 0 || (holdsNote && draft.trim().length > 0) ? true : undefined}
        // 021. With the field gone, the keys the row answers to: Enter sends
        // and Escape discards.
        onKeyDown={(event) => {
          if (!holdsNote) return;
          if (event.key === "Escape") {
            event.preventDefault();
            void discardRecording();
          } else if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            void submit();
          }
        }}
        // 020. A photo dropped onto the card attaches, because that is how a
        // screenshot reaches a browser.
        onDragOver={(event) => {
          if (holdsNote) return;
          if (event.dataTransfer.types.includes("Files")) event.preventDefault();
        }}
        onDrop={(event) => {
          if (holdsNote || event.dataTransfer.files.length === 0) return;
          event.preventDefault();
          addFiles(event.dataTransfer.files);
        }}
      >
        {/* 021. The words typed before the microphone was pressed, drawn
            above the row as static text and sent with the note. The kit hides
            them and sends them anyway; text you cannot see being sent is a
            surprise. */}
        {holdsNote && draft.trim() ? <div className={styles.recordingWords}>{draft}</div> : null}
        <div className={styles.fieldRow}>
          {/* Said, not enforced. The server passes the same thread to the model
              as a default and the prompt lets the words override it, so this
              reads as where things are going rather than as a lock. */}
          {inThread ? (
            <span className={styles.inThread}>in thread {inThread.name}</span>
          ) : null}
          {holdsNote ? (
            // 021. The kit's recording row: the dot while it records and not
            // after, the time, the window of bars growing from the right.
            <span className={styles.recording} role="group" aria-label="Voice note">
              <span className={styles.srOnly} role="status">
                {announced}
              </span>
              {recording ? <span className={styles.recordingDot} aria-hidden="true" /> : null}
              <span className={styles.recordingTime}>
                {mmss(recording ? recLive.elapsedMs : (note?.durationMs ?? 0))}
              </span>
              <span className={styles.recordingWave} aria-hidden="true" ref={wave}>
                {(recording ? recLive.bars.slice(-waveBars) : (note?.waveform.map((v) => v / 255) ?? [])).map((h, at, all) => (
                  <span
                    key={at}
                    className={styles.recordingBar}
                    style={{
                      height: `${Math.max(3, Math.round(h * 24))}px`,
                      opacity: 0.35 + 0.65 * (at / Math.max(1, all.length)),
                    }}
                  />
                ))}
              </span>
            </span>
          ) : (
          <textarea
            ref={input}
            className={styles.composerInput}
            rows={1}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void submit();
              }
            }}
            // 020. A pasted image attaches; pasted text is text.
            onPaste={(event) => {
              const files = [...event.clipboardData.files].filter((file) =>
                file.type.startsWith("image/"),
              );
              if (files.length === 0) return;
              event.preventDefault();
              addFiles(files);
            }}
            placeholder={openQuestion ? invitation(openQuestion) : "Dump anything"}
            aria-label="Dump anything"
          />
          )}
        </div>
        <div className={styles.toolsRow}>
          {/* 020. The chips, in the row with the controls, wrapping, as the
              phones' composer draws them. Locked while a send is out: a chip
              removed mid-send would still go. */}
          {photos.length ? (
            <div className={styles.chips}>
              {photos.map((photo) => (
                <AttachChip
                  key={photo.key}
                  name={photo.name}
                  error={photo.error}
                  disabled={sending}
                  onRemove={() => removePhoto(photo.key)}
                />
              ))}
            </div>
          ) : null}
          <span className={styles.actions}>
            {/* The camera, live since 020. The microphone stays as it was,
                drawn and inert, until voice notes are built. */}
            <input
              ref={picker}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
              multiple
              hidden
              onChange={(event) => {
                addFiles(event.target.files ?? []);
                event.target.value = "";
              }}
            />
            {/* Not drawn while a note is in the row, as the kit's recording
                state draws Discard and Send alone. */}
            {holdsNote ? null : (
              <button
                type="button"
                className={styles.quiet}
                aria-label="Add a photo"
                title="Add a photo"
                disabled={sending}
                onClick={() => picker.current?.click()}
              >
                <Icon name="camera" size={17} />
              </button>
            )}
            {/* 021. The microphone, live, in the kit's order. Not drawn while
                a note is in the row: one voice note per message. Discard takes
                its place beside Send, the kit's trash. */}
            {holdsNote ? (
              <button
                type="button"
                className={styles.discard}
                aria-label="Discard voice note"
                title="Discard"
                disabled={sending}
                onClick={() => void discardRecording()}
              >
                <Icon name="trash-2" size={17} />
              </button>
            ) : (
              <button
                type="button"
                className={styles.quiet}
                aria-label="Voice note"
                title="Voice note"
                disabled={sending || !recorderSupported()}
                onClick={() => void startRecording()}
              >
                <Icon name="mic" size={17} />
              </button>
            )}
            <button
              ref={sendButton}
              type="button"
              className={styles.send}
              // A chip the device refused holds the send: the way forward is
              // its remove control, and a button that does nothing when
              // pressed is worse than one that is off.
              disabled={!hasSomething || sending || photos.some((photo) => photo.error)}
              data-busy={sending ? true : undefined}
              data-recording={holdsNote ? true : undefined}
              aria-label="Send"
              aria-busy={sending}
              onClick={() => void submit()}
            >
              <Icon name="arrow-up" size={17} />
            </button>
          </span>
        </div>
      </div>

      {line ? (
        <p className={styles.composerLine} role="alert">
          {line.text}
          <button
            type="button"
            className={styles.composerLineDismiss}
            aria-label="Dismiss"
            onClick={() => setLine(null)}
          >
            <Icon name="x" size={14} />
          </button>
        </p>
      ) : null}

      {viewer
        ? (() => {
            const turn = turns.find((t) => t.id === viewer.turnId);
            const set = turn ? viewerPhotos(turn) : [];
            return set.length ? (
              <PhotoViewer
                photos={set}
                index={Math.min(viewer.index, set.length - 1)}
                onIndex={(index) => setViewer({ turnId: viewer.turnId, index })}
                onClose={() => setViewer(null)}
              />
            ) : null;
          })()
        : null}

      {tooLong ? (
        <p className={styles.composerError} role="alert">
          That is longer than offload can take in one go. The limit is{" "}
          {tooLong.toLocaleString()} characters.
        </p>
      ) : null}
      </div>
    </div>
  );
}

/** What this conversation is about, for the composer's own header.
 *
 *  The first thing you said, truncated. The kit shows a thread name because its
 *  fixture has one; a real conversation is not about a thread yet, and offload
 *  does not title conversations, so the honest label is your own opening line.
 *  When something names a conversation, this is where that name goes. */
/** The kit's number, the same one the phones grow to. */
const MAX_FIELD_HEIGHT = 380;

function conversationTitle(turns: Turn[]): string {
  const first = turns.find((turn) => turn.from === "you");
  if (!first) return "This conversation";
  // One line in the header, whatever the dump's own breaks. 021: a voice
  // note reads as its words once written down, and as "Voice note, 0:14"
  // until then.
  const said = first.voice?.transcribed ? `${first.text} ${first.voice.transcript ?? ""}` : first.text;
  const text = said.replace(/\s+/g, " ").trim() || (first.voice ? `Voice note, ${mmss(first.voice.durationMs)}` : "");
  return text.length > 70 ? `${text.slice(0, 70)}…` : text;
}

/** Confirm or decline a calendar write offload proposed.
 *
 *  **Names who finds out and nothing else.** The two controls beside it are the
 *  answer to "why is it asking", so a paragraph explaining would be offload
 *  diagnosing itself, which it does not do. */
/** 018. A question offload asked back: its sentence, and the chips that
 *  answer it. The sentence is plain text, never markup: it was composed from
 *  a template and a title, and a title has no business becoming a link. */
function Question({
  turn,
  onAnswered,
}: {
  turn: Turn;
  onAnswered: (turn: Turn, sent: Sent | null, option: { label: string; kind: "value" | "plain" }) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [failedToSend, setFailedToSend] = useState(false);
  const question = turn.question;
  if (!question) return null;

  async function pick(index: number) {
    if (busy || !question) return;
    const option = question.options[index];
    if (!option) return;
    setBusy(true);
    setFailedToSend(false);
    try {
      const { status, sent } = await answerQuestion(question.id, index);
      // 404 means closed, answered elsewhere or gone: the chips leave and
      // there is nothing to retry. Anything else that failed is the network
      // or the server, and the chips stay beside the line that offers again.
      if (!sent && status !== 404) {
        setFailedToSend(true);
        return;
      }
      onAnswered(turn, sent, option);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.question}>
      <p className={styles.questionLine}>{question.text}</p>
      {failedToSend ? (
        <p className={styles.questionFailed} role="alert">
          That did not go through. Try again.
        </p>
      ) : null}
      <QuickReplies
        options={question.options}
        label={question.text}
        onPick={(index) => void pick(index)}
        disabled={busy}
      />
    </div>
  );
}

function Waiting({
  waiting,
  onAnswered,
}: {
  waiting: WaitingOn;
  onAnswered: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  // 022. A share's tap goes to its own route; the calendar's to 019's.
  const share = waiting.kind === "share";

  async function answer(choice: "confirm" | "decline") {
    if (busy) return;
    setBusy(true);
    const ok = share ? await answerShare(waiting.id, choice) : await answerPending(waiting.id, choice);
    setBusy(false);
    if (ok) onAnswered();
    // What happened, next to the control that retries it. Never why: this
    // cannot tell an expired proposal from a dropped connection.
    else setFailed(true);
  }

  return (
    <span className={styles.waiting}>
      <span className={styles.waitingLine}>{waiting.because}</span>
      {/* The line a person reads before sharing, here as on the sheet: the
          policy promises it at the moment of sharing. */}
      {share ? <span className={styles.waitingShareLine}>{SHARE_LINE}</span> : null}
      {failed ? (
        <span className={styles.waitingFailed} role="alert">
          That did not go through. Try again.
        </span>
      ) : null}
      <span className={styles.waitingControls}>
        <button
          type="button"
          className={styles.waitingConfirm}
          onClick={() => void answer("confirm")}
          disabled={busy}
        >
          {share ? "Share" : "Add it"}
        </button>
        <button
          type="button"
          className={styles.waitingDecline}
          onClick={() => void answer("decline")}
          disabled={busy}
        >
          Not now
        </button>
      </span>
    </span>
  );
}

/** How long a turn runs before it is worth saying anything about it. 017.
 *
 *  Under this, the three dots are the honest answer: a line appearing and being
 *  replaced twice inside a second is noise, and most turns finish here.
 *
 *  **Not the same number as the way out.** Saying what it is doing is
 *  reassurance and comes early; offering to stop is an admission this is taking
 *  too long and comes later. One number for both would either delay the
 *  reassurance or offer the escape to somebody who did not need it. */
const SAY_AFTER_MS = 2500;

/** When the way out appears. The product owner's number. */
const STOP_AFTER_MS = 10_000;

/** What offload is doing, and past ten seconds a way to stop it.
 *
 *  **Both live where the three dots already were**, at the foot of the log,
 *  because the alternative is a toast and a toast takes the only control away
 *  with it when it clears. This has no mock; the divergence is logged.
 *
 *  It re-renders on a clock rather than on the step, because the two thresholds
 *  are times and nothing else moves them: a turn can sit on one line for eight
 *  seconds and the way out still has to arrive. */
function Working({
  step,
  since,
  onStop,
}: {
  step: string | null;
  since: number | null;
  onStop: () => void;
}) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (since === null) return;
    setElapsed(Date.now() - since);
    // Half a second. Fine enough that neither threshold lands visibly late,
    // coarse enough not to be a render loop on a page that is waiting.
    const timer = setInterval(() => setElapsed(Date.now() - since), 500);
    return () => clearInterval(timer);
  }, [since]);

  const line = elapsed >= SAY_AFTER_MS ? step : null;
  const canStop = elapsed >= STOP_AFTER_MS;

  // **Falls back to the dots, not to a filler sentence.** A turn with no step is
  // a turn that is thinking rather than looking something up, and inventing a
  // line for it would be offload narrating itself.
  if (!line && !canStop) {
    return (
      <div className={styles.writing} aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    );
  }

  return (
    <div className={styles.working}>
      {line ? (
        // The line replaces itself rather than stacking. The log's own live
        // region announces the turn's transitions, so this one is scoped to the
        // sentence and polite.
        <p className={styles.workingStep} aria-live="polite">
          {line}
        </p>
      ) : (
        <div className={styles.writing} aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      )}

      {canStop ? (
        <button type="button" className={styles.retry} onClick={onStop}>
          Stop
        </button>
      ) : null}
    </div>
  );
}
