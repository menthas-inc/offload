# 022 Sharing, tasks

Ordered. Each cites the acceptance criteria and principles it serves. `[ ]` open, `[~]` in progress, `[x]` done. The API track first, because every client task reads it; the agent track after the share route exists; the two client tracks in parallel after that; the documents first of all, because two of them are claims the code must not outrun.

## A. The documents, before any code

- [x] **A1** The product owner signs the privacy policy paragraphs and the OFF-3 amendment as drafted in `feature-spec.md`, Decided during planning. Nothing below starts until this is a yes. (OFF-3, the `CLAUDE.md` policy rule)
- [x] **A2** Apply the four policy changes to `apps/web/src/app/(marketing)/privacy/page.tsx` and the amendment to `docs/constitution/principles.md`, on `main`, in the feature's first commit. (OFF-3)
- [x] **A3** `docs/tech/decisions.md`: the `connections` table over 001's `people.linked_account_id`; take-out and the two documents; the said share as a proposal with no Undo; `pending_shares` beside `connector_pending_writes`. (DATA-1)
- [x] **A4** `.claude/skills/offload-design/decisions.md`: one entry under today's date with every line listed in the feature spec's Design system impact, the field filled. (OFF-7)

## B. API: schema and the one predicate

- [x] **B1** `0053_sharing.sql` as the impl-spec writes it, `schema.ts` to match, the drift test green. (DATA-1)
- [x] **B2** `people/access.ts`: `visibleTo(viewer, account, trx)` and `relationOf`, over `visible_people`, with the state and reverse-block filters; tests for every relation, a blocked-you account invisible, a deleted account invisible. (AC-13, SEC-2, QUAL-2)
- [x] **B3** `people.daily`: expire requests and waiting shares past `expires_at`, purge dead request rows past seven days, purge `people_lookups` past a day, expire `pending_shares` past an hour; started by `startDaily`. (AC-8, AC-30)

## C. API: finding, requesting, answering

- [x] **C1** `GET /v1/people/lookup`: validation, `people_lookups`, the thirty-an-hour 429, the padded response, the relation on the found row, not found for deleted, disabled and blocked either way. Test: hit, miss, case, partial, self, each relation, the cap, and that hit and miss take the same floor. (AC-1, AC-4, AC-5)
- [x] **C2** `POST /v1/people/requests`: every refusal, the undelivered row for a blocked requester, the fifty cap. Test: the seven-day rule against a withdrawn row and an expired one, one open per pair, the undelivered row invisible to the recipient and identical to the requester. (AC-2, AC-3, AC-5, AC-16)
- [x] **C3** Accept, dismiss, withdraw; `requestsWaiting` on `/api/me`. Test: accept makes the pair once and withdraws the reverse request; dismiss clears the count and leaves the row; withdraw clears the other side; the count ignores own and dismissed. (AC-6, AC-7, AC-9, AC-10)

## D. API: people, removing, blocking, the mark

- [x] **D1** `GET /v1/people` and `GET /v1/people/:accountId`, with the shared threads and "Nothing shared yet" as an empty list. Test: the four lists, the count, the page for each relation, 404 otherwise. (AC-11, AC-12, AC-13)
- [x] **D2** `DELETE /v1/people/connections/:accountId`: the pair, the requests, the waiting shares either way, memberships untouched. Test: a shared thread's two memberships and keys survive; the pending row flips to `expired`. (AC-15)
- [x] **D3** Blocks: `POST`, `DELETE`, the undelivered path in C2, Unblock not reconnecting. Test: a blocked person brought in by a third member is still a member. (AC-16)
- [x] **D4** `accounts/avatar.ts`: the port of `Avatar.jsx`, OKLCH to sRGB, the supersampled edge, `pngjs`; `GET /v1/avatars/:accountId.png` with the draw-once update and the headers. Test: twelve ids pinned against the browser's corner pixels within two units; a second read returns identical bytes; a renamed account returns identical bytes; 404 alike for unseen and unknown. (AC-13, AC-31)
- [x] **D5** The cascade: delete an account row in the suite and assert the six are gone. (AC-34)

