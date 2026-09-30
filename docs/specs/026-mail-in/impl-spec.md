# 026 Mail in, implementation

Against `feature-spec.md` as revised 2026-09-30. Grounded in `docs/tech/stack.md` (Railway, R2, Postgres jobs table, the model tiers), `docs/tech/decisions.md` (the 2026-09-29 mail entry, the 2026-09-08 calendar reversibility entry), 020's blobs, 024's Activity and 025's Undo.

## Data flow

```
sender's mail server
  -> Cloudflare Email Routing, to.offload.club (MX), rule over@ -> mail Worker, catch-all reject
  -> mail Worker (apps/mail-worker): read message.raw, POST https://api.offload.club/v1/mail/inbound
       headers: X-Mail-Timestamp, X-Mail-Signature = HMAC-SHA256(secret, timestamp + "." + sha256(body))
       non-2xx or network error -> throw, so Cloudflare answers the sender with a temporary failure
  -> core-api /v1/mail/inbound
       1. request check: signature, 5-minute window, 26MB body cap, no body capture
       2. sender check (src/mail-in/sender.ts): DKIM via mailauth, then the rules below
          -> refused: outcome enum; refused-row writer if From is an account; 200
          -> key fetch failed: 503 (temporary), nothing written
       3. rate caps: accepted in the last hour and day for the account
       4. parse (src/mail-in/parse.ts), in a worker thread with limits: text, subject, original sender and date,
          note boundary, candidate images, left-out attachment kinds
       5. rule-filter images (src/mail-in/images.ts), seal the candidates as unclaimed blobs (020's storeSealed)
       6. takeDump(source 'mail', text, attrs.mail, clientKey = sha256(account, Message-ID or signature b=))
          enqueue dump.answer with payload.mailLook = candidate blob ids
       7. 200
  -> agent worker, dump.answer
       a. if mailLook: the look (harness/look.py): 400px rendition of each candidate -> sort model, one
          schema'd verdict each; POST /internal/v1/mail/:messageId/look {keep: [...]}; core-api claims
          the kept (at most ten, email order) to the message and deletes the rest
       b. the turn as for any dump, with the mail blocks (below) and the look's kept images
  -> core-api /internal/v1/turns/... (existing turn result path)
       on a turn whose message has source 'mail': write the Activity row (src/mail-in/activity.ts)
```

**Why the Worker holds nothing and decides nothing.** It is outside Railway and is the first code offload runs on Cloudflare. Its whole job is to move bytes to one route with a signature, so a compromise of it yields the ability to submit an email for the same checks anybody's mail server faces, and nothing else. It has no KV, R2, D1 or queue binding, and `wrangler.toml` is asserted in a test to declare none.

**Why the sender check runs in core-api, not the Worker.** The accounts are in Postgres, the check's refusals have to write Activity rows, and a DKIM library with a real DNS resolver is ordinary Node. The Worker would need a database binding to do it, which is what it must not have.

**Why the image look runs inside the turn.** 020 already prepares photos as the turn's first step (`_prepare_photos`, `worker.py:1362`), core-api does not call models, and a separate job would need somewhere to hold the email's text between the two, which is a second copy of content. Candidates are unclaimed blobs until the look, so 020's hourly orphan sweep (`jobs/handlers.ts:234`) removes anything a dead turn leaves behind.

## Data model

Migration `0063_mail_in.sql`.

