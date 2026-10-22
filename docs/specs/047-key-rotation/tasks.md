# 047 Key rotation, tasks

Red before green (QUAL-1). All tests are in `apps/core-api/test/key-rotation.test.ts` unless named.

- [x] **T1 Unwrap by name.** Two roots, names derived from the keys, `db:v1` read as the previous root when one is set, a loud failure on a name no root has; `wrapUnderRoot`/`unwrapFromRoot`; `wrap`/`unwrap` take an explicit key; `promote.ts`, `blobs/keys.ts`, `seed-store-demo.ts` moved over. *Red:* the module did not exist. `promote.test.ts` and `vault.test.ts` follow the new API.
- [x] **T2 `rotate-keys.js root`.** A transaction per row, resumable by `wrapped_by`, `rotated_at` set, failures left as they were and counted, counts only. *Red:* the three `rewrapRoot` cases, including a run stopped half way and resumed.
- [x] **T3 `rotate-keys.js account <email>`.** New account key; thread key copies, copies' keys and account wraps in `blob_keys` rewrapped in one transaction; `version` bumped. *Red:* the three `rotateAccountKey` cases. The race case went red without `FOR SHARE` in `accountKey`; the two read-order cases went red until `threadKey`, `passThreadKeyOn` and `objectKeyOf` read their wrap after the account key (security review).
- [x] **T4 Docs.** The impl-spec's runbook, `docs/tech/decisions.md`, `.env.example`.
- [ ] **T5 Production.** The owner runs the runbook in `impl-spec.md`, after a green core-api deploy.
- [ ] **T6 Open, the owner's call.** New thread keys and blob re-encryption, only if the database may have been copied. Not built.
