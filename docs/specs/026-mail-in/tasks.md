# 026 Mail in, tasks

Every task starts with its failing test, run and seen red for the reason the task exists, then the code (QUAL-1). A task is done when its test is green and nothing else is red. After the foundation, three tracks, API, Mobile and Web; the feature closes when all three pass. Nothing accepts production mail until part 6.

## 0. Setup

- [ ] **T0.1** Worktree `mail-in` via `.claude/scripts/new-worktree.sh mail-in`, its own database, launch entries that cd into it. Nothing under `.claude/skills/offload-design/`, `docs/tech/` or `docs/constitution/` is edited in the worktree: the `mail` glyph and the design decisions entry land on `main` first (T0.3). *(process)*
- [ ] **T0.2** Before any code: the privacy page edits in the feature spec are confirmed with the product owner, and Cloudflare's own statement of what Email Routing keeps, including during retries, is read and linked here. The Cloudflare row in section 6 is worded from that statement and nothing else. If it says Cloudflare keeps an email beyond delivering it, or does not say, stop and bring it to the owner before any code. T6.1 does not start until this is done. *(AC-22, CLAUDE.md)*
- [ ] **T0.3 On main.** `mail.svg` added to `.claude/skills/offload-design/assets/icons/` in the set's style; `.claude/skills/offload-design/decisions.md` gains the entry with the four divergences and **Design system impact** filled. *(AC-21, OFF-7)*

## 1. Arriving (API and the Worker)

- [ ] **T1.1** Migration `0063_mail_in.sql` as in the impl-spec. Tests: `messages.source = 'mail'` is accepted; an Activity `mail` row without `mail_outcome` is refused; a `refused` row carrying a `message_id` is refused; a second insert of the same `mail_signatures.hash` inserts nothing. *(AC-5, AC-4, DATA-1)*
- [ ] **T1.2** Fixtures in `apps/core-api/test/fixtures/mail/`: a real signed Gmail forward to `over@to.offload.club` from a test account the owner creates for this, a real Gmail filter-forwarded message, a real signed direct email with offload in Cc, and derived variants for each refusal. Real fixtures only for the passing cases; a refusal variant is a real message altered in one respect. No personal mail. *(AC-3)*
- [ ] **T1.3** `mail/sender.ts`, first test: `mailauth`'s output over the passing fixture has exactly the fields the code reads (result, signing domain, body length tag, signed header list, `t=`). Red until the reader is written against the real shape. *(AC-3, CLAUDE.md)*
- [ ] **T1.4** `mail/sender.ts`, the rules. One test per refusal in AC-3, each red first, each asserting its outcome enum; a resolver that times out yields `key_unavailable`. *(AC-3, SEC-2)*
- [ ] **T1.5** `POST /v1/mail/inbound`: tests for a missing or wrong signature (401), a timestamp six minutes old (401), the old and the next secret both accepted, a 27MB body refused, a refused email answered 200 `{}` identically to an accepted one, `key_unavailable` answered 503; a captured-log test asserting no body, address or subject appears for any of them; a test that no route accepting `INTERNAL_SERVICE_TOKEN` is registered outside the internal host guard. *(AC-1, AC-2, AC-22)*
- [ ] **T1.6** Refused rows: a refused email whose From is an account's writes one row with the fixed words and no ids; a second in the hour writes nothing; the fourth in a day writes nothing; `from_shape`, `no_account` and `key_unavailable` write nothing. *(AC-4)*
- [ ] **T1.7** Rate caps: the thirty-first accepted email in an hour and the hundred-and-first in a day are dropped with one `over_limit` row a day; an account over its daily budget is refused as `requireBudget` refuses a dump. *(AC-8)*
- [ ] **T1.8** `mail/parse.ts`: text from a plain part and from HTML-only; the note boundary for Gmail, Apple Mail and Outlook forwards and for a direct email; the original sender, date and subject; the whole text stored; attachment kinds counted. Bounds: 101 parts, nesting 11, an HTML part over 2MB, and a parse past ten seconds each refused as `unparseable`; a test with network functions replaced by failing ones processes an email holding a remote image and links. *(AC-5, AC-6, AC-7, AC-10)*
- [ ] **T1.9** `mail/images.ts`: fixtures of a signature logo, a social icon, a 1px spacer, a 1200x200 banner, an inline image drawn at 120px, a boarding pass and a photo; the first five left out by the rules and the last two sealed as unclaimed blobs; a twenty-first survivor dropped; 020's daily limits counted with the account's photos. *(AC-9)*
- [ ] **T1.10** `takeDump` with `mail`: `source = 'mail'`, `attrs.mail` validated, candidates unclaimed, `payload.mailLook` on the job; the same email through the route twice files once. *(AC-5)*
- [ ] **T1.11** `apps/mail-worker`: a test with the Worker runtime's local harness that it POSTs the raw bytes with a valid signature, throws on a non-2xx, retries a failed POST three times over about thirty seconds before throwing, and logs only the enum; a test that `wrangler.toml` declares no KV, R2, D1 or queue binding. *(AC-1)*

