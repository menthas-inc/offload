# 005 The thread page, tasks

> Ordered. Each task is one thing (QUAL-2) and names the criteria it is done against.
> A, B and C are shippable on their own and close the privacy gap; D adds the writes.

## A. Schema and reads

- [x] **A1** `0013_archive.sql`: `content.archived_at`, plus the two partial indexes.
  *Test:* migration up on a fresh database; an archived row is absent from the active index's query and present in the archived one.
- [x] **A2** `schema.ts`: `archived_at` on `ContentTable`.
- [x] **A3** `memberOf` and `authorOf` helpers, in one module, used by everything after this.
  *Test:* a pending membership is not a member; an accepted one is; authorship is per row.
- [x] **A4** `GET /v1/threads`, grouped now / always / older, 30 day staleness, `meta` composed server-side *(**AC-1**)*
  *Test:* a thread with `always_on` true lands in always whatever its activity; one untouched for 31 days lands in older; another account's threads never appear.
- [x] **A5** `GET /v1/threads/:id`, the four-query bundle with counts and members *(**AC-4**, **AC-5**, **AC-8**)*
  *Test:* the query count is asserted and does not change when the thread gains content; counts match a direct query; a non-member 404s.
- [x] **A6** `GET /v1/threads/:id/content`, cursor on `(created_at, id)`, page 30, `archived` flag, `canDelete` per row *(**AC-6**)*
  *Test:* 500 rows paginate without repeats or gaps; `canDelete` is false on another member's row and true on your own.
- [x] **A7** `GET /v1/content/:id` with provenance, and **without** the source thread's name *(**AC-16**, **AC-17**)*
  *Test:* a moved row's provenance names the dump and the author and never the old thread.

## B. The shell

- [x] **B1** `(app)/layout.tsx`: sidebar plus pane stack, up to five, two on screen, depth stamped on push.
  *Test:* opening a third pane pushes the first out; truncating the stack does not repaint a surviving pane.
- [x] **B2** Narrow window: one pane, crumb becomes a back button, at 1180px *(**AC-2**)*
- [x] **B3** Today moves into the shell, and the composer moves with it, under every pane on every tab as the kit specifies.
  *Test:* the 003 and 004 composer tests still pass unchanged.
- [x] **B4** Every pane has a URL: `/today`, `/threads`, `/threads/:id`, `/content/:id`. The stack is derived from the route, not accumulated.
  *Test:* opening `/threads/:id` cold renders My threads beside that thread.
- [x] **B5** offload's reply links to the threads the turn actually wrote to, from the content rows.
  *Test:* a reply naming three threads where two were written to links two, in filing order, deduplicated; a turn that filed nothing links nothing; content that was undone drops its link.

## C. The screens

- [x] **C1** My threads, from `WThings`: three groups, counts, "All N older threads" *(**AC-1**, **AC-3**)*
- [x] **C2** The thread page, from `WThing`: head, faces, the standing summary when there is one, "Everything in here" *(**AC-4**, **AC-7**)*
- [x] **C3** The item pane, from `WTask`: thread chip, "Where this came from" *(**AC-16**)*
- [x] **C4** Empty states for a thread with nothing in it and an account with no threads *(**AC-3**, **AC-7**)*
- [x] **C5** `dead-css` and `dead-classes` clean, `pnpm lint` clean.

## D. The writes

- [x] **D1** `PATCH /v1/content/:id`, membership-checked, returning `previous` *(**AC-9**)*
- [x] **D2** `POST /v1/content/:id/archive` and `/restore` *(**AC-9**, **AC-15**)*
  *Test:* an archived row is still readable and still counted; restore after the toast has gone still works.
- [x] **D3** `DELETE /v1/content/:id`, author only, soft, enqueuing `content.purge` on 004's mechanism *(**AC-10**, **AC-14**)*
  *Test:* a non-author is refused; the row survives its eight seconds; the purge takes it after.
- [x] **D4** `POST /v1/content/:id/move`, author only *(**AC-11**, **AC-12**)*
  *Test:* the author moves to a thread they are a member of; a non-author is refused even when both are members of both threads; the author is refused a destination they are not in; both counts move in one transaction; every refusal is byte-identical.
- [x] **D5** `PATCH /v1/threads/:id`, rename *(**AC-13**)*
  *Test:* content is untouched.
- [x] **D6** Undo on all five, via the `Toast` 004 wired, eight seconds *(**AC-14**)*
  *Test:* each action's Undo restores the prior value; delete's Undo is `restore`.
- [x] **D7** The delete and move controls are drawn only where the server says they are allowed *(**AC-10**, **AC-11**)*
- [x] **D8** No analytics event, log or trace carries a title, a thread name or dumped text *(**AC-18**)*
  *Test:* extend the existing isolation assertions to the new endpoints.

## E. The record

- [x] **E1** `decisions.md`: **`archive` added to the OFF-6 reversible allowlist**, before D2 ships.
- [x] **E2** `decisions.md`: move is author-only, and why a per-thread role check on it routed around OFF-3.
- [x] **E3** Design system `decisions.md`: the divergences, each with **Design system impact** filled in.
- [x] **E4** The privacy policy re-read. "Visible to you" becomes true when this ships; "can be moved at any time afterwards" becomes true for the author and is now precisely bounded for everybody else. **Update the page in this change**, and close the ⚠️ entry `004` left open.
- [x] **E5** `001-data-model` amended with `archived_at`.

## F. Ship

- [x] **F1** Full suite green.
- [ ] **F2** Deploy, migrate, and open a real thread holding real content filed by 004.
