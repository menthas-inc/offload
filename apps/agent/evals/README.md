# The principle evals

How offload's model calls are measured. `/run-llm-tests` is the skill that runs
them and says how to read a result; this file is the shape of what is here.

```
evals/
  run.py            the harness, never the cases
  compare.py        two records side by side: accuracy, cost, latency; no model
  spend.py          the spend log and cap a run checks when EVAL_SPEND_LOG is set
  principles/       NN-slug.json, one principle and its cases
  contexts/         name.json, one account's fixture, shared by cases
  subsets/          screen, holdout and train, cut by make.py; --subset runs one
  holdout/          fresh sets written for a prompt change, per /test-llm
  results/          every run's record, not committed
  BASELINE.md       the last full run, written by --write-baseline
  history.jsonl     every run, one line each, appended by run.py, committed
  HISTORY.md        the same as a table, regenerated from history.jsonl
```

## A principle file

```json
{
  "statement": "One sentence of how offload behaves.",
  "why": "Why it behaves that way, so a failure can be argued about.",
  "sources": ["016 AC-5", "plan_v2.md: What you do not look up"],
  "cases": [ ... ]
}
```

The statement is the thing being tested. Cases are derived from it: the
ordinary path, the edges, and the negatives. When the product stops behaving
this way the file goes, and the diff says which behaviour was dropped.

## A case

```json
{
  "id": "note-forbids-dates",
  "why": "a note that forbids date questions wins over the table",
  "surface": "file",
  "input": "renew the contents insurance",
  "context": "behrooz",
  "notes": {"00000013-0000-0000-0000-000000000000": ["Never ask about dates here"]},
  "looking_at": "00000013-0000-0000-0000-000000000000",
  "expect": {"asks": "none", "files_something": true, "say": null}
}
```

- `surface` is one of `file`, `answer`, `classify`, `judge`,
  `nightly`. It decides which model call runs and which `expect` keys apply.
- `input` is the dump, the question, the typed reply, or for `nightly`
  either the list of notes or `{thread, notes, messages}` (an ordinary
  thread's pass, which may learn) or `{thread, notes, candidates}` (the
  default thread's, which suggests threads).
- `context` names a file in `contexts/`. Any fixture key on the case replaces
  the context's value for that key wholesale.
- `expect` holds the checks. Mechanical keys are exact; `rubric` is marked by
  a judge model over the transcript of what offload did and said, and runs only
  when every mechanical check passed.
- `label_pending` holds a question for Behrooz. The case states a guess and is
  skipped until the field is removed.
- `live` marks a case that reaches the real web. Skipped unless `--live`.

## Fixture keys

| key | shape | used by |
| --- | --- | --- |
| `threads` | `[{id, name, default?}]`; `[]` means an account with none | all |
| `looking_at` | thread id on screen | file, answer |
| `notes`, `notes_from_members`, `notes_from_apps` | `{thread id: [text or {text, writtenAt}]}` | file, answer |
| `rows` | a list, or `{thread id: [rows]}` in the Core API's row shape | file, answer |
| `facts` | what `account_facts` returns | answer |
| `calendars`, `events`, `calendar_waits` | what the calendar tools return; `calendar_waits` is the reason a write waits | file, answer |
| `has_calendar`, `may_search`, `may_read_links` | the switches | file, answer |
| `country` | two letters, or `null` for not known | file, answer |
| `today` | the date line, default Friday 11 September 2026 | all |
| `time_zone` | the device's IANA zone, default Europe/Lisbon; `null` for UTC | file, answer |
| `history` | `[{role: person or offload, text}]` | file, answer |
| `answered` | `{field, label}`, the block a typed answer leaves | file |
| `country_override` | the country picked when asked | answer |
| `truncated` | the read hit its page | answer, file |
| `asides` | `[{kind: note or message, who: a member, you or offload, threadName, text}]`, what `search` returns beside its rows | answer |
| `lookup_result` | `{found: false}` or `{fields: {...}}` in place of the stub's | file, answer |
| `fail_tools` | `{tool or tool:N: error}`, the Core API refusing | file |
| `tool_errors` | `{tool: error}`, every call of it refused | file |
| `question_asked` | `{field, text, options}`, the open question | judge |
| `spoken` | `true` when the dump is a voice note written down; the input is the transcript | file |

## Expect keys

**file**: `filed` as `"none"`, a count, or a list of matchers each of which
some filing must satisfy: `tool`, `type`, `thread`, `thread_not`, `thread_id`,
`has`, `lacks`, `date`, `date_any`, `no_date`, `repeats`, `no_repeats`, `url`,
`reminder`, `priority_min`, `tags_include`, `no_tags`, `type_any`, `photo`,
`no_photo`, `body_has`, `body_no_digits`. Also `filed_count`, `filed_max`,
`not_filed` (matchers no filing may satisfy),
`files_something`, `creates_thread`, `say` as an exact string, `null` for
nothing, or `{contains, must_not_contain, max_words}`, `say_not`, `asks`,
`options`, `option_count`, `no_options`, `look_up`, `query_names_country`,
`query_must_not_contain`, `called`, `not_called`, `call_count`, `before`,
`calls_with`, `calls_with_none`, `must_not_contain`,
`transcript_must_not_contain`, `final_title_max_words`,
`final_title_min_words`, `step_present`, `rubric`.

**answer**: `reply` exact, `contains`, `must_not_contain`, `max_words`, `asks`,
`options`, `option_count`, `look_up`, `query_names_country`,
`query_must_not_contain`, `called`, `not_called`, `call_count`, `step_present`,
`rubric`. Writing is always a failure.

**classify**: `routes` as `answer` or `file`.

**judge**: `answers`, `whole`, `value` as `{day, to, time, tag, country}`.

**nightly**: `no_change`, `folds`, `supersedes`, `never_touches`, `adds`,
`learns`, `learned_has`, `learned_lacks`, `groups`, `rubric`. Removing a
person's note, touching another member's, or citing a dump it was not shown
is always a failure.

Everywhere: a dash, an emoji, a capitalised offload, or a self diagnosis in
anything offload wrote fails the case; on a lookup, the progress line is held
to 017's rules.

## Contexts

`three` is the suite's default account. `behrooz` is the eight thread one 018
was written against. `shared` is `behrooz` with Flat admin shared with Ana.
`calendar` is `behrooz` with a Google calendar connected. `sam` and `ana` are
the two accounts the brevity set used for calendar facts.

Ids are stable across contexts on purpose, so a case can name a thread by the
same id whichever context it picks. Add a context when three or more cases
would otherwise repeat the same fixture.