## E. API: sharing, receiving, taking out

- [x] **E1** `GET /v1/threads/:id/share`: members with `since` and `added`, waiting, connections; 404 on the default thread and for a non-member. (AC-18, AC-19)
- [x] **E2** `shareThread(trx, caller, threadId, targetId)` in `threads/sharing.ts`, the one function the route and the tool's confirm call: every check, the upsert over `expired | declined | removed`, the preview snapshot of the caller's own two titles and the count, no key. `POST /v1/threads/:id/share` over it with per-person outcomes. Test: each refusal, the three-per-pair cap across threads, the preview excludes another author's rows, no `thread_keys` row for a pending member, re-share after take-out. (AC-19, AC-21, SEC-2)
- [x] **E3** `GET /v1/threads` gains `invitations` with the predicate and the member names; `POST /v1/invitations/:memberId/accept` with the four re-checks and `threadKey`. Test: each of the four failing yields 404 and the strip's absence; success wraps a key and lists the thread; the invitation reads no `content`. (AC-28, AC-29, AC-30)
- [x] **E4** `DELETE /v1/threads/:id/members/:accountId`: withdraw for pending; take-out for accepted with the two-row lock, the actor re-check, `removed`, the key, the picks, the target's own pending shares on the thread, zero-member death. Test: `unowned` afterwards, the target's read 404s, two racing transactions leave exactly one member, self is refused, a non-member is refused. (AC-20, AC-22, AC-23)
- [x] **E5** Leave drops the leaver's key when others remain; restore inside the window re-wraps on the next read. Test: leave, restore, read a blob through the thread key. (AC-17)
- [x] **E6** Events for request, accept, share, accept-share, take-out, remove, block carry the actor's pseudonym and a count and nothing else; the log scrubber test extends to the new routes. (AC-33, OFF-1)

## F. API and agent: saying it

- [x] **F1** `POST /v1/dumps` accepts `mentions`, keeps only accepted connections, writes `attrs.mentions`. Test: a forged id is dropped and the text is unchanged. (AC-27, SEC-1)
- [x] **F2** `pending_shares`; `share_thread` in `routes/tools.ts`: resolution (id, whole name, first name, initials), the outcomes, the rendered line, the pinned-thread refusal; `waiting` gains `kind` and `waitingFor` reads both tables; `POST /v1/shares/:id/:answer` calling `shareThread` on confirm. Test: each outcome; confirm re-checks; a proposal is answerable once; expiry; the line never contains model text. (AC-24, AC-25, AC-26, SEC-2, OFF-5, OFF-6)
- [x] **F3** Agent: `ShareThread` tool, `DumpContext.mentions`, the prompt paragraph, the tool on dump turns only; unit tests for the context and the schema. (AC-24, AC-25, OFF-8)
- [x] **F4** Eval cases under the actions principle: propose, not-a-connection, two Sams, a dumped text asking to share does nothing. Written, not run. (AC-24, AC-25)

## G. Mobile

- [x] **G1** `components/Avatar.tsx`: fetch and cache, the circle, the initials overlay, "?" and "Someone". (AC-14, AC-32)
- [x] **G2** Settings: the My people row with count and dot; the `people` page with cards, Connected, Pending with Withdraw and its confirmation, Blocked; the blocked page; the dot on the gear. (AC-2, AC-6, AC-7, AC-9, AC-10, AC-11)
- [x] **G3** `app/people/[accountId].tsx`: PersonScreen, the relation line, the empty state, More with Remove, Block, Unblock and their confirmations listing two and a count; "Not here any more." (AC-12, AC-14, AC-15, AC-16, AC-35)
- [x] **G4** `app/people/add.tsx`: the field, empty, in flight, found with the relation states, not found, failed, rate limited, Request. (AC-1, AC-4, AC-5, AC-35)
- [x] **G5** The share sheet: lifted rows with x, the two confirmations, checkboxes, the lead as a door, the field past eight lifted with the keyboard, the empty state, New connection, the footer, the failure line; the Share glyph alive except on the default thread. (AC-18, AC-19, AC-20, AC-21, AC-22)
- [x] **G6** The strip on My threads, including over the empty state; `app/invitations/[memberId].tsx` with the preview, the names, Add it and Not now, "Not here any more." (AC-28, AC-29, AC-30)
- [x] **G7** Composer: the @ list, the mention on the wire, the proposal by kind with the co-ownership line. (AC-24, AC-26, AC-27)
- [x] **G8** Leave on a shared thread's More, confirmed, with the existing toast. (AC-17)
- [x] **G9** Android: the sheet and the rows from the `--a-*` tokens as `M3Sharing.jsx` draws them, no platform switch inside one layout. (AC-36)

