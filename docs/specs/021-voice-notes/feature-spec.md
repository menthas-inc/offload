# 021 Voice notes

**Status:** drafted 2026-09-20, revised the same day with the product owner's answers and the three reviews
**Surfaces:** web, iOS, Android, the Core API and the agent plane
**Depends on:** 003, whose message this rides; 004, 006 and 013, which act on the words once they are written down; 017, whose one line says what is happening while they are, and whose Stop learns to wait for one thing; 018, whose open question a spoken answer can close; 020, whose upload, encryption, claim and purge this reuses, and whose every reader of `blobs` learns to tell a photo from a voice note

## Why

The pitch names five things you can dump: notes, links, screenshots, photos, voice notes. Four work. The fifth is the one you reach for when your hands are busy: walking, driving, cooking, holding a child. "Remind me to call the dentist Thursday, and move the Lisbon flights to the trip thread." Today the microphone is drawn dead on the web and not drawn on the phones, each with a comment pointing here.

A voice note is not a file you keep. It is the most direct way of talking to offload there is, and everything offload does with typed words, it should do with spoken ones: file them, answer them, carry out what they ask, close a question they answer. The stack chose the transcription provider a month ago, the privacy policy has described the transcript as ordinary text since its first draft, the data model gave a voice note its place in the conversation and nowhere else, and the kits draw the recording and the sent note. What is missing is the feature.

## What

### Vocabulary

A person **records** a voice note and **sends** it. The message **carries** it. offload **listens** and **writes it down**, and the words are the **transcript**. In schema and code the bytes are a **blob** of kind `audio`, the message is of type `voice` whenever it carries one, whatever else it carries, and the transcript is a field of the message beside its typed words. There is no "recording" as a noun anywhere a person reads, no "audio", "clip", "memo" or "attachment", and no `content` row: a voice note is never a row in a thread, and `content.type`'s `voice` value, which 0033 kept, is written by nothing. What the person said lands in threads as rows, the way typed words do.

### Recording

The composer's microphone comes back on every surface, exactly where the kit draws it: the trailing group, in the kit's order, camera, microphone, send.

**Tapping it starts recording.** The first time, the platform asks for the microphone, and a refusal is a line in the failure table with a control that opens the system settings. Then the composer takes the kit's recording shape: the field is replaced by a pulsing dot, a running `m:ss`, and a live waveform that grows from the right, with two controls beside them, **Discard** and **Send**. There is no pause and no listen-back before sending: this is a thing you say and let go of, and the kit drew it that way. Photos already attached stay as chips beside the controls beneath the row, where the kit's composer keeps them. Words already typed stay too, drawn above the row as static text at the primary colour, capped at three lines with the rest clipped, and are sent with the note; the kit hides them and sends them anyway, which is text you cannot see being sent, and this is logged. On the phones the field blurs and the keyboard drops as recording starts, since there is nothing to type into, and the composer's plate stays as it is with the keyboard down. **The screen stays awake while it records**, because the case this feature exists for is a phone held loosely and a thought longer than the auto-lock. Nothing else in the composer is reachable while it records: no camera, no send of anything else, and on the web the live head's Close is disabled.

**Send stops the recording and sends it.** Discard stops it and throws it away, and the composer is as it was, words and chips intact. Discard on a note longer than a minute shows the toast "Discarded · Undo" for eight seconds, with the note kept on the device until the toast clears, because Discard sits a thumb's width from Send and a nine-minute thought is not something to lose to a mis-tap. A recording stops on its own at **ten minutes**, showing `10:00`, and on the phones when a call comes in or the app leaves the screen; it never continues in the background. **A stopped note is a row with no dot**: the time and the waveform stand still and the two controls stay, so the absence of the dot is the whole signal and reduced motion changes nothing about it. A stopped row takes no more photos.

