# 020 Photos, tasks

Ordered. Each cites the acceptance criteria it serves and the principles it satisfies. The share sheet is its own track and ships on its own if the extension fights back. Anything under `docs/tech/`, `docs/constitution/` or `.claude/skills/offload-design/` is written on `main`, never in the feature worktree.

## A. Setup and record

- [x] **A1** Migration `0050_photos.sql` (was 0049; a calendar branch took that number the same week): `blobs`, `blob_keys`, `content_blobs`, `place_reverse`, the indexes in the impl-spec, `questions.field` gaining `thread`, `readable_content` recreated, the worker role's grants. *(AC-14, AC-26, AC-37; DATA-1, OFF-3)*
  *Test:* the migration applies to the seeded database and rolls forward from 0048; `blobs (account_id, client_key)` refuses a duplicate; the worker role can read `blobs` and not `blob_keys`.
- [x] **A2** Env and clients: `R2_*` in `env.ts`, required in production and optional in test; an `ObjectStore` interface with the R2 implementation and an in-memory one for tests; `keys.ts` gains the object layer, wrap and unwrap of a 32-byte key under an account or thread key, and the streaming AES-256-GCM seal and open for objects. *(AC-14; OFF-2, DEV-3)*
  *Test:* a sealed object opens with the right key and fails with the tag on one flipped byte; a wrap round-trips under both scopes; the in-memory store and R2 pass one shared contract test.
- [x] **A3** On `main`, `.claude/skills/offload-design/decisions.md`, five entries each with **Design system impact**: links leave Files; `SentPhoto` at 36px `--radius-sm`; the viewer, unmocked, its controls and its bar per platform; the move sheet borrowing `Sharing.jsx`; the web borrowing the mobile kit's `AttachChip`, `SentPhoto` and `FileTile`. *(AC-12, AC-29, AC-30, AC-31; OFF-7)*
- [x] **A4** On `main`, `docs/tech/decisions.md`: the photo entries under a "Photos, decided during 020" heading, including reverse geocoding as its own gated path, the rendition split, the `thread` field's condition, and the share extension's `openURL` workaround. `docs/specs/018-asking-back/feature-spec.md`: the four "never which thread" sentences gain the one exception, dated. *(DEV-2)*
- [x] **A5** The privacy policy, `apps/web/src/app/(marketing)/privacy/page.tsx`: the line in "What offload makes from it" on when and where a photo was taken as the day and the town; the sentence in section 10 that members of a shared thread see the row; the Google Maps Platform row stays unwritten until the key is set, and the line for it is drafted in A4 so it is not invented later. Shown to the product owner before commit. *(AC-38; CLAUDE.md privacy rule)*
- [x] **A6** Regenerate the harness map once the prompt, tools and routes exist. *(DEV-2)*

## B. API

- [x] **B1** `routes/blobs.ts`: `POST /v1/blobs` with `@fastify/multipart`, the 20 MB stream limit, the header sniff and the 60 megapixel bound, the daily ceiling, `(account_id, client_key)` idempotency, `exifr` metadata, the object key, the seal, the R2 write, the account wrap, the row with `message_id` null. The log line carries no name. *(AC-5, AC-6, AC-10, AC-13, AC-14, AC-19; SEC-2, OFF-1, OFF-2)*
  *Test:* a 20 MB + 1 byte body is 413 with no row and no object; a PDF named `photo.jpg` with `image/jpeg` declared is 415; a HEIC is accepted with its dimensions from `ispe`; the 201st photo of the day is 429; a repeat client key returns the same id and writes nothing; a JPEG with GPS stores rounded-nothing, the exact coordinate on the row, and the log line asserted free of the name.
- [x] **B2** `GET /v1/blobs/:id/thumb|large`: the authorization `EXISTS`, the streamed open, the headers, 404 until ready. No `original` route. *(AC-15, AC-34; OFF-3, SEC-2)*
  *Test:* the dumper reads before any row exists; a member of the thread the row landed in reads; a non-member is 404; a member of a thread the row was moved out of is 404; `original` is 404 for everyone; `Cache-Control` is `private`.
