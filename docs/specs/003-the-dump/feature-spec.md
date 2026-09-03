# 003 The dump, feature spec

> The what and the why. No tech choices; those are in `impl-spec.md`.
>
> Revised after the review panel. What changed and why is at the bottom.

## Why

Everything shipped so far gets a person to an empty screen. 002 ends with an account, a thread and a composer that accepts text and does nothing with it. This is the first feature where offload does the thing it is named after.

It is also the feature that forces the architecture. Nothing in the product has yet talked to a model, and the whole stack for doing so is designed and unbuilt: a second service in a second language, a queue drained by a consumer that is not the producer, a token ledger, a structured prompt boundary, and an answer that has to find its way back to a client that is waiting. Picking the dump first means those get built against something small and real rather than against the first hard feature.

**What it deliberately does not do yet is file anything.** offload reads the dump, answers as though it had filed it, and files nothing. That is a decision with a cost, recorded in `docs/tech/decisions.md` under "The dump, decided during 003", with the condition that retires it: 004 ships the sorter and the `content` table. The purpose is to build and prove the plane end to end without also landing the first content table, the first sorter and the first tool call in the same change.

**It makes a live claim on `/privacy` false for that window**, which says filing is automatic, visible and reversible. That was put to the product owner and accepted rather than resolved, on the grounds that 004 follows immediately. It is recorded in `decisions.md` so the window is visible and closes on the same condition.

## What

A person types into the composer on the web app and sends it. offload marks the message seen, thinks, and answers in the same composer. The exchange stays as a conversation they can scroll.

**One surface in this feature: web.** The composer is drawn in all three kits and the phones already render an inert one. Web goes first because the iteration loop is a browser refresh rather than a native build, and because the prompt is the thing that will be tuned hardest here. iOS and Android follow in their own feature, against a server contract this one has already proven.

**Text only.** The kit's composer carries a camera and a microphone. Attachments bring object storage, encryption before storage, and for voice a new company receiving people's audio. Each is real work with its own privacy surface and none of it is needed to prove the plane.

**Invites stay internal until 004.** 002 held real invites back because a composer that cannot take a dump is a bad first impression. A composer that answers convincingly and filed nothing is a worse one, so the same discipline carries forward rather than lapsing quietly.

### The shape of one dump

```
person types, presses send
        │
        ├─ the message is stored, immediately, before anything else
        │
        ├─ 👀 appears on it: offload has it and has not answered
        │
        ├─ offload thinks
        │
        └─ the answer arrives whole, in the same composer
```

The message is stored first and unconditionally. Whatever happens after, a dump is never lost, which is the promise the product is built on and the one failure mode that would be unforgivable.

### Which conversation it joins

A dump joins the account's most recent conversation if that conversation was last spoken to within **six hours**, and starts a new one otherwise. Six hours is a working session: a morning of dumps is one conversation, and tomorrow morning is a new one. It means a follow-up like "actually make that the 21st" has the earlier turn to refer to, without a single conversation growing without bound for the life of an account.

`docs/specs/001-data-model/impl-spec.md` records which conversation a dump joins as deliberately open and a product decision. This answers it.

**A conversation has no title in this feature.** `conversations.title` stays null and the client shows a truncated echo of the first message, which is what the kit's prototype does. Naming a conversation is a model call with a reason to exist, and it does not have one while there is one screen and no list.

### What offload says back

The reply is a plain answer in offload's voice, naming what it would file and where. One model call, no tools.

It invents nothing about the account it was not given: the prompt carries a **bounded list of the account's most recently active threads**, so an answer that names a thread names one that exists. Bounded, not complete, because threads run to 300 on a heavy account and grow every week, and a prompt that carries all of them grows with the age of the account, which is the thing OFF-8 exists to stop.

Those thread names are trusted, server-sourced data and the dumped text is not. They travel in the prompt as separate content, never merged into one block, and neither goes in the system prompt.

### When it goes wrong

The model call is retried once. If it fails twice the composer says so, in a line that makes clear the dump itself is safe, and offers to try again. The message stays, marked failed, and appears in history like any other.