**On the web** the browser asks for the microphone, and everything else is the same row, borrowed from the mobile kit since `WComposer` draws no recording state, with the waveform's window scaling to the row's width at the kit's pitch rather than sitting 160px wide at the right of a 940px card. A hidden tab keeps recording, because looking something up mid-sentence is what a tab switch is for, and the browser's own microphone indicator says so; the recording lives as long as the tab. A refusal has no settings control to offer, so the line stands alone.

**One voice note per message.** A message can carry words, up to ten photos, and one voice note, in any combination, and the send button lights for any of them. Words and photos with a voice note are read together with it, as 020 reads words with photos.

**What the product records.** Mono, at about 64 kbps: AAC in an M4A container on both phones; Opus in WebM on Chrome, Edge and Firefox, and AAC in MP4 on Safari, whichever the browser offers first. Ten minutes is about five megabytes, so the **10 MB** cap is unreachable by our own recorders and exists for a client that is not ours: the server refuses it by byte count and by the file's own header, never the name or the declared type, and never decodes audio to do so. An account may send **sixty minutes of voice or a hundred voice notes in a day**, a ceiling for an invited alpha and one line when reached, counted by the device's declared length before the fact and by the provider's measured length after it, and bounded on every single call by asking the provider for the first ten minutes and no more.

Voice does not go through the + on a section heading. That control writes a row from a line of text; it stays text.

**From the home screen.** On iOS and Android, a long press on the app icon offers **Record**. Choosing it opens offload with the plate's composer already in the recording row, on whatever screen is up, Today from cold, with no conversation sheet raised, so one press and a sentence is the whole of it. The mechanism is the platform's: a home screen quick action on iOS with a system symbol, a static app shortcut on Android with a drawable, since neither takes the product's own glyphs. If the app was open on a thread, the thread stays on screen behind the composer and is the filing default, as it is for anything said there; an existing draft keeps its words and chips and gains the recording, and a pinned + on a section is released first, as 020's share does. If the microphone has never been asked for, it is asked for first and the recording starts on yes. If the composer is locked by a send, the recording starts when the send lands, as a share waits. If it is already recording, nothing more happens. Signed out, or with first run or the name screen due, those come first and the shortcut is forgotten, since there is nothing to keep. The web has no home screen and no shortcut.

### Sending

Pressing send does what 003 does with a voice note on the message, and draws what the 20 September decision draws: **the bubble joins the conversation at the press**, as the kit's `SentVoice`, the microphone glyph, the waveform and the duration, with its words above and its photos beneath in the kit's order, and the request follows. The web borrows `SentVoice` from the mobile kit, since `WTurns` draws text only.

**Nothing is processed until the message and the voice note are stored.** The voice note travels first, on its own, and is held unclaimed; the message is written referencing it, which claims it, as 020 does for a photo. An unclaimed voice note older than an hour is swept. If the send never lands, the bubble takes the failed treatment with its own words, **"That didn't go through." with Try again**, and Try again puts the note back in the composer's row, stopped and sendable, with its words and chips. The note on the device is deleted when it sends or is discarded, and anything left behind by a kill is swept on launch.

While it sends, the send control shows the platform's progress indicator and the composer is locked, as it is today. Idempotency holds across the message: the draft's client key and the voice note's own, so a retry neither duplicates the message nor stores the audio twice.

**The waveform is the whole note.** The composer's live row keeps the kit's sliding window of the last few seconds, and at stop the device resamples everything it heard to the kit's thirty two bars, sends them with the upload, and they are stored with the note, so every device and every reload draws the same bars and a bar is a fixed slice of time. The kit passes the live window to `SentVoice` and falls back to a drawn sine when it has nothing; neither is what a sent note shows, and this is logged.

### Written down

**The transcript is a field of the message, beside its words.** A message has its typed words, as today, and its transcript, which is empty until offload has listened. Every reader of "what the person said", the classifier that decides question or dump, the filing turn's dump, the conversation's tail, 018's judge of a spoken answer, the search index and 013's answering, reads the two together, words then transcript, through one definition. The wire carries them apart, because the bubble draws them apart. From the moment the transcript exists, the message is a text message to every one of those readers, and none of them has a rule of its own for voice.