```sql
-- 026. An email forwarded to over@to.offload.club is a dump. 'gmail' stays
-- reserved for reading an inbox through the API, which this does not do.
alter table messages drop constraint messages_source_check;
alter table messages add constraint messages_source_check
  check (source in ('person', 'share', 'mail', 'gmail', 'calendar', 'browser'));

-- The rate caps count an account's accepted mail by the hour and the day.
create index messages_mail_idx on messages (account_id, created_at desc) where source = 'mail';

-- A DKIM signature is accepted once, ever. The hash of the signing domain and
-- the signature value, never the message: this table holds no content and no
-- account.
create table mail_signatures (
  hash        bytea primary key,
  seen_at     timestamptz not null default now()
);

-- Activity gains the email's rows.
alter table activity drop constraint activity_kind_check;
alter table activity add constraint activity_kind_check
  check (kind in ('digest', 'request', 'share', 'shared_activity', 'expired', 'moved', 'acted', 'labelled', 'mail'));
alter table activity
  -- Which of the five an email row is. Null for every other kind.
  add column mail_outcome text check (mail_outcome in ('filed', 'asked', 'nothing', 'refused', 'over_limit')),
  -- The turn Undo reverses, and the email the row opens. Both null for
  -- 'refused' and 'over_limit', which carry nothing from any email.
  add column turn_id uuid,
  add column message_id uuid references messages (id) on delete cascade,
  add constraint activity_mail_shape_check check (
    (kind = 'mail') = (mail_outcome is not null)
    and (mail_outcome not in ('refused', 'over_limit') or (turn_id is null and message_id is null and thread_id is null and content_id is null))
  );
create index activity_mail_capped_idx on activity (account_id, occurred_at desc)
  where kind = 'mail' and mail_outcome in ('refused', 'over_limit');
```

`messages.attrs.mail`, validated by a zod schema on write and a pydantic model on read:

```
{ subject: string (<= 300), fromName: string | null (<= 120), fromAddress: string (<= 320),
  sentAt: ISO string | null, noteLength: int (chars of text that are the person's own),
  leftOut: { pdf?: n, spreadsheet?: n, document?: n, calendar?: n, archive?: n, other?: n },
  cc: boolean }
```

`messages.text` is the whole extracted text (OFF-1). The first `noteLength` characters are what the person wrote above the forwarded part; everything after is somebody else's. A direct email with no forwarded block has `noteLength = text.length`. `type` is `'text'`, or `'image'` once the look claims an image, as 020 sets it for a dump with photos.

`messages.derived_from_untrusted` stays false for a mail message: that flag replaces a message's words with a fixed line in the turn tail (`context.py:232`) and removes it from search (`search/read.ts:433`), which is right for a stranger's calendar answer and wrong for somebody's own dump. What is marked instead is what the turn writes, below.

## Volume and access