**A failed dump stays on screen and stays actionable.** It is not a toast: a toast clears itself after eight seconds and the person who stepped away would never know.

## Acceptance criteria

**The loop**

- **AC-1** A dump is stored before any processing begins, and is still stored if every subsequent step fails. A person who sends a dump and immediately loses connectivity finds it in their history on next load.
- **AC-2** A dump joins the account's most recent conversation when that conversation's last message is under six hours old, and starts a new conversation when it is older or when none exists.
- **AC-3** A sent message shows as seen until it is answered, and as answered once the reply lands. The two states are distinguishable in the API response, not inferred by the client from the presence of a reply. `queued` is internal and never observed by a client.
- **AC-4** The reply arrives without the client polling for it, and a client that disconnects and reconnects before the reply lands still receives it. A client that was disconnected when it landed can fetch it from a plain endpoint.
- **AC-5** A failed model call is retried once. After a second failure the message is marked failed, the person is told in a persistent affordance rather than a toast, and the dump is still present and readable.
- **AC-11** A duplicate send from a client that retried without hearing the response creates one message, not two.
- **AC-13** A second dump sent while the first is still being answered is accepted, stored, and answered in order within its conversation. The thinking indicator refers to exactly one message at a time.

**The model call**

- **AC-6** Every model call writes a usage row carrying the account, the job kind, the model, token counts, cost and latency. No call goes unrecorded, including one that failed.
- **AC-7** The system prompt is a fixed string carrying no account data of any kind. Dumped text reaches the model only inside a user turn, and the account's thread names travel as their own separate content, never concatenated with dumped text. All three are assertable against the request body the harness builds.
- **AC-10** The prompt is bounded and does not grow with the age of the account: at most the most recent turns of the conversation, at most the most recently active threads, and a total token ceiling. The three numbers are stated in the impl-spec and enforced in code, not assumed.
- **AC-14** A single dump above a stated character limit is refused before it is enqueued, with an error the composer can show. It is not silently truncated.
- **AC-22** The model returns a validated object, not bare text, and the reply is a field on it. A response failing validation gets one repair-and-revalidate retry, then raises and is logged (OFF-5). This is a different retry from AC-5, which covers a call that failed to complete at all: one is a malformed answer, the other is no answer, and conflating them means a model that reliably returns the wrong shape retries forever.

**Isolation and privacy**

- **AC-9** Every read and write in this feature is scoped to the account that owns it. A request for another account's conversation or message returns not found, not forbidden.
- **AC-15** The prompt assembled for one account contains no row belonging to another. Asserted directly against an assembled prompt with two accounts present, not inferred from the query.
- **AC-16** The Core API derives the account and conversation a worker result is written into from the job it minted, never from values the worker asserts. A result naming a different account is refused.
- **AC-8** No dumped text appears in an analytics event, an application log, a trace or span attribute, an error message, or the error stored on a failed job. Includes exceptions raised by the model SDK, which can carry the request body.
- **AC-17** An account disabled while an event stream is open stops receiving on that stream. Session revocation cannot depend only on the next request, because an open stream makes none.

**Observability**

- **AC-18** The loop emits an event when a dump is sent, when it is answered and when it fails, following the existing object-verb convention and carrying no content. Without these the feature's own purpose, proving the plane, is unobservable outside manual testing.

**Fairness**

- **AC-12** One account cannot occupy the worker. A stated cap on concurrent in-flight interactive jobs per account is enforced in the claim query, and the number is in the impl-spec. Testable by enqueueing above the cap for one account and asserting another account's dump is still claimed.

**The screen**

- **AC-19** The thinking state and the arriving answer are announced once each to a screen reader, through a polite live region, not per token or per frame.
- **AC-20** The seen marker carries the text alternative the design system specifies, and is not conveyed by the emoji alone.
- **AC-21** Reduced motion removes the thinking indicator's animation rather than shortening it, and the state stays legible without it.

## Out of scope

Named because each is a live temptation while building this one.

