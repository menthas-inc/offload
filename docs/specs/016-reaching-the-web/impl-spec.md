# 016 Reaching the web, implementation spec

**Status:** drafted 2026-09-14, after the three review passes and the gate
**Reads with:** `feature-spec.md` and `research.md` in this folder

## Data flow

One new tool in the planner's hands, and one new model call behind it.

1. The planner, in `harness/plan.py`, gets a client tool `look_up`. It is an
   ordinary tool: the loop already knows how to call one, and nothing about
   server tools reaches this loop. That is the whole point of the quarantine and
   it is what keeps `pause_turn`, the mixed server and client turn, and the
   encrypted-block round trip out of a loop that handles none of them today.
2. The worker answers the call in a new module, `offload_agent/reader.py`. It
   builds a **fresh conversation**, three messages at most, with no thread
   contents, no notes and no history, and calls the model with the provider's
   `web_search` and `web_fetch` enabled and no client tools at all.
3. The reader's answer crosses back as a validated object. Anything else, a
   title, a quoted citation, a raw completion, stops there.
4. The planner files and replies as it does today, with the object's fields
   available to it and its sources recorded against the turn.
5. The Core API records the sources on the turn and one telemetry row, and the
   clients read the sources the same two ways they read a reply.

## The tool the planner sees

```
look_up(
  question: str | None,   # <= 200 chars, built from the dump's words only
  url: str | None,        # a link that appeared in this dump
  want: list[str],        # the fields it needs back, from a closed set
)
```

Exactly one of `question` and `url`. `want` names what the answer is for, from
`{date, time, place, dates_range, title, artist, price, hours, forecast, fact}`,
which is also what selects the reader's output schema.

**`url` is validated against the dump, not trusted.** The Core API holds the
message text; the tool call is refused unless the URL appears in that message,
matched as a link the way the composer recognises one rather than as a substring.
That is AC-16 and AC-25, enforced in the one place a model cannot argue with.

**`question` is validated for provenance.** Every token in it must appear in the
dump, allowing for casing and punctuation, or the call is refused with a reason
the model can act on. This is coarse and it is deliberate: it makes AC-24 a
property of the code rather than a hope about the prompt, and the failure mode,
a refused lookup that was actually fine, costs a lookup rather than a leak.

## The reader

`reader.py`, a new call site, routed through the **same masked harness every
other model call uses**. It is the largest new source of untrusted text the
system has and a bespoke client here would walk around the control that makes
hosted tracing acceptable (`docs/tech/decisions.md`, no content in Langfuse).

- **Tools**: `web_search_20250305` and `web_fetch_20250910`, the basic versions,
  which are the ones eligible for zero data retention. Dynamic filtering is the
  newer versions' feature and is not worth losing ZDR for at our volume.
- **`max_uses`**: search 3 per turn, counted across every `look_up` in that turn
  and passed down, so the bound is the turn's rather than the call's. Fetch 1
  when the lookup carries a URL, 0 otherwise.
- **`max_content_tokens`**: 10,000.
- **`use_cache`**: false, until the vendor answers what the cache retains under
  our retention setting. Written as a constant with that sentence next to it.
- **`blocked_domains`**: the backstop list for the one refusal category that is
  never a judgement call.
- **Output**: a forced tool call, so OFF-5's boundary is a schema rather than a
  parse. One repair retry, then give up and return `unsure`.
- **On a validation failure**, the log line carries the field name and the error
  type. Never the completion.

Returns:

```python
@dataclass(frozen=True)
class Found:
    fields: dict[str, str]        # only the keys in `want`
    sources: list[Source]         # domain and url, nothing else
    unsure: bool
    label: str                    # closed set, coerced to "other" if unknown
```

## Data model

Three small things and one column pair.

```sql
-- What the turn read, for the chips. Scoped like everything else.
create table turn_sources (
  id uuid primary key default uuidv7(),
  account_id uuid not null references accounts (id) on delete cascade,
  turn_id uuid not null,
  domain text not null,
  url text not null,
  created_at timestamptz not null default now()
);
create index turn_sources_turn_idx on turn_sources (turn_id);

-- What kind of lookup happened, for deciding what to build next.
-- No query, no URL, no page. A label from a closed set, an outcome, a cost.
create table lookups (
  id uuid primary key default uuidv7(),
  account_id uuid not null references accounts (id) on delete cascade,
  label text not null,
  kind text not null,             -- 'search' | 'read'
  outcome text not null,          -- 'used' | 'unused' | 'empty' | 'failed' | 'refused_bound'
  cost_micros integer not null,
  created_at timestamptz not null default now()
);
create index lookups_label_idx on lookups (label, created_at);

-- Which domains get read, with nobody attached. Aggregate by construction
-- rather than by policy: there is no account id to join on, deliberately.
create table domain_reads (
  domain text not null,
  day date not null,
  count integer not null default 0,
  primary key (domain, day)
);

alter table accounts
  add column web_search_enabled boolean not null default true,
  add column web_links_enabled boolean not null default true;
```