- [x] **B3** `POST /v1/dumps`: `blobIds` and `viaShare`; the claim inside the existing transaction; `unknown_blob`; `type` and `source`; the idempotent path untouched; `dump_sent.v2` with `photos`, `photo_bytes`, `via_share`, and the schema file. *(AC-9, AC-10, AC-13; OFF-1)*
  *Test:* a dump with a blob from another account writes nothing; a photo-only dump has `type = image`; a retry with the same client key does not re-claim; the event validates against v2 and carries no name.
- [x] **B4** Internal: `GET /internal/v1/blobs/:id/original`, `POST /internal/v1/blobs/:id/renditions`, `POST /internal/v1/blobs/:id/unreadable`. *(AC-14, AC-27)*
  *Test:* the original streams decrypted and byte-identical; renditions land encrypted under the same object key with distinct nonces and set `renditions_at`; a non-JPEG rendition is refused.
- [x] **B5** `tool-call` `add_content.photo`: the index resolved against the message's blobs, `unknown_photo`, the `content_blobs` row, the thread wrap, the metadata sentence appended to the body. *(AC-16, AC-17, AC-19; OFF-5, OFF-3)*
  *Test:* `photo: 2` on a one-photo message is refused; `photo` on `type: task` is refused by schema; the second `add_content` naming the same photo is refused; the body ends with `Taken on 11 August.` when the blob has a date and no town.
- [x] **B6** `turn-result`: the server files every photo without a live row before settling, in `looking_at_thread_id` or the default thread, and the outcome says so; the `thread` question's condition and option validation; the template. *(AC-16, AC-26, AC-27; OFF-5)*
  *Test:* a turn that filed nothing leaves every photo with a row titled `A photo`; a `thread` question on a turn that wrote two rows is dropped and logged as `thread_condition`; an option naming a thread the account is only invited to is refused; labels come from the database and are clipped to 24.
- [x] **B7** `questions.ts`: `thread` in `FIELDS`, `parseValue`, `renderText`, `applyAnswer` through `moveContent` with `previous_value`, the restore on Undo. *(AC-26; OFF-6)*
  *Test:* a tap moves the row and its wraps; Undo moves it back; a row already moved by hand closes the question.
- [x] **B8** `moveContent` adjusts wraps; `undoTurn` soft-deletes the turn's blobs; `content.purge` gains the `content_blobs` sweep, the wrap drop, the orphan and unclaimed sweeps; `blob.purge` deletes R2 keys then rows with a ceiling. Account deletion and last-member-leaves name the blob tables. *(AC-28, AC-33, AC-35, AC-36, AC-37; OFF-3, OFF-6)*
  *Test:* moving a photo between two shared threads leaves the origin members unable to read and the destination members able; Undo of a dump makes its photos purge-due; a blob claimed by a purged message with a live row in a shared thread survives and its account wrap does not; an unclaimed blob is swept at 61 minutes and not at 59; `blob.purge` leaves the row when the store refuses the delete.
- [x] **B9** `blob.locate` and the reverse cache behind `GOOGLE_MAPS_API_KEY`, rounding to three decimals, locality only, the body sentence rewrite, the backfill. *(AC-19; OFF-1)*
  *Test:* two photos 30 m apart share one cache row and one call; the call's query carries three decimals and no account id; with the key unset nothing is enqueued and the sentence has no town.

## C. Agent

- [x] **C1** `worker.py`: the rendition step with Pillow and `pillow-heif`, `exif_transpose`, the 400px square thumbnail and the 2048px large copy, the posts, the unreadable path, `images` and `image_bytes` on the log line, image blocks stripped from the trace. *(AC-14, AC-15, AC-27; OFF-1)*
  *Test:* a sideways HEIC yields an upright JPEG large copy under 2048 on its long edge with no EXIF; a corrupt file marks `unreadable_at` and the turn still runs; the log line and the trace input carry no base64.
- [x] **C2** `context.py` and `plan.py`: `Photo`, `DumpContext.photos`, an empty `text` no longer returning `None` when blobs exist, the labelled image blocks before the dump text, the tail rendering a photo message as text plus its rows' titles, `fit()` carrying photos uncounted. *(AC-16, AC-21, AC-22; OFF-8, SEC-1)*
  *Test:* `build_blocks` places each image after a label block naming it as data and before the dump text; a photo message in the tail renders with titles and no image block; `fit()` never drops `photos`.