**The words are written down before anything else in the turn happens**, ahead of the question-or-dump decision, which reads message text and cannot run without it. While that happens 017's line says **"Listening"**, written ahead of "Looking through your threads", and replaced as usual by whatever the turn does next. The threshold is unchanged; how often a short note shows the line is a number to measure on the first real turns and not one to promise here. **The transcript is the one thing 017's Stop waits for**: a turn stopped while listening still gets its words written down, and Stopped applies to the filing that would have followed, so no note is ever left unheard with no way forward.

The transcript is drawn **beneath the waveform, inside the person's bubble**, once it exists, in the bubble's own type at the secondary colour, and it reaches the bubble on the client's next read of the message after it is written, ahead of the reply. That is where the person sees what offload heard, and it is the reason an odd reply is explicable, and it is the review a spoken dump gets in place of the one a typed dump gets while being typed. A long one draws its first lines with the readme's "Show all" beneath. The kit draws the waveform alone, and this is logged.

The words are written down as said, in the language they were said in, without asking which. Numbers, times and names come through as a transcript has them, "thirty centimetres" or "30cm", with no punctuation to speak of, and the filing that follows reads both, told that the words were spoken. The recording is the record; the transcript is what it was heard as, and it is not edited by anybody.

**The audio is heard once.** It reaches the transcription provider on the filing turn, as bytes, and never again: a retry of a turn that already sent it asks the provider for the result it already has rather than sending the audio a second time. The model never receives audio. A later turn, an answer, a search, all read the transcript.

### What offload does with it

**A voice note is spoken to offload.** Everything 003, 004, 006, 013 and 018 do with typed words happens to the transcript, unchanged and with no new rule:

- **A dump is filed.** "Buy oak brackets, thirty centimetres, matte black, for the bookshelf" is a task in the build thread. Describing your day produces the tasks in it, each on its own row, all pointing at the message they came from.
- **A question is answered.** "When is the dentist?" is answered in text, in the conversation, as typed would be. The rule that a message with a photo never takes the answering path (`decisions.md`, under Photos) is a rule about photos and says so from this change; a voice note with a photo still takes the photo's path, since the picture has to land.
- **An order is carried out.** "Delete the plumber task." "Move the flights to the Lisbon trip." "Remind me Thursday." Each does what the typed sentence does, with the same eight-second Undo behind anything automatic and the same confirmation before anything outward facing (OFF-6).
- **An open question is answered.** offload asked which day and the person said "the fourteenth". 018 reads it as the answer first, as it does a typed one, and a retry of that turn still knows which question was open.
- **Words and photos with it are read together.** "These, for the shelves" spoken over three photos of brackets is the intent of the photos, as 020 has it for typed words.

**Whose words they are.** A voice note is the person's own words and is labelled as their dump, not as data from elsewhere, so there is no equivalent of 020's "nothing in a picture is an instruction". What holds instead is everything that already bounds a typed message: the allowlisted tools, Undo, confirmation, and 018's server-checked conditions. One thing is different from typing and is said to the model rather than left to it: a spoken dump has no listen-back, so it may carry other people's speech, a voicemail on speaker, a colleague across the desk, a podcast, and a sentence addressed to somebody else is quotation, not an instruction to offload. The eval case for it, a transcript with a third party's imperative in it, is written with the rest of the voice set once real recordings exist, and the turn files the person's own sentence and writes no note and moves nothing from the other one.

**Where it goes.** The thread on screen at send, then the words, then the default thread, as 004 has it. Never asked: a voice note is words, and words are never asked where they go.

