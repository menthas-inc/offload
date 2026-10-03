# 036 · Tasks

Each test is written and seen red before its code.

## API

- [x] T1 `cap.storage_bytes` in the registry, default 1 GiB. AC-2.
- [x] T2 `storageUsed`, counting kept originals and not what a leaver left. AC-3, AC-5, AC-6.
- [x] T3 Both upload routes refuse `storage_full` and record the hit. AC-1.
- [x] T4 Mail in leaves out what would not fit, one hit. AC-4.
- [x] T5 `deleteContent` and its restore take and put back the photo. AC-7, AC-10.
- [x] T6 `deleteThread` as last member and `restoreThread`, on the restore window, with a purge enqueued. AC-8.
- [x] T7 `blobPurge` puts back a condemned photo a live row carries. AC-11.
- [x] T8 `GET /api/me/storage`, `no-store`. AC-12.
- [x] T9 Admin `usedToday` carries the figure. AC-15.
- [x] T10 `storageFigure` in `@offload/widgets`. AC-13.

## Web

- [x] T11 `PhotoRefused`/`VoiceRefused` read `storage_full`; the composer says *Your storage is full.* AC-14.
- [x] T12 *Storage* section on Privacy, read once, toast once on failure. AC-13.
- [x] T13 A message with nothing left to draw is not drawn: dropped by `GET /v1/conversations/current`, so both clients. AC-16.
- [x] T14 Admin: labels, units, the person page figure beside Files. AC-15.

## Mobile

- [x] T15 `upload()` returns the body's error; `storage_full` reaches the composer line. AC-14.
- [x] T16 *Storage* section on Privacy. AC-13.
- [x] T17 As T13, from the API. AC-16.

## Records

- [x] T18 `docs/tech/decisions.md`: the OFF-6 allowlist line, and the claim defect closed.
- [x] T20 The privacy page clause for a left-behind photo, with its test.
- [x] T19 `.claude/skills/offload-design/decisions.md`: the kit divergence, with Design system impact.
