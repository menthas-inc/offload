# 028 Not in a thread, at merge

What was built differently from the specs, and what the logs need. Written during the build on 2026-10-02.

## Built differently

- **One order across two tables is the id, not `created_at`.** Content and notes ids are both UUIDv7, so `/v1/loose` merges the two by id and the cursor is the last id, as the thread page's own content cursor is. A `(created_at, id)` cursor would have truncated microseconds on the round trip, the defect the content route already documents. The notes index is `(subject_id, id desc)`.
- **The migration is 0066**, since `main` took 0065 for the calendar's whose-event change while the branch was open. It drops and recreates `readable_content` and `readable_notes` around its new columns, as 0057 and 0060 do; the predicate test caught the omission.
- **The worker reads content and notes whole already**, so 0066 grants it only `suggestions (content_id, note_id)`.
- **The dismissal is a timestamp on the thing** (`content.suggest_dismissed_at`, `notes.suggest_dismissed_at`), so a suggestion and a proposal can be deleted freely without losing it, and it carries no words.
- **A proposal takes the name the person chose** when it is spent, so Undo restores their words and a later rename shows as a change that refuses Undo.
- **A turn says it filed.** Both clients drew Done from the footer's pills, and a turn that filed only loose has none, so `filed` rides the stream, the message read and the tail, and Done reads it. Found by the web build and confirmed on the simulator: a loose dump shows Done and nothing else.
- **A note carries `createdAt`** on the wire, for the meta line and the order.
- **The model reads "not in a thread"** in place of the default thread's stored name in the thread list, every filing tool result, the read results and `account_facts`; the thread list adds the words a person may use for it (miscellaneous, unsorted, the inbox).
- **Labels skip the default thread** in the live labeller (reported done, so the model does not retry) and in the nightly sort's candidates.
- **The tool definition budget is 1,900**, by the owner's decision, for `suggest_thread_id` on both filing tools.
- **The daily pass** runs on the `sort` model with at most fifty things of two hundred characters, numbered so the model echoes integers; its server half holds ids to the set sent and to what is still a candidate, writes at most three proposals, and takes `on conflict do nothing` where a filing gave a thing a Move to meanwhile. Booked from `account.daily.run` when two or more candidates form a set it has not read; `LOOSE_PROPOSALS=off` stops it.
- **Phones:** loose notes draw as loose rows with the `text-quote` tile (the note row has a drag grip and no swipe). Files use `paperclip`, since the set has no `file`. `perform` gained an optional retry label so 028's failures say Try again and a duplicate note offers none. `SheetFoot` gained `disabled`. The full list's empty state is an inline title, since the phones have no `EmptyState`. A note's Move sits on its own line in the note sheet. The content move toast says *Moved to {thread}* on the thread page too.
- **Web:** loose rows use the thread page's 32px tile. Move lives in the edit modal for every row that can move, so the hover tools stay two. A Create failure stays in the modal with *Couldn't create that* and Try again, since a toast would sit behind the scrim. A loose result in an answer that was cut short reads *The rest is not in a thread.*
- **Not done, deliberately:** the worker's early return when the candidate set has shrunk below two by the time it runs does not refresh `loose_pass_key`; the next change to the set books the pass again, which costs at most one extra pass.

## Verified on devices

- **iOS simulator (iPhone 17)** against the worktree's API on an isolated database, with seeded data and one real turn: My threads with no Always on and no Miscellaneous, the group between the lists with its count and chips, Links filtering in place with *All 4 links*, a Move to with *Moved to Lisbon trip* and the thread rising to the top, Create's sheet (*These three look like one project.*, untick down to two) making Kitchen shelves and opening it with *Created Kitchen shelves* and Undo while the unticked link stays loose without its suggestion, the full list with its title, line, chips, a shared Move to drawing two faces and *+1*, the archived foot row, a dismiss with no toast recorded in the database, and a real dump ("a guy at work recommended a plasterer") filed as a loose note with a Move to suggestion, its turn showing Done with no pill and no words.
- **Not verified on a device:** the Pixel runs a store build (versionCode 7), not a development client, so Android was not tried; Undo inside eight seconds (covered by the API tests, too fast for screenshots); the web, which needs the owner to sign in; dark mode; the largest type size.

## For the logs, on main after merge

- **`.claude/skills/offload-design/decisions.md`**, one entry, *Not in a thread as built (028)*, carrying the feature spec's divergence list plus: loose notes as loose rows; `paperclip` for Files; the web's 32px tile; Move in the web edit modal; the create modal's inline failure; *The rest is not in a thread.*; the faces as a 20px initials mark on `--surface-fill` with a 6px overlap. **Design system impact:** `LooseParts.jsx` draws the faces, the eight chip types, 025's chips, plain-string toasts and the leaving row as a deleted row's; the web kit's create sheet becomes a modal; the readme's **Not in a thread** loses *Saved.* as a reply (Done alone) and gains the faces.
- **`docs/tech/decisions.md`**: the tool definition budget at 1,900; the reversible allowlist's conditional entry for a suggested move into a shared thread (one tap and Undo, by the owner's decision of 2026-10-01 against the security review's recommendation to confirm), in 019's wording; the ⚠️ on what a row looks like before it is sorted, closed.
- **Dated amendment lines**: 004 (no *Saved to Miscellaneous.*; a loose filing shows Done), 014 (a note moves between threads), 025 (labels skip the default thread).
