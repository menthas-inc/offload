# 051 Birthdays are memories, tasks

Each task starts with a test that is run and seen red for the reason the task exists (QUAL-1), then the smallest code that turns it green (DEV-1). Suites run on the feature's own database, never the shared one (`docs/tech/` and the feature session loop).

## Setup

- [x] **T1** Migration `0100_memory_events.sql`: `notes.event_ref` with its partial index and scope check, `connector_pending_writes.note_id`, and `memories_to_date` offering a linked memory whose words changed with its reminders off. `questions.target_note_id` already existed (013) and is reused. Test: `memory-events-schema.test.ts`. *(AC-15, AC-18; DATA-1)*

## API: writing the memory

- [x] **T2** `memories/dates.ts`: read a day from a phrase ("Feb 1st", "1 February", "February 1", "1st of Feb", "29 Feb"; never "1/2"), strip it from a sentence, refuse an unreal day. Table test, including the strings that must not read ("in February", "1/2" with no order). *(AC-4)*
- [x] **T3** The remember handler's unasked path: accepted for a People or About sentence with `on` and `name` when the day matches the message and every non-date word is in it; refused `not_their_words` when a word is missing, `bad_date` when the day differs, `untrusted_turn` when the turn read a member's note or row or anything 038 AC-5 lists. Red first on the Kristina message and on the security review's "did Kristina say anything about 1 Feb?" with the date in a member's note. Asked-path tests unchanged and still green. *(AC-2, AC-3, AC-4; SEC-1)*
- [x] **T4** `name` checks: `nameIsOwn`, contains "birthday" or "anniversary", at most 60; failing it writes the memory with no name. *(AC-5)*
- [x] **T5** Dedupe and supersede on flattened name and date; at the cap, `memories_full`. *(AC-6, AC-8)*
- [x] **T6** `labelMemoryNow`: the label written in the turn with lead `days` and the note's fingerprint; their own birthday gets none; `memoriesToDate` does not offer it to the next pass until the text changes. *(AC-9)*
- [x] **T7** `threadsFor` and `threadsForAll`: a memory-only turn is `filed: true` with no thread; a turn that also filed a row shows that thread. The `memories` live change is emitted. *(AC-7)*

## API: the calendar

- [x] **T8** Found event: a series instance of the person's own on the UTC day with the name's words, on any selected calendar including a read-only one, links the memory by its `series_ref`, writes nothing, sets `attrs.event_found`. Red on a fake Google that counts writes. *(AC-12)*
- [x] **T9** Which calendar: named and settled; named and unsettled (the question with `target_note_id`, the sentence under 80, field `calendar`, never joining an open question, nothing raised when one is open); nothing named (the primary, else the first approved writable, no question); none approved (the connect line only when asked). Their own birthday and a held memory only when `calendar` is given and the turn is untainted. *(AC-11, AC-13; SEC-1)*
- [x] **T10** The write: all-day, yearly, title the name, nothing else in the draft; through `verdictFor` so `Ask before adding` waits with `note_id`; confirming the pending write links the note. *(AC-11, AC-14)*
- [x] **T11** Scoping: another account's note id, a thread note's id, and another account's calendar each get the one refusal. *(AC-15; OFF-3, SEC-2)*
- [x] **T12** The turn's Undo deletes the event offload wrote and clears `event_ref`; leaves a found event alone. The pick's Undo deletes the event and keeps the memory. *(AC-16; OFF-6)*
- [x] **T13** Forget: `memory.event_delete` is enqueued with the Undo window as its delay; a restored memory's job does nothing; otherwise `undoWrite` deletes with no verdict on a shared calendar; a found event is only unlinked; a Google error ends quietly. A ref moved to a replacing memory is never deleted by the old row's job. *(AC-17, AC-18; OFF-6, OFF-1)*
- [x] **T14** Edit: a changed text re-offered to the pass, with reminders on and off (`memories_to_date`); `applyMemoryDates` with a new day enqueues `memory.event_move` (an edit of the master, scope `one`), with no day enqueues the delete; a found event only unlinks. The `shortcut:` comment sits here. *(AC-18)*
- [x] **T15** Sync and calendar: an event gone from Google, an unticked calendar and a disconnected one each clear `event_ref`, memory unchanged; an event edited on Google changes no memory. *(AC-19)*
- [x] **T16** No day or no name: no calendar; *That needs the day first.* only when asked. *(AC-20)*
- [x] **T17** The pass refuses an add that repeats a held name and date; a supersede or fold moves `event_ref`. *(AC-21, AC-18)*
- [x] **T18** Today: a linked memory's day window is not drawn; its earlier windows are. *(AC-10)*
- [x] **T19** Hygiene: the job payloads, the handler's log lines and the admin views carry no memory text, name or title; a test greps the new log calls' fields. *(AC-24; OFF-1)*

## Agent

- [x] **T20** `Memory` gains `on`, `name`, `calendar`; the tool set still fits 2,400 (`test_the_tool_set_fits_the_raised_budget`). *(OFF-5, OFF-8)*
- [~] **T21** `plan_v2.md` and `memory.md` say what the feature spec says; a birthday is never `add_content` or `create_event`. Eval cases written under the memories principle as AC-23 lists; run before and after only with the owner's yes. *(AC-1, AC-2, AC-23)*

## Web and Mobile

- [x] **T22** `memoryOrigin`'s line for a `stated` memory from a message reads *You told offload this*; the widgets test red first. Web and both phones draw it with no further change. *(AC-22; OFF-7)*

## Docs, in the same change

- [x] **T23** The privacy page: sections 3 and 7 reworded as the feature spec's Privacy says, before any code that writes an event unasked ships. *(AC-25)*
- [x] **T24** 038, 019, 040 and 042 amended where the feature spec's Amends list says; `docs/tech/decisions.md`: the unasked remember, the memory as a write's anchor, the forget's delete on OFF-6's allowlist (owner, 2026-11-17); the design `decisions.md`: the question sentence and the origin line, with Design system impact. *(AC-25; DEV-2, OFF-7)*

## Close

- **T25** The whole suite green on the feature database, the four local checks `ci.yml` runs, then a phone check: a birthday dumped on the Android build lands in Memories, on the calendar, and nowhere in a thread.