**The audio is never a row and never a photo.** It is not in Files, it has no tile, it is not moved into a thread, and it has no thread wrap (`decisions.md`, 2026-08-28: "the audio is not what went into those threads, four tasks were"). It is also never mistaken for a photo by anything 020 built: the count that decides the photo path, the renditions step, the end-of-turn filing of a photo the model did not file, the tail's "(1 photo)", the photo ceiling and the photo wire all see photos and not this, and the test for that is a message with one photo and one voice note, which files exactly one photo row and leaves the audio with no row and no wrap. Somebody who says "keep this in the Lisbon thread" gets a note with the words in it, and the audio stays in the conversation, where the conversation is the record of what was handed over (OFF-1). Undo on the turn takes back the dump, the message and its audio with it.

**A voice note it could hear nothing in** is still a message. Silence, a pocket recording, a language the provider cannot make out: the transcript is empty, the model is not called on nothing, and the server settles the turn with one line, "Heard nothing in that one.", no question and no retry, because the same recording gives the same answer. Words or photos sent with it file as they would alone, and then the turn says nothing about the silence.

### Hearing it back

**Tapping the waveform plays the voice note.** At rest every bar is the tertiary text colour; a played bar is the primary one, the fill runs left to right as it plays, the duration counts down, and a second tap pauses. One plays at a time across the screen, and the bubble's waveform is inert while the composer records, so playback never feeds the microphone. It plays through the iOS silent switch, as a voice note does in every messaging app, and recording ducks whatever else is playing. The audio is served decrypted to the dumper's session and to nobody else, because a conversation is theirs alone (013's third rule): the route refuses any blob that is not a voice note, resolves through the message alone with no thread arm, and a member of a thread holding a row from this note gets nothing. This is the one route that serves a blob as it arrived, which 020 said no route does; it says so because the audio is our own recording with nothing in it the person did not say, unlike a photo's original with its coordinate. On the phones the bytes are fetched with the session and played from a cache file that is deleted when the note ends, on leaving the screen and on sign-out (a pause keeps it for the resume), never through a URL a player could be handed. Playback is a control on the bubble and nothing else: no scrubbing, no speed, no viewer, no save.

### Accessibility

The microphone's name is "Voice note", the kit's. The recording row's controls are "Discard voice note" and "Send"; the kit's "Discard recording" uses the noun the vocabulary bans. A screen reader hears one polite announcement when recording starts, "Recording", and one when it stops, "Stopped, 0:14", never the running seconds. On the web, focus moves to Send when the field is replaced, Escape discards and Enter sends. The bubble's waveform is a button named "Voice note, 0:14, play", whose state reads "playing, 0:09 left" and "paused"; its target is the `SentVoice` row at a 44px minimum height, and the transcript beneath is the bubble's text, read once, not part of the target. Seconds floor, never round, so 59.6 is "0:59" and not "0:60".

### What it costs in privacy

Said here before any code, because these touch the privacy policy, and drafted now rather than on the day the key is set, as 020 drafted the Maps row.

- **The audio goes to AssemblyAI**, once, on the filing turn, as bytes uploaded by the agent plane and never as a link to fetch. Already on the page, as its own row. The page's section 5 says every named company publishes terms ruling out training on what an API sends them. AssemblyAI's published page on data retention and model training, read on 2026-09-20, says they train on submitted files **unless** the request uses their European servers or the account has opted out, and that a file uploaded to their asynchronous service begins deletion at twenty four hours and is gone within forty eight. **The European endpoint is the condition of the first call** (product owner, 2026-09-20): every request goes to `api.eu.assemblyai.com`, the host is a constant with a test that any other raises, there is no variable that could move it, and the request carries the audio, a language-detection flag and the ten-minute bound and nothing that names the account. The transcript is deleted from their side as soon as offload has read it, by a call that is retried until it succeeds and is keyed on the provider's own reference rather than on the message surviving, which turns their thirty-day default into seconds and holds through an undone turn or a dead worker. The page changes on this branch rather than with the key, since a key is an environment variable and no commit forces one (the security review's point; nothing leaves until the key is set, and the lines describe the mechanism that exists): the AssemblyAI row becomes *Transcribes voice notes, on their European servers* / *The audio of a voice note*; section 5 gains, after the photo line, **A voice note goes as its audio, to be written down.** *It goes to AssemblyAI's European servers and nowhere else. Two reasons for the choice of servers, both theirs to publish: what is sent to their other servers may be used to train their models, and what is sent to the European ones is not; and the audio then stays in the EU. The code checks the address on every call. They delete the audio within two days, by their own statement, and offload deletes the transcript from their side once it has read it.*; and the line "A search carries words you wrote" becomes "words you dumped", since spoken words now feed the same search.
- **The transcript is ordinary text in the database and the search index.** Already on the page, in section 3 and in section 12's "what a file says is not protected even where the file is".
- **The audio goes to R2, encrypted, with a key it never receives.** Already on the page.
- **The model receives the transcript, never the audio.** The Anthropic row's "the part of your content a given task needs" covers it.

