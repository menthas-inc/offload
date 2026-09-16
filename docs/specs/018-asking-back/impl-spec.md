# 018 Asking back, implementation

**Feature spec:** `feature-spec.md`. **Decisions and the labelled set:** `research.md`.

## The shape in one paragraph

A filing turn gains one tool, `ask`, whose calls are collected by the harness and posted with the turn's result, where the Core API validates them against a closed field set and stores them as rows of a new `questions` table, at most two per turn, one open at a time. A question is returned to the clients as a field on the message, beside `waiting`. A tap posts an option index; the server applies the value to the row the question was about, writes the person's words as their own message, and settles, with no model involved. A typed message while a question is open is judged by the worker with one small structured call before the classifier, and the value is applied through an internal endpoint the same way. The country question is the one that runs a model on its answer: it re-runs the answering turn, read-only, with the chosen country as a closed value. Everything the model may ask is bounded by schema and by code; everything a person may answer is a value the server already knows how to apply.

```
worker      plan_v2.md + ASK_TOOL ──ask(field, text, options, target)──▶ Outcome.questions (≤2)
worker      POST /internal/v1/turn-result { ..., questions }
core-api    validate (field enum, template, caps, target ∈ this turn's landed) → insert questions (ordinal 1 open, 2 pending)
clients     envelope.question { id, field, text, options[label], ordinal }
person      tap ──POST /v1/questions/:id/answer { option }──▶ core-api applies value, inserts person message, settles
person      types ──POST /v1/dumps──▶ worker: judge(text, question) → POST /internal/v1/question-answer → then classify, plan
country     tap ──answer──▶ core-api enqueues dump.answer { country } → worker re-runs plan_answer read-only
```

## Data flow

### The asking turn

1. `plan()` runs as today with `TOOLS + [ASK_TOOL]` (and the calendar and web tools as before). The model files first; `ask` is a tool it calls after `add_content` or `add_note` for the row that needs a field, naming the row by the `contentId` that call returned.
2. The harness (`_run`) handles `ask` like `say`: no Core API call, the arguments are validated by the pydantic schema, appended to `Outcome.questions`, and answered with `{ok: true}`. The third call in a turn is answered `{ok: false, error: "limit_reached"}` and not recorded. `ask` is not a `FILING_TOOL` and does not count towards `worked` or `landed`.
3. The worker posts `questions` on the `answered` arm of `turn-result` only. A partial, failed or stopped turn carries none, so a question can never point at a filing that did not settle.
4. The Core API validates each question (below), rejects the whole list on any failure and settles the turn as if nothing had been asked, logging `question refused` with the field and the reason as enums. Accepted questions are inserted in the same transaction as the reply, idempotent on `(turn_id, ordinal)`.

### The answering turn

The same, with `ANSWER_TOOLS + [ASK_TOOL]`, and the schema restricted server-side to `field: country` with exactly two ISO codes as values. An answering turn's `ask` carries no target.

### A tap

`POST /v1/questions/:id/answer` with `{option: n}`:

1. Resolve the question by id, scoped to the caller's account, `state = 'open'`. Anything else is 404, including a question already answered on another device.
2. If `n` is the escape option: one conditional update `open → closed`, insert a person message in the conversation with the escape label as its text and a fresh `turn_id`, state `answered`. Return the envelope. No job.
3. Otherwise, in one transaction: re-resolve the target row; if it is deleted, or the field already holds a value set after the question was created, close the question and return the envelope unchanged. Else record the field's previous value on the question row, apply the value, mark the question `answered` with the option index and the answering message's id, insert the person message (label as text, fresh `turn_id`), and touch the thread so open panes reload. Return the envelope with `state: answered`.
4. Country: as 2 for the insert, then `enqueue(dump.answer, {messageId, conversationId, turnId, questionId, country})`, message state `seen`. The stream carries the rest exactly as a dump's does.
5. Promote the turn's pending second question to `open` when the first settles by any path, **and move it onto the message that settled it**: the answering message's envelope is what every client reads next, a tap's response and a typed answer's stream alike, so the second question hangs off it. The tap's response carries it as `question`. The question row is locked for the tap's transaction, so two devices tapping at once queue, and the second gets the 404.