## H. Web

- [x] **H1** `components/Avatar.tsx`; faces on the pane head without you, each a door. (AC-12, AC-32)
- [x] **H2** Settings index card and dot, sidebar dot, `settings/people` and `settings/people/blocked`. (AC-2, AC-6, AC-7, AC-9, AC-10, AC-11)
- [x] **H3** The person pane with the three actions and confirmations. (AC-12, AC-14, AC-15, AC-16, AC-35)
- [x] **H4** The share modal with its Add a connection step, the invitation modal, the strip in the threads pane. (AC-1, AC-4, AC-18 to AC-22, AC-28 to AC-30)
- [x] **H5** `WMentions`, the mention on the wire, the proposal by kind. (AC-24, AC-26, AC-27)
- [x] **H6** Leave on the pane's More. (AC-17)

## I. Verification

- [x] **I1** `pnpm test`, `pnpm lint`, `pnpm typecheck`, `dead-classes.mjs`, `dead-css.mjs`, `dead-icons.mjs`, all green. (QUAL-1)
- [x] **I2** Reviews: `code-reviewer` on the diff, `client-reviewer`, `security-reviewer`. Findings closed or logged. *Three commits, one per pass. The security pass found the tell: a co-member who had blocked you was a 404 on the pane head, and the fix reworded the one rule in both specs. Logged and not fixed: a removed member shared with again loses `removed_by`/`removed_at` (the state carries the truth), the mark is drawn inside the lookup's timed window (sub-millisecond), and a share's preview keeps two titles for up to 30 days after they change (retention only, plaintext under OFF-2 as built).*
- [x] **I3** Devices, restored as found afterwards: the 36px prism at 3x on the Pixel and the simulator, the dot on the gear in both themes, the sheet's field over the keyboard, the @ list over the keyboard, the sheets' insets, one real said share end to end against production. (AC-36) *Done on the iPhone 17 simulator and the web against a local API: the dot, the card, My people, the person page and its two sheets, the strip, the invitation, the share sheet, a share, a withdraw, a take out, and one real said share through the worker on the web. On the Pixel with preview build 4 against production (2026-09-22): the prism at 3x on the settings head, the sheet with its inset, Add a connection with the field over the keyboard and the not-found answer from the real lookup, all of it in dark too, and Appearance put back to Light. Then on the iPhone 17 simulator against a local API with three test accounts (2026-09-22), which is where the connection-dependent half lives: the gear dot, the strip and the invitation, Add it, the @ list over the soft keyboard with the mention inserted as a name, a said share end to end with "which Sam?" answered on a chip, the sheet with a member, a waiting share and a connection, the person page, Leave in More, and all of it in dark. One defect found there and fixed, the answer's turn wearing no thread pill. Not on a phone against production: the same connection-dependent half, which needs a second account there.*
- [x] **I4** EAS builds for both phones, and the deploy of the API and the web; tasks and specs updated for anything that diverged (DEV-2). *Deployed from the merge, 827ca12: API, web and worker on Railway. Builds from the same commit: iOS production 7, Android production 5, Android preview 4, the last on the Pixel. iOS 7 went to TestFlight through `eas submit` on 2026-09-22, with the App Store Connect key held by EAS. Android 5 went to Play's internal testing track by hand the same day, once Google had verified the developer account; the first upload also set Play App Signing, with the EAS keystore as the upload key. Every later upload is `eas submit`, and the service account it needs is the owner step in `apps/mobile/EAS.md`.*