Analytics carries the shape and never the words: a dump with a voice note, its seconds as the device counted them at send, its bytes, whether words or photos came with it; the provider's measurement goes to the cost ledger, not to an event. Never a transcript, never the waveform. Logs the same, and the model traces treat the transcript as they treat any dump's text. A refusal, a job's last error, a validation error on the route that writes the transcript, and the failure line carry none of it. The provider's key lives on the server; no phone and no browser ever talks to the provider or holds a token for it.

### Failure states

Every one is one short clause, next to the control that acts on it, and offload never says why.

| What happened | What the person sees |
| --- | --- |
| Microphone permission refused | "Microphone is off for offload." with a control that opens the system settings; on the web the line alone |
| The recording hit ten minutes | The dot goes, `10:00`, the row stays with Send and Discard |
| A call came in, or the app left the screen | The same: the dot goes and the row stays sendable |
| Too big, which our own recorders cannot produce | "Too big to send." under the composer, from the server, the note back in the row with Discard still there |
| No object store behind the API, or a container the server did not recognise | "Not taking voice notes yet." under the composer, the note back in the row |
| The day's ceiling | "Enough for today." under the composer, the note kept in the row |
| The send did not land | The bubble takes the failed treatment, "That didn't go through." and Try again, which puts the note back in the row |
| Could not be written down after the job's retries | The bubble takes the failed treatment, "Couldn't write that one down." and Try again, which runs the same turn again on the same note |
| Nothing to hear in it | The message stands, the reply "Heard nothing in that one.", nothing filed |
| Stopped while listening | The words are written down, then 017's Stopped |
| The turn ran out or a tool failed after the transcript landed | 017's partial state, unchanged: everything that landed is named, Finish is offered |
| Playback could not start | "Not here yet." on the bubble, tap to try again |

### Logged against the kit

Each is one entry in the design log with its **Design system impact**, written on `main`.

- The web composer borrows the recording row and `SentVoice` from the mobile kit; `WComposer` and `WTurns` gain both.
- Typed words stay drawn above the recording row, static, three lines; the kit hides them.
- The stopped row: no dot, time and waveform still, both controls.
- The failure lines on the row ("Too big to send.") and under the composer ("Enough for today."), and "Not here yet." on the bubble.
- `SentVoice` draws thirty two bars resampled over the whole note and stored with it, not the live window and not the drawn sine; its bars take `--text-primary`, not the `--ink-950` ramp the kit retypes.
- `SentVoice` gains the playing state: tertiary at rest, primary as played, the countdown, and the button name.
- The transcript beneath the waveform, with "Show all" past its first lines.
- The unsent and the failed treatments on a voice bubble.
- The quick action's arrival: the plate's composer in the recording row, no sheet.
- The Discard toast past a minute.
- The Android row on its Material pair, `--a-on-var` for the time and `--a-on` for the bars on `--surface-raised`, as `M3Composer.jsx` draws it, with the dark contrast of the transcript on the bubble measured on both platforms.

### Needs a device

