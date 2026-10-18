# 043 and the Today month, at merge

The entry below goes on `main` after the merge, in `docs/tech/decisions.md`, which is shared state edited on `main` only. The design log's two entries of 2026-10-18 travel with the branch, as the design sync does (owner, 2026-10-02).

## docs/tech/decisions.md

### 2026-10-18 · Undo is client state keyed by the thing, and Today's month is a count read

**Undo in place (043) changes no write.** The optimistic op gains an optional `place`, and each client's toast hands a word with a place to one module-level store keyed by the thing's id, each entry with its own eight-second timer, outside every screen so leaving one does not cancel a window. The state and the slot ordering are `@offload/widgets` (`undo.ts`), React-free and tested once; each client wraps them in `useSyncExternalStore`. Nothing new reaches the server.

**Today's month (027, amended)** reads `GET /v1/today/month?from&to`, a count per day of to-dos, offload events and the account's own ticked calendar events, computed by `readMonth` with the day read's own queries and predicates over the window rather than a day read per cell. A day's count is what its day read draws, which a test pins day by day. The window is at most 62 days, days before today and past the calendar copy's edge carry nothing, and the route is the session account's only. No index added: the day read's queries already filter on the account's rows and `connector_events` by account and time, and a month is one read of each.