| Field | Estimate |
| --- | --- |
| Records per account | Accepted emails: 2 a day typical, 20 heavy; capped at 100 a day. Refused rows: 0 typical, 3 a day at the cap. |
| Fan-out | Images per email: 0 to 2 kept typical, 10 at the cap; 20 candidates at most. Content rows per email: 1 typical, 5 heavy. |
| Growth | Messages: 700 a year typical, 7,000 heavy per account. Activity: bounded by the 30-day purge, 60 typical, 700 heavy. `mail_signatures`: one row per accepted email, forever, 32 bytes of key. |
| Read pattern | Activity screen (existing paged read, `activity_account_idx`). The rate caps, once per inbound email: two counts on `messages_mail_idx`. The refused-row cap: one count on `activity_mail_capped_idx`. The signature check: one primary-key lookup. The conversation: existing reads, unchanged. |
| Write pattern | Bursty per account (a person forwarding a morning's mail), negligible globally at alpha. |
| Sort and filter | `messages (account_id, created_at) where source = 'mail'`; `activity (account_id, occurred_at) where kind = 'mail' and mail_outcome in (...)`; `mail_signatures (hash)`. |

- **Pagination:** nothing new; Activity is already server-side and cursor-based.
- **Indexes:** the two partial indexes and the primary key above, account leading.
- **Normalisation:** none. The caps count rows rather than keeping counters, because the counts are over at most a hundred rows on a partial index.
- **Partitioning:** none. `mail_signatures` at a hundred accounts forwarding twenty a day is 730,000 rows a year, a few tens of megabytes.

## Interfaces

### The Worker, `apps/mail-worker`

```ts
export default {
  async email(message, env) {
    const body = await new Response(message.raw).arrayBuffer();
    const ts = String(Date.now());
    const sig = hmac(env.MAIL_INBOUND_SECRET, ts + "." + sha256hex(body));
    const r = await fetch(env.INBOUND_URL, { method: "POST", body, headers: { "content-type": "message/rfc822", "x-mail-timestamp": ts, "x-mail-signature": sig } });
    if (!r.ok) throw new Error(`inbound ${r.status}`);   // after the retries below: a permanent failure to the sender
    console.log(JSON.stringify({ outcome: "delivered" })); // an enum, never an address
  },
};
```

`wrangler.toml` declares the route's URL as a var and the secret as a secret, and no bindings. Deployed with `wrangler deploy` from `apps/mail-worker` by the owner, who holds the Cloudflare credentials; the secret is set with `wrangler secret put` and on `core-api` as `MAIL_INBOUND_SECRET`. **Rotation:** core-api accepts `MAIL_INBOUND_SECRET` and, when set, `MAIL_INBOUND_SECRET_NEXT`; set next on both sides, deploy, then promote.

**Checked 2026-09-30: a Worker cannot ask the sender to retry.** Cloudflare's runtime API offers `setReject`, which is permanent, and documents nothing about a thrown error; reports on Cloudflare's community forum say a throw answers `521 Upstream error`, also permanent, and that there is no way to return a 4xx. So the Worker retries the POST itself, three attempts over about thirty seconds (waiting on `fetch` is wall time, not CPU time), and only then throws, which bounces the email to its sender. That is acceptable: it happens only when core-api is down, the bounce tells the person to forward again, and it says nothing about whether an address has an account because every refusal of the check is still a 200. T6.3 confirms the 521 on the platform.

### `POST /v1/mail/inbound` (core-api, public)

- `bodyLimit: 26 * 1024 * 1024` on this route alone; content type `message/rfc822` parsed as a Buffer.
- The request check before anything else reads the body: both headers present, timestamp within 300 seconds, HMAC in constant time against either secret. A failure is 401 with no body and a log line carrying the reason enum.
- The route is excluded from any request-body capture: Fastify's logger serialises the request without a body (verified by a test that logs a request and asserts the body is absent), and the error handler for this route replaces any error with its enum before logging.
- Returns 200 `{}` for accepted and for refused alike, so the Worker never learns which and never logs it; 503 for a temporary refusal.

### The sender check, `src/mail-in/sender.ts`

`mailauth`'s `authenticate(raw, { trustReceived: false, resolver })` for the DKIM results, with a resolver wrapper that times out at 5 seconds and caches keys for an hour. Then, in code we own and test:

1. `From`: exactly one header; parsed with `mailauth`'s address parser to exactly one addr-spec; the display name discarded. Local part must be ASCII; the domain is converted with `domainToASCII`. Compared as `lower(localpart) + "@" + lower(asciiDomain)` against `lower(accounts.email) where deleted_at is null`, which is how `0001`'s unique index reads it. No other normalisation, and a comment says why.
2. A DKIM result with `status.result = 'pass'` where the From domain equals the signing domain or is a subdomain of it (relaxed alignment, RFC 7489). A pass with a body length tag is ignored. The pass's signed header list must contain `from`, and contain `to` or `cc`.
3. `over@to.offload.club` appears in a To or Cc header that is in the signed list. Where the header occurs more than once and the signature covers fewer instances than exist, refused.
4. `t=` present and older than seven days: refused. `sha256(d + b)` inserted into `mail_signatures` with `on conflict do nothing`; zero rows inserted: refused.

**The field names above are the library's, and are asserted, not assumed** (CLAUDE.md, *a field you took from documentation and never sent is a guess*): T1.3 runs `authenticate` over a real signed Gmail message checked into `test/fixtures/mail/` and asserts the exact shape the code reads, including how a body length tag and the signed header list are reported. Any field the code reads that the fixture's output does not carry fails that test.

Outcome enum: `accepted`, `unsigned`, `unaligned`, `length_tag`, `unsigned_from`, `unsigned_recipient`, `from_shape`, `no_account`, `stale`, `replayed`, `key_unavailable`, `over_limit`, `unparseable`.

### Parsing, `src/mail-in/parse.ts`

`mailparser`'s `simpleParser` in a `worker_threads` Worker with `resourceLimits: { maxOldGenerationSizeMb: 256 }` and a 10-second timeout, after a pre-pass over the raw MIME structure that refuses more than 100 parts or nesting deeper than 10. Per part: decoded size under 25MB; HTML under 2MB before conversion. The text is `parsed.text`, or `parsed.html` through `html-to-text` with images and links as text, when there is no plain part. Remote references are never resolved: nothing in the parse fetches, and a test runs it with the global `fetch` and `http.request` replaced by functions that fail the test.

The note boundary: the first line matching Gmail's `---------- Forwarded message ---------`, Apple Mail's `Begin forwarded message:`, or Outlook's `From: ... Sent: ...` header block. The forwarded block's own `From:`, `Date:` and `Subject:` lines give the original sender, date and subject; without a block, the email's own. Reply history (`On ... wrote:` and `>` lines) after the forwarded message is found in the same pass and marked for the prompt copy, not removed from the text.

Attachments by content type after sniffing: images to the rule filter; everything else counted into `leftOut` by kind.

### The image rules, `src/mail-in/images.ts`

020's `sniff` for type, `dimensions` (`blobs/photos.ts:49`) for size, and: at least 20KB, shorter side at least 300px, aspect at most 4:1, and for an inline image referenced by `cid:` from the HTML, an `<img>` whose `width` or `height` attribute is under 300 is left out. 020's per-photo limits (20MB, 60MP) and daily limits (200 photos, 500MB) apply, counted with the account's other photos. The first twenty survivors, in the order the email held them, are sealed with `storeSealed` as unclaimed image blobs.

### takeDump

`takeDump` gains one optional argument, `mail?: { attrs: MailAttrs; candidates: string[] }`. With it: `source = 'mail'`, no `looking_at_thread_id`, no mentions, no labels, `attrs.mail` written, the candidates **not** claimed, and `payload.mailLook = candidates` on the `dump.answer` job. Everything else, the budget, the conversation join, the idempotency lock on the client key, is the dump's own code.

### The look, `apps/agent/src/offload_agent/harness/look.py`

Runs first in `dump.answer` when `payload.mailLook` is non-empty. Each candidate's 400px rendition (020's `renditions.py`) goes to the sort model (`claude-haiku-4-5`, `config.sort_model`) in one call with a tool whose schema is `{ verdicts: [{ index: int, keep: bool }] }`. OFF-5: validated, one repair-and-revalidate retry, then it raises; the step catches the raise, logs `look_failed` with the count, and keeps nothing. The prompt is a fixed paragraph naming what to keep and what decoration looks like; the images are user-turn blocks. Then `POST /internal/v1/mail/:messageId/look { keep: blobId[] }`: core-api checks every id was in the job's `mailLook`, claims the kept in order (at most ten) to the message exactly as `takeDump` claims photos, sets `type = 'image'` when any was kept, and deletes the rest. The turn then prepares the kept images through `_prepare_photos` as for any dump.

