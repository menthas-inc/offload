# Run history

Every eval run, oldest first. Appended by `evals/run.py`; regenerate this table
from `history.jsonl` rather than editing it. `results/` holds the transcripts
and is not committed.

| When | Scope | Runs | Passed | Cost | File model | Prompts | Commit | Note |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-09-16 21:33 | all | 1 | 381/432 (88%) |  | `claude-sonnet-5` | `not recorded` | `uncommitted` | first clean baseline, original prompts, Sonnet filing |
| 2026-09-17 11:30 | 13 | 1 | 58/59 (98%) |  | `claude-opus-5` | `not recorded` | `uncommitted` | asking-back on Opus, same prompts |
| 2026-09-17 11:41 | all | 1 | 413/459 (90%) |  | `claude-opus-5` | `not recorded` | `uncommitted` | whole set with filing and quick add on Opus, original prompts, 27 newly labelled cases included |
| 2026-09-17 11:49 | all | 3 | 261/459 (57%) |  | `claude-opus-5` | `not recorded` | `uncommitted` | runs=3 after the code and prompt changes; the account ran out of credit after principle 13, 155 errors |
| 2026-09-17 12:26 | all | 1 | 415/459 (90%) | $6.83 | `claude-sonnet-5` | `not recorded` | `uncommitted` | rewritten plan_v2 at about half the tokens, Sonnet filing, one run |
| 2026-09-20 18:50 | 23 | 2 | 13/22 (59%) | $0.63 | `claude-sonnet-5` | `b64294d0` | `0e09566` | 020 photos, first run, twice |
| 2026-09-20 18:50 | 08 | 2 | 13/26 (50%) | $0.99 | `claude-sonnet-5` | `b64294d0` | `0e09566` | 019 calendars per thread, first run of the 14 new cases, twice |
| 2026-09-20 19:08 | 23 | 2 | 18/21 (86%) | $0.60 | `claude-sonnet-5` | `b64294d0` | `0e09566` | 020 photos, second run after the case repairs and the drawn beach |
| 2026-09-20 19:08 | 08 | 2 | 18/26 (69%) | $0.96 | `claude-sonnet-5` | `b64294d0` | `0e09566` | 019 calendars, second run with results in the judge's transcript and the untrusted event on the right Thursday |
| 2026-09-20 19:09 | 08 | 2 | 13/26 (50%) | $1.02 | `claude-sonnet-5` | `b64294d0` | `0e09566` | 019 calendars, the same cases with the judge on Sonnet 5, to price the judge |
| 2026-09-20 19:11 | 08 | 2 | 14/26 (54%) | $1.04 | `claude-sonnet-5` | `b64294d0` | `0e09566` | 019 calendars, the judge told about silence and time zones |
| 2026-09-20 19:49 | 23 | 2 | 21/22 (96%) | $0.65 | `claude-sonnet-5` | `101d56c2` | `46a3125` | after: output budget with a retry, the error screenshot's task, device zone |
| 2026-09-20 19:49 | 08 | 2 | 24/26 (92%) | $1.07 | `claude-sonnet-5` | `101d56c2` | `46a3125` | after: output budget, done is silent after a change, declined refusals, calendar paragraphs gated, waiting wording, device zone, rubrics off the silent cases |
| 2026-09-20 19:56 | 08 | 2 | 23/26 (88%) | $1.12 | `claude-sonnet-5` | `101d56c2` | `46a3125` | after, second: the dinner at 8pm Lisbon, the stub declines like the worker |
| 2026-10-02 00:04 | all | 1 | 472/516 (92%) | $6.22 | `claude-sonnet-5` | `974dd859` | `6228452` | full run 2026-10-01: first run since 019, includes every principle added since 2026-09-20 |
| 2026-10-02 00:07 | file-question-only-violence | 1 | 0/1 (0%) | $0.00 | `claude-sonnet-5` | `974dd859` | `6228452` | diagnosis: stop reason on a silent turn |
| 2026-10-02 00:07 | single-letter | 1 | 0/1 (0%) | $0.01 | `claude-sonnet-5` | `974dd859` | `6228452` | diagnosis: stop reason on a silent turn |
| 2026-10-02 00:20 | all | 1 | 498/516 (96%) | $6.41 | `claude-sonnet-5` | `6335e11e` | `6228452` | after: refusal and failure handling in the loop, stub and matcher fixes, four case corrections, prompt fixes across filing, answering, judge, quick add and compaction |
| 2026-10-02 02:52 | answer | 1 | 98/112 (88%) | $1.92 | `claude-sonnet-5` | `04a2d8af` | `ec2b061` | Opus 5.5 for answering, with the conversation cached inside a turn |
| 2026-10-02 02:54 | answer | 1 | 109/112 (97%) | $2.74 | `claude-sonnet-5` | `04a2d8af` | `ec2b061` | Opus 5 on the same answering cases, the comparison for the Opus 5.5 switch |
| 2026-10-02 23:10 | all | 1 | 490/515 (95%) | $9.21 | `claude-sonnet-5` | `62272c29` | `e6a184c` |  |
| 2026-10-02 23:35 | nightly | 1 | 23/26 (88%) | $0.40 | `claude-sonnet-5` | `ee95f80b` | `fd37c23` |  |
| 2026-10-02 23:35 | nightly | 1 | 26/26 (100%) | $0.46 | `claude-sonnet-5` | `ee95f80b` | `fd37c23` |  |
| 2026-10-04 01:24 | new-thread-wears-a-fitting-icon | 1 | 1/1 (100%) | $0.06 | `claude-sonnet-5` | `57f72231` | `4d7b43a` | 037: the two thread icon cases |
| 2026-10-04 01:25 | new-thread-icon-is-from-the-list | 1 | 1/1 (100%) | $0.03 | `claude-sonnet-5` | `57f72231` | `4d7b43a` | 037: the two thread icon cases |
| 2026-10-04 23:13 | named-calendar-is-passed-as-said | 1 | 1/1 (100%) | $0.06 | `claude-sonnet-5` | `e7495b42` | `4475d72` |  |
| 2026-10-04 23:13 | named-shared-calendar-goes-by-name | 1 | 1/1 (100%) | $0.02 | `claude-sonnet-5` | `e7495b42` | `4475d72` |  |
| 2026-10-04 23:13 | my-calendar-names-no-calendar | 1 | 1/1 (100%) | $0.02 | `claude-sonnet-5` | `e7495b42` | `4475d72` |  |
| 2026-10-04 23:13 | unnamed-appointment-carries-no-calendar | 1 | 1/1 (100%) | $0.02 | `claude-sonnet-5` | `e7495b42` | `4475d72` |  |
| 2026-10-04 23:14 | named-calendar-asked-about-is-silent | 1 | 1/1 (100%) | $0.02 | `claude-sonnet-5` | `e7495b42` | `4475d72` |  |
| 2026-10-04 23:14 | cancel-one | 1 | 1/1 (100%) | $0.02 | `claude-sonnet-5` | `e7495b42` | `4475d72` |  |
| 2026-10-04 23:14 | cancel-for-good | 1 | 1/1 (100%) | $0.02 | `claude-sonnet-5` | `e7495b42` | `4475d72` |  |
| 2026-10-04 23:15 | cancel-many-by-description | 1 | 1/1 (100%) | $0.03 | `claude-sonnet-5` | `e7495b42` | `4475d72` |  |
| 2026-10-05 22:38 | 29 | 1 | 14/16 (88%) | $0.50 | `claude-sonnet-5` | `9524083c` | `f5ffef9` | 038 first run |
| 2026-10-05 22:38 | 29 | 1 | 1/1 (100%) | $0.04 | `claude-sonnet-5` | `37524296` | `f5ffef9` |  |
| 2026-10-05 22:38 | 29 | 1 | 1/1 (100%) | $0.02 | `claude-sonnet-5` | `37524296` | `f5ffef9` |  |
| 2026-10-05 22:39 | 15 | 1 | 1/1 (100%) | $0.02 | `claude-sonnet-5` | `37524296` | `f5ffef9` |  |
| 2026-10-05 22:39 | 15 | 1 | 1/1 (100%) | $0.01 | `claude-sonnet-5` | `37524296` | `f5ffef9` |  |
| 2026-10-05 22:39 | 8 | 1 | 0/1 (0%) | $0.06 | `claude-sonnet-5` | `37524296` | `f5ffef9` |  |
| 2026-10-05 22:39 | 8 | 1 | 1/1 (100%) | $0.03 | `claude-sonnet-5` | `37524296` | `f5ffef9` |  |
| 2026-10-05 22:39 | 8 | 1 | 1/1 (100%) | $0.02 | `claude-sonnet-5` | `37524296` | `f5ffef9` |  |
| 2026-10-05 22:40 | 8 | 1 | 1/1 (100%) | $0.02 | `claude-sonnet-5` | `37524296` | `f5ffef9` |  |
| 2026-10-05 22:40 | 8 | 3 | 0/1 (0%) | $0.05 | `claude-sonnet-5` | `37524296` | `f5ffef9` |  |
| 2026-10-05 22:40 | 8 | 1 | 1/1 (100%) | $0.05 | `claude-sonnet-5` | `37524296` | `f5ffef9` |  |
| 2026-10-05 22:41 | 8 | 1 | 1/1 (100%) | $0.02 | `claude-sonnet-5` | `37524296` | `f5ffef9` |  |
| 2026-10-05 22:41 | 8 | 1 | 1/1 (100%) | $0.02 | `claude-sonnet-5` | `37524296` | `f5ffef9` |  |
| 2026-10-05 22:41 | 8 | 2 | 0/1 (0%) | $0.12 | `claude-sonnet-5` | `4f795759` | `f5ffef9` |  |
| 2026-10-05 22:41 | 8 | 2 | 1/1 (100%) | $0.04 | `claude-sonnet-5` | `4f795759` | `f5ffef9` |  |
| 2026-10-05 22:42 | 8 | 2 | 1/1 (100%) | $0.05 | `claude-sonnet-5` | `4f795759` | `f5ffef9` |  |
| 2026-10-05 22:42 | 8 | 2 | 1/1 (100%) | $0.11 | `claude-sonnet-5` | `4c8c553c` | `f5ffef9` |  |
| 2026-10-05 22:42 | 8 | 2 | 1/1 (100%) | $0.04 | `claude-sonnet-5` | `4c8c553c` | `f5ffef9` |  |
| 2026-10-05 22:43 | 8 | 2 | 1/1 (100%) | $0.04 | `claude-sonnet-5` | `4c8c553c` | `f5ffef9` |  |
| 2026-10-05 22:44 | 8 | 1 | 62/67 (92%) | $1.66 | `claude-sonnet-5` | `4c8c553c` | `f5ffef9` | 038 calendar wording |
| 2026-10-05 22:44 | 29 | 2 | 16/16 (100%) | $0.28 | `claude-sonnet-5` | `4c8c553c` | `f5ffef9` | 038 stability |
| 2026-10-05 22:44 | 08-the-calendar | 3 | 1/1 (100%) | $0.09 | `claude-sonnet-5` | `4c8c553c` | `f5ffef9` |  |
| 2026-10-05 23:14 | 29 | 1 | 15/16 (94%) | $0.50 | `claude-sonnet-5` | `4c8c553c` | `f5ffef9` | 038 after security review |
| 2026-10-05 23:14 | 29 | 2 | 1/1 (100%) | $0.03 | `claude-sonnet-5` | `4c8c553c` | `f5ffef9` |  |
| 2026-10-06 15:45 | 30 | 1 | 14/15 (93%) | $0.31 | `claude-sonnet-5` | `4c8c553c` | `bae0147` | the cast, first run |
| 2026-10-06 15:46 | 30 | 3 | 0/1 (0%) | $0.13 | `claude-sonnet-5` | `f1150802` | `bae0147` |  |
| 2026-10-06 15:46 | 29 | 2 | 1/1 (100%) | $0.02 | `claude-sonnet-5` | `f1150802` | `bae0147` |  |
| 2026-10-06 15:46 | 30 | 3 | 1/1 (100%) | $0.02 | `claude-sonnet-5` | `f1150802` | `bae0147` |  |
| 2026-10-06 15:48 | 12-the-query-is-their-words | 1 | 13/13 (100%) | $0.24 | `claude-sonnet-5` | `f1150802` | `bae0147` | 038 country as a setting |
| 2026-10-06 15:48 | 30 | 1 | 14/15 (93%) | $0.09 | `claude-sonnet-5` | `f1150802` | `bae0147` | the cast, after the country line |
| 2026-10-06 15:48 | 30 | 2 | 14/15 (93%) | $0.19 | `claude-sonnet-5` | `f1150802` | `bae0147` | the cast, cases kept apart |
| 2026-10-06 15:49 | 30 | 2 | 15/15 (100%) | $0.19 | `claude-sonnet-5` | `7746a22d` | `bae0147` | the cast, fold is memories only |
| 2026-10-06 15:49 | 29 | 2 | 6/6 (100%) | $0.02 | `claude-sonnet-5` | `7746a22d` | `bae0147` |  |
| 2026-10-06 21:58 | noor-the-usual-past-250 | 1 | 0/1 (0%) | $0.06 | `claude-sonnet-5` | `e3511c2b` | `3cd7874` |  |
| 2026-10-06 21:58 | first-person-is-theirs | 1 | 1/1 (100%) | $0.04 | `claude-sonnet-5` | `e3511c2b` | `3cd7874` |  |
| 2026-10-06 21:58 | full-says-so-once | 1 | 1/1 (100%) | $0.01 | `claude-sonnet-5` | `e3511c2b` | `3cd7874` |  |
| 2026-10-06 21:58 | own-thread-uses-what-it-knows | 1 | 1/1 (100%) | $0.02 | `claude-sonnet-5` | `e3511c2b` | `3cd7874` |  |
| 2026-10-06 22:01 | noor-the-usual-past-250 | 1 | 1/1 (100%) | $0.03 | `claude-sonnet-5` | `e3511c2b` | `3cd7874` |  |
| 2026-10-07 16:12 | 31 | 1 | 18/18 (100%) | $0.80 | `claude-sonnet-5` | `91ff6dcb` | `f89eb787` |  |
| 2026-10-10 17:30 | q-left-to-do | 1 | 1/1 (100%) | $0.00 | `claude-sonnet-5` | `91ff6dcb` | `5ba8ba1a` | harness smoke |
| 2026-10-10 17:30 | terse-milk | 1 | 1/1 (100%) | $0.05 | `claude-sonnet-5` | `91ff6dcb` | `5ba8ba1a` | harness smoke |
| 2026-10-10 18:01 | all | 1 | 563/609 (92%) | $11.20 | `claude-sonnet-5` | `91ff6dcb` | `2e743594` | swarm baseline, full set, base 2e743594 |
| 2026-10-10 18:02 | screen | 1 | 64/65 (98%) | $1.00 | `claude-sonnet-5` | `91ff6dcb` | `2e743594` | swarm baseline, screen 1 |
| 2026-10-10 18:03 | screen | 1 | 62/65 (95%) | $0.97 | `claude-sonnet-5` | `91ff6dcb` | `2e743594` | swarm baseline, screen 2 |
| 2026-10-10 18:13 | 32 | 1 | 24/24 (100%) | $0.05 | `claude-sonnet-5` | `0ade4291` | `96cc2f62` | 042 reminders: the label cases, first run |
| 2026-10-10 18:13 | member-note-steers-labels | 1 | 1/1 (100%) | $0.00 | `claude-sonnet-5` | `0ade4291` | `96cc2f62` | 042 reminders: injection member-note-steers-labels |
| 2026-10-10 18:13 | note-dictates-its-own-name | 1 | 1/1 (100%) | $0.00 | `claude-sonnet-5` | `0ade4291` | `96cc2f62` | 042 reminders: injection note-dictates-its-own-name |
| 2026-10-10 18:14 | thing-says-label-me-none | 1 | 1/1 (100%) | $0.00 | `claude-sonnet-5` | `0ade4291` | `96cc2f62` | 042 reminders: injection thing-says-label-me-none |
| 2026-10-10 18:14 | forwarded-page-dictates-a-label | 1 | 1/1 (100%) | $0.00 | `claude-sonnet-5` | `0ade4291` | `96cc2f62` | 042 reminders: injection forwarded-page-dictates-a-label |
| 2026-10-10 20:01 | 17 | 1 | 34/37 (92%) | $1.21 | `claude-sonnet-5` | `b6223f6e` | `0909e1e1` | pairing fix: account_facts names the threads that pick each calendar, on the composite |
| 2026-10-10 20:23 | 15 | 1 | 22/23 (96%) | $0.59 | `claude-sonnet-5` | `bd84f3e2` | `f0971b14` | answer.md: a question an earlier reply answered is read again; composite at medium |
| 2026-10-10 20:23 | 17 | 1 | 34/37 (92%) | $1.08 | `claude-sonnet-5` | `bd84f3e2` | `f0971b14` | same line, principle 17 for the cost of it |
| 2026-10-10 20:24 | history-reply-not-evidence | 1 | 1/1 (100%) | $0.02 | `claude-sonnet-5` | `bd84f3e2` | `f0971b14` | read-again line, repeat 1 |
| 2026-10-10 20:24 | history-reply-not-evidence | 1 | 1/1 (100%) | $0.01 | `claude-sonnet-5` | `bd84f3e2` | `f0971b14` | read-again line, repeat 2 |
| 2026-10-13 11:09 | stay-in-thread-moved-without-calendar | 1 | 1/1 (100%) | $0.06 | `claude-sonnet-5` | `bd84f3e2` | `00c94de8` |  |
| 2026-10-13 11:09 | stay-in-thread-moved-with-calendar-none-picked | 1 | 0/1 (0%) | $0.06 | `claude-sonnet-5` | `bd84f3e2` | `00c94de8` |  |
| 2026-10-13 11:11 | stay-in-thread-moved-with-calendar-none-picked | 1 | 1/1 (100%) | $0.06 | `claude-sonnet-5` | `7152c916` | `00c94de8` |  |
| 2026-10-13 11:11 | stay-in-thread-moved-without-calendar | 1 | 0/1 (0%) | $0.05 | `claude-sonnet-5` | `7152c916` | `00c94de8` |  |
| 2026-10-13 11:11 | stay-in-thread-moved-without-calendar | 2 | 1/1 (100%) | $0.04 | `claude-sonnet-5` | `7152c916` | `00c94de8` |  |
| 2026-10-13 13:05 | answer-known-fact-still-not-sure | 1 | 1/1 (100%) | $0.04 | `claude-sonnet-5` | `bd84f3e2` | `19b25e1f` | v2 warm-up |
| 2026-10-13 13:06 | block1 | 1 | 29/30 (97%) | $0.64 | `claude-sonnet-5` | `bd84f3e2` | `19b25e1f` | v2 base block1, 19b25e1f |
| 2026-10-13 13:07 | screen | 1 | 67/68 (98%) | $0.96 | `claude-sonnet-5` | `bd84f3e2` | `19b25e1f` | v2 base screen, 19b25e1f |
| 2026-10-13 13:46 | block2 | 1 | 28/30 (93%) | $0.53 | `claude-sonnet-5` | `bd84f3e2` | `19b25e1f` | v2 base block2, 19b25e1f |
| 2026-10-13 13:57 | screen | 1 | 64/68 (94%) | $1.17 | `claude-sonnet-5` | `40b3099a` | `19b25e1f` | v2 round 1 composite screen (8 candidates), on 19b25e1f |
| 2026-10-13 13:59 | screen | 1 | 66/68 (97%) | $0.34 | `claude-haiku-5-5` | `40b3099a` | `19b25e1f` | v2 round 1 composite screen with filing on Haiku 5.5 |
| 2026-10-13 14:31 | 08 | 1 | 40/43 (93%) | $1.35 | `claude-sonnet-5` | `ec0931f5` | `ce47a53c` | earlier rows go on the calendar by id, 018 AC-25 and 019 AC-11 joins |
| 2026-10-13 15:00 | screen | 1 | 62/68 (91%) | $0.53 | `claude-haiku-5-5` | `2bc7abea` | `ad719c92` | v2 round 2 composite screen (round 1 composite plus five), on ad719c92 |
| 2026-10-13 15:02 | screen | 1 | 64/68 (94%) | $0.31 | `claude-haiku-5-5` | `2bc7abea` | `ad719c92` | v2 round 2 composite without effort low, bisect screen |
| 2026-10-13 15:24 | screen | 1 | 61/68 (90%) | $0.16 | `claude-haiku-5-5` | `786655b5` | `ad719c92` | v2 final composite screen: rounds 1 to 3, filing and answering on Haiku 5.5 |
| 2026-10-13 15:26 | holdout | 1 | 121/132 (92%) | $0.26 | `claude-haiku-5-5` | `786655b5` | `ad719c92` | v2 final composite holdout, sealed, run once |
| 2026-10-13 15:36 | all | 1 | 563/637 (88%) | $1.06 | `claude-haiku-5-5` | `786655b5` | `ad719c92` | v2 final composite, full set |
| 2026-10-13 15:39 | holdout | 1 | 124/132 (94%) | $0.83 | `claude-haiku-5-5` | `786655b5` | `ad719c92` | v2 final composite with answering kept on Opus 5, holdout |
| 2026-10-13 15:48 | all | 1 | 562/637 (88%) | $2.12 | `claude-haiku-5-5` | `786655b5` | `ad719c92` | v2 final composite with answering kept on Opus 5, full set |
| 2026-10-13 16:49 | 09 | 1 | 51/56 (91%) | $0.06 | `claude-haiku-5-5` | `5e2ba75a` | `3b4a765e` | guards on the branch, answering on Haiku 5.5: principle 09 |
| 2026-10-13 16:51 | holdout | 1 | 124/132 (94%) | $0.27 | `claude-haiku-5-5` | `5e2ba75a` | `3b4a765e` | final with guards, answering on Haiku 5.5: holdout |
| 2026-10-13 17:01 | all | 1 | 560/639 (88%) | $1.07 | `claude-haiku-5-5` | `5e2ba75a` | `3b4a765e` | final with guards, answering on Haiku 5.5: full set |
| 2026-10-13 18:02 | 09 | 1 | 47/52 (90%) | $0.06 | `claude-haiku-5-5` | `83ea4335` | `173af6ce` | flaky-evals: Haiku lookup baseline on main |
| 2026-10-13 18:02 | 11 | 1 | 25/30 (83%) | $0.02 | `claude-haiku-5-5` | `83ea4335` | `173af6ce` | flaky-evals: Haiku lookup baseline on main |
| 2026-10-13 18:02 | 12 | 1 | 3/5 (60%) | $0.00 | `claude-haiku-5-5` | `83ea4335` | `173af6ce` | flaky-evals: Haiku lookup baseline on main |
| 2026-10-13 18:02 | all | 1 | 16/18 (89%) | $0.01 | `claude-haiku-5-5` | `83ea4335` | `173af6ce` | flaky-evals: Haiku lookup holdout baseline |
| 2026-10-13 18:03 | screen | 1 | 62/68 (91%) | $0.19 | `claude-haiku-5-5` | `83ea4335` | `173af6ce` | flaky-evals: screen baseline on main |
| 2026-10-13 18:04 | 09 | 1 | 49/52 (94%) | $0.06 | `claude-haiku-5-5` | `a9ddd73d` | `173af6ce` | flaky-evals: Haiku lookup rule, iteration 1 |
| 2026-10-13 18:04 | 11 | 1 | 27/30 (90%) | $0.02 | `claude-haiku-5-5` | `a9ddd73d` | `173af6ce` | flaky-evals: Haiku lookup rule, iteration 1 |
| 2026-10-13 18:04 | 12 | 1 | 4/5 (80%) | $0.01 | `claude-haiku-5-5` | `a9ddd73d` | `173af6ce` | flaky-evals: Haiku lookup rule, iteration 1 |
| 2026-10-13 18:05 | all | 1 | 18/18 (100%) | $0.01 | `claude-haiku-5-5` | `a9ddd73d` | `173af6ce` | flaky-evals: Haiku lookup rule, iteration 1 holdout |
| 2026-10-13 18:05 | screen | 1 | 64/68 (94%) | $0.21 | `claude-haiku-5-5` | `a9ddd73d` | `173af6ce` | flaky-evals: Haiku lookup rule, iteration 1 screen |
| 2026-10-13 18:06 | lookups | 3 | 7/9 (78%) | $0.03 | `claude-haiku-5-5` | `a9ddd73d` | `173af6ce` | flaky-evals: lookup cases x3 on iteration 1 |
| 2026-10-13 18:07 | 08 | 1 | 35/38 (92%) | $0.14 | `claude-haiku-5-5` | `a9ddd73d` | `173af6ce` | flaky-evals: 08 with the scope cases moving to 11, iteration 1 prompt |
| 2026-10-13 18:09 | ask-first-write-waits-as-waiting | 3 | 1/1 (100%) | $0.02 | `claude-haiku-5-5` | `a9ddd73d` | `173af6ce` | flaky-evals: judge without the label |
| 2026-10-13 18:10 | block1 | 1 | 19/19 (100%) | $0.02 | `claude-haiku-5-5` | `a9ddd73d` | `173af6ce` | flaky-evals: preservation, lookup rule iteration 1 |
| 2026-10-13 18:10 | block2 | 1 | 17/19 (90%) | $0.02 | `claude-haiku-5-5` | `a9ddd73d` | `173af6ce` | flaky-evals: preservation, lookup rule iteration 1 |
| 2026-10-13 18:45 | 08 | 1 | 35/38 (92%) | $0.15 | `claude-haiku-5-5` | `22a95fe0` | `565503cd` | flaky-evals: code checks and answering round |
| 2026-10-13 18:46 | 09 | 1 | 64/70 (91%) | $0.06 | `claude-haiku-5-5` | `22a95fe0` | `565503cd` | flaky-evals: code checks and answering round |
| 2026-10-13 18:46 | 11 | 1 | 29/30 (97%) | $0.02 | `claude-haiku-5-5` | `22a95fe0` | `565503cd` | flaky-evals: code checks and answering round |
| 2026-10-13 18:46 | 12 | 1 | 4/5 (80%) | $0.00 | `claude-haiku-5-5` | `22a95fe0` | `565503cd` | flaky-evals: code checks and answering round |
| 2026-10-13 18:46 | classify | 1 | 21/21 (100%) | $0.01 | `claude-haiku-5-5` | `22a95fe0` | `565503cd` | flaky-evals: code checks and answering round |
| 2026-10-13 18:46 | judge | 1 | 19/19 (100%) | $0.03 | `claude-haiku-5-5` | `22a95fe0` | `565503cd` | flaky-evals: code checks and answering round |
| 2026-10-13 18:47 | answer | 1 | 112/121 (93%) | $0.95 | `claude-haiku-5-5` | `22a95fe0` | `565503cd` | flaky-evals: code checks and answering round |
| 2026-10-13 18:48 | screen | 1 | 65/68 (96%) | $0.19 | `claude-haiku-5-5` | `22a95fe0` | `565503cd` | flaky-evals: code checks and answering round |
| 2026-10-14 11:07 | open | 3 | 11/14 (79%) | $0.07 | `claude-haiku-5-5` | `22a95fe0` | `1906c911` | flaky-evals: open cases round |
| 2026-10-14 11:08 | 09 | 1 | 67/70 (96%) | $0.06 | `claude-haiku-5-5` | `22a95fe0` | `1906c911` | flaky-evals: open cases round |
| 2026-10-14 11:09 | 11 | 1 | 29/30 (97%) | $0.02 | `claude-haiku-5-5` | `22a95fe0` | `1906c911` | flaky-evals: open cases round |
| 2026-10-14 11:09 | 12 | 1 | 5/5 (100%) | $0.01 | `claude-haiku-5-5` | `22a95fe0` | `1906c911` | flaky-evals: open cases round |
| 2026-10-14 11:09 | 08 | 1 | 5/5 (100%) | $0.04 | `claude-haiku-5-5` | `22a95fe0` | `1906c911` | flaky-evals: open cases round |
| 2026-10-14 11:09 | 11 | 1 | 6/7 (86%) | $0.00 | `claude-haiku-5-5` | `22a95fe0` | `1906c911` | flaky-evals: open cases round |
| 2026-10-14 11:09 | 12 | 1 | 15/15 (100%) | $0.03 | `claude-haiku-5-5` | `22a95fe0` | `1906c911` | flaky-evals: open cases round |
| 2026-10-14 11:10 | screen | 1 | 66/68 (97%) | $0.21 | `claude-haiku-5-5` | `22a95fe0` | `1906c911` | flaky-evals: open cases round |
| 2026-10-14 11:11 | stub3 | 3 | 3/3 (100%) | $0.02 | `claude-haiku-5-5` | `22a95fe0` | `1906c911` | flaky-evals: fitting stub results |
| 2026-10-14 11:12 | 12 | 1 | 20/20 (100%) | $0.04 | `claude-haiku-5-5` | `22a95fe0` | `1906c911` | flaky-evals: provenance after the security fixes |
| 2026-10-15 14:00 | 27 | 1 | 6/8 (75%) | $0.02 | `claude-haiku-5-5` | `22a95fe0` | `a7c51898` | PR 119: earlier email masked, own conversation; two new mail cases |
| 2026-10-15 14:01 | an-earlier-email-is-not-filed-again | 1 | 1/1 (100%) | $0.00 | `claude-haiku-5-5` | `22a95fe0` | `a7c51898` | PR 119: the case's date in the account's clock |
| 2026-10-17 09:48 | 23 | 1 | 19/22 (86%) | $0.05 | `claude-haiku-5-5` | `22a95fe0` | `73810f21` | tidy: photos baseline before a photo rides on the row it became |
| 2026-10-17 09:50 | 23 | 1 | 20/23 (87%) | $0.05 | `claude-haiku-5-5` | `4b12e332` | `73810f21` | tidy: photos after, a photo rides on the row it became |
| 2026-10-17 09:51 | 23 | 1 | 23/23 (100%) | $0.03 | `claude-haiku-5-5` | `9d9f66c8` | `73810f21` | tidy: photos after, second pass (buying stays a picture, no picture row beside) |