- [x] **C3** `harness/tools.py`: `AddContent.photo` with its type validator; `Ask.field` gains `thread` and the description its one case. *(AC-16, AC-26; OFF-5)*
  *Test:* `photo: 11` and `photo` on a task are refused by schema.
- [~] **C4** `prompts/plan_v2.md`, the "Photos" section, and `evals/principles/photos.json` with the sixteen cases, the no-context beach photo asking `thread`, a receipt from Today not asking, a list from Today not asking, and the injection screenshot; drawn fixtures under `evals/fixtures/photos/`. Run through the `test-llm` skill with a held-out half. **Never run without the product owner's yes in the session.** *(AC-17, AC-18, AC-22, AC-23, AC-24, AC-25, AC-26)*
  *Test:* every held-out case files its rows and no others; the injection case files one row and says nothing; the passport case's title has no digits.

## D. Web

- [x] **D1** `Composer.tsx`: the live camera button, the file input, paste and drop, `AttachChip`, the expanded shape with the chip row, the per-draft keys, upload then dump with the progress state, the failure lines. *(AC-1 to AC-6, AC-9, AC-10, AC-11)*
- [x] **D2** `SentPhoto` in the turns at 36px `--radius-sm`, tap to open the viewer; `TailMessage.photos` on the wire. *(AC-12)*
- [x] **D3** `packages/widgets` `EARNS.files` drops `link` and `file`, the nineteen assertions plus two updated on both copies; `Widgets.tsx` draws the grid of `FileTile`; `ContentRowView.tsx` draws the thumbnail tile and opens the viewer from it. *(AC-29, AC-32; OFF-7)*
  *Test:* a thread with one link and no photo earns no Files; one screenshot earns it; the count ignores the chip.
- [x] **D4** `PhotoViewer.tsx`: scrim, large rendition, the text beneath, Full screen through the Fullscreen API, More with rename, move, archive, delete by author, Close, arrows and Esc, reduced motion, the toast after delete; the move sheet with search. *(AC-30, AC-31, AC-33; OFF-3)*
- [x] **D5** `dead-classes`, `dead-css`, `dead-icons`, lint, typecheck.

## E. Mobile

- [x] **E1** `Composer.tsx`: the camera button, `expo-image-picker` with multiple selection and the camera in the sheet, the camera permission line with `openSettings`, `AttachChip` with 44px hit slop, the expanded shape, the scrolling chip row, upload then dump, the progress state, the failure lines. *(AC-1 to AC-6, AC-8 to AC-11)*
- [x] **E2** `Conversation.tsx` `SentPhoto`; `ContentRow.tsx` the thumbnail tile; `Widgets.tsx` the grid; `Image` with the cookie header. *(AC-12, AC-29, AC-32)*
- [x] **E3** `PhotoViewer`: the modal route, the platform bar on each phone with the three controls, pinch to zoom, swipe between the set, swipe down and back to close, the text under a pull, the move sheet. *(AC-30, AC-31, AC-33)*
- [x] **E4** On-device checks on the Pixel 9 and an iPhone: ten chips with the keyboard up, a HEIC from the camera drawing in the grid within a minute, the viewer at 200% text, the remove control's hit area. *(AC-3, AC-15, AC-30)*

## F. Share sheet

- [~] **F1** `expo-share-intent` and its config plugin: the Android intent filter for images, the iOS extension with the ten-image activation rule, the app group, the scheme; an EAS build of both. *(AC-7)*
- [x] **F2** `useShareIntent` on the root layout: chips into the draft, the eleventh dropped with its line, `viaShare`, the composer opened and focused, the pinned + released, a send in progress waited out, the container cleared; signed out, held behind the gate and cleared on refusal, sign-out and after a day; the "Open offload to send it." fallback. *(AC-7; OFF-1)*
  *Test:* the extension has no log call; a pending share older than 24 hours is deleted on launch.
- [x] **F3** On-device: share three photos from Photos on each platform with the app closed, then with a thread open, then signed out. *(AC-7)*

## G. Close

- [~] **G1** All three suites; the eval's held-out number in the PR description; one real turn on web and on each phone: a receipt with words, a shopping-list screenshot from Today, a beach photo from Today answered by a tap, Undo on each. *(QUAL-1)*
- [~] **G2** The harness map regenerated (A6) and the privacy lines (A5) shown to the product owner before the merge.

## Where it stands, 2026-09-18