### A typed message

`takeDump` is unchanged except that the enqueued job carries `openQuestionId` when the conversation has one. In the worker, before `classify`:

1. `judge_answer(text, question, today, week_start)`: one call on the sort model, forced tool `answer`, schema `{answers: bool, value: object | null}` where `value` is typed per field: `{day}` for a date, `{from, to}` for a span, `{day, time}` for a time, `{tag}` for a tag, `{country}` for a country, all in the wire forms of the value table below. The prompt is given the field, the question sentence, the option labels and today's date, never the thread or the notes. The week start is the device's and the worker has none, so the judge reads weeks as ending on Sunday, which is what the option labels the planner writes also mean; it does the reading of "next weekend" the planner already does. Code then checks shape and sense: the day forms, `from <= to`, within a year of today, a tag among the thread's values, a country among the two. A shape failure gets one repair retry (OFF-5); anything that still fails is `answers: false`.
2. If it answers: `POST /internal/v1/question-answer {questionId, jobId, value}`. The server applies it exactly as a tap would, with the person's own message as the answering message, and returns whether it applied. The worker then continues into classify and plan with `ctx.answered = {field, value}` as a labelled block ("They answered your question about the dates with 14th to 17th; that is already on the row. File the rest."), so the value is not filed twice and nothing else in the message is lost.
3. If it does not answer: `POST /internal/v1/question-close {questionId, jobId}` and continue as today.
4. Country: the judge's value is a country; the worker runs `plan_answer` with it as the override directly, no second job.

### Closing

- A new dump in the conversation closes the open question through step 3 above, or answers it.
- `takeDump` starting a new conversation after the gap closes any open question of the previous one. So does `DELETE` on a conversation.
- `undoTurn` on the asking turn closes its questions; on an answer's turn it writes `previous_value` back and leaves the question `answered`.

## Data model

### Volume and access

| Field | Estimate |
| --- | --- |
| Records per account | Asked on at most one dump in ten by the held-out rule: 2 a week typical, 10 a day heavy. Two years: 200 typical, 7,000 heavy. |
| Fan-out | Questions per turn: 0 nearly always, 1 sometimes, 2 rarely. Per conversation open at once: exactly one. |
| Growth | Bounded by dumps; a question is never created without a turn. |
| Read pattern | The current conversation read, the message read, and the stream's settled event, each needing the one open or pending question for a message; the answer route by id. |
| Write pattern | One insert per asked turn, one update per answer. Never bursty. |
| Sort and filter | By `message_id` for the envelope; by `conversation_id` where open, for the composer and for closing; by `turn_id` for Undo; by `id` and `account_id` for the answer. |

What follows: no pagination, the rows are read one at a time. Indexes: `(message_id)` where `state in ('open','pending')`; a partial unique index on `(conversation_id)` where `state = 'open'`, which is the one-open-question rule as a constraint rather than a check; `(turn_id)`. Nothing denormalised.

### Schema