## 2. The turn (agent and API)

- [ ] **T2.1** `/internal/v1/mail/:messageId/look`: refuses an id not in the job's `mailLook`; claims kept ids in email order, at most ten; sets `type = 'image'`; deletes the rest; a second call changes nothing. *(AC-9, SEC-2)*
- [ ] **T2.2** `harness/look.py`: a stubbed model that answers with the real schema, and one that answers malformed twice, which raises and is caught as keep-nothing with `look_failed` logged. The stub runs the real validation (CLAUDE.md, *a stub that always succeeds*). *(AC-9, OFF-5)*
- [ ] **T2.3** `context.py` and `build_blocks`: for a mail message, the label block, the note block and the forwarded block are separate; the forwarded block is clamped at 12,000 characters with reply history trimmed; a message with `noteLength = 0` has no note block; a direct email has no forwarded block; the subject and name are clamped and stripped. *(AC-11, OFF-8)*
- [ ] **T2.4** `plan_v2.md`: the *What you are reading* paragraph names the third kind. The prompt-text test that pins the paragraph is updated red first. *(AC-11, SEC-1)*
- [ ] **T2.5** `sawMail`: a note written in a mail turn is stored with `derived_from_untrusted`, derived from the stored message and not the payload (a payload claiming `sawMail: false` changes nothing); it appears in the prompt's `fromApps` list afterwards; the email message itself is still returned by search. *(AC-12)*
- [ ] **T2.6** Links: in a mail turn, `look_up` with a URL only in the forwarded part is declined `not_in_the_dump`; a URL in the note is read; a search question drawn from the forwarded part is allowed. *(AC-13)*
- [ ] **T2.7** Eval cases in `apps/agent/evals/principles/`: the five in AC-14, with the real provenance bound in the stub. Not run; running them is a separate ask. *(AC-14)*

## 3. Activity and Undo (API)