### The turn's prompt

`context.py` loads `attrs.mail` into `ctx.mail`. `build_blocks` (`plan.py:300`), for a mail message, emits in place of the usual dump block:

```
<email subject="…" from="Name <address>" sent="…">          (a label block, ours)
[the person's note, the first noteLength characters, labelled "What they wrote"]
[the forwarded part, trimmed of reply history, clamped at 12,000 characters,
 labelled "An email from <address>, which they forwarded. Somebody else wrote this."]
[the kept images, as 020 frames photos]
```

Each is its own content block and none is concatenated with another. `plan_v2.md`'s *What you are reading* paragraph gains the third kind: words somebody else wrote and the person forwarded, which are data like a tool result and are never read as the person asking for anything. The subject and names in the label block are clamped (300, 120) and stripped of control characters and quotes.

**OFF-8 bound:** at most 12,000 characters of body, 300 of subject, the note up to 2,000 characters (beyond which it is clamped with the rest of the body), and ten images: roughly 5,000 tokens of text and the images' existing budget, constant whatever the account's age.

### Marking what the turn writes

`routes/tools.ts:757` derives `sawApps` from the payload. It gains `sawMail`, derived **by core-api** from the job's message (`source = 'mail'`), never from the payload, and a note or standing fact written in that turn is stored with `derived_from_untrusted = sawApps || sawMail`. It then goes to the `fromApps` list the prompt says never to obey (`threads/notes.ts:652`), exactly as a note from a calendar read does.

### Links

`worker.py`'s look-up bound reads `budget.dump`. For a mail turn `budget.dump` is the person's note alone, so `_in_the_dump(url, ...)` refuses a link that appears only in the forwarded part, with the existing `not_in_the_dump` outcome. Search questions keep the whole email as their provenance, since a search reads and does not act.

### Activity, `src/mail-in/activity.ts`

