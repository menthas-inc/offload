# 021 Voice notes, implementation

**Feature spec:** `feature-spec.md` in this folder. **Grounded in:** `docs/tech/stack.md` (the agent plane owns transcription; R2; AssemblyAI), `docs/tech/decisions.md` (transcription 2026-08-27, the dump as a message and the thread-wrap rule 2026-08-28, "shape not content", the Photos entry on the classifier), `docs/specs/020-photos/impl-spec.md` (the upload, the key layers, the claim, the purge, the internal routes, the serving route), `docs/specs/013-answering/impl-spec.md` (the chunk tables and the sweep), `docs/specs/017-saying-what-it-is-doing/impl-spec.md` (the step line and the cancel task), `docs/specs/018-asking-back/impl-spec.md` (the open question on the job), and AssemblyAI's documentation as read on 2026-09-20: the data retention and model training page (training unless European servers or opt-out; uploaded files begin deletion at 24 hours, gone by 48; transcripts 30 days by default; `DELETE /v2/transcript/:id`), the region page (`https://api.eu.assemblyai.com`, data stays in the EU, upload works there), and the limits page (2.2 GB an upload, 10 hours a file).

## The shape in one paragraph

A voice note is uploaded on its own to `POST /v1/blobs/audio`, which sniffs the container, checks the byte cap and the day's ceiling, encrypts the bytes under 020's key layers and stores them at `blobs/<id>/original` as a blob of `kind = 'audio'`, with the declared duration and the thirty two bars. `POST /v1/dumps` claims it as it claims a photo, types the message `voice`, and enqueues the filing job. The worker, at the top of that job and before anything reads the message's words, sends the bytes to AssemblyAI's European endpoint, records the provider's reference so a retry never re-sends, polls, writes the transcript through an internal route onto `messages.transcript`, and enqueues the job that deletes the transcript from the provider. From that write on, every reader of "what the person said" reads `said(text, transcript)`, one SQL function, so the classifier, the filing turn, the tail, 018's judge, the search column and the embedding path see a text message. Playback is `GET /v1/blobs/:id/audio`, the original bytes, decrypted, to the dumper's session alone, with Range. Nothing about the audio ever becomes a row.

## Data flow

### Recording, on the device

- **Phones**, `expo-audio`: `requestRecordingPermissionsAsync` on the first tap; a recorder with `.m4a`, AAC, mono, 44.1 kHz, 64 kbps, `isMeteringEnabled: true`; `setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true })` for the session. Metering is read at 100 ms into the live window the kit draws, and every sample is kept in memory for the resample at stop. `useKeepAwake` for the length of the recording. `AppState` leaving `active` and the recorder's own interruption status both call `stop()`, and the row shows the stopped state. At 600 s the recorder is stopped by a timer. Stop resamples the samples to 32 bars (mean amplitude per bucket, normalised to the recording's own peak, quantised 0 to 255) and hands the file URI, the duration and the bars to the conversation context, where the recording state lives beside `draft` and `photos` so the sheet and the plate share it. Discard deletes the file, or on a note past 60 s parks it under the toast and deletes it when the toast clears without Undo. Send uploads it, then deletes it once claimed. On launch, anything in the recordings directory is deleted.
- **Web**, `MediaRecorder`: `getUserMedia({ audio: true })`; the mime type is the first supported of `audio/webm;codecs=opus`, `audio/ogg;codecs=opus`, `audio/mp4`, at `audioBitsPerSecond: 64000`; chunks collected on a one-second `timeslice` into a `Blob`; an `AnalyserNode` on the stream sampled at 100 ms for the bars. `visibilitychange` is ignored. The 600 s timer stops it. There is no file on disk; a failed send keeps the `Blob` in the composer state.
- **The quick action**, `expo-quick-actions` with its config plugin: one static item, `id: record`, title "Record", `symbol:mic` on iOS and a drawable of the mic on Android. On arrival (cold or warm) the root layout hands `record` to the conversation context, which runs the feature spec's order: gate, first run and name screen first; a locked composer defers it until the send lands; already recording is a no-op; a pinned + is released; then permission if never asked, then start. Android's shortcut intent can be fired by any app; accepted, since nothing sends without a tap and the screen shows the recording.
- **Permission strings.** `NSMicrophoneUsageDescription`: "For voice notes. Nothing is recorded until you tap the microphone." Android's `RECORD_AUDIO` comes from the plugin. `UIBackgroundModes` gains nothing, and a test reads `app.json` to say so.