- [ ] **T3.1** `mail/activity.ts`: after a mail turn, one never-sent row per outcome with the words and doors in the impl-spec; one row filed, several in one thread, several across threads; a left-out PDF and two spreadsheets add their sentences; every string clamped. *(AC-15, AC-17)*
- [ ] **T3.2** Undo: `POST /v1/activity/:id/undo` on a `mail` row under a day reverses the turn's content rows, labels and notes, keeps the message and its images, skips a row edited after the turn, sets `undone_at`; at 24 hours and one minute it is `not_undoable`; another account's row is `not_found`; a calendar row is deleted at Google first (the connector's existing fake). *(AC-16, OFF-6)*
- [ ] **T3.3** The Activity read: `undoable` true for a filed mail row under a day; the door ids per outcome; the question door resolves to the message once the question is closed. *(AC-16, AC-17)*
- [ ] **T3.4** `/api/me` gains `mailAvailable`, false for an Apple relay address. *(AC-18)*

## 4. Mobile

- [ ] **T4.1** Icons regenerated from the design set; `dead-icons.mjs` passes with `mail` used in the three places below. *(AC-21)*
- [ ] **T4.2** Connected apps: the Mail row in its own group as a door with the address as its note, or *Unavailable*; the Mail page with Copy, Add to contacts, the sign-in address, the two lines, the relay note, one spinner until `me`. *(AC-18)*
- [ ] **T4.3** Add to contacts opens `https://offload.club/offload.vcf` in the system browser. Tried on the iOS simulator and on the Pixel, and what each does is written here; if either does not offer to add the contact, stop and bring it to the owner before an alternative. *(AC-19)*
- [ ] **T4.4** First run: `MAIL_STEP` after the calendar's, skipped for `mailAvailable = false`, the bar's total from the account's own step list; both buttons move on. *(AC-20)*
- [ ] **T4.5** The conversation draws a mail message with the glyph, the subject and *Forwarded*. *(AC-5)*
- [ ] **T4.6** Activity: the `mail` rows, their doors and Undo, in both themes. *(AC-15, AC-16, AC-17)*

## 5. Web

- [ ] **T5.1** `apps/web/public/offload.vcf` served as `text/vcard`, holding `FN:offload` and the address; a test fetches it. *(AC-19)*
- [ ] **T5.2** Connected apps pane and the Mail pane as T4.2, with a download link for the card. *(AC-18, AC-19)*
- [ ] **T5.3** First run's Mail step as T4.4 in `ConnectBlock.tsx`. *(AC-20)*
- [ ] **T5.4** The conversation's mail message and the Activity pane's `mail` rows with Undo, as T4.5 and T4.6. *(AC-15, AC-16, AC-17)*
- [ ] **T5.5** `dead-classes.mjs`, `dead-css.mjs`, `dead-icons.mjs` pass. *(AC-21)*

## 6. Going live

- [ ] **T6.1** The seven privacy page edits, `UPDATED` and `CONSENT_VERSION` moved. Section 17's notice: count the active accounts; with one, the owner's, this plan is the notice; with more, the email goes first. *(AC-22, feature spec)*
- [ ] **T6.2** With the owner: Email Routing enabled on `to.offload.club`, the `over@` rule to the Worker and the catch-all to reject; `MAIL_INBOUND_SECRET` set on the Worker and `core-api`; `wrangler deploy`. The owner holds the credentials; nothing is typed from this session. *(AC-1)*
- [ ] **T6.3** Verify on the platform what local runs cannot: with core-api's route answering 503, a forwarded email is retried by the Worker three times and then bounced to the sender with 521, as the forum reports and the docs do not state; a 24MB email reaches core-api whole through Railway's edge (the declared length already passes, checked 2026-09-30). What was observed, the SMTP code the sender's server logged and the number of Worker attempts, replaces the forum-sourced sentence in the impl-spec's *Checked 2026-09-30* paragraph. Either differing amends the spec before T6.4. *(AC-1, AC-2)*
- [ ] **T6.4** A real email forwarded from Gmail on a phone lands in production and files; one sent from another address writes nothing; a forged From writes the one row; the same email re-delivered files once. *(Done means)*
- [ ] **T6.5** Reviews: `code-reviewer` on the full diff, `client-reviewer` on the clients, `security-reviewer` on the route, the sender check, the parse bounds and the prompt blocks. Findings resolved or logged. *(QUAL-1)*
- [ ] **T6.6 On main after merge.** `docs/tech/decisions.md`: the 2026-09-29 entry updated to built; OFF-6's allowlist names a mail turn; the Worker, its secret and its rotation, and **why a Worker at all** (DEV-3): Email Routing hands a message only to a Worker or to a mailbox, and a mailbox would be a stored copy. `docs/tech/stack.md`'s Compute section gains Cloudflare Workers, for the mail Worker alone. *(DEV-2, DEV-3)*