- **After a mail turn**, in the existing turn-result handler: `filed` with the landed rows (one: `<row title>, in <thread>`; several in one thread: `<Count> into <thread>, from an email`; across threads: `<Count> from an email`), `asked` when the turn opened a question, `nothing` otherwise. Body: `From an email, “<subject>”.` for one row, `“<subject>”.` otherwise, then a sentence per `leftOut` kind (*A PDF was left out.*, *Two spreadsheets were left out.*). Every interpolated string through 024's clamp (one line, controls stripped, 120). Written with `turn_id`, `message_id`, and `content_id` or `thread_id` for the door.
- **Refused**: inside the inbound route, only for outcomes that name an account (`from_shape` never does, `no_account` never does), only when neither cap is met: `count(*) where kind = 'mail' and mail_outcome = 'refused' and occurred_at > now() - 1 hour` is zero and the day's is under three. Fixed words, no ids.
- **Over limit**: once a day, fixed words.
- The door for each is mapped by the client from `mail_outcome` and ids, as 024's kinds are.

### Undo

`POST /v1/activity/:id/undo` accepts `kind = 'mail'` rows with `mail_outcome = 'filed'`, owned by the caller, not undone, and under twenty-four hours old (`MAIL_UNDO_HOURS = 24`). It calls `undoTurn(accountId, turnId, { keepMessage: true, since: row.occurred_at })`: `undoTurn` (`routes/dumps.ts:1868`) gains the two options, one to leave the message and its claimed blobs alone, one to skip any content row, note or label join whose `updated_at` is after `since`. Calendar rows go to Google first, as they already do. The row's `undone_at` is set in the same transaction. `undoable` in the Activity read widens to the mail case.

### Clients

- **Icons:** `mail.svg`, the set's stroke style, into `.claude/skills/offload-design/assets/icons/`, then `apps/mobile/scripts/icons.mjs` and the web's set regenerated; `dead-icons.mjs` run.
- **Settings:** `apps/mobile/app/settings/[page].tsx` gains `mail` in the page map and a `Mail()` page; `Apps()` moves the Mail row to its own group as a door. Web: `apps/web/src/components/panes/Apps.tsx` the same, and a `Mail` settings pane. Both read `me.email` and a new `me.mailAvailable` (false for `@privaterelay.appleid.com`).
- **Add to contacts:** `apps/web/public/offload.vcf`, a vCard 3.0 with `FN:offload` and `EMAIL:over@to.offload.club`, served `text/vcard`. Phones: `WebBrowser.openBrowserAsync("https://offload.club/offload.vcf")`, no native module. Web: an `<a download>`.
- **First run:** `apps/mobile/lib/gate.ts` gains `MAIL_STEP` after `CONNECT_STEP`; the step list is computed per account and the bar's `total` passed from it. Web: `ConnectBlock.tsx` the same.
- **Conversation:** a message with `source = 'mail'` draws the `mail` glyph, `attrs.mail.subject` as its first line and *Forwarded* as meta, on the three surfaces' message components.
- **Activity:** the `mail` kind's glyph, title, body, door by outcome, and Undo on the phones (`apps/mobile/lib/activity.ts`) and web.

### The privacy page

The seven edits in the feature spec, in `apps/web/src/app/(marketing)/privacy/page.tsx`, with `UPDATED` and `CONSENT_VERSION` moved. Cloudflare's row is written after reading Cloudflare's Email Routing privacy statement and linked from the task that makes the edit.

### Analytics and logs

`mail_received { outcome, images_kept, images_candidates, left_out }` from core-api. Worker: `{ outcome: "delivered" | "refused_upstream" }`. No address, subject, name, body or file name anywhere; a test greps the captured log output of the inbound tests for the fixture's address and subject.

## Dependencies

- `mailauth` (DKIM, address parsing) and `mailparser` plus `html-to-text` in `apps/core-api`, both from the same maintainer as Nodemailer, widely used, MIT. No new Python dependency.
- `wrangler` as a dev dependency of `apps/mail-worker` only.
- Cloudflare Email Routing enabled on the `to.offload.club` subdomain, which adds its MX and SPF records there and nowhere else; the apex's Google MX is untouched.
- Open decisions at the bottom of `docs/tech/decisions.md`: none of them is assumed. This adds Cloudflare Workers as a runtime, which `stack.md`'s "two datastores, two vendors" does not forbid (Cloudflare is already a vendor) but is a new place code runs; logged at merge.