As 020 listed its own: the keyboard dropping as recording starts on both phones and the plate not jumping; an incoming call on both; the auto-lock held off while recording; the silent switch on playback; the audio fetch carrying the session on Android; reduced motion on both; the row at the largest text size on a 360dp frame; the dark transcript contrast; the quick action from cold and over an open thread on both platforms.

### What this is not

- **Not a row.** Never in a thread, never in Files, never moved.
- **Not spoken back.** offload answers in text. Reading a reply aloud is a hands-free question of its own, with its own surprises in a quiet room.
- **Not live.** Nothing is written down while you talk; the words appear after you send.
- **Not edited.** The transcript is what was heard. A wrong word is corrected by saying it again, or by fixing the row it became.
- **Not re-heard.** The audio reaches the provider once; later turns read the transcript.
- **Not asked about.** Where the words go, what they meant: guesses with Undo behind them, as for typed words.
- **Not protected by being inline.** The dumper can keep the bytes their own session is served; no line here or on the page calls the absence of a download control a protection.

## Acceptance criteria

**Recording**

- **AC-1** The composer's microphone is drawn and live on web, iOS and Android, in the kit's order after the camera and before send.
- **AC-2** Tapping it asks for the microphone once, then records: the kit's row with the pulsing dot, the running `m:ss`, the live waveform, Discard and Send. Photos already attached stay as chips above; words already typed stay drawn above the row, static and capped at three lines, and are sent with it. On the phones the field blurs and the keyboard drops, and the screen stays awake while recording. Nothing else in the composer is reachable, and the web's live head Close is disabled.
- **AC-3** Send stops the recording and sends it. Discard stops it, keeps nothing, and returns the composer with its words and chips intact; past a minute it shows "Discarded · Undo" for eight seconds and Undo puts the row back.
- **AC-4** The recording stops on its own at ten minutes showing `10:00`, and on the phones on an incoming call and when the app leaves the screen, and in each case the dot goes and the row stays, sendable or discardable, taking no more photos. Nothing records in the background, and the iOS build declares no audio background mode. On the web a hidden tab keeps recording. *The call and the auto-lock are device checks.*
- **AC-5** A message can be words, photos, a voice note, or any combination with at most one voice note; the send button lights for any of them and is quiet for none; a message carrying a voice note is of type `voice`.
- **AC-6** The phones record AAC in M4A and the browsers Opus in WebM or AAC in MP4, mono at about 64 kbps. The server refuses anything over 10 MB and anything whose header is not one of those containers, regardless of name or declared type, without decoding it; the sixty-minute or hundred-note daily ceiling, counted by declared length before and measured length after, refuses the send with its line and keeps the note in the row.
- **AC-7** A refused microphone permission shows its line with a control that opens the system settings on the phones, and the line alone on the web.
- **AC-8** A long press on the app icon offers Record on iOS and Android; choosing it puts the plate's composer into the recording row on whatever screen is up, Today from cold, with no sheet; keeps an open thread as the filing default; adds to an existing draft and releases a pinned +; asks for the microphone first if never asked; starts when a send in progress lands; does nothing when already recording; and yields to the gate, first run and the name screen. *A device check on both platforms.*

**Sending**

- **AC-9** The bubble joins the conversation at the press as `SentVoice` with the note's own bars and duration, words above and photos beneath, on every surface. No message is written until the voice note is stored and claimed; an unclaimed voice note older than an hour is swept; a send that never lands marks the bubble failed with "That didn't go through." and Try again, which puts the note back in the row with its words and chips.
- **AC-10** The draft's client key and the voice note's own belong to the draft until it sends; a retry neither duplicates the message nor stores the audio twice. The note on the device is deleted on send and on discard, and a leftover is swept on launch.
- **AC-11** The stored waveform is thirty two values resampled over the whole note, sent by the device with the upload, bounded by the server, and drawn identically on every surface and after a reload.
- **AC-12** Analytics and logs carry the kind, the declared seconds, the byte size and whether words or photos came with it, and never a transcript or a waveform; traces treat the transcript as dump text; no error message or `last_error` carries it.

