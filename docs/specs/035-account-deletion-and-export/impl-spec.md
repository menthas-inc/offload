# 035 · Account deletion and export, how

Two parts. Part A, deletion, ships alone and is what the stores need. Part B,
export, builds on it. Migrations start at 0080 (034 holds 0074 to 0079).

## Volume and access

| Field | Deletion | Export |
| --- | --- | --- |
| Records per account | 40 threads typical, 300 heavy; 5,000 messages typical, 40,000 heavy (001); blobs 200 typical, 5,000 heavy | One `exports` row per account at most |
| Fan-out | One accounts row cascades into 34 columns across 30 tables | Archive 200 MB typical, 5 GB heavy; 32 MB sealed parts, so 7 typical, 160 heavy |
| Growth | None: a delete only removes | At most one row per account per 7 days, and the row is replaced |
| Read pattern | None | Privacy page reads one row on open, and polls every 5 s while making |
| Write pattern | A handful a month at launch, one transaction each | Bursty per account, rare overall |
| Sort and filter | By account id only | By account id; the sweep by `expires_at` |

What follows:

- **Pagination:** none. One row per account.
- **Indexes:** `exports` unique on `account_id`; a partial index on
  `expires_at` where `state <> 'gone'` for the hourly sweep.
  `pending_revocations` is drained whole and stays tiny.
- **Normalisation:** `exports.thread_ids uuid[]` is a copy of the threads the
  archive holds, so a membership change can find the copy to destroy without
  opening it.
- **One transaction for the delete.** The heavy case is tens of thousands of
  rows through cascades, which Postgres takes in well under the request
  timeout. Storage and Google are never called inside it.
- **Export memory is bounded by the part size**, not the archive: the zip is
  streamed, cut at 32 MB, sealed and put, one part at a time.

## Part A: deletion

### Where the invariant lives

Every foreign key to `accounts` already carries a delete rule, so deleting the
`accounts` row is the delete, and the database enforces it. `deleteAccount`
does only what a cascade cannot. The full ledger:

**Cascade with the row (nothing to write):** `account_identities`,
`account_keys`, `sessions`, `staff`, `thread_members.account_id`,
`thread_keys`, `conversations`, `messages` (and through them `message_chunks`,
`message_threads`, `message_content`, `questions`, `turn_sources`), `jobs`,
`lookups`, `people_lookups`, `connector_connections` (and `connector_secrets`,
`connector_calendars`), `connector_events`, `connector_pending_writes`,
`thread_calendars`, `connections`, `connection_requests`, `blocks`,
`pending_shares` (both columns), `push_tokens`, `activity` (both columns, so
entries about the person leave other people's feeds), `activity_mentions`,
`today_put_offs`, `thread_proposals`, `suggestions`, `exports` (new).

**Set null by the row (kept, authorless):** `content.account_id`,
`notes.account_id`, `blobs.account_id`, `labels.created_by` and `deleted_by`,
`threads.created_by_account_id`, `thread_members.invited_by` and
`removed_by_account_id`, `accounts.referred_by_account_id`,
`app_settings.updated_by_account_id`, and after migration 0080
`llm_usage.account_id`.

**No foreign key, so named steps:**

| Column | Step |
| --- | --- |
| `blob_keys.scope_id` where `scope = 'account'` | delete the wraps |
| `notes` of account scope (and their `note_chunks`, `note_labels`) | delete before the row goes, or `SET NULL` leaves them ownerless and unreadable |
| `analytics_events.subject_id` | delete unshipped rows for `accounts.analytics_subject_id`; the pseudonym itself goes with the row, which is the shred 001 asks for |
| `waitlist_attempts.email_hmac` | delete the rows for the address's HMAC |
| `verifications` | delete rows whose identifier is the address |
| `connector_connections.external_account_email` | goes with its row |
| `mail_signatures` | untouched: a replay guard keyed by signature, no account |

`test/account-ledger.test.ts` reads `pg_constraint` and
`information_schema.columns`, and fails when a foreign key to `accounts`, or a
column matching `account|subject|scope_id|email|owner`, is not in this ledger
(AC-3).

### `deleteAccount(accountId)`, in `apps/core-api/src/accounts/delete.ts`

Before the transaction:

1. Read the account's connector connections and seal each refresh token into
   `pending_revocations` (new: `id`, `provider`, `sealed_token` under the root
   key through `crypto/keys.wrap`, `attempts`, `created_at`). No account id.
   A `connector.revoke` job (Core kind, hourly and enqueued now) calls
   `google.revoke`, deletes the row on success, and deletes it regardless
   after 7 days (AC-7).

One transaction:

2. `select ... for update` on the accounts row. This transaction is ours, so
   the lock holds.
3. Refuse with 409 `last-owner` if the account is the only `staff` owner
   (AC-9).
4. **Thread keys.** For each thread where the account is an accepted member
   and another accepted member exists: `threadKey(trx, id)` to read the key,
   then `wrapForMembersWithout`. If no accepted member holds a copy and the
   account does, unwrap from the account's copy first. Only then may the
   cascade drop the account's `thread_keys` row (AC-5).
5. **Threads the account is alone in** (no other accepted member):
   `deleteNotesForThread`, then delete the thread; pending invitations into it
   die with it. Cascades take content, labels and the rest.
6. The named steps in the table above.
7. If an `exports` row exists, note its id and part count for step 10.
8. Delete the `accounts` row.
9. `sweepBlobs(trx)` from the purge handler, so thread wraps and blobs that
   nothing references are put on the purge clock in the same transaction; the
   existing R2 delete job destroys the objects (AC-6).

After commit:

10. Enqueue `export.destroy` with the export id and part count, account id
    null.
11. Enqueue the notice email with a null account id, the address in the
    payload as the existing `email.*` jobs carry it (AC-23).
12. Emit `account.deleted` with no subject and no properties.

`threadKey` changes too: it refuses to mint when a `blob_keys` row of thread
scope exists for the thread, throwing `NoKey`. Minting there is what turns a
missing copy into unreadable photos. `takeOut` (`threads/sharing.ts:288`) and
leave (`routes/threads.ts:1159`) call step 4's helper before dropping a key.
Accepting an invitation calls `wrapForMembersWithout`, which the comment on it
has been asking for since 020.

### In-flight work (AC-12)

The cascade removes the account's queued and running `jobs` rows. `complete`
and `fail` on a missing job are already no-ops; a test pins that. The worker's
write-backs through `routes/internal.ts` and `routes/tools.ts` resolve the
account first and return 410 when it is gone; the Python worker treats 410 as
done, not failed. Mail-in already matches only an active account.
`connectors/tokens.ts` `accessTokenFor` re-reads the connection inside its own
write and does nothing when it is gone, so a refresh in flight cannot re-seal a
secret.

### Interface

`DELETE /v1/me`, JSON body `{ "confirm": "delete" }`.

- Session required. Allowed for `invited` and `active`, so it is on the
  no-write-before-consent guard's allowlist (033).
- `Origin` must be the web origin or absent with the phones' session header;
  anything else is 403 (AC-13). JSON only, so a form post cannot reach it.
- 204 on success with the session cookie cleared. 409 `last-owner`. 400 when
  the word does not match.
- Limited to 5 an hour per account.

### Clients

- **Phones:** `apps/mobile/app/settings/[page].tsx`, the account page gains the
  *Ending things* group. The confirmation is a `DragSheet`; iOS and Android
  each take their own kit's chrome. The foot rides the keyboard and
  `putKeyboardAway` runs on close. The field: `autoCapitalize="none"`,
  `autoCorrect={false}`, `spellCheck={false}`. On 204: clear the stored
  session and replace the stack with `sign-in?deleted=1`.
- **Web:** the Account pane gains the danger panel, in `--surface-danger-soft`,
  `--border-danger` and `--text-danger` rather than the kit's ramps; the
  dialog follows the existing dialog component. On 204: `/sign-in?deleted=1`.
- **Sign-in screens** show *Your account is deleted.* for `deleted=1`.
- **`/delete-account`** under `(marketing)`: static, no input, a button to
  `/sign-in?next=/settings/account`.
- A 401 on any other device already lands on sign-in; no new handling.

## Part B: export

### Data model, migration 0081

`exports`: `id`, `account_id` (FK, cascade, unique), `state`
(`making | ready | failed | gone`), `requested_at`, `ready_at`, `expires_at`
(`requested_at + 7 days`), `parts int`, `byte_size bigint`, `wrapped_key`
(a fresh key wrapped under the account key), `thread_ids uuid[]`.

### Flow

1. `POST /v1/me/export`. Same origin rule as the delete. Refused with 409 and
   `nextAt` while a row exists with `requested_at` inside 7 days, whatever its
   state (AC-20). Otherwise upsert the row as `making`, enqueue `export.build`
   (Core kind, payload: export id only), enqueue the notice email, emit
   `export.requested`.
2. `export.build` reads through `readable_content`, `readable_notes` and
   `readable_messages` for the account, never a per-thread role check, and
   streams a zip (`archiver`, the one new dependency) of:
   - `index.html` and `threads/<n>.html`, plain HTML with no script;
   - `conversations.html`, `notes.html`, `people.html`;
   - `files/<blob id>.<ext>`, each opened with `objectKeyOf`;
   - `data.json`, the same content, with each row's author name or `null`.
   Thread files are numbered, not named, and the builder logs ids and counts
   only (AC-22). The stream is cut every 32 MB; each part is sealed with the
   export's key by the blob sealing routine and put at `exports/<id>/<n>`.
   On finish: `ready`, `parts`, `byte_size`, `thread_ids`, and one `activity`
   row of kind `export.ready`, no push. On error: `failed`, parts removed. A
   failed row does not hold the 7 days: `requested_at` is cleared.
3. `GET /v1/me/export` returns state, `readyAt`, `expiresAt`, `nextAt`.
4. `GET /v1/me/export/file` checks the session and that the row is the
   caller's and `ready`, then streams the parts in order, decrypting each, as
   `application/zip` with a fixed filename, `offload.zip`. No presigned URL
   exists anywhere (AC-18).
5. `DELETE /v1/me/export` sets `gone` and enqueues `export.destroy`. The 7
   days still count from the request.
6. `export.destroy` removes `exports/<id>/0..n` from storage. It runs from
   step 5, from the hourly `export.sweep` for rows past `expires_at`, from
   `deleteAccount`, and from leave and take-out when the thread is in
   `thread_ids` (AC-19).

A build over 8 GB stops and fails. That is above the heavy case and is a guard
against a runaway, not a product limit anyone should meet.

### Clients

- **Row state** comes from `GET /v1/me/export`; polled every 5 s while
  `making`, never otherwise.
- **Phones:** `FileSystem.downloadAsync` with the session header into the
  cache directory, then `expo-sharing` (new, needs a native build) to hand the
  file to the system's save or share sheet (AC-21). The Privacy page gains
  *Your copy*; its glyph is `download`, checked by `dead-icons.mjs`.
- **Web:** a plain link to `/v1/me/export/file`, which the session cookie
  authorises.

## Privacy page (AC-24)

Told to the owner before the code, 2026-10-03. Edits to
`apps/web/src/app/(marketing)/privacy/page.tsx`, with `UPDATED` and
`CONSENT_VERSION` moved:

- Section 13's note stops covering export and delete.
- Lines 100 and 956: a copy is kept 7 days, encrypted, and one can be made
  every 7 days.
- Section 10: any member can take a copy of a shared thread as they see it.
- Deletion: cost records are kept without the account; usage counts already
  shipped can no longer be tied to anyone; calendar access is revoked at
  Google; what vendors already hold runs out on their own clocks, as the
  vendor table says.
- Account mail: the two notices.

## Dependencies

- `archiver` in `core-api`; `expo-sharing` in `mobile`.
- 034 touches `jobs/queue.ts` and `routes/admin.ts`; this adds kinds in
  `jobs/kinds.ts` and `handlers.ts`. Announce on the board before merging.
- No open decision in `decisions.md` is assumed. The root key moving to a KMS
  (deferred hardening 1) changes nothing here: `pending_revocations` and
  `exports.wrapped_key` use the same wrap as everything else.

## Edge cases

- Delete while an export is making: the cascade removes the row, the builder's
  final update finds none and removes its parts.
- Two deletes at once: the second finds no session.
- The account is the last accepted member and a pending invitation exists: the
  thread dies and the invitation with it (001).
- A thread shared by two people, both delete: the second is alone by then, so
  the thread dies.
- Google is down: the token waits in `pending_revocations`, sealed, for up to
  7 days.
- The same person rejoins later: a new account, nothing reattached.
- `0018`'s closing note says content whose author is gone can be deleted by
  nobody; OFF-3 as amended by 008 and 022 says the remaining members may. The
  code follows the amendment; the note is corrected in this change.

## Constitution check

- **DEV-1** Deletion leans on existing cascades and the existing purge; two
  new tables, each with a reader.
- **QUAL-1** Every AC has a test written first and seen red; the ledger test
  is the standing one.
- **SEC-1** The typed word and ids are the only inputs; tokens awaiting
  revocation are sealed, never in a job payload.
- **SEC-2** Both flows resolve the account from the session; the file route
  checks the row's owner per request; origin checked server-side.
- **OFF-1** Payloads, events and logs carry ids and counts; archive members
  are numbered.
- **OFF-2** The archive is sealed before storage with a key R2 never
  receives. The privacy page says the copy is encrypted in storage and does
  not say the data is.
- **OFF-3** Shared threads keep their content and their keys; the export reads
  through the readable predicates; a thread dies only with its last member.
- **OFF-4** Nothing from a connected app is stored or exported beyond the
  derived rows already held.
- **OFF-5, OFF-8** No model call.
- **OFF-6** Deletion is confirmed per action since it cannot be undone. The
  export is offload's own surface and its copy can be destroyed on demand.
- **OFF-7** Kits followed for the row and panel; the undrawn parts go to
  `decisions.md` (AC-25).