`domain_reads` is read only through a view that suppresses rows below a
threshold, so a count of one on a rare personal domain is not a re-identification
in an invite-only alpha.

## Volume and access

| Field | Number |
| --- | --- |
| Records per account | `turn_sources`: 0 on almost every turn. A heavy day is 20 dumps of which 5 look something up, so 8 rows a day, 3,000 a year. `lookups`: the same 5 a day. |
| Fan-out | Sources per turn: 0 typical, 6 hard maximum from the bounds. |
| Growth | Per active account per week: around 35 lookups and 55 source rows. `domain_reads` grows with distinct domains, not with accounts: hundreds of rows a year in total. |
| Read pattern | `turn_sources` is read once per turn settling, by the stream and by `GET /v1/messages/:id`, keyed by `turn_id`. `lookups` is read by nobody in the product: it is a table for us, queried by hand. `domain_reads` the same. |
| Write pattern | One insert per source and one per lookup, inside the transaction that records the turn's result. Bursty only in the sense that a turn is. |
| Sort and filter | `turn_sources` by `turn_id`. `lookups` by label and date. `domain_reads` by domain and day. |

- **Pagination:** none anywhere. Six rows is the maximum any screen reads.
- **Indexes:** `turn_sources (turn_id)` is the only one the product needs.
  `lookups (label, created_at)` is for us. `domain_reads` is keyed by its
  primary key.
- **Normalisation:** `domain` is stored alongside `url` rather than derived on
  read, because the chip draws the domain and parsing a URL in three clients is
  three parsers.
- **Partitioning:** no.

## Interfaces

- **`POST /internal/v1/lookup`** does not exist and must not. The reader runs in
  the worker and writes nothing: the sources and the telemetry ride home on the
  existing `turn-result` payload, which already carries what a turn did. One
  fewer endpoint, one fewer thing to authenticate.
- **`GET /v1/messages/:id`** gains `sources: [{domain, url}]`.
- **The SSE `done` event** gains the same field, beside `threads` and `changed`.
- **`GET /v1/settings`** and its update path gain the two switches.
- The clients gain no new call.

## Prompt budget, per OFF-8

The planner's prompt grows by one tool definition, about 200 tokens, and by
whatever a returned object contains, which is bounded by `want` and by the
schema: a few hundred tokens at most. **Page text and search results never enter
it.** The reader's own prompt is a system prompt, one dump-derived sentence and
up to 10,000 tokens of page text, in a conversation that is discarded when the
call returns. Nothing added grows with the age of an account.

## Edge cases

- **A turn with several lookups.** The search bound is the turn's, carried in the
  tool caller's state, not reset per call.
- **A lookup inside a quick add.** Not offered. `thread.quick_add` has two tools
  and is not a turn anybody watches.
- **A cancelled turn mid-lookup.** 017's problem, and the reader's call is the
  one that gets abandoned.
- **Both switches off.** The tool is not sent at all, rather than sent and
  refused, so the model never spends a call on something that cannot work. This
  is the same reasoning as the calendar tools in `plan.py` today.
- **A URL in a dump that is also in a note.** Provenance is checked against the
  message, so the note is irrelevant and the answer is the same either way.
- **A resume.** A lookup already made is not repeated: `landed` tells the
  planner what happened, and the sources already on the turn are not duplicated.

## Constitution check

SEC-1 is satisfied structurally rather than by prompt: the reader has no tools
and no data, and what crosses back is a schema. SEC-2 and OFF-3 by AC-30, the
switches read server-side at call time. OFF-1 by the three tables above holding
no content, by the reader's validation-failure logging, and by the refusal path
writing nothing anywhere. OFF-4 by keeping the derived fields and the URL and
discarding the page. OFF-5 by the forced tool call. OFF-8 by the quarantine.
OFF-6 is the flagged SHOULD, argued in the feature spec's gate.
