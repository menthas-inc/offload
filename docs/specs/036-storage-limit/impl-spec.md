# 036 · A storage limit per account: implementation

Feature spec: `feature-spec.md`. No migration, no new table, no new job kind.

## Data flow

**Refusing.** `POST /v1/blobs` and `POST /v1/blobs/audio` (`routes/blobs.ts`)
run, after the idempotency branch and the daily caps, `storageRefuses`:
`storageUsed(account) + bytes > limitFor(account, "cap.storage_bytes")`
records a hit and answers `429 {"error":"storage_full"}`. Mail in's
`sealCandidates` (`mail-in/images.ts`) carries a running `kept` beside its
daily counters and stops at the first picture that would pass it, recording
one hit, exactly as for `cap.photo_bytes`.

**Counting.** `storageUsed` (`blobs/storage.ts`) is one statement:

```sql
select sum(b.byte_size) from blobs b
where b.account_id = $1 and b.deleted_at is null
  and not (exists live link and not exists live link in a thread b.account_id is accepted in)
```

So a blob with no live row (unclaimed, a voice note, a photo on a message
whose row was not filed) counts; a photo counts while at least one of its live
rows is in a thread the uploader is in. Read by the uploads, mail in,
`GET /api/me/storage`, and `usedToday` on the admin person page.

