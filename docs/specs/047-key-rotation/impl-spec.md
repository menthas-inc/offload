# 047 Key rotation, implementation

**Why now.** Railway disclosed on 2026-10-22 that customer environment variables were exposed. Every secret on offload's Railway services is assumed leaked, `DATA_ROOT_KEY` and `CONNECTOR_VAULT_KEY` included. Before this change the root could not be rotated: `crypto/keys.ts` read one root, and swapping the variable would have failed every unwrap and locked every account out of its photos. The owner is the only person on offload, so nobody else is told; the owner wants the root rotatable and their own account key rewrapped.

**Grounded in:** `apps/core-api/src/crypto/keys.ts` (the root, `wrap`/`unwrap`), `apps/core-api/src/blobs/keys.ts` (`accountKey`, `threadKey`, `objectKeyOf`, `mintObjectKey`), `apps/core-api/src/admin/promote.ts` (`ensureAccountKey`), `apps/core-api/src/exports/copy.ts` and `build.ts` (`exports.wrapped_key`), migration 0001 (`account_keys.wrapped_by`, `version`, `rotated_at`, never used until now), `apps/core-api/src/api-role.ts` (how a script runs in production), `apps/core-api/src/connectors/vault.ts`, `apps/backup/backup.sh`. No migration.

## What is wrapped by what

| Layer | Row | Wrapped by |
|---|---|---|
| Account key | `account_keys.wrapped_dek` | the root, named in `wrapped_by` |
| Thread key, one copy per member | `thread_keys.wrapped_tk` | that member's account key |
| A copy's key | `exports.wrapped_key` | the account key |
| Object key, account wrap | `blob_keys` where `scope = 'account'` | the account key |
| Object key, thread wrap | `blob_keys` where `scope = 'thread'` | the thread key |
| Blob in R2 | the object | its object key |

Text in Postgres is plaintext (OFF-2) and none of this touches it.

## Level 1, the root

- **Two roots at once.** `DATA_ROOT_KEY` is the current root and `DATA_ROOT_KEY_PREVIOUS`, set only while a rotation runs, is the one being retired.
- **A root's name is derived from the key**, `db:` plus six bytes of HKDF output in hex, not set beside it. A name set in code or in a variable can disagree with the key it labels: had the code said `db:v2` and been deployed before the variables changed, new accounts would have been wrapped by the old root under the new name, and would have failed to open after the swap. A derived name cannot be wrong, and the next rotation needs no code change. Six bytes of HKDF output say nothing useful about a 256-bit key.
- **`db:v1`** is what every row said before this change. It resolves to the previous root while one is set and to the current one otherwise, which is right in every state the variables can be in. Once the script has run, no row carries it.
- **`unwrapFromRoot(row)`** opens an account key with the root its row names, and fails loudly on a name no configured root has. **`wrapUnderRoot(key)`** returns `{ wrapped_dek, wrapped_by }` under the current root. `wrap` and `unwrap` no longer default to the root, so nothing can wrap under it without writing its name.
- **`rotate-keys.js root`** selects every `account_keys` row not on the current root's name and moves each in its own transaction: lock the row, unwrap by its name, wrap under the current root, set `rotated_at`. The account key itself does not change, so nothing under it is touched. It is idempotent and resumable by `wrapped_by`: a run that dies is finished by running it again. A row that will not open is left exactly as it was and counted. It prints `moved N, failed N, still on an older root N` and exits non-zero unless the last two are zero.

## Level 2, one account's key

`rotate-keys.js account <email>` gives the account a new key and, in **one** transaction, rewraps under it the account's `thread_keys` copies, its `exports` keys, and its photos' account wraps in `blob_keys`, then writes the new key under the current root, bumps `version` and sets `rotated_at`. If any of those does not open under the old key, the transaction rolls back and nothing changes. It prints the three counts.

**Racing a request.** A request reads the account key, then wraps something under it a statement later. A rotation that committed in between would leave that wrap under a key nobody holds. `accountKey()` now takes `FOR SHARE` on the row, so the rotation's `FOR UPDATE` waits for every transaction holding the old key, and every transaction that reads the key afterwards waits for the rotation to commit. `threadKey`, `passThreadKeyOn` and `objectKeyOf` read the wrap they open only after they hold the account key. Before that, a read between the two could fetch a stale copy, and account deletion, which counts a copy that will not open and goes on, would have dropped the last copy of a shared thread's key.