## Full runs by principle

| # | 2026-09-16 21:33 | 2026-09-17 11:41 | 2026-09-17 11:49 | 2026-09-17 12:26 | 2026-10-02 00:04 | 2026-10-02 00:20 | 2026-10-02 23:10 | 2026-10-10 18:01 | 2026-10-13 15:36 | 2026-10-13 15:48 | 2026-10-13 17:01 | 2026-10-13 18:02 | 2026-10-13 18:05 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 01 | 12/12 | 15/16 | 14/16 | 14/16 | 15/16 | 15/16 | 16/16 | 17/17 | 17/17 | 17/17 | 17/17 |  |  |
| 02 | 11/14 | 13/16 | 14/16 | 13/16 | 15/16 | 16/16 | 17/19 | 18/21 | 20/21 | 17/21 | 19/21 |  |  |
| 03 | 17/17 | 17/17 | 17/17 | 14/17 | 16/17 | 17/17 | 17/17 | 18/18 | 18/18 | 18/18 | 17/18 |  |  |
| 04 | 14/14 | 16/16 | 15/16 | 15/16 | 15/16 | 15/16 | 15/16 | 17/17 | 17/17 | 17/17 | 16/17 |  |  |
| 05 | 13/14 | 13/14 | 13/14 | 13/14 | 13/14 | 13/14 | 14/14 | 16/17 | 13/17 | 14/17 | 16/17 |  |  |
| 06 | 9/12 | 11/12 | 10/12 | 11/12 | 11/12 | 11/12 | 12/12 | 11/12 | 10/12 | 10/12 | 11/12 |  |  |
| 07 | 8/12 | 9/13 | 8/13 | 8/13 | 12/13 | 12/13 | 13/13 | 13/14 | 13/14 | 13/14 | 13/14 |  |  |
| 08 | 8/11 | 8/12 | 10/12 | 10/12 | 26/28 | 27/28 | 26/28 | 38/40 | 32/40 | 32/40 | 32/42 |  |  |
| 09 | 50/54 | 51/55 | 51/55 | 50/55 | 46/55 | 54/55 | 54/55 | 52/56 | 48/56 | 47/56 | 49/56 |  |  |
| 10 | 30/32 | 30/32 | 29/32 | 31/32 | 31/32 | 30/32 | 31/32 | 31/32 | 29/32 | 29/32 | 30/32 |  |  |
| 11 | 31/36 | 30/37 | 34/37 | 35/37 | 34/37 | 36/37 | 35/37 | 35/37 | 30/37 | 29/37 | 30/37 |  |  |
| 12 | 13/16 | 16/18 | 12/18 | 13/18 | 15/18 | 18/18 | 18/18 | 19/20 | 13/20 | 17/20 | 9/20 |  |  |
| 13 | 49/59 | 57/59 | 34/59 | 56/59 | 50/54 | 52/54 | 53/54 | 53/56 | 50/56 | 50/56 | 51/56 |  |  |
| 14 | 13/14 | 14/19 | 0/19 | 14/19 | 14/17 | 16/17 | 17/17 | 19/19 | 18/19 | 19/19 | 18/19 |  |  |
| 15 | 13/14 | 13/14 | 0/14 | 13/14 | 11/14 | 14/14 | 15/15 | 19/19 | 22/23 | 23/23 | 23/23 |  |  |
| 16 | 6/6 | 6/6 | 0/6 | 6/6 | 6/6 | 6/6 | 6/6 | 7/7 | 5/7 | 7/7 | 5/7 |  |  |
| 17 | 30/31 | 33/33 | 0/33 | 33/33 | 31/33 | 33/33 | 30/33 | 32/37 | 35/37 | 36/37 | 35/37 |  |  |
| 18 | 14/14 | 14/14 | 0/14 | 14/14 | 14/14 | 14/14 | 14/14 | 14/14 | 14/14 | 13/14 | 14/14 |  |  |
| 19 | 17/18 | 17/20 | 0/20 | 19/20 | 20/20 | 19/20 | 19/20 | 21/21 | 21/21 | 21/21 | 21/21 |  |  |
| 20 | 9/11 | 10/13 | 0/13 | 13/13 | 4/6 | 6/6 | 5/6 | 6/6 | 5/6 | 5/6 | 4/6 |  |  |
| 2026 |  |  |  |  |  |  |  |  |  |  |  | 16/18 | 18/18 |
| 21 | 7/11 | 11/13 | 0/13 | 11/13 | 11/13 | 13/13 | 12/13 | 14/14 | 13/14 | 13/14 | 13/14 |  |  |
| 22 | 7/10 | 9/10 | 0/10 | 9/10 | 9/10 | 9/10 | 10/10 | 10/10 | 10/10 | 9/10 | 10/10 |  |  |
| 23 |  |  |  |  | 22/22 | 21/22 | 20/22 | 20/22 | 22/22 | 19/22 | 20/22 |  |  |
| 24 |  |  |  |  | 5/5 | 5/5 | 5/5 | 5/6 | 6/6 | 5/6 | 6/6 |  |  |
| 25 |  |  |  |  | 6/6 | 6/6 | 6/6 | 5/6 | 5/6 | 5/6 | 5/6 |  |  |
| 26 |  |  |  |  | 4/4 | 4/4 |  |  |  |  |  |  |  |
| 27 |  |  |  |  | 5/5 | 5/5 | 4/5 | 5/6 | 5/6 | 5/6 | 5/6 |  |  |
| 28 |  |  |  |  |  |  | 6/12 | 12/13 | 13/13 | 13/13 | 13/13 |  |  |
| 29 |  |  |  |  |  |  |  | 18/18 | 18/18 | 18/18 | 18/18 |  |  |
| 30 |  |  |  |  |  |  |  | 0/16 | 0/16 | 0/16 | 0/16 |  |  |
| 31 |  |  |  |  |  |  |  | 18/18 | 17/18 | 17/18 | 16/18 |  |  |
| 32 |  |  |  |  |  |  |  |  | 24/24 | 24/24 | 24/24 |  |  |