**Freeing.** A photo blob is condemned at the moment of the person's delete,
never at purge time, so the dump's and the mail's Undo paths, which soft-delete
rows for their own reasons, are untouched (026 keeps an email's pictures).

| Path | What 036 adds | Undo |
| --- | --- | --- |
| `deleteContent` | `takePhotosOfRow` with the row's returned `deleted_at`/`purge_after` | `setArchived(false)` calls `restorePhotosOfRow` with the row's `deleted_at` before clearing |
| `deleteThread`, last member | `takePhotosOfThread` with the thread's `deleted_at` and `purge_after = deleted_at + 15s` (the restore window), then enqueues `content.purge` 17 s out | `restoreThread` reads the thread's `deleted_at`, revives it, calls `restorePhotosOfThread` |

Both takes require `kind = 'image'`, a link from the row or thread's live
rows, and no live row elsewhere. The row take also requires the deleter to be
the uploader or the uploader to hold no accepted membership in the row's
thread; `requireAuthor` has already refused anybody else (OFF-3). Restores
match on the exact stamp the take wrote, read back through the same JS `Date`,
so they can never revive a blob another path condemned.

`photosOf` already filters `blobs.deleted_at is null`, so the settle's
`fileUnfiled` cannot file a condemned photo again (AC-10).

`blobPurge` first puts back any due blob a live row in a live thread still
carries (AC-11), then destroys the rest as before. A thread's delete leaves its
rows live until the thread is purged, so the live-thread condition is what
stops a thread's condemned photos being put back for good.

The thread's own `purge_after` is the 15 second restore window, not eight
seconds as before 036: a purge between the two took the thread while its Undo
still answered yes, which since 036 would also destroy its photos.

**Reading.** `GET /api/me/storage` → `{ usedBytes, limitBytes }`,
`Cache-Control: no-store`, beside 035's `/api/me/export`.

## Volume and access

| Field | Estimate |
| --- | --- |
| Records per account | Blobs: 300 typical at a year, 3,000 heavy (an account near 1 GB of 3 MB photos is ~350; small screenshots raise the count, not the bytes). |
| Fan-out | Links per blob: 1, by construction (a row only links its own message's photos). |
| Growth | Bounded by the daily caps: at most 200 photos and 100 voice notes a day. |
| Read pattern | Every upload (one sum), every mail-in seal (one), Privacy on open (one), the admin person page (one). |
| Write pattern | Unchanged: one insert per upload. |
| Sort and filter | `account_id = ?` and `deleted_at is null`, two `exists` probes per blob on `content_blobs_blob_idx`. |

- **Pagination:** none; it is an aggregate.
- **Indexes:** `blobs_account_created_idx (account_id, created_at)` leads with
  the account, `content_blobs_blob_idx (blob_id)` serves the probes. At 3,000
  blobs that is a few milliseconds, inside an upload that already moves
  megabytes. No new index.
- **Normalisation:** no denormalised counter. Six paths write `blobs` and two
  would have to adjust it on membership changes; the sum cannot drift.
- **Partitioning:** no.

## Interfaces

- `cap.storage_bytes`: `int`, default `STORAGE_BYTES` (1 GiB), min 1 MiB,
  max 1 TiB, in `settings.ts`'s registry and `SETTING_KEYS`.
- `429 {"error":"storage_full"}` on both upload routes; the response schema is
  `z.union([dailyLimit, storageFull])`.
- `GET /api/me/storage`: `200 { usedBytes: number, limitBytes: number }`, `401`.
- `@offload/widgets`: `storageFigure(usedBytes, limitBytes): string`.
- Web `lib/dump.ts`, mobile `lib/dump.ts`: `PhotoRefused` and `VoiceRefused`
  gain `storage_full`, read from the 429 body. Mobile `upload()` returns the
  body's `error` as `send()` already does.
- Admin web: `CAP_LABELS`, `NUMBERS` (megabytes), audit `UNITS`, the person
  page's `capOf`.

## Edge cases

- **A re-upload under a client key whose blob 036 condemned.** The upload
  route's idempotency branch hard-deletes a dead row with the same key. Only a
  dump's Undo hands a draft its keys back; a row delete never does, so the
  branch is not reachable from a 036 condemnation through our clients.
- **The uploader's account is deleted.** `blobs.account_id` is null; it counts
  against nobody; any member may delete the row and the file goes.
- **Two uploads racing past the limit** each pass; one file of overshoot per
  concurrent request, bounded by the daily caps.
- **A photo-only message** whose photo is condemned has no text, no photos and
  no voice. `/v1/conversations/current` leaves out its whole turn, the reply
  included, so neither client draws an empty bubble or a reply about a photo
  that is gone (AC-16). A dump always arrives with one of the three, so the
  empty case is exactly this one.
- **`storageUsed` reads on the pool.** Every caller today is outside a
  transaction; one inside a transaction that has written `blobs` would read
  on a second connection.
- **R2 versioning** must be off on the bucket or the purge does not remove the
  bytes. Checked on the dashboard, not in code; listed in the PR.

## Dependencies

None new. No open decision in `docs/tech/decisions.md` is touched.

## Constitution check

- **DEV-1** compliant: one module, one cap key, one route, two client
  sections; no counter, no migration.
- **DEV-2** compliant: the spec states the uploader and leave rules the code
  enforces.
- **QUAL-1** compliant: `test/storage.test.ts`, `test/storage-figure.test.ts`,
  the mail-in case, and the client tests, each seen red first.
- **SEC-1** not applicable: no new input reaches a query unparameterised.
- **SEC-2** compliant: every figure is the session's own account; who may
  delete is still `requireAuthor`.
- **DATA-1** compliant: this section.
- **OFF-1** compliant: no content in logs, events or `limit_hits`; the refusal
  log lines are unchanged. Destroying a file happens only on a person's
  delete, which OFF-1 permits; offload deletes nothing on its own.
- **OFF-2** not applicable: nothing changes about sealing.
- **OFF-3** compliant: the uploader pays; what a leaver left is the thread's,
  as the privacy page says; a member can free a file only where OFF-3 already
  lets them delete the row.
- **OFF-4** compliant: only forwarded mail, a person's dump, is counted; no
  connector writes blobs.
- **OFF-5, OFF-8** not applicable: no model call, nothing enters a prompt.
- **OFF-6** compliant: the file goes only after the eight seconds (or the
  thread's 15), and Undo restores it. `docs/tech/decisions.md`'s reversible
  allowlist is amended to say a soft delete of a photo row ends in its file.
- **OFF-7** compliant with a logged divergence: the kits' *Files and photos*
  row, one entry in `.claude/skills/offload-design/decisions.md`.

GATE: PASS
