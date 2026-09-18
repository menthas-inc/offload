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

## Full runs by principle

| # | 2026-09-16 21:33 | 2026-09-17 11:41 | 2026-09-17 11:49 | 2026-09-17 12:26 |
| --- | --- | --- | --- | --- |
| 01 | 12/12 | 15/16 | 14/16 | 14/16 |
| 02 | 11/14 | 13/16 | 14/16 | 13/16 |
| 03 | 17/17 | 17/17 | 17/17 | 14/17 |
| 04 | 14/14 | 16/16 | 15/16 | 15/16 |
| 05 | 13/14 | 13/14 | 13/14 | 13/14 |
| 06 | 9/12 | 11/12 | 10/12 | 11/12 |
| 07 | 8/12 | 9/13 | 8/13 | 8/13 |
| 08 | 8/11 | 8/12 | 10/12 | 10/12 |
| 09 | 50/54 | 51/55 | 51/55 | 50/55 |
| 10 | 30/32 | 30/32 | 29/32 | 31/32 |
| 11 | 31/36 | 30/37 | 34/37 | 35/37 |
| 12 | 13/16 | 16/18 | 12/18 | 13/18 |
| 13 | 49/59 | 57/59 | 34/59 | 56/59 |
| 14 | 13/14 | 14/19 | 0/19 | 14/19 |
| 15 | 13/14 | 13/14 | 0/14 | 13/14 |
| 16 | 6/6 | 6/6 | 0/6 | 6/6 |
| 17 | 30/31 | 33/33 | 0/33 | 33/33 |
| 18 | 14/14 | 14/14 | 0/14 | 14/14 |
| 19 | 17/18 | 17/20 | 0/20 | 19/20 |
| 20 | 9/11 | 10/13 | 0/13 | 13/13 |
| 21 | 7/11 | 11/13 | 0/13 | 11/13 |
| 22 | 7/10 | 9/10 | 0/10 | 9/10 |