**Written down**

- **AC-13** The transcript is a field of the message beside its typed words; the wire carries them apart; and one definition of "what the person said", words then transcript, is read by the classifier, the filing turn, the tail, 018's judge, the search index and 013's answering. A message with words and a voice note is found by search and answered from by both parts once the transcript exists, and is indexed again when the transcript lands after the words were indexed.
- **AC-14** The transcript is written before the question-or-dump decision and before 017's first line; "Listening" is written ahead of "Looking through your threads". Stop during listening waits for the transcript, then applies to the rest.
- **AC-15** The transcript is drawn beneath the waveform inside the person's bubble on every surface, arriving on the next read after it is written and before the reply; past its first lines it draws "Show all".
- **AC-16** The audio reaches the transcription provider on the filing turn only and the model never; a retry of a turn that already sent it polls the provider's reference rather than sending the audio again.
- **AC-17** A voice note with nothing to hear in it, and no words or photos with it, settles with the server's line "Heard nothing in that one.", no model call, no question and no retry; with words or photos, those file and the reply says nothing about the silence.
- **AC-18** A transcription that fails after the job's retries marks the bubble failed with "Couldn't write that one down." and Try again, which runs the same turn again on the same message, carrying the open question if there was one, on all three clients.

**What offload does with it**

- **AC-19** A spoken dump is filed as the same words typed would be; a spoken question is answered; a spoken order is carried out with the same Undo and the same confirmations; a spoken answer to an open question closes it under 018's rules; a voice note with a photo takes the photo's path. Held by the harness tests that each path reads `said(...)` and by the existing typed evals, since the transcript is text to every path. **Transcript-shaped eval cases are deferred** (product owner, 2026-09-20): they are written from real recordings once the feature can make them, not typed by hand.
- **AC-20** Words and photos sent with a voice note are read together with it, under 020's rules for words with photos.
- **AC-21** A transcript carrying a third party's imperative files the person's own sentence, writes no note from the other one and moves nothing. The prompt says so from this change; the eval case that holds it is written with the deferred set above, from a real recording.
- **AC-22** The audio is never a content row, has no thread wrap, appears in no Files widget, and cannot be moved into a thread; a message with one photo and one voice note files exactly one photo row and leaves the audio with no row and no wrap; "keep this in the Lisbon thread" produces a note holding the words.
- **AC-23** Undo on the turn removes every row it filed and the message with its audio.

**Hearing it back**

- **AC-24** Tapping the waveform plays the voice note with the bars filling from tertiary to primary and the duration counting down; a second tap pauses; one plays at a time; the bubble is inert while the composer records. The route serves the bytes as they arrived to the dumper's session only, refuses a blob that is not a voice note, resolves through the message with no thread arm, and a thread member holding a row from the note gets 404. On the phones the bytes are fetched with the session into a cache file deleted when the note ends, on leaving the screen and on sign-out; no URL carries a credential.

**Sharing and deletion**

- **AC-25** A voice note is readable by its dumper alone, in its conversation; rows filed from it into a shared thread carry no audio. Deleting the account makes the conversation and its audio unreadable; the rows it filed into shared threads stay, as 001 decided.
- **AC-26** Audio referenced by no message is destroyed by the purge job, and not before.

**Privacy**

- **AC-27** The provider host is the European endpoint as a constant, with a test that any other host raises and no variable that could move it; the request carries the audio, the language flag and the ten-minute bound only; the key is server-side only. The provider's reference is stored at submission, the transcript is deleted from the provider by a retried call keyed on that reference, and a daily sweep retries any reference older than an hour. The privacy page changes as drafted above, on this branch.

## Out of scope