```sql
create table questions (
  id                   uuid primary key default uuid_v7(),
  account_id           uuid not null references accounts (id) on delete cascade,
  conversation_id      uuid not null references conversations (id) on delete cascade,
  -- The person's message the turn was about, so the envelope finds it the way
  -- it finds `waiting`, and its text is what a country re-run answers again.
  -- (Built as such: the first draft said the reply, and a silent filing has none.)
  message_id           uuid not null references messages (id) on delete cascade,
  turn_id              uuid not null,
  ordinal              smallint not null check (ordinal in (1, 2)),
  field                text not null check (field in ('date', 'span', 'time', 'tag', 'country')),
  -- The row the answer fills. One of the two, or neither for country: a stay
  -- said as a sentence is a note, and a note takes a span too.
  target_content_id    uuid references content (id) on delete set null,
  target_note_id       uuid references notes (id) on delete set null,
  -- Template with the row's title in its slot, never free text.
  text                 text not null check (length(text) <= 80),
  -- [{label, value}]. Labels ≤ 24 chars, values typed per field; the client
  -- never sees the values and sends an index back.
  options              jsonb not null,
  state                text not null default 'pending'
                         check (state in ('pending', 'open', 'answered', 'closed')),
  answered_option      smallint,
  answered_message_id  uuid references messages (id) on delete set null,
  -- What the field held before the answer, for Undo. Null when nothing was set.
  previous_value       jsonb,
  -- The answer's own turn, so undoTurn can find what it changed.
  answer_turn_id       uuid,
  derived_from_untrusted boolean not null default false,
  created_at           timestamptz not null default now(),
  settled_at           timestamptz,
  unique (turn_id, ordinal)
);
create index questions_message_idx on questions (message_id) where state in ('open', 'pending');
create unique index questions_one_open_idx on questions (conversation_id) where state = 'open';
create index questions_turn_idx on questions (turn_id);
create index questions_answer_turn_idx on questions (answer_turn_id) where answer_turn_id is not null;
```

Migration `0046_asking_back.sql`. 0045 went to the reorder tweak that landed the same day.