- **Filing anything.** No `content` table, no sorter, no thread assignment. The reply describes filing that does not happen. Retired by the condition in `decisions.md`.
- **Tools of any kind**, server-side or client-side. The response envelope is shaped to carry client actions later, and carries none now.
- **Attachments.** No object storage, no encryption at rest for blobs, no transcription. The composer's camera and microphone are not rendered.
- **iOS and Android.** The phones keep the inert composer they already have.
- **Conversation history as a screen.** There is no list of past conversations and no full-pane conversation view. The live composer and the unread-reopen path are the only ways back to one, and that is a stated limitation rather than an oversight.
- **Naming a conversation.** `title` stays null.
- **Retrieval, embeddings and memory.** Nothing is embedded, nothing is recalled, no memory is written.
- **Token caps and alerts.** Usage is recorded; nothing is refused for cost. The dump size limit in AC-14 and the concurrency cap in AC-12 are safety rails, not a cost feature.
- **Langfuse.** Prompts are in git; tracing arrives with the second prompt, not the first.
- **Undo.** There is nothing to undo while nothing is filed. The undo unit is designed in 001 and lands with the sorter.
- **Streaming the answer as it is written.** The answer arrives whole; SSE delivers it, it does not stream it.

## What the kits do not answer

Both need a drawn treatment and a `decisions.md` entry when built, because they are new surface rather than divergence from an existing mock.

- **The web kit never draws the seen marker.** 👀 exists only in `ui_kits/mobile_app/LiveConversation.jsx`; `WTurns` in `ui_kits/web_app/WMisc.jsx` renders a chip for done and has no branch for seen. AC-3 needs it on web.
- **No kit draws a failed message.** `001-data-model` names `failed` as one of four message states and nothing anywhere draws it. AC-5 needs it.
- **Hiding the camera and microphone is a divergence** from `WComposer`, which draws them unconditionally. Code wins under OFF-7 and it gets its own entry.

## Open, needing a call before the work it touches

- **`content` as a table name now contradicts the vocabulary.** "thing" was retired as the product's noun on 2026-09-02, and `docs/specs/001-data-model/impl-spec.md` names the central content table `content`, with `content_blobs` and `derived_from_message_id` around it. The analytics convention in `decisions.md` carries it too, as `thing_dumped` and `thing_sorted`, and AC-18 emits those names. This feature does not create that table, so nothing is blocked today, and the next feature creates it and cannot avoid the question. Renaming after the first migration is expensive; renaming before it is free.

## What the review changed

Three reviewers ran against the first draft in parallel. The findings they agreed on, and what happened:

- **The spec cited a decision that did not exist.** Two reviewers grepped for it independently and found nothing. The entry is written now, with its retiring condition. This is the failure `CLAUDE.md` names as the costliest here, and the spec that describes it contained it.
- **AC-7 contradicted the design.** It required the system prompt to carry no account content while the same document said the prompt carries thread names. Both could not be true. AC-7 now separates the system prompt from the user turns and says where the thread names go.
- **AC-10 was unachievable as written.** Threads are 40 typical and 300 heavy, growing weekly, so a prompt carrying all of them grows with account age, which AC-10 said it would not. The list is bounded now.
- **AC-12 had no mechanism.** It asserted fairness the queue design provides no means to deliver. It now names a per-account concurrency cap enforced in the claim query.
- **The design log claimed 003 closes the inert-composer divergence on three surfaces.** 003 is web only. That entry is amended rather than left to read as kept.
- **Nine acceptance criteria were added**, covering prompt isolation between accounts, worker write scoping, stream revocation, dump size, ordering, analytics, live regions, the seen marker's text alternative, and reduced motion.

Deliberately not changed:

- **The pretend behaviour stays**, and the reply still asserts a completed action rather than a conditional one. The product owner chose this knowingly, twice, on the grounds that 004 removes it immediately. The cost is recorded rather than argued again.
- **SSE stays**, against one reviewer's recommendation to poll. The reversal is logged with its cost, including what the phones inherit.