- **Spoken replies.** Text back, always. On-device speech is free and private and is its own spec, because it needs a rule about when a phone may talk.
- **Siri, the Assistant, a lock-screen control.** Each is a platform's own mechanism with no screen at all, and each is a follow-up once the composer's path and the home-screen shortcut are proven.
- **Live transcription while you talk.**
- **Audio files from the share sheet**, a Voice Memo, a WhatsApp voice note. The extension takes still images.
- **Editing the transcript.**
- **Keeping the audio in a thread.** The audio lives in the conversation; the words live in threads.
- **Speaker labels, timestamps, translation.**
- **Voice through the + on a section heading.**
- **The export.** Promised on the page, not built; when it is, a voice note is its transcript and its audio.
- **Recording in the background.** Decided against; the screen stays awake instead.
- **Self-hosted transcription.** Named in `decisions.md` as the alternative when the bill or a stated user concern justifies it.

## Decided during planning

- **The transcript is a field of the message, and one definition composes it with the words** (the two technical reviews, 2026-09-20). The draft said "the transcript is the message's text", which is undefined once typed words ride along and would have left the bubble unable to draw them apart. Search still falls out, because the index reads the message.
- **A blob has a kind.** Both technical reviews, against the draft's "the same blob": every 020 reader selects a message's blobs as its photos, and without a kind the audio is filed as "A photo", wrapped for the thread, and the classifier is skipped. The 020 decision "the classifier is not consulted when the message carries a blob" is amended to "a photo" in the same change.
- **Transcribe first, then the message is text.** Mine: the classifier reads message text before anything is loaded, so the words have to exist before the turn decides what kind of turn it is. A spoken order, question or 018 answer then costs no new code in any of those paths.
- **Stop waits for the transcript.** The project lead's finding: 017's cancel would otherwise strand the audio unheard with no control, since a voice note cannot go back in the composer. 017's own rule for a write in flight, applied to the one write this turn makes first.
- **The screen stays awake while recording.** The project lead's finding: an auto-lock at thirty seconds would have cut the very notes the Why leads with, silently. Not a reopening of the background decision.
- **The bubble joins at the press** (the 20 September decision, which the draft had missed by copying 020's table).
- **The waveform is thirty two bars over the whole note, stored.** Both client-facing reviews: the kit keeps the last three seconds and draws a sine when it has nothing.
- **No content row for the audio.** The product owner's framing, "they are like conversation text essentially", and the 28 August decision on thread wraps.
- **The transcript is shown in the bubble** (product owner, 2026-09-20). The kit draws the waveform alone; logged. The security review kept it as the review a spoken dump gets.
- **Playback is in** (product owner, 2026-09-20). The stack says the waveform is part of the product, and an audio nobody can hear is a promise with nothing behind it. The security review narrowed the route to the dumper alone with no thread arm.
- **The home-screen shortcut is in, Siri and the Assistant are not** (product owner, 2026-09-20). One press to a recording is most of hands-free; a screenless intent is its own spec.
- **Ten minutes a note, sixty minutes a day** (product owner, 2026-09-20), bounded on the server by the byte cap and by the provider's own end offset per call, since a browser's WebM carries no length in its header.
- **One voice note per message, with words and photos** (product owner, 2026-09-20), as the kit draws.
- **The European endpoint is the whole of the provider gate** (product owner, 2026-09-20), against the draft's second condition of a dashboard opt-out. Their published page names the endpoint alone as sufficient. The security review turned it from configuration into a constant with a test.
- **A recording stops when the app leaves the screen** (product owner, 2026-09-20), and stays sendable. Nothing records in the background.
- **Other people's speech is quotation.** The security review's finding: a transcript has no listen-back, so a third party's imperative reaches the model unseen; the prompt says so. Not a new boundary, since every tool bound already applies.
- **The voice evals wait for real recordings** (product owner, 2026-09-20). A transcript typed by hand is a guess at what a transcript looks like; the cases are made from voice notes the feature itself recorded, once it can.
- **Discard past a minute offers Undo.** The project lead's point about a nine-minute thought a thumb's width from Send, answered with the product's own pattern rather than a dialog.