- A3 and A4 are written in the feature worktree rather than on `main`, because a calendar session had `decisions.md` open on `main` at the time. They move with the merge.
- C4: the prompt section, the fixtures and the 21 cases in `evals/principles/23-photos.json` are written. The eval has not been run; it costs money and needs a yes in the session.
- E4 and F3 are on-device checks nobody has run yet. F1's config is in `app.json`; the share extension needs its own bundle id and provisioning in EAS before the first build with it, which is an owner step.
- G1: the core-api, agent, web and mobile suites and gates are green; the eval number is not in hand. One real turn was run on web, none on a phone.
- G2: the harness map is regenerated in `docs/tech/harness-map.html`; the artifact is republished once this is committed, so the commit stamp on the page matches what it describes. The privacy lines are in the diff for the owner to read.
- Not in the spec: a message with a photo never takes the answering path, whatever its words. The classifier is skipped when the message carries a blob, because the answering path cannot see a picture and the picture has to land.
- The three reviews ran on 2026-09-18 and everything they found is fixed except two things left on purpose: the rendition read is three round trips rather than the spec's one (noted in the impl-spec, collapse if it ever shows in a profile), and the web viewer's Delete confirm uses two clay ramp values because no danger surface alias exists (the same precedent as the row tools). What changed from the reviews: an advisory lock serialises overlapping retries; `blob.daily` backfills towns and sweeps unclaimed uploads; the renditions drop a JPEG comment; Pillow's bound raises at 60 megapixels rather than 120; a partial R2 delete keeps the row; the towns are behind `PHOTO_TOWNS=on` as well as the key and are the locality only; the worker's grant on `blobs` is five columns; a swept upload retried under the same key is replaced; every read of a thread key wraps it for members without a copy; found rows carry the photo; the mobile viewer's plane is dark in both themes and sits under the sheets; a share that lands mid-send waits; the share arrival focuses the field; a sent message draws the file itself until the renditions land; the viewer's More is one way out; chips lock while a send is out; "Not here yet." has Retry; the web chip row scrolls without taking the send with it.
- Merged with `main` on 2026-09-19 (019 calendars, the mail guard, the design sync). Nine conflicts, all kept both sides: `questions.field` carries `calendar` and `thread`, the tail query carries the photo titles and 019's untrusted mask, the design log holds both days' entries. `add_content.photo` had to lose 35 tokens to fit the tool budget, which now sits at 1,798 of 1,800.
- On a Pixel 9 on 2026-09-19, against a local API through adb: the share sheet lists offload and a share from Photos lands as a chip with the field focused and the keyboard up; the picker attaches; a photo with words files and the sent message draws the picture at once; the Files grid draws the thumbnail; the viewer opens from a tile with More on top and Move above the keyboard. Found and fixed on the way: the upload's multipart part, the share path's missing scheme, the thumbnail's headers Android never sent, the composer's two-line box, the move sheet under the keyboard, the picker's media-id name, and the partial turn on a repeated photo. Not run on the phone: the share with a thread open and signed out (F3's other two), the thread question (the account had one thread), and iOS at all.
- 2026-09-20: shipped to production from `main` at `049fe63`; `0050_photos.sql` applied there and the boot log says "R2 is not configured; photos are refused", which holds until the four `R2_*` variables are set. F3's other two ran on the Pixel: a share signed out held its chip through Google sign-in and first run; a share with Porto trip open landed pinned to it (the model then filed the IKEA receipt to Flat admin over the thread on screen, which is the eval's "from inside a thread every piece stays there" to measure, not a code defect). The photo alone from Today was filed without the thread question on the one try; the API tests hold the mechanism and the eval holds the judgement. The icon build (`3d933e80`) is installed; the launcher shows the cached old icon until it refreshes.
- 2026-09-20, later: the `R2_*` four are set on `core-api` (bucket `offload-user-data`), the boot warning is gone, and a photo dumped from the production web app was filed to a thread, drew its thumbnail in Files and its large rendition in the viewer, both served out of the bucket. Before that the same photo went through a local API pointed at the bucket and its thumbnail survived an API restart, which is the proof it was R2 and not the memory store.
- One setting the owner still sets in production, optional: `PHOTO_TOWNS=on` with `GOOGLE_MAPS_API_KEY`, in the same deploy as the privacy row.
