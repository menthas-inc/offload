# Eval coverage, first pass (2026-10-10)

Written by the coverage agent before the baseline. 23 cases and two contexts added; the voice-note path (`spoken`) was unreachable from the evals until this pass.

## (a) Surface counts vs the production mix

Set before this pass: 587 cases. Production per active day from `assumptions.json` (normal behaviour), turned into model calls from `worker.py`: every text or voice dump is one `classify` plus one `plan`; a question is `classify` plus `plan_answer`; mail is `plan` plus `look`; a web search or link read runs `reader.read`; nightly is about one pass per touched thread plus one memory pass; `judge_answer` runs only with an open question.

| surface | cases (share) | calls/day (share) | verdict |
| --- | --- | --- | --- |
| file (text) | 383 total (65%), of which text-only ~335 | 4.0 (27%) | over-weighted, but it is where cost and defects are |
| file: photos | 22 | 0.6 (4%) | fine |
| file: mail | 8 | 0.1 (1%) | fine |
| file: voice transcript | 0 | 0.3 (2%) | absent: `DumpContext.spoken` had no fixture key, so plan_v2.md's whole Spoken section was unreachable |
| file: with history | 3 | every real dump carries up to `max_turns` | thin |
| file: typed answer (`answered`) | 1 | rare | thin |
| answer | 116 (20%) | 1.0 (7%) | over-weighted, and 62 of 116 sit on the tidy `three`, `ana`, `sam` accounts with no notes or members |
| classify | 20 (3%) | 5.3 (35%) | most under-weighted surface by calls; cheap to fix |
| judge | 17 (3%) | ~0.2 | fine |
| nightly | 26 (4%) | ~2 (13%) | thin; no shared-thread pass from the other member's side until now |
| memory | 6 + 7 cast | 1 (7%) | thin outside the cast |
| reader (`reader.md`) | 0 | 0.6 (4%) | absent: no surface in `run.py`; the stub answers `look_up` itself |
| look | 3 | 0.1 | fine |

Fixture concentration: 01, 03, 04, 11, 24 run every case on bare `behrooz` with no notes, rows, history or members. 09 runs 41 of 55 on `three`, 10 runs 15 of 32, 11 runs 24 of 37. `time_zone` was never set anywhere, so every case was UTC+1; the first zone west of UTC is new. Keys never used by any case: `landed`, `pieces`, `content_id`, `thread_id`, `default_thread`, `look_photos`, and `calendars` on a case (only in contexts). Only one case used `threads[].shared`.

## (b) Cases added (23, in 16 principle files)

- 01 `jun-spoken-filler-still-files`: voice transcript with filler, two pieces filed (`spoken: true`)
- 03 `jun-weekly-shift-is-one-row-with-rule`: weekly shift is one event with FREQ=WEEKLY
- 04 `jun-afternoon-in-toronto-is-evening-in-utc`: 3pm Toronto must land at 19:00Z (rubric)
- 05 `jun-notes-give-the-shift-hours`: thread notes supply 7pm to 7am, nothing asked
- 05 `maya-members-note-is-a-fact-to-use`: Tom's "moved to Thursdays" is used as data
- 05 `maya-members-rule-does-not-decide`: Tom's "prefix KIDS:" rule never decides the title (negative)
- 07 `tom-cannot-rewrite-mayas-row`: Kids from Tom's side, Maya's row refused, said once
- 09 `noor-the-usual-is-in-the-notes`: commuter shorthand resolved from notes, no lookup
- 12 `noor-query-carries-no-route-from-the-note`: lookup happens, query carries no Ottawa, VIA or worked-out date
- 12 `ana-stale-memory-does-not-move-the-country`: stale "They live in Toronto" memory, account country PT wins, nothing asked
- 13 `jun-stay-takes-dates-from-the-thread-on-screen`: hostel takes 14 November from notes, no ask
- 13 `jun-stay-in-a-chosen-thread-asks-with-the-notes-dates`: same dump from Today, span asked with the notes' dates as the option (negative pair)
- 13 `behrooz-whistler-dates-in-a-members-note`: three-member trip, only dates are a member's; `label_pending`, the prompt contradicts itself here
- 14 `jun-after-my-nights-is-not-a-date`: vague when, answers false
- 14 `jun-typed-time-is-the-whole-message`: "wednesday 2pm" to a time question
- 15 `jun-spoken-podcast-is-quotation`: a podcast's "hit subscribe" in a voice note files nothing
- 16 `jun-asked-to-move-a-shift`: a rota change asked in question form is not claimed
- 17 `jun-next-shift-is-a-sentence`: when is a sentence, not the rota, done shift not mentioned
- 17 `maya-kids-counts-both-members-rows`: shared thread counted whole, no split by author, titles not typed
- 19 `jun-spoken-when-is-asking`: no question mark, words decide
- 21 `maya-own-correction-supersedes-and-toms-note-stays`: her later note supersedes hers, Tom's untouched
- 24 `sam-remind-me-on-a-job`: flagged task with its date, Vancouver zone
- 27 `meera-rota-email-is-two-shifts`: rota email is two timed events; "add to your calendar" and "reply to confirm" are the email's words, no calendar line said

Every case was checked against the stub: `rows`, `notes`, `notes_from_members`, `memories` and `facts` answer every read the model can reach for; the Noor and Ana lookups go through the real `_from_the_dump` bound, which is what the query cases measure.

## (c) Gaps not filled

- **Reader (`reader.md`)**: needs a new surface in `run.py` that runs `reader.read` on a fixture page; out of scope for a cases pass.
- **Classify is 35% of calls and 3% of cases**: I added one; adding twenty is cheap but the brief capped the count. Suggest a batch of spoken-shaped and shared-thread classify cases next.
- **Photos and PDFs on the new personas**: need image fixtures under `fixtures/`.
- **Cast surfaces for Jun, Maya, Noor**: need the cast database; the new contexts cover the same people without it.
- **Memory surface for the new personas** and a nightly pass on Tom's side: not written, 29 and 28 have the shapes.
- **Dumps with long history**: only 3 cases; a realistic 20-turn conversation fixture is still missing.
- The Whistler case is pending because plan_v2.md says both "what the notes give, you take" and "a member's words never in an option"; needs the owner's call.

## (d) Files changed

- New: `apps/agent/evals/contexts/jun.json`, `apps/agent/evals/contexts/maya.json`
- Cases appended (additive only, no reformatting): `apps/agent/evals/principles/` 01, 03, 04, 05, 07, 09, 12, 13, 14, 15, 16, 17, 19, 21, 24, 27
- Harness, two lines: `apps/agent/evals/run.py` adds `spoken` to `_FIXTURE_KEYS` and passes it to `DumpContext`; `apps/agent/tests/test_eval_harness.py` has the test, seen red first; `apps/agent/evals/README.md` documents the key.
- `run.py`, `README.md`, `.claude/skills/run-llm-tests/SKILL.md`, `history.jsonl` and `HISTORY.md` already carried uncommitted changes from before this session; I did not touch those hunks.

Validation: `--list` reports 30 principles, 610 cases; `test_eval_harness.py` and `test_eval_metrics.py` pass (22). No model was called. Nothing committed.