**Accepted, from the security review.** The account's requests wait while its rotation runs, one `UPDATE` per wrapped row: run it while not using offload. Asking for a copy at the same moment can deadlock with it, and Postgres rolls back one side whole, so nothing is lost. The root wrap carries no associated data, so someone who can write `account_keys` could swap rows or, mid-rotation, plant a key under `db:v1` and the leaked root. Both need database write access. Binding the wrap to its account and dropping the `db:v1` fallback once nothing carries it is a follow-up, not part of this response. `test/key-rotation.test.ts` fails on any new `wrapped_*` column, because a column sealed under an account key that `rotateAccountKey` does not rewrap would be lost the next time it ran. The API warns on every boot while `DATA_ROOT_KEY_PREVIOUS` is set.

## What each level does and does not protect

Leaked on 2026-10-22: the root, the vault key, the database URL with its password, the R2 credentials and the auth secret. The database has no public endpoint (`docs/tech/decisions.md`, `railway ssh`), so the password alone does not reach it from outside Railway.

- **The attacker has the old root and the R2 credentials, but no database copy.** This is the likely case. Level 1, with the database password and the R2 credentials rotated, closes it: the rows are rewrapped under a root they do not have, and the old root opens nothing they can get. Until the script has run, the old root plus a later database read would open every photo.
- **The attacker already has a database copy and the old root.** From that copy they can derive every account key, thread key and object key as they were. Level 1 changes nothing for them, because the account key is the same key under a new wrap. Level 2 protects only what is newly wrapped under the new account key, and only from someone who gets a later database copy without the new root. Thread keys and object keys are unchanged: every blob already in R2 stays readable to them, and a new photo's thread wrap sits under a thread key they already know. Changing that needs **new thread keys** (rewrap every member's copy and every thread wrap) and, for blobs that already exist, **re-encrypting each blob under a new object key** and rewriting it in R2. Neither is built. And with a database copy, all text is already theirs, which is most of what offload holds.
- **Not covered:** the database's own text, the vault (below), and backups, which `age` seals to the owner's key rather than the root.

**The open call for the owner:** whether there is any reason to think the database was copied. If not, level 1 plus the credential rotations is the whole response. If so, new thread keys and blob re-encryption are the next pieces, and neither has been built without that call.

## The vault, left as it is

`CONNECTOR_VAULT_KEY` has the same problem but not the same fix. Its sealed values carry associated data that names `vault:v1` (`connectors/vault.ts`), so a second key needs a per-row name threaded into the AAD as well, and the tokens it seals are themselves the thing that leaked if the database was reached. Since 2026-10-08 a rotated vault key is a supported state: `openOrNull` turns every sealed token into a connection that asks to be reconnected, and S27 keeps an unopenable grant for a revoke by hand. So the vault is rotated by replacing the key, reconnecting the calendar, and revoking the old grant at Google. No code.

## Runbook, production

The owner runs every step; Claude's classifier refuses production deploys and reads. Never print a key: copy values in the Railway dashboard, never through a terminal.

1. **Wait for a green core-api deploy of this change.** Railway's builds for core-api and web were failing on pnpm resolution on 2026-10-22; nothing below starts until the merged code is live.
2. **On core-api, stage both variables, then deploy once.** Set `DATA_ROOT_KEY_PREVIOUS` to the current value of `DATA_ROOT_KEY` (copy it in the dashboard). Then generate the new root with `openssl rand -base64 32 | pbcopy`, paste it into `DATA_ROOT_KEY`, and save it in the password manager. Keep the old value there too, labelled as retired, for step 8. Deploy once with both changed: a deploy with the new root and no previous one would fail every unwrap until it was fixed. It would not lose anything.
3. **Check it.** Sign in and open a photo. It opens under the previous root.
4. **Rewrap.** `railway ssh --service core-api -- node apps/core-api/dist/rotate-keys.js root`. Expect `moved N, failed 0, still on an older root 0`, where N is the number of accounts.
5. **Run it again.** Expect `moved 0, failed 0, still on an older root 0`.
6. **Optional, the owner's own account key.** `railway ssh --service core-api -- node apps/core-api/dist/rotate-keys.js account <email>`. Expect a line counting thread keys, copies and photo keys. Locally the same is `pnpm rotate-keys account <email>` in `apps/core-api`.
7. **Retire the old root.** Remove `DATA_ROOT_KEY_PREVIOUS`, deploy, open a photo again. The boot log warns while it is still set.
8. **Restoring a backup from before step 4** needs the old root as `DATA_ROOT_KEY_PREVIOUS`, because that dump's rows are still wrapped by it. Backups are kept 30 days, so keep the retired value until 2026-11-22, then delete it.

If step 4 reports a failure, leave both variables in place and run it again. A row that still fails was not wrapped by either root, and nothing it reports has been changed.