## Edge cases

| Case | Behaviour |
| --- | --- |
| Railway's edge and a 25MB request body | Checked 2026-09-30: Railway documents no body size limit, only that a body must finish uploading within five minutes, and its staff say the same. A 25MB POST to production was passed to Fastify, which answered its own 404 after reading 512KB, so the edge applies no limit on the declared length. Fastify's default body limit is 1MB, which is why the route sets its own. The full body arriving is proven by T1.5 locally and T6.4 on the platform. |
| The same email delivered twice | The signature is already in `mail_signatures`: refused as `replayed`, no row, and the first copy stands. |
| Two emails in one second from one account | The dump's client-key lock serialises them; both file. |
| Email with no text and no kept image | `nothing` row, no turn. |
| All candidates are decoration | The look keeps none; the turn files the text. |
| The look fails | Keeps none, logs, the turn files the text. |
| An account deleted between check and insert | `takeDump` fails on the account's absence; 200 to the Worker, nothing kept. |
| A mail message undone, then the email deleted | Deleting the message cascades the Activity row's `message_id` reference. |
| A question closed by a later turn | The Activity door checks the question's state on tap and opens the message instead. |
| `noteLength` zero (the person forwarded without typing) | No note block; the forwarded block alone. |
| A non-forward email the person wrote to offload | The whole text is the note, their own words. |

## Constitution check

- **DEV-1.** Compliant. PDFs and the push were cut to 027 and to nothing; no per-account address, no added senders. The one new model call is the image look the owner asked for.
- **DEV-3.** Flag, justified. The Worker is a new runtime; Email Routing can only hand a message to a Worker or a mailbox, and a mailbox would be a stored copy. The libraries are the standard ones.
- **QUAL-1.** Compliant: every task below starts from its failing test, and the sender check's first test is the fixture-shape assertion.
- **SEC-1.** Compliant. The forwarded part travels in a labelled user-turn block and is never in a system prompt; the prompt rule names it; parsing is bounded and runs in a limited thread; nothing reaches a shell.
- **SEC-2.** Compliant. Every decision is core-api's: the sender check, the caps, the look's kept ids checked against the job's, the fetch provenance from the stored note, `sawMail` from the stored message.
- **DATA-1.** Compliant: this document.
- **OFF-1.** Compliant, under one interpretation the product owner agreed on 2026-09-30. The email's text is kept whole and its kept images are a dump's blobs; nothing accepted is later discarded. Non-image attachments and decoration images are never accepted, as the share sheet accepts only images; the candidates live as unclaimed blobs only until the look, as a photo uploaded and never sent does. No content in logs, traces, events or `jobs.last_error` (AC-22).
- **OFF-2.** Compliant. Images are sealed as photos; the text is plaintext and the page says so.
- **OFF-3.** Compliant. The message belongs to the account the sender check matched; Activity rows are the account's own; Undo checks ownership and runs through `undoTurn`'s membership-scoped deletes.
- **OFF-4.** Not applicable: a forwarded email is a dump. Cloudflare holds it in transit only, stated from their own statement.
- **OFF-5.** Compliant. The look validates, repairs once, raises; its caller degrades and logs.
- **OFF-6.** Compliant. Filing is on offload's surfaces; the Undo that covers it is Activity's, twenty-four hours, with nothing destroyed while it is offered; a calendar write reaching nobody else is the allowlist's conditional entry, and one reaching anybody still asks. The allowlist names a mail turn at merge.
- **OFF-7.** Compliant: the glyph and four divergences logged.
- **OFF-8.** Compliant: the bound above.

## As built

Where the build differs from the plan above, recorded as it happened (DEV-2).