`messages` does not change. The envelope gains `question` beside `waiting`, resolved by one `questionsFor(messageIds)` helper used in all four places the envelope is built (the dump response, `GET /v1/messages/:id`, the stream's `done`, `GET /v1/conversations/current`), the same shape `waitingFor` takes.

### What a value is, per field

| Field | Value | Applied to | Options offered |
| --- | --- | --- | --- |
| date | `YYYY-MM-DD` | `content.occurs_at` (day), or `due_at` on a task | end of this week, end of this month, in the account's day boundary (0035) and week start |
| span | `{from, to}` | `occurs_at` and `occurs_end_at` | the dates the thread's notes hold, when they hold any; otherwise no values, the escape alone, and the placeholder invites a typed span |
| time | `YYYY-MM-DDTHH:MM` | `occurs_at`, `all_day = false` | none from context; the model may offer up to four from the coming week |
| tag | `dimension:value` | appended to `content.tags`, one per dimension | the thread's existing values of the dimension, two to four |
| country | ISO code | nothing; carried into the re-run | the account's and the thread's |

The apply step is one `edit_content` in code, on the server, with the author rule of OFF-3 unchanged: the row was filed by this account in the asking turn, and the target is checked against that turn's landed rows at validation time. A tag or a country value is applied only when it is one of the values offered, checked in the apply step as well as in the worker, because the internal route is a second writer. A tag is never appended past the six a row may carry.

## Interfaces

### Tool: `ask` (worker, `harness/tools.py`)

```python
class AskOption(BaseModel):
    value: str = Field(max_length=40)      # typed per field, parsed server-side
    label: str | None = None               # ignored: the server words every label

class Ask(BaseModel):
    field: Literal["date", "span", "time", "tag", "country"]
    content_id: str | None                  # required unless field == "country"
    options: list[AskOption] = Field(min_length=1, max_length=4)
    # No free sentence. The server renders the template for the field; the
    # model supplies only what the template needs.
    title: str = Field(max_length=60)       # the row's own title, echoed
```

Description, in offload's voice: "Ask them for one field the row you just filed needs and nothing gave you: its dates, its by-when, its time, or the tag this thread groups by. Never a question about what they meant or where it goes. Only once per field per row, at most twice in a turn."

The five templates live in the Core API, one per field, and are the only sentences a question can be:

| Field | Template |
| --- | --- |
| date | Filed "{title}". By when? |
| span | Filed "{title}" as a stay. Which dates? |
| time | Filed "{title}". Which day and time? |
| tag | Filed "{title}". Which {dimension}? |
| country | For which country? |

The escape option is appended by the server: `{label: "Not that", value: null}`.

**The server words every label from its value** (review, 2026-09-16): a date as "20 September", a span as "10 to 12 October", a time as "Fri 18 Sep 10:00", a tag as its value capitalised, a country as its name. A label is written into the log as the person's own turn when tapped, read back into every later prompt as their words and indexed with them, so a page's sentence smuggled in as a label would become something they said. The model's `label` is accepted for compatibility and never stored. The same rule reaches `title`: the sentence uses the row's stored title, and the echoed one is ignored.

### Internal, `POST /internal/v1/turn-result`

The `answered` arm gains `questions?: Question[]`, max 2, validated with the schema above plus: `content_id` must be among the turn's landed content or note ids; `field` and each option value must parse, and are stored in the parser's form (a country uppercased, a tag normalised); a `tag` question's options share one dimension, which the thread already groups by: on a row's tags, or named as a word in a note of the person's own; `country` only from an answering turn that is not itself a country re-run, with exactly two ISO codes one of which is the account's; a field a note of the person's own forbids is refused. A list that fails is dropped whole and logged as `question refused {field, reason}`, reasons an enum: `too_many`, `bad_target`, `bad_value`, `too_few_values`, `no_target`, `wrong_path`, `forbidden_by_note`, `duplicate_field`, `bad_dimension`, `not_their_country`.

### Internal, `POST /internal/v1/question-answer` and `question-close`

Bearer token like the rest of the internal routes. Both take `{jobId, questionId}`; `question-answer` adds `value`. The job's message must be in the question's conversation, which is what ties the worker's judgement to the person's own message (the answering message is the job's). `question-answer` applies exactly as the tap route does and returns `{applied: bool}`.

### Client, `POST /v1/questions/:id/answer`

Body `{option: number}`. Returns the dump envelope: `{messageId, conversationId, state, turnId}` for the message the answer created, so the composer's existing wait path handles the country case and returns immediately for the rest. 401 unauthenticated, 404 for unknown, foreign or not-open, 400 for an option out of range.

### The envelope

```ts
question: {
  id: string;
  field: "date" | "span" | "time" | "tag" | "country";
  text: string;                 // the rendered template
  options: { label: string; kind: "primary" | "plain" | "value" }[];
  ordinal: 1 | 2;
} | null
```

`kind` is decided server-side and is the same for every field here: each value is `value` and the escape is `plain`. No question in this feature is a yes-or-no proposal, so no option is ever `primary`; the component keeps its proposal rule for 012's control. The client never sees a value.

### Agent context

`AnswerContext` gains `turns: list[Turn]`, loaded by the same `_TURNS` query `load()` uses, and `build_answer_blocks` adds the "Earlier in this conversation" block between the thread list and the question. `fit()` for both contexts counts and drops turns as today; an open question's sentence and its answer are ordinary turns in that tail (the reply message and the person's message) and so travel together or not at all, oldest first. `DumpContext` gains `answered: {field, value} | None`, rendered as one labelled block, never dropped. `AnswerContext` gains `country_override: str | None`, and `looking_at` with `looking_at_notes`: the thread the question was asked from and its own notes, loaded from the message's `looking_at_thread_id` the way a dump's is. The country question needs it, because the thread's name or notes are what put the person somewhere other than the account says. `fit_answer` drops the tail first and then the notes, oldest first, and never the thread.

## Dependencies

- 012: the `waiting` envelope field and the `Waiting` control on both clients, which the question sits beside and never replaces. Both can be on one turn; the proposal draws first.
- 013: the read-only answering path and its decision that no answering turn holds a write tool, unchanged. The country re-run is an answering turn.
- 015: notes as rules, which is what a "grouped by city" or "never ask about dates" note already is to the planner. The tag question's dimension comes from a note.
- 016: `_from_the_dump` admits the account's country as a closed value; the country override is admitted the same way and nothing else about the bound moves. The privacy page line changes before this ships.
- 017: the stream, the step line and Undo. The answer's turn is undone through `undoTurn`, extended to restore `previous_value`.
- The design system: `QuickReplies` in the answering group, extended from three options to five and given an accessible group; the component's `.jsx` and `.d.ts` are checked in and the adherence file regenerated.

## Edge cases

| | |
| --- | --- |
| The model asks three times | The third is refused in the harness; the two recorded stand. |
| The model asks about a row it did not file this turn | The list is refused whole at `turn-result`; the turn settles without questions. |
| The model asks a field the thread's notes forbid | The prompt carries the rule; the Core API also refuses a question whose field a note on that thread forbids, read at validation, so the prompt is not the only gate. |
| A tag question on a thread with one value | Refused by validation (fewer than two values). The row keeps no tag. |
| A span or date question with no values to offer | Accepted with the escape as its only option; the placeholder carries the typed form. |
| Two devices tap different options | The first conditional update wins; the second gets 404 and drops its chips silently. |
| A tap after the row was archived, moved or deleted | The target is re-resolved; a deleted row closes the question and changes nothing. An archived or moved row still takes the value. |
| A tap after the field was set by hand | The question closes and changes nothing; the person's message is still written. |
| A typed message that both answers and adds | The value is applied and the whole message files with the `answered` block, so the planner files the rest and not the value again. |
| A typed message that looks like an answer but does not parse | Not an answer. The question closes and the message files. |
| A question open when the conversation rolls over | Closed by `takeDump` when the new conversation starts. Its chips are gone on the next load. |
| Undo on the asking turn | Content and reply go as today; the turn's questions close. |
| Undo on an answer's turn | `previous_value` is written back to the target; the question stays answered. Unconditionally, as every turn Undo is: a hand edit of the same field made in the eight seconds between the answer and the Undo is reverted with it, which is what Undo on any turn does to a field that turn wrote. |
| The asking turn also proposed a calendar write | Both are on the envelope; the client draws the proposal first, the question under it; their lifetimes are independent. |
| The country re-run refuses or fails | The failure line and Try again as any answering turn; the question stays answered, since the country was given. |
| The judge call fails or times out | Treated as not an answer: the question closes and the dump files. Nothing is lost. |
| A question on a resumed (Finish it) turn | A resume is the same turn; its `turn-result` may carry questions, and `(turn_id, ordinal)` keeps a repeated post from doubling them. |
| Quick add | `ask` is not in `QUICK_ADD_TOOLS`, and `turn-result` refuses questions on a `thread.quick_add` job. |

## Constitution check

- **SEC-1.** The question's sentence is a server template; the model supplies a title it already filed and values the server parses. No untrusted text reaches a system prompt or a shell. The judge call sees the person's own message and the question, never the thread.
- **SEC-2, OFF-3.** The answer route resolves the question by id and account and applies the value to a row this account filed in that turn, checked at validation; membership and the author rule are unchanged.
- **OFF-1.** The question is content of the conversation and is stored with it. Logs and events carry `field`, option count, outcome and how answered. No text.
- **OFF-4.** `derived_from_untrusted` is inherited from the asking job's `sawApps`; no calendar event text can reach an option because options are values.
- **OFF-5.** `ask` and `answer` are validated schemas; a question that fails validation is dropped and logged.
- **OFF-6.** Every value applied is an `edit_content` on the reversible allowlist, with `previous_value` for Undo. No option sends or writes outside offload; a calendar write reached later still goes through 012's confirmation.
- **OFF-7.** Three design-system changes, each with a `decisions.md` entry and its impact field: five options, the accessible group, and the replaced trust-boundary sentence.
- **OFF-8.** The answering path's new tail is bounded by the same `fit()` ceiling as filing. One open question per conversation bounds what the envelope carries. Nothing here grows with account age.
- **DATA-1.** The schema above precedes the code.
- **DEV-1.** One tool, one table, one client route, two internal routes, two prompt sections. The judge call reuses `classify`'s shape.