### Upload

1. `POST /v1/blobs/audio`, `multipart/form-data`: `clientKey` (uuid), `durationMs` (integer), `waveform` (JSON array of 32 integers 0 to 255), `file`. One note per request. The client refuses nothing by size, since its own recorder cannot exceed the cap; it refuses a second note in a message by not drawing the microphone.
2. The Core API streams the body under a **10 MB** limit; over it is 413 `too_big`. The first 64 bytes are sniffed, and the kind is the route's, never a shared sniff, since `ftyp` overlaps HEIF: MP4 family (`ftyp` box at offset 4 with brand `M4A `, `isom`, `iso2`, `mp42` or `dash`) is `audio/mp4`; EBML (`1A 45 DF A3`) is `audio/webm`; `OggS` is `audio/ogg`. Anything else is 415 `not_a_voice_note`. **The server never decodes audio**: no ffprobe, no ffmpeg, nothing that puts an untrusted file on a shell. `durationMs` is refused over 600,000 and the waveform over 32 entries or outside the range.
3. The ceiling, before the write and outside the insert's transaction, 020's posture: audio blobs by this account in the last 24 hours, their count and the sum of `coalesce(measured_ms, duration_ms)`; 100 or 3,600,000 ms is 429 `daily_limit`. The declared duration is the pre-check; the measured one replaces it after the fact; the per-call bound below is what bounds the bill.
4. Idempotency on `(account_id, client_key)`, as 020.
5. Encryption and the account wrap exactly as 020's original: a random object key, AES-256-GCM, `blobs/<id>/original`, `blob_keys (scope = 'account')`. No renditions, ever.
6. The row: `kind = 'audio'`, `content_type` from the sniff, `width` and `height` null, `duration_ms` declared, `waveform` stored, `message_id` null until claimed. Response `{ blobId }`. The hourly unclaimed sweep takes it as it takes a photo.

The request log carries method, path, status, byte count and duration; never the waveform.

### The dump

`POST /v1/dumps` takes the audio blob in the same `blobIds` array. In the existing transaction: at most one of the ids may be `kind = 'audio'` or the request is 400; every id must be this account's, unclaimed and live, as today. `messages.type` is `voice` when an audio blob is present, else `image` when photos and no text, else `text`. `messages.text` is the typed words or null. `dump_sent.v1` gains `voice` (boolean), `voice_seconds` (integer, the declared length) and `voice_bytes`, additive on v1 as 020's were.

### The filing turn

`handle()` in `worker.py`, before `question_text` and before the first step line:

1. **Voice first.** `ctx_mod.voice_of(conn, message_id)` reads the message's audio blob, if any: `blob_id`, `provider_ref`, and whether `messages.transcribed_at` is set. Nothing to do when there is no audio or the transcript exists, which is what a retry after the write and a resume both find.
2. **"Listening"** is written as the step, ahead of "Looking through your threads".
3. **Transcribe**, inside a task the cancel waits for. The worker's cancel mechanism raises `CancelledError` at the next await; this step runs under `asyncio.shield`, and on cancellation the handler awaits the shielded task to completion before re-raising, which is 017's "a cancel in the middle of a write waits for that one thing" applied to the first write of the turn. Inside:
   - If `provider_ref` is null: `GET /internal/v1/blobs/:id/original` streams the decrypted bytes (the route already exists and serves any kind); `POST {EU}/v2/upload` with the bytes as the body returns `upload_url`, a reference only the same key can use; `POST {EU}/v2/transcript` with exactly `{ audio_url, language_detection: true, audio_end_at: 600000 }`, the keys asserted at import time against the vendor's reference (the 016 lesson: a field taken from documentation and never checked is a guess); then `POST /internal/v1/blobs/:id/submitted { jobId, providerRef }` before the first poll, so a death here costs a poll on retry and never a second upload.
   - Poll `GET {EU}/v2/transcript/:ref` every 3 s until `status` is `completed` or `error`, for at most 6 minutes. `error` and the timeout raise, and the job retries on its own backoff; after `max_attempts` the loop's terminal path posts `turn-result` `failed` with the new reason `transcription_failed`.
   - On `completed`: `POST /internal/v1/messages/:id/transcript { jobId, text, durationMs: audio_duration * 1000 }`. The Core API sets `messages.transcript` and `transcribed_at`, `blobs.measured_ms`, writes one `llm_usage` row (`model = 'assemblyai'`, tokens zero, `cost_micros` from the measured seconds at `ASSEMBLYAI_MICROS_PER_SECOND`, the provider's wall time as latency) so the admin Costs page counts it, and enqueues `voice.forget { blobId }`.
4. **Nothing to hear.** If `said(text, transcript)` is empty after the write and the message has no photos, the worker posts `turn-result` `answered` with `replyText = HEARD_NOTHING` ("Heard nothing in that one.") and no usage, and returns; no model is called. With words or photos, the turn continues on them and the reply says nothing about it.
5. **From here the message is text.** `question_text`, `_DUMP`, `_TURNS`, 018's judge and `load_answer` all read `said(m.text, m.transcript)` in place of `m.text`. `build_blocks` labels the dump block "spoken, written down" when the message has a transcript, and `plan_v2.md` and the classify prompt gain the "Spoken" paragraph: it may carry other people's speech, a sentence addressed to somebody else is quotation, numbers arrive as words, there is little punctuation. Nothing else in the turn changes.
6. **The photo readers learn the kind.** `_PHOTOS`, `_PHOTO_COUNT` and the `photos` subquery in `_TURNS` add `and b.kind = 'image'`, as do `photosOf`, `fileUnfiled`, `photosForAll` and the two end-of-turn steps in `internal.ts`. The test is the feature spec's: one photo and one voice note on a message file exactly one photo row, and the audio has no `content_blobs` row and no thread wrap.

### Forgetting the provider's copy

`voice.forget`, a worker job: read `blobs.provider_ref`; `DELETE {EU}/v2/transcript/:ref`; on 2xx or 404, `POST /internal/v1/blobs/:id/forgotten`, which nulls the reference; anything else raises and the job retries on its backoff, up to its attempts. `blob.daily` enqueues `voice.forget` for every blob whose `provider_ref` is not null and is older than an hour, which covers a worker that died after submitting, a turn undone in flight, and a parked job. The job is keyed on the blob and reads the reference from the row, so it runs whether or not the message survives.

### Serving

`GET /v1/blobs/:id/audio`, session-authenticated. Readable when `kind = 'audio'`, the blob is live, and its message belongs to the requester and is live. **No thread arm**: 020's `readable()` is not used, since its second arm would hand a thread member a linked blob, and this route serves originals. The object is decrypted whole (at most 10 MB), and the response honours a single `Range` with 206 and `Content-Range`, or answers 200, with `Accept-Ranges: bytes`, `Content-Type` from the row, `Content-Length`, `Cache-Control: private, max-age=3600`, `X-Content-Type-Options: nosniff`, `Content-Disposition: inline`. A blob that is not audio, not the requester's, or gone is 404. A test proves an accepted member of a thread holding a row filed from the note gets 404.

- **Web** draws `<audio preload="none" crossOrigin="use-credentials">` with the route as `src`; `timeupdate` fills the bars; one element per screen, paused when another starts.
- **Phones** fetch the route with the session cookie through `expo-file-system` into the app's cache directory, then play the file with `expo-audio`'s player under `playsInSilentMode: true`; the file is deleted on pause, on unmount and on sign-out. Never a URL handed to a native player, which cannot carry the session, and never a token in a query string.

### Undo, purge, deletion

Unchanged from 020: `undoTurn` soft-deletes the message's blobs; `content.purge` sweeps blobs with no message; `blob.purge` deletes the R2 key and the row. An audio blob has one R2 key, so the purge's three-key delete tolerates a missing `thumb` and `large`, which it already does for a photo whose renditions never landed. Account deletion hard-deletes messages, the audio loses its message and is swept. `voice.forget` runs independently of all of it.

## Data model

### Volume and access

| Field | Estimate |
| --- | --- |
| Records per account | Voice notes: 2 a day typical, 20 heavy, 100 at the cap. Length: 30 s typical, 10 min max. Bytes: 240 KB typical, 5 MB max. Two years: 1,500 typical at 360 MB; 15,000 heavy at about 15 GB. Transcript: 75 words typical, 1,500 max, on the message row |
| Fan-out | Audio blobs per message: 0 or 1. Wraps per audio blob: exactly 1, the account's, never a thread's |
| Growth | As above; nothing here grows faster than messages do |
| Read pattern | The conversation tail: 50 messages joined to their audio blob for `voice` on the wire. Playback: one fetch of one object. The worker: one original, once. Search: the existing message index. The ceiling: one aggregate over the last day |
| Write pattern | One blob insert and one message per send, bursty like photos; one transcript write and one measured duration per note, seconds later; the provider reference written and cleared once each; `llm_usage` one row per note |
| Sort and filter | `blobs` by `(account_id, kind, created_at)` for the ceiling; by `provider_ref is not null and created_at` for the sweep; by `message_id` and `kind` for the tail and the claim. `messages` by `transcribed_at` for the embed sweep's version and predicate |

- **Pagination:** none new. The tail is 50 as today; the audio joins it one row per message.
- **Indexes:** the ceiling reuses `blobs_account_created_idx (account_id, created_at desc)` and filters `kind` behind it, since a day holds at most 300 blobs per account. New: `blobs_provider_ref_idx on blobs (created_at) where provider_ref is not null`, for the daily sweep. `blobs_message_idx` already covers the tail and the claim. `messages_search_idx` is dropped and rebuilt with the regenerated column.
- **Normalisation:** `messages.transcribed_at` is the readiness flag the wire's `transcribed` derives from. `blobs.duration_ms` is the declared length and `measured_ms` the provider's, kept apart so the ceiling can prefer the measured one and an analytics event can say which it carries. `waveform` is stored once on the blob and never recomputed. `search_text` is regenerated from `said(text, transcript)` so search needs no second column.
- **Partitioning:** none.

### Schema

Migration `0051_voice_notes.sql`. No branch holds 0051 today.

```
-- One function, every reader. Words then transcript, a blank line between, nulls dropped.
create function said(words text, transcript text) returns text
  immutable language sql as $$ select nullif(concat_ws(E'\n\n', nullif(words, ''), nullif(transcript, '')), '') $$;

blobs
  + kind          text not null default 'image' check (kind in ('image', 'audio'))
  ~ width, height  drop not null; add check
                   ((kind = 'image' and width is not null and height is not null)
                    or (kind = 'audio' and width is null and height is null))
  + duration_ms   integer null check (duration_ms between 1 and 600000)     -- declared by the device
  + measured_ms   integer null                                              -- the provider's
  + waveform      smallint[] null check (array_length(waveform, 1) = 32)
  + provider_ref  text null                                                 -- the transcript's id at the provider, until forgotten
  + index blobs_provider_ref_idx on blobs (created_at) where provider_ref is not null

messages
  + transcript     text null
  + transcribed_at timestamptz null
  ~ search_text    dropped and regenerated as to_tsvector('simple', coalesce(said(text, transcript), ''))
  ~ messages_search_idx rebuilt
  ~ readable_messages dropped and recreated, since it selects messages.* and a view freezes its list

grant select (kind, duration_ms, measured_ms, provider_ref) on blobs to offload_agent;
```

`messages.type` already allows `voice`; `content.type` still allows it and nothing writes it, which the migration's comment says. The default `'image'` on `kind` makes every existing row a photo, which is what every existing row is.

## Interfaces

### Client

- `POST /v1/blobs/audio`, multipart `clientKey`, `durationMs`, `waveform`, `file`. 201 `{ blobId }`; 413 `too_big`; 415 `not_a_voice_note`; 429 `daily_limit`; 503 `voice_unavailable` when no object store is configured. Idempotent on the key as 020.
- `POST /v1/dumps`: `blobIds` may hold one audio id; 400 `one_voice_note` for two.
- `GET /v1/blobs/:id/audio`: the bytes, Range-aware, dumper only.
- `POST /v1/dumps/:id/resume`: unchanged in shape; it already accepts `failed`, and it now recomputes `openQuestionId` for the conversation as the original enqueue does, so a spoken answer whose transcription failed once is still judged as an answer on the retry.
- The envelope: `voice: { blobId, durationMs, waveform: number[], transcript: string | null, transcribed: boolean } | null` on person messages, in both `messageResponse` and the current-conversation shape; `text` stays the typed words. `photos` excludes audio by construction.
- `dump_sent.v1.json`: `voice` boolean, `voice_seconds` integer, `voice_bytes` integer, optional.
- `turn-result`'s `reason` enum gains `transcription_failed`.

### Internal

- `GET /internal/v1/blobs/:id/original`: unchanged; serves any kind.
- `POST /internal/v1/blobs/:id/submitted`: `{ jobId, providerRef }`, sets `provider_ref`. Job-bound like 020's rendition route.
- `POST /internal/v1/messages/:id/transcript`: `{ jobId, text (max 20,000 chars), durationMs }`. Sets `transcript` and `transcribed_at`, `blobs.measured_ms`, writes the `llm_usage` row, enqueues `voice.forget`. Validation errors on this route never echo the body; the reply is the field name and the reason.
- `POST /internal/v1/blobs/:id/forgotten`: `{ jobId }`, nulls `provider_ref`.

### Agent

- `transcribe.py`, new: the provider client on the worker's `httpx` client. `EU = "https://api.eu.assemblyai.com"` is a module constant; every request is built from it and a guard raises on any other host, with a unit test that the US host raises; there is no base-URL setting. The request body's keys are checked against a frozen set copied from the vendor's reference on the day, and a mismatch fails at import. Logging is type-only, as `worker.py` does for renditions: never the text, never the reference.
- `context.py`: `voice_of`; `said(...)` in `_DUMP`, `_QUESTION`, `_TURNS`, the answer and judge loaders; `kind = 'image'` in the three photo queries; `DumpContext.spoken: bool`.
- `harness/plan.py`: the dump label gains "spoken, written down" when `spoken`.
- `worker.py`: the voice step at the top of `handle()` under the shield; `HEARD_NOTHING`; the `voice.forget` handler; `voice_seconds` and the outcome on the log line.
- `prompts/plan_v2.md` and the classify prompt: the "Spoken" paragraph. `evals/principles/voice.json` is **deferred**: its cases are made from real recordings once the feature can produce them, and it is never run without the product owner's yes.
- Config: `ASSEMBLYAI_API_KEY` (unset means every voice job fails `transcription_failed` and the boot line says so), `ASSEMBLYAI_MICROS_PER_SECOND` (default from the current price).

### Web

- `Composer.tsx`: the microphone live; the recording row borrowed from the mobile kit with the waveform window scaled to the row; the words as static text above it; the stopped state; Discard with the toast past a minute; upload then dump with the audio in `blobIds`; the failed treatment on the bubble with Try again putting the `Blob` back in the row; the live head's Close disabled while recording; Escape and Enter.
- `SentVoice.tsx`, new, borrowed from the kit: the glyph, 32 bars from the wire, the duration, the playing state, the button name and state; the transcript beneath with "Show all".
- `Conversation` turns: `voice` on the person's bubble, above the photos.

### Mobile

- `expo-audio`, `expo-keep-awake`, `expo-quick-actions`; the recording state in `conversation-context.tsx`; `Composer.tsx` as above with the keyboard dropped and the plate still; `SentVoice.tsx` in `components/shell` with the cache-file playback; the quick action on the root layout; the launch sweep of the recordings directory; the Material pair on Android.

## Prompt budget, per OFF-8

The transcript is the dump text, which `fit` never drops, and it is bounded at ten minutes of speech, about 1,500 words and 2,000 tokens against the 8,000-token ceiling, so the worst case is a quarter of the budget once. The tail reads a voice message as its words, which the existing turn cap bounds. The "Spoken" paragraph is fixed text. Nothing grows with account age.

## Dependencies

- Core API: nothing new; `@fastify/multipart` and the S3 client are 020's. Env: `R2_*` as 020.
- Worker: nothing new; `httpx` is there. Env: `ASSEMBLYAI_API_KEY`, `ASSEMBLYAI_MICROS_PER_SECOND`.
- Mobile: `expo-audio`, `expo-keep-awake`, `expo-quick-actions`. Each carries a config plugin, so this is an EAS build on both platforms.
- Web: nothing new.
- **AssemblyAI**, gated on the key. The account is the product owner's; the endpoint is the code's. The privacy page changes in the same commit as the key, as the feature spec drafts: the row, the section 5 line, "words you dumped".

## Edge cases

- **The worker dies between upload and submit:** the upload is orphaned at the provider and deleted by their own 48-hour rule; the retry uploads again, which is the one case the audio leaves twice, and it is a crash inside a three-second window.
- **The worker dies between submit and the transcript write:** `provider_ref` is set; the retry polls it. If the provider finished long ago, the poll returns `completed` at once.
- **The turn is undone while listening:** the message and blob are soft-deleted; the transcript write lands on a deleted message, harmlessly; `voice.forget` runs from the write, and the daily sweep catches it if the write never came.
- **The provider's DELETE keeps failing:** the job parks dead after its attempts and the daily sweep re-enqueues it tomorrow; the reference stays on the row until a 2xx or 404.
- **The provider returns `completed` with empty text:** the transcript is the empty string, `transcribed_at` is set, and the turn takes the heard-nothing path; `said` drops it.
- **Words, a photo and a voice note in one message:** the photo path, since `photo_count > 0`; the dump is `said(words, transcript)` with the image blocks; one photo row, no audio row.
- **A voice note answers an open question, and the job is resumed:** the resume recomputes `openQuestionId`; the judge reads `said(...)`.
- **The client declares 30 s and sends 20 minutes at 6 kbps:** under 10 MB, so accepted; `audio_end_at` bounds the provider to the first ten minutes; the measured duration then counts 600 s against the ceiling.
- **Two uploads race the ceiling:** over by the number in flight, as 020 accepts.
- **A Range request past the end:** 416.
- **Safari and MP4 without `moov` at the front:** MediaRecorder on Safari writes a playable file; if a browser ever produces one Safari's `<audio>` refuses, the bubble shows "Not here yet." on the error event, which is the failure line and not a diagnosis.
- **The quick action arrives during first run:** first run completes, the shortcut is dropped, and the person is on Today with a plain composer.
- **Sign-out mid-recording:** the recording is discarded with the composer state, its file deleted.
- **The kit's `--ink-950` on `SentVoice`'s bars:** the code takes `--text-primary`, logged.
- **A message from before this migration:** `kind = 'image'` by default, `transcript` null, `said` returns its words; nothing changes for it.

## Constitution check

- **OFF-1:** the audio and the transcript are stored with the message and purged by refcount; events carry `voice`, seconds and bytes; logs and traces carry ids, kinds and counts, and the provider client logs types only; `last_error` is scrubbed as today; the transcript route echoes nothing.
- **OFF-2:** the audio is encrypted under 020's layers and R2 holds ciphertext; the transcript is plaintext on `messages` and the page already says so in sections 3 and 12.
- **OFF-3:** the audio route resolves through the message to its dumper with no thread arm and refuses non-audio; no thread wrap is ever created for `kind = 'audio'`; rows filed from the words follow the existing rules.
- **OFF-4:** not applicable.
- **OFF-5:** the transcript enters through a validated internal route; the provider's response is parsed as JSON against the fields used and nothing else; model outputs are unchanged.
- **OFF-6:** every action a spoken sentence causes is the same allowlisted action inside the whole-turn Undo; `voice.forget` is cleanup of our own copy at a processor, not an action on anyone's surface; the Discard toast is the client's own eight seconds.
- **OFF-7:** the eleven divergences in the feature spec, each logged on `main` with its impact.
- **OFF-8:** the transcript is bounded by the ten-minute cap and sits inside the existing text budget; nothing added accumulates.
- **SEC-1:** the key is server-side; the transcript travels as the person's dump in user-turn content, labelled spoken; the server never decodes audio; the EU host is a constant with a test.
- **SEC-2:** byte cap, sniff, kind, ceiling, the one-note rule and the per-call bound are all enforced at the server; the audio route authorizes on every fetch.
- **DATA-1:** this document, before the migration.
- **DEV-1:** one function for the composed text, no new table, no server-side waveform, no SDK, no renditions, the existing purge and resume paths.
- **DEV-3:** `httpx`, `MediaRecorder`, and three Expo modules with config plugins.