- **`src/mail-in/`, not `src/mail/`.** `src/mail/` is the outbound mailer.
- **The signature is spent after the email is handled, not by the check.** `checkSender` reads `mail_signatures` and returns the hash; `receiveMail` spends it once the email is filed, dropped at a cap or found empty. Spending it inside the check meant a failure between the check and the dump made the redelivery a "replay" of an email nothing kept. The dump's client key is `mail:` plus the signature's hash, so two concurrent deliveries collapse into one message through the dump's own lock.
- **`unsigned_from` is reachable only as `unsigned`.** RFC 6376 makes a signature that leaves From out a permanent failure, and mailauth refuses both to sign and to verify one. The check keeps its own rule as a second line; the test tampers with `h=` and expects `unsigned`.
- **The model budget is a cap like the others.** An account over its daily budget drops the email with the `over_limit` row, checked before the parse so no candidate is sealed for a turn that cannot run.
- **An email the parser refuses writes the `nothing` row**, as one that held nothing does.
- **The parser is a standalone `.ts` file** (`parse-worker.ts`) run in a worker thread under Node's native type stripping in development and in the tests, and compiled in production. It uses `html-to-text` directly: mailparser produced no text for an HTML-only email.
- **`attrs.mail` gains `historyAt`**, where reply history below the forwarded message starts, found once at intake so the turn's copy can stop there.
- **`wrangler` is not a dependency.** `pnpm --filter @offload/mail-worker deploy` runs it through `npx`, so the workspace does not carry its runtime binary for a deploy the owner runs by hand.
- **Analytics.** `mail_received` has its schema in `schemas/events/`, and `dump_sent` gains `via_mail`.
- **A mail turn is never answered and never answers an open question.** The job carries `mail: true`; the worker skips the question classifier for it, and `takeDump` attaches no open question, so a booking email's "can you confirm by Friday?" is filed rather than answered, and an email arriving while a question is open leaves it open for the person.
- **025's provenance bounds read the note alone.** A label the turn creates, and a `#word` in the text, must come from the person's note in a forwarded email (`ownWords` in `mail-in/attrs.ts`), as a fetched link must.
- **`sawMail` marks notes only.** `sawApps` also makes a calendar write confirm; the owner chose the account's own setting for mail turns, so the two flags stay separate.
- **The look's model call is not on the turn's usage ledger**, as the question classifier's is not.
- **The evals' runner builds a mail case through `mail_of`**, and its look-up stub reads the note as the link bound, as the worker does.
- **The question row opens the email, whatever the question's state.** 018's question chips live on the email's message in the conversation, so opening the email shows the question while it is open and the email once a later turn has closed it, with nothing to resolve on the server. The feature spec's two doors are the same door.
- **The Activity read gains `mailOutcome` and `messageId`**, which the clients map to a door.
- **Notes count as landed** in the row's count and title, beside content rows.
- **First run offers Mail before the calendar, on all three surfaces.** Connecting a calendar ends first run on the calendar page (phones) or at Google's consent screen (web), so a step after it would never be seen by anybody who connects. `offersFor` and `dotsFor` in `apps/mobile/lib/gate.ts` give the per-account list and the dots.
- **The web draws Mail inline in Connected apps**, as 019 draws the calendar there, rather than a third pane.
- **The phones' Activity doors**: a filed email opens its thread, anything else opens Today, where the conversation holding the email is; the phones have no route to a single row. The web opens the row, the thread, or Today.
- **The conversation tail carries `mail: { subject }`**, which both clients draw as the bubble's heading, with the text kept to four lines.
- **`expo-clipboard` is added** for Copy, so the phones need a native rebuild.
- **After the code reviews (2026-10-01).** More than five DKIM signatures on one email is refused as `from_shape` before any key is fetched, since each is a lookup on a domain the sender chose. A question a mail turn asks is stored as derived from somebody else's words. The look leaves out an image that cannot be opened rather than failing for the rest. The look route's message update is scoped by account. Undo clears the Activity row's `content_id`, so the purge's hard delete no longer cascades the record away. The web offers Mail only in a real first run (`mailOffered`), Copy is a 44px target named "Copy the address", and the phones' Copy row carries no chevron.
- **Reviewed and left.** A label join a person has changed since is already left by 025's `undoRun`, which matches on the run and who set it, so mail's Undo needed nothing more there. An image-only email whose look keeps nothing stays an `image` message with no photos; the turn then finds no dump, fails, and the Activity row says nothing was filed. The hourly and daily caps are counted, not locked, so two emails a moment apart can both pass: an accepted overshoot of one. A signature with no `t=` is accepted once, by the spec, and refused as a replay after.
