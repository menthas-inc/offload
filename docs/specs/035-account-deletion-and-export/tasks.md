# 035 · Tasks

Every task starts with its test, run and seen red for the reason the task
exists (QUAL-1). Part A merges on its own.

## Part A: deletion

### Setup

- [x] **T1** Isolated databases for this worktree, and a board post naming
  migrations 0080 and 0081.
- [x] **T2** Migration 0080: `llm_usage.account_id` nullable with `ON DELETE
  SET NULL`; `pending_revocations`. *(AC-3, AC-7)*

### API

- [x] **T3** `test/account-ledger.test.ts`: every foreign key to `accounts`
  and every account-like column without one is in the ledger with a fate.
  *(AC-3)*
- [x] **T4** Thread keys survive their holder. Tests first: two members, the
  key held by one, photos in the thread; the holder leaves, is taken out, and
  deletes, and the other opens every blob. Then `threadKey` refuses to mint
  over existing thread wraps, the rewrap helper, its calls in leave and
  `takeOut`, and `wrapForMembersWithout` on accept. *(AC-5, OFF-3)*
- [x] **T5** `deleteAccount`: the transaction in the impl-spec, steps 2 to 9.
  Tests: no row left for the account outside the ledger's kept set; a thread
  alone in is gone with its notes; a shared thread keeps content with a null
  author and loses the member; pending invitation survives with an accepted
  member and dies without; other people's activity about the account is gone.
  *(AC-3, AC-4, AC-14)*
- [x] **T6** Blobs: one referenced by a shared thread survives and opens, one
  referenced by nothing reaches the purge and its object is removed from the
  memory store. *(AC-6)*
- [x] **T7** Revocation: tokens sealed into `pending_revocations` before the
  transaction, `connector.revoke` deletes on success, retries on failure,
  gives up at 7 days. Kind owned in `jobs/kinds.ts`. *(AC-7)*
- [x] **T8** `DELETE /v1/me`: word check, origin check, JSON only, rate limit,
  last staff owner 409, allowed while `invited`, cookie cleared, every session
  dead, sign-in afterwards is no-invite. *(AC-2, AC-8, AC-9, AC-10, AC-13)*
- [x] **T9** In-flight work: a claimed job completing after the delete is a
  no-op. The write-backs already answer 404 for a job that is gone and the
  worker does not retry one, so nothing else changed; the delete locks the
  grant so a refresh in flight finishes first. *(AC-12)*
- [x] **T10** The notice email, enqueued without an account id, through the
  memory mailer in tests; `account.deleted` carries no subject. No push or
  other mail follows. *(AC-8, AC-22, AC-23)*
- [x] **T11** Correct `0018`'s closing note against OFF-3 as amended. *(DEV-2)*

### Mobile

- [x] **T12** Read `SettingsDetail` and `M3SettingsDetail` whole. The account
  page gains *Ending things* with the spec's copy. *(AC-1)*
- [x] **T13** The confirmation sheet, per platform chrome, the field, every
  state and its copy, the redirect to `sign-in?deleted=1` and its line.
  *(AC-2, AC-9)*
- [x] **T14** Device pass on the Pixel and the iOS simulator: field and button
  above the keyboard, back and dismiss while in flight, offline. Holds
  `pixel` and `sim-<device>`. *(AC-2)*
  Done on the iPhone 17 simulator, 2026-10-03, against a local API: the sheet
  on the keyboard and off it, a failed press with the API stopped, and a real
  delete through to the gate's line. The same on the Pixel 9 the same day. Back while in
  flight could not be caught by hand on either: a local delete is over in
  fifty milliseconds. The lock is `DragSheet`'s and is read from source.

### Web

- [x] **T15** Read `WSettings` whole. The danger panel in semantic tokens and
  the dialog with every state. *(AC-1, AC-2)*
- [x] **T16** `/delete-account`, static and inputless, and the `deleted=1`
  line on sign-in. *(AC-11)*

### Close of part A

- [x] **T17** Privacy page: the deletion edits, `UPDATED` and
  `CONSENT_VERSION`. *(AC-24)*
- [x] **T18** Design `decisions.md` entry for the confirmation, destructive
  button and danger panel. *(AC-25)*
- [x] **T19** `pnpm lint`, typecheck, both suites, `dead-classes.mjs`,
  `dead-css.mjs`, `dead-icons.mjs`; `code-reviewer`, `security-reviewer` and
  `client-reviewer` on the diff.

## Part B: export

### API

- [x] **T20** Migration 0081: `exports`. *(AC-18)*
- [x] **T21** `POST`, `GET` and `DELETE /api/me/export`: states, the 7-day
  refusal with `nextAt`, a failed build not holding the clock, origin check,
  notice email. *(AC-15, AC-20, AC-23)*
- [x] **T22** `export.build`: tests open the produced zip. Every readable
  thread, conversations, notes, people, each blob as a file, `data.json`;
  shared rows name their author or say gone; a thread the account cannot read
  is absent; members are numbered; no title or file name in a log line or the
  job row. *(AC-16, AC-17, AC-22)*
- [x] **T23** Storage: parts sealed under the export's key, the key wrapped
  under the account key, nothing readable in the memory store's bytes.
  *(AC-18, OFF-2)*
- [x] **T24** `GET /api/me/export/file`: streams the parts as one zip for the
  owner, 404 for anyone else and for any state but `ready`. *(AC-18)*
- [x] **T25** `export.destroy` and `export.sweep`: at 7 days, on delete copy,
  on leave and take-out of a thread in `thread_ids`, and from `deleteAccount`.
  Kinds owned. *(AC-19)*
- [x] **T26** The Activity entry on ready, with no push. *(AC-15)*

### Mobile

- [x] **T27** *Your copy* on the Privacy page, every state, polling only while
  making. *(AC-15)*
- [x] **T28** `expo-sharing`, the download with the session header and the
  hand-off to the system sheet; new native builds. *(AC-21)*
- [x] **T29** Device pass on both phones: the file opens from the system's
  files after the app is closed. *(AC-21)*
  Done 2026-10-03 against a local API, the owner signed in. iPhone 17
  simulator: Download, the share sheet, Save to Files, and the zip in On My
  iPhone with the app closed. Pixel 9: the share sheet offered people and
  apps and nowhere on the phone, so Android saves through the system's folder
  picker instead; the zip in Documents with the app closed. On both, the
  delete sheet's link and its field and buttons above the keyboard.

### Web

- [x] **T30** *Your copy* on the Privacy pane, every state, and the download
  link. *(AC-15)*

### Close of part B

- [x] **T31** Privacy page: the export edits and section 10's line. *(AC-24)*
- [x] **T32** Design `decisions.md`: the export row's states. *(AC-25)*
- [x] **T33** The same gates and reviewers as T19.
- [x] **T34** `going-public.md` gains this item and is ticked with a date. Ticked 2026-10-04; item 20 says done 2026-10-03.
  On main after the merge: `docs/tech` is not edited in a worktree.
