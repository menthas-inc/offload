"""The worker. Claims a dump, files it, posts the reply back.

Long-running and single-purpose. It holds no HTTP surface because nothing calls
it: work arrives by polling the jobs table, which is also the admission control
that bounds how many model calls can be in flight at once.

It writes nothing to the canonical tables. The reply goes back through the Core
API's internal endpoint, which is what keeps one writer.
"""

import asyncio
import contextlib
import re
import signal
import uuid
from collections.abc import Awaitable, Callable

import httpx
import structlog
from anthropic import AsyncAnthropic
from sqlalchemy.ext.asyncio import create_async_engine

from offload_agent import context as ctx_mod
from offload_agent import reader
from offload_agent.cancels import Cancels, listen
from offload_agent.compact import KINDS as COMPACT_KINDS
from offload_agent.compact import handle_compact
from offload_agent.config import Config
from offload_agent.context import DumpContext
from offload_agent.embed import EmbeddingUnavailable, embed, to_pgvector
from offload_agent.embed_jobs import KINDS as EMBED_KINDS
from offload_agent.embed_jobs import handle_embed
from offload_agent.harness.plan import Outcome, classify, plan, plan_answer, plan_quick_add
from offload_agent.queue import ClaimedJob, claim, release_for_retry

log = structlog.get_logger()


class InvalidOutput(Exception):
    """The model finished without saying anything. Kept distinct from a
    transport failure so the two retry differently."""


class ReportFailed(Exception):
    """The answer exists and could not be handed over. Distinct from a model
    failure, because the two want opposite responses: a model failure should be
    reported, and this one cannot be."""

KINDS = ["dump.answer", "thread.quick_add", *EMBED_KINDS, *COMPACT_KINDS]


async def _post_result(
    client: httpx.AsyncClient, cfg: Config, body: dict, *, path: str = "turn-result"
) -> None:
    """Report the outcome, retrying the report itself.

    Worth its own retry rather than folding into the job's. By the time this is
    called the model has already answered and been paid for, so treating a
    momentary blip on the private network as a job failure throws away an answer
    somebody is waiting on and buys it again. The endpoint is idempotent, so
    repeating the post is free.
    """
    last: Exception | None = None
    for attempt in range(3):
        try:
            response = await client.post(
                f"{cfg.api_url}/internal/v1/{path}",
                json=body,
                headers={"authorization": f"Bearer {cfg.internal_token}"},
                timeout=30.0,
            )
            response.raise_for_status()
            return
        except Exception as exc:  # noqa: BLE001, PERF203
            last = exc
            if attempt < 2:
                await asyncio.sleep(0.5 * (attempt + 1))

    raise ReportFailed(str(type(last).__name__)) from last


class Lookups:
    """The turn's own web budget, and the record of what it spent it on.

    **The bounds belong to the turn rather than to a call.** A dump can ask for
    three things and each `look_up` would otherwise get its own three searches,
    which is how a bound stated per turn becomes nine.
    """

    #: Per turn, both of them.
    SEARCHES = 3
    READS = 3

    def __init__(self, dump: str, *, may_search: bool, may_read_links: bool) -> None:
        self.dump = dump
        self.may_search = may_search
        self.may_read_links = may_read_links
        self.searches = 0
        self.reads = 0
        self.sources: list[dict] = []
        self.rows: list[dict] = []
        self.usage: list[dict] = []

    def left(self) -> int:
        return max(0, self.SEARCHES - self.searches)

    def record(self, *, label: str, kind: str, outcome: str, cost_micros: int = 0) -> None:
        """One row per lookup: a closed label, what became of it, what it cost.

        Never the question and never the URL. A query is somebody's own sentence
        and anonymising it does not make it not content (OFF-1).
        """
        self.rows.append(
            {"label": label, "kind": kind, "outcome": outcome, "costMicros": cost_micros}
        )


def _from_the_dump(text: str, dump: str) -> bool:
    """Every word of it appears in the dump.

    **A bound on composition rather than on judgement**, which is the only kind
    that survives an injected instruction. The planner may use everything it
    knows to decide whether to look something up; it may only send out of the
    sentence in front of it. Without this, a note another member wrote in a
    shared thread can steer a query carrying their details to a search company,
    and nothing in the refusal list or the bounds would notice.

    Coarse on purpose. The failure mode is a refused lookup that was fine, which
    costs a lookup; the other direction costs somebody their address.
    """
    haystack = set(re.findall(r"[a-z0-9]+", dump.lower()))
    return all(w in haystack for w in re.findall(r"[a-z0-9]+", text.lower()))


def _in_the_dump(url: str, dump: str) -> bool:
    """The URL was dumped by this person, as a link, in this message.

    Matched against the dump rather than against the thread, so a URL somebody
    else wrote into a shared thread is not fetchable however it got into the
    model's context, and a URL the model composed is not fetchable at all.
    """
    return url in re.findall(r"https?://[^\s<>\"\')]+", dump)


async def _look_up(
    client: "AsyncAnthropic",
    cfg: Config,
    budget: Lookups,
    args: dict,
    say: "StepWriter | None" = None,
) -> dict:
    """Answer a `look_up` without leaving the worker.

    Nothing here writes, so nothing crosses to the Core API: the sources and the
    counters ride home on the turn result the worker already posts.

    The one exception is 017's step, which goes out before the lookup runs. That
    ordering is the guarantee: a line written before anything is fetched cannot
    carry anything fetched.
    """
    question = (args.get("question") or "").strip() or None
    url = (args.get("url") or "").strip() or None

    if (question is None) == (url is None):
        return {"ok": False, "error": "give exactly one of question and url"}

    if url:
        if not budget.may_read_links:
            return {"ok": False, "error": "reading links is switched off"}
        if not _in_the_dump(url, budget.dump):
            budget.record(label="link_metadata", kind="read", outcome="refused_bound")
            return {"ok": False, "error": "that url is not in what they dumped"}
        if budget.reads >= budget.READS:
            budget.record(label="link_metadata", kind="read", outcome="refused_bound")
            return {"ok": False, "error": "limit_reached"}
    else:
        if not budget.may_search:
            return {"ok": False, "error": "searching is switched off"}
        if not _from_the_dump(question or "", budget.dump):
            budget.record(label="other", kind="search", outcome="refused_bound")
            return {"ok": False, "error": "ask using only words from what they dumped"}
        if budget.left() == 0:
            budget.record(label="other", kind="search", outcome="refused_bound")
            return {"ok": False, "error": "limit_reached"}

    # **Before the reader, and only once the bounds have passed.** A step for a
    # lookup that was about to be refused would put a line on screen for work
    # that never happened.
    if say is not None:
        await say(args.get("doing") or "")

    reading = await reader.read(
        client,
        cfg.sort_model,
        question=question,
        url=url,
        want=list(args.get("want") or []),
        searches=budget.left() if question else 0,
    )

    budget.searches += reading.searches
    budget.reads += reading.fetches
    budget.usage.extend(reading.usage)
    for source in reading.found.sources:
        entry = {"domain": source.domain, "url": source.url}
        if entry not in budget.sources:
            budget.sources.append(entry)

    outcome = "failed" if reading.failed else ("empty" if reading.found.unsure else "used")
    budget.record(
        label=reading.found.label,
        kind="read" if url else "search",
        outcome=outcome,
        cost_micros=sum(u.get("webSearches", 0) for u in reading.usage) * 10_000,
    )

    if reading.failed or reading.found.unsure:
        return {"ok": True, "found": False}

    # Fields and sources. **Not the title and not a quoted excerpt**, which are
    # written by whoever owns the page.
    return {
        "ok": True,
        "found": True,
        "fields": reading.found.fields,
        "sources": [s["domain"] for s in budget.sources],
    }


#: 017. One line to the Core API, which puts it on screen.
StepWriter = Callable[[str], Awaitable[None]]


def _step_writer(http: httpx.AsyncClient, cfg: Config, job_id: str) -> StepWriter:
    """Post the current step, and never let it break the turn.

    **Failures are swallowed on purpose.** A progress line is the least
    important thing happening on this turn: dropping the post loses a sentence,
    and raising would lose the answer. The client falls back to the writing
    indicator when no step arrives, which is what AC-3 already specifies for a
    turn that produced none.

    The cap is the server's (AC-4), so nothing is truncated here. An overlong
    line is refused and not drawn, which is visible in a way that a silently
    trimmed sentence is not.
    """

    async def say(text: str) -> None:
        line = text.strip()
        if not line:
            return
        try:
            await http.post(
                f"{cfg.api_url}/internal/v1/turn-step",
                json={"jobId": job_id, "text": line},
                headers={"authorization": f"Bearer {cfg.internal_token}"},
                timeout=5.0,
            )
        except Exception as exc:  # noqa: BLE001
            log.info("step undelivered", job_id=job_id, error_type=type(exc).__name__)

    return say


def _tool_caller(
    http: httpx.AsyncClient,
    cfg: Config,
    job_id: str,
    embedder: "Callable[[str], Awaitable[str | None]] | None" = None,
    lookups: "tuple[AsyncAnthropic, Config, Lookups] | None" = None,
    say: "StepWriter | None" = None,
):
    """The loop's only route to a write.

    A closure over the job id rather than a parameter the loop passes, because
    the job id is what the Core API derives the account from, and a loop that
    can name a job is a loop that could name the wrong one.

    Retried on transport failure and not on a refusal. A refusal comes back as a
    200 with ok false and is data the planner is meant to read; only the network
    is retried, and the endpoint is idempotent on the tool call id so a repeat
    cannot file twice.
    """

    async def call(tool: str, tool_call_id: str, args: dict) -> dict:
        # The one tool that never reaches the Core API, because it writes
        # nothing. It reads the web in a call that holds none of this person's
        # data, and what comes back is fields.
        if tool == "look_up":
            if lookups is None:
                return {"ok": False, "error": "not available on this turn"}
            return await _look_up(lookups[0], lookups[1], lookups[2], args, say)

        payload = {"tool": tool, "jobId": job_id, "toolCallId": tool_call_id, **_camel(args)}

        # The query embedding is attached here, not asked of the model.
        #
        # The agent plane owns the Voyage client, so this is where a query can
        # become a vector. **The model has no field it could set**, which is the
        # same reasoning 012 gives for confirmation: some of what it read was
        # written by somebody else, and a field it can fill is a decision handed
        # to whoever wrote that. Absent means the text arm answers alone: search
        # is worse, not broken, and there is nothing for the person to do about
        # it so nothing is said.
        if tool == "search" and embedder is not None:
            payload["queryVector"] = await embedder(str(args.get("query", "")))
        last: Exception | None = None
        for attempt in range(3):
            try:
                response = await http.post(
                    f"{cfg.api_url}/internal/v1/tool-call",
                    json=payload,
                    headers={"authorization": f"Bearer {cfg.internal_token}"},
                    timeout=30.0,
                )

                # A 4xx is a decision, not a blip.
                #
                # **This cost a real turn.** The endpoint refused a malformed
                # argument with a 400, this retried it three times as though the
                # network had dropped, and then reported "unavailable" to the
                # model, which told somebody "the task tool seems to be down".
                # It was up. It had said no, clearly, and the answer was thrown
                # away and replaced with a lie.
                #
                # A malformed request will be malformed again, so retrying is
                # pure delay. It comes back as a refusal the planner can read
                # and act on, which is what it should have been all along.
                if 400 <= response.status_code < 500:
                    log.warning(
                        "tool call refused", job_id=job_id, status=response.status_code
                    )
                    return {"ok": False, "error": "invalid_arguments"}

                response.raise_for_status()
                return response.json()
            except Exception as exc:  # noqa: BLE001, PERF203
                last = exc
                if attempt < 2:
                    await asyncio.sleep(0.5 * (attempt + 1))

        # Three failures is the network. Reported to the model as a failed tool
        # so the turn can still finish and say what landed, rather than raised,
        # which would throw away everything already filed.
        log.error("tool call undeliverable", job_id=job_id, error_type=type(last).__name__)
        return {"ok": False, "error": "unavailable"}

    return call


def _camel(args: dict) -> dict:
    """snake_case in Python, camelCase on the wire. One mapping, here, rather
    than a second spelling of every field in the pydantic models."""
    out = {}
    for key, value in args.items():
        head, *rest = key.split("_")
        out[head + "".join(part.title() for part in rest)] = value
    return out


def _usage_wire(outcome: Outcome) -> list[dict]:
    return [
        {
            "model": u.model,
            "inputTokens": u.input_tokens,
            "outputTokens": u.output_tokens,
            "cacheReadTokens": u.cache_read_tokens,
            "costMicros": 0,
            "latencyMs": u.latency_ms,
        }
        for u in outcome.usage
    ]


async def handle(
    job: ClaimedJob,
    *,
    cfg: Config,
    engine,
    anthropic: AsyncAnthropic,
    http: httpx.AsyncClient,
) -> None:
    """One job. Never raises: the outcome always reaches the Core API, because a
    dump that silently stops being answered is indistinguishable from one still
    being thought about."""
    if job.kind == "thread.quick_add":
        await _handle_quick_add(job, cfg=cfg, engine=engine, anthropic=anthropic, http=http)
        return

    if job.kind in COMPACT_KINDS:
        # Nobody is waiting on a fold, so a failure releases the job and the
        # thread keeps every note it has. Wrapped for the same reason the embed
        # branch below is: it returns before the catch-all, and a stuck
        # `running` row is nothing's job to reap.
        try:
            await handle_compact(
                job, cfg=cfg, engine=engine, http=http, client=anthropic
            )
        except Exception as exc:
            # **`log.error`, never `log.exception`.** The type, never the value:
            # an SDK exception can echo the request body, and the request body
            # here is a hundred notes (OFF-1). `log.exception` sets
            # `exc_info=True` and structlog renders the whole traceback with
            # `str(exc)` in it, which is the breach this comment was written to
            # prevent and did not. Same shape as `dump failed` below.
            log.error("compaction failed", kind=job.kind, error=type(exc).__name__)
            async with engine.begin() as conn:
                await release_for_retry(conn, job.id, "compact_error", delay_seconds=3600)
        return

    if job.kind in EMBED_KINDS:
        # No model call and nobody waiting, so it closes its own job rather
        # than reporting an outcome the Core API has no use for.
        #
        # **Its own guard, because it returns before the one below.** Everything
        # past this point is wrapped; this was not, and `handle_embed` catches
        # only `EmbeddingUnavailable`. A malformed Voyage body, a KeyError, a
        # database error inside its own transaction: any of those reached the
        # loop's catch-all, which logs and sleeps without releasing the job.
        #
        # Nothing reaps a stuck `running` row, and the sweep cannot re-enqueue
        # it because the idempotency key is `kind:rowId:version` and the version
        # only moves when somebody edits the row. So one bad response left a row
        # permanently unsearchable, silently, with no way back short of an edit.
        try:
            await handle_embed(job, cfg=cfg, engine=engine, http=http)
        except Exception as exc:
            # The type, never the value: an SDK exception can echo the request
            # body, and the request body here is content (OFF-1).
            #
            # **This said `log.exception` until 2026-09-10**, which sets
            # `exc_info=True`, and structlog renders the traceback with
            # `str(exc)` in it however few fields are passed. The comment above
            # was right and the call under it was not. Found by the review of
            # 014, in the identical line it had just written.
            log.error("embed failed", kind=job.kind, error=type(exc).__name__)
            async with engine.begin() as conn:
                await release_for_retry(conn, job.id, "embed_error", delay_seconds=300)
        return

    payload = job.payload
    message_id = payload.get("messageId")
    conversation_id = payload.get("conversationId")

    if not (message_id and conversation_id and job.account_id):
        # Nothing to answer and nothing to answer it for. Reported rather than
        # retried: a malformed payload will be malformed again.
        await _post_result(
            http, cfg, {"outcome": "failed", "jobId": job.id, "reason": "invalid_output"}
        )
        return

    try:
        # Question or note, decided on the message alone and before anything is
        # read. Its own call, because the toolset has to be chosen before the
        # model is invoked: a mode the model picks mid-turn is a mode it can be
        # talked into. See `classify`.
        async with engine.connect() as conn:
            asked = await ctx_mod.question_text(conn, message_id=message_id)

        if asked:
            verdict = await classify(anthropic, asked, cfg.sort_model)
            if verdict.asking and verdict.confident:
                await _handle_answer(
                    job,
                    question=asked,
                    cfg=cfg,
                    engine=engine,
                    anthropic=anthropic,
                    http=http,
                )
                return

        async with engine.connect() as conn:
            loaded = await ctx_mod.load(
                conn,
                account_id=job.account_id,
                conversation_id=conversation_id,
                message_id=message_id,
                max_turns=cfg.max_turns,
                max_threads=cfg.max_threads,
            )

        if loaded is None:
            await _post_result(
                http, cfg, {"outcome": "failed", "jobId": job.id, "reason": "invalid_output"}
            )
            return

        fitted = ctx_mod.fit(loaded, cfg.max_prompt_tokens)
        budget = Lookups(
            fitted.dump,
            may_search=fitted.may_search,
            may_read_links=fitted.may_read_links,
        )
        outcome = await plan(
            anthropic,
            fitted,
            cfg.model,
            _tool_caller(
                http,
                cfg,
                job.id,
                lookups=(anthropic, cfg, budget),
                say=_step_writer(http, cfg, job.id),
            ),
        )

        nothing_left = _nothing_left(outcome, fitted)

        # Not finished means either the loop ran out of round trips or a tool
        # failed. Both are partial, and in both the reply is ours: a model that
        # could not do something is not a reliable narrator of what it did.
        if not outcome.finished and not nothing_left:
            # The loop ran out of round trips. Everything in `landed` is
            # committed, so this is partial rather than failed, and the person
            # is offered a way to finish it rather than a way to start again.
            #
            # The reply is written here rather than asked of the model, because
            # the model is the thing that did not finish. It names threads from
            # `landed`, which is the record of what actually happened.
            await _post_result(
                http,
                cfg,
                {
                    "outcome": "partial",
                    "jobId": job.id,
                    "replyText": _partial_reply(outcome),
                    "usage": _usage_wire(outcome),
                    # A turn cut off partway still read what it read, and the
                    # chip is a record of that rather than of the turn finishing.
                    **_web_wire(budget),
                },
            )
            log.warning(
                "dump partial",
                job_id=job.id,
                calls=len(outcome.usage),
                filed=len(outcome.landed),
                failed=len(outcome.failed),
                # See above: this is the count that was missing while three
                # turns in production looked like they had done nothing.
                refused=outcome.refused,
                out_of_calls=outcome.out_of_calls,
            )
            return

        # **No reply is an outcome, not a failure.** A dump that was simply
        # filed says everything it has to say through the Done mark and the
        # pill naming the thread, and a sentence repeating what somebody just
        # typed is noise wearing offload's voice. `finished` above already
        # refused to call a silent turn finished unless something landed.
        await _post_result(
            http,
            cfg,
            {
                "outcome": "answered",
                "jobId": job.id,
                **({"replyText": outcome.reply} if outcome.reply else {}),
                # What the turn read, and what kind of lookup it was. They ride
                # home here rather than through an endpoint of their own,
                # because the reader writes nothing and one fewer route is one
                # fewer thing to authenticate.
                **_web_wire(budget),
                "usage": _usage_wire(outcome),
            },
        )
        # Ids and counts only. Never the dump, never the reply, never a thread
        # name: a thread the model named after a diagnosis is as identifying as
        # the sentence it came from (OFF-1).
        log.info(
            "dump answered",
            job_id=job.id,
            calls=len(outcome.usage),
            filed=len(outcome.landed),
            # Which of the two answered turns this was: one that did something,
            # or a resume that found the work already done. They read the same
            # in a log otherwise, and telling them apart is what turned "the
            # retry fails every time" into one line of code.
            nothing_left=nothing_left,
            # A tool call the schema refused never reaches the Core API, so it
            # is in neither `filed` nor `failed`, and a turn that spent every
            # round trip on rejected arguments logged as though it had done
            # nothing at all. Field names and error types only (OFF-1).
            refused=outcome.refused,
            latency_ms=sum(u.latency_ms for u in outcome.usage),
        )

    except ReportFailed as exc:
        # The answer was produced and could not be delivered. Do not report a
        # failure, because there is nothing to report it through, and do not
        # leave the job running, because a running job counts against the
        # account's concurrency cap forever. Put it back and let it be tried
        # again when the Core API is reachable.
        log.error("result undeliverable", job_id=job.id, error_type=str(exc))
        async with engine.begin() as conn:
            await release_for_retry(conn, job.id, "undeliverable", delay_seconds=30)
    except InvalidOutput:
        log.warning("model output invalid", job_id=job.id, attempt=job.attempts)
        await _give_up_or_retry(job, "invalid_output", cfg=cfg, engine=engine, http=http)
    except Exception as exc:  # noqa: BLE001
        # The type, never the message. An SDK exception can embed the request
        # body, which is the person's dump, and this line would carry it into a
        # log (OFF-1).
        log.error("dump failed", job_id=job.id, attempt=job.attempts, error_type=type(exc).__name__)
        await _give_up_or_retry(job, "model_error", cfg=cfg, engine=engine, http=http)


def _web_wire(budget: "Lookups | None") -> dict:
    """The web half of a turn result: sources for the chips, rows for the counts.

    Omitted entirely on a turn that reached nothing, which is almost all of
    them, so an ordinary filing result is the shape it has always been.
    """
    if budget is None or (not budget.sources and not budget.rows):
        return {}
    return {"sources": budget.sources, "lookups": budget.rows}


def _nothing_left(outcome: Outcome, ctx: DumpContext) -> bool:
    """A resume that found the work already done.

    **Finished, not partial.** The rule everywhere else is that a turn which
    filed nothing and said nothing did not happen, and on a first attempt that
    is right. On a resume it is the opposite: the earlier attempt filed, this
    one reads what already landed, finds nothing left and stops. Reported as
    partial, that turn said "Nothing saved." about eight rows sitting in the
    thread, and offered a Finish that would say it again, every time. The
    product owner pressed it three times.

    Narrow on purpose. The model has to have stopped of its own accord, with
    nothing refused and nothing half done, and this message has to have filed
    something already. Anything else is still a turn that needs finishing.
    """
    return (
        not outcome.finished
        and not outcome.out_of_calls
        and not outcome.failed
        and outcome.worked == 0
        and bool(ctx.landed)
    )


def _partial_reply(outcome: Outcome) -> str:
    """What offload says when a turn did not finish.

    Built from `landed`, never from the model's own account of itself. The model
    either stopped mid-turn or had a tool refused, and in both cases its last
    word on the subject is unreliable by construction: asked to explain, it
    wrote "the task tool seems to be down" about a tool that was up.
    """
    names: list[str] = []
    for item in outcome.landed:
        if item.thread_name and item.thread_name not in names:
            names.append(item.thread_name)

    # Short, and only what happened. No apology, no explanation, no mechanism,
    # and nothing about what went wrong: the screen says that, next to the way
    # to fix it, where somebody can act on it. A sentence cannot be clicked.
    if names:
        placed = names[0] if len(names) == 1 else ", ".join(names[:-1]) + " and " + names[-1]
        return f"Saved to {placed}."

    # **"Nothing saved." is a claim about the database and it can be false.**
    # `landed` holds filings, and a move, a tick, an archive and a rename are
    # none of them: a turn that moved a piece and then stopped told somebody
    # nothing had been saved about a move that had already happened. If a tool
    # did something, say the true thing instead, which is that the turn did not
    # finish, and let the screen offer the way to finish it.
    if outcome.worked:
        return "That did not finish."
    return "Nothing saved."


async def _stopped(job: ClaimedJob, *, cfg: Config, engine, http: httpx.AsyncClient) -> None:
    """Report a turn somebody stopped. 017.

    **Not a failure and not a retry.** Both of those exist because offload got
    something wrong; this one is somebody exercising a control, and a turn that
    retried itself after being stopped would be the product ignoring them
    (AC-12). The job is closed by the Core API in the same transaction as the
    state, exactly as every other outcome is.

    Everything already filed stays filed (AC-10). Cancel stops work; Undo is the
    thing that reverses it.
    """
    try:
        await _post_result(http, cfg, {"outcome": "cancelled", "jobId": job.id})
        log.info("turn stopped", job_id=job.id)
    except ReportFailed:
        # **Nothing else to do, and deliberately no retry.** The person's screen
        # already moved on when they pressed it, and the Core API has the job
        # marked cancelled either way, so the turn settles from that rather than
        # from this post. Releasing it would put the cancelled job back in the
        # queue, which is the one thing that must not happen here.
        log.error("stop undeliverable", job_id=job.id)


async def _give_up_or_retry(
    job: ClaimedJob, reason: str, *, cfg: Config, engine, http: httpx.AsyncClient
) -> None:
    """One retry, then tell the person.

    AC-5 asks for a retry before a failure is shown, and the first version of
    this did not have one: any error posted `failed` immediately and the
    composer said so on the first transient blip. The attempt count comes from
    the claim, so the decision is made against what the database recorded rather
    than against anything held in this process.
    """
    if job.attempts < job.max_attempts:
        async with engine.begin() as conn:
            await release_for_retry(conn, job.id, reason)
        log.info("dump requeued", job_id=job.id, attempt=job.attempts)
        return

    try:
        await _post_result(http, cfg, {"outcome": "failed", "jobId": job.id, "reason": reason})
    except ReportFailed:
        # Even the failure could not be delivered. Same treatment: release it
        # rather than leave it locked, and it terminates on its own once the
        # Core API answers, because the attempt count is already spent.
        log.error("failure undeliverable", job_id=job.id)
        async with engine.begin() as conn:
            await release_for_retry(conn, job.id, "undeliverable", delay_seconds=30)


async def run(cfg: Config, stop: asyncio.Event) -> None:
    engine = create_async_engine(cfg.database_url, pool_size=4, pool_pre_ping=True)
    anthropic = AsyncAnthropic(api_key=cfg.anthropic_api_key)
    worker_id = f"agent-{uuid.uuid4().hex[:8]}"

    log.info("worker started", worker_id=worker_id, kinds=KINDS)

    # 017. One listening connection for the process, alongside the poll rather
    # than instead of it: jobs still arrive by claim, and this is only how a
    # request to stop one reaches a worker already inside a model call.
    cancels = Cancels()
    listener = asyncio.create_task(listen(engine, cancels, stop))

    async with httpx.AsyncClient() as http:
        while not stop.is_set():
            try:
                async with engine.begin() as conn:
                    job = await claim(conn, worker_id, KINDS, cfg.per_account_running)

                if job is None:
                    # Nothing to do. Wait, but wake immediately on shutdown
                    # rather than sleeping through it.
                    with contextlib.suppress(TimeoutError):
                        await asyncio.wait_for(stop.wait(), timeout=cfg.poll_seconds)
                    continue

                # **Cancelled before it was claimed.** The notification and the
                # claim race, and this is the half of the race the listener
                # cannot win: the job is already ours before the id arrives.
                if cancels.asked(str(job.id)):
                    await _stopped(job, engine=engine, http=http, cfg=cfg)
                    cancels.done(str(job.id))
                    continue

                # **In a task rather than awaited directly**, which is the whole
                # mechanism: a coroutine being awaited cannot be interrupted, and
                # a task can. Cancelling it raises at the next await, which
                # inside an Anthropic call is the socket read.
                running = asyncio.create_task(
                    handle(job, cfg=cfg, engine=engine, anthropic=anthropic, http=http)
                )
                cancels.watching(str(job.id), running)
                try:
                    await running
                except asyncio.CancelledError:
                    # **Ours, not the loop's.** A cancel aimed at this job must
                    # not read as a shutdown, so it is caught here and the worker
                    # carries on. If the process is actually stopping, `stop` is
                    # set and the `while` ends on its own.
                    if stop.is_set():
                        raise
                    await _stopped(job, engine=engine, http=http, cfg=cfg)
                finally:
                    cancels.done(str(job.id))

            except Exception as exc:  # noqa: BLE001
                # The loop itself must not die. A worker that exits on a
                # transient database blip stops answering everybody.
                log.error("worker loop error", error_type=type(exc).__name__)
                await asyncio.sleep(cfg.poll_seconds)

    listener.cancel()
    with contextlib.suppress(asyncio.CancelledError):
        await listener

    await engine.dispose()
    log.info("worker stopped", worker_id=worker_id)


def main() -> None:
    cfg = Config.from_env()
    stop = asyncio.Event()

    async def _main() -> None:
        loop = asyncio.get_running_loop()
        for sig in (signal.SIGINT, signal.SIGTERM):
            # Finish the job in hand rather than dropping it mid-model-call and
            # leaving the row locked until its visibility timeout.
            loop.add_signal_handler(sig, stop.set)
        await run(cfg, stop)

    asyncio.run(_main())


if __name__ == "__main__":
    main()


async def _handle_quick_add(
    job: ClaimedJob,
    *,
    cfg: Config,
    engine,
    anthropic: AsyncAnthropic,
    http: httpx.AsyncClient,
) -> None:
    """A row somebody typed straight into a thread.

    Never raises, for the same reason `handle` does not: a job that stops
    without reporting leaves a spinner turning on somebody's screen forever.

    **Failure here is cheap and that is the design.** The row was written before
    this job existed and holds exactly what they typed, in the thread they typed
    it into. Everything below is an improvement on something already safe, so
    the failure path has nothing to recover and only has to stop the spinner.
    """
    content_id = job.payload.get("contentId")

    if not (content_id and job.account_id):
        await _post_result(
            http, cfg, {"outcome": "failed", "jobId": job.id}, path="quick-add-result"
        )
        return

    outcome = None
    try:
        async with engine.connect() as conn:
            loaded = await ctx_mod.load_quick_add(
                conn, account_id=job.account_id, content_id=content_id
            )

        if loaded is None:
            # Deleted between the write and the claim, which is a thing somebody
            # is entitled to do to their own row.
            await _post_result(
                http, cfg, {"outcome": "failed", "jobId": job.id}, path="quick-add-result"
            )
            return

        outcome = await plan_quick_add(
            anthropic, loaded, cfg.model, _tool_caller(http, cfg, job.id)
        )

        await _post_result(
            http,
            cfg,
            {
                "outcome": "done",
                "jobId": job.id,
                "usage": _usage_wire(outcome),
            },
            path="quick-add-result",
        )
        # Ids and counts only, never the typed text and never a thread name
        # (OFF-1).
        log.info(
            "quick add read",
            job_id=job.id,
            calls=len(outcome.usage),
            wrote=len(outcome.landed),
            latency_ms=sum(u.latency_ms for u in outcome.usage),
        )

    except ReportFailed as exc:
        # Nothing to report through. Leave the job for another attempt rather
        # than closing it: see the note on the same case in `handle`.
        log.error("quick add undeliverable", job_id=job.id, error_type=str(exc))
        raise

    except Exception as exc:  # noqa: BLE001
        log.error("quick add failed", job_id=job.id, error_type=type(exc).__name__)
        await _post_result(
            http,
            cfg,
            {
                "outcome": "failed",
                "jobId": job.id,
                **({"usage": _usage_wire(outcome)} if outcome and outcome.usage else {}),
            },
            path="quick-add-result",
        )


async def _handle_answer(
    job: ClaimedJob,
    *,
    question: str,
    cfg: Config,
    engine,
    anthropic: AsyncAnthropic,
    http: httpx.AsyncClient,
) -> None:
    """A question. Reads, answers, files nothing.

    Never raises, for the same reason `handle` does not: a turn that stops
    without reporting leaves somebody watching a spinner.

    **Failure here is cheap and that is deliberate.** Nothing was written, so
    there is nothing to unwind. The worst case is a sentence saying it could not
    answer, which is the honest outcome anyway.
    """
    assert job.account_id is not None

    try:
        async with engine.connect() as conn:
            ctx = await ctx_mod.load_answer(
                conn,
                account_id=job.account_id,
                question=question,
                max_threads=cfg.max_threads,
            )

        budget = Lookups(
            question, may_search=ctx.may_search, may_read_links=ctx.may_read_links
        )
        caller = _tool_caller(
            http,
            cfg,
            job.id,
            embedder=_embed_query(cfg, http),
            lookups=(anthropic, cfg, budget),
            say=_step_writer(http, cfg, job.id),
        )
        outcome = await plan_answer(anthropic, ctx, cfg.answer_model, caller)

        reply = outcome.reply
        if reply is None:
            # A question with no sentence back is a failure, unlike a dump,
            # where filing something and saying nothing is merely terse.
            raise InvalidOutput("answered without a reply")

        await _post_result(
            http,
            cfg,
            {
                "outcome": "answered",
                "jobId": job.id,
                "replyText": reply,
                "usage": _usage_wire(outcome),
                **_web_wire(budget),
                # The rows the answer showed, as ids. The reply resolves them
                # when it is read, so a row ticked or deleted later is never
                # stale in an old answer.
                "found": outcome.found,
            },
        )
        log.info(
            "question answered",
            job_id=job.id,
            calls=len(outcome.usage),
            rows=len(outcome.found),
        )

    except Exception as exc:  # noqa: BLE001
        log.error("answer failed", job_id=job.id, error_type=type(exc).__name__)
        await _post_result(
            http, cfg, {"outcome": "failed", "jobId": job.id, "reason": "model_error"}
        )


def _embed_query(cfg: Config, http: httpx.AsyncClient):
    """Turn a question into a vector, or into nothing.

    `input_type="query"` rather than `document`: Voyage embeds the two
    asymmetrically, and getting it the wrong way round is a quiet loss of
    quality rather than an error, which is exactly the kind of mistake that
    never gets found.
    """

    async def run(query: str) -> str | None:
        if not cfg.voyage_api_key or not query:
            return None
        try:
            vectors = await embed(
                [query], client=http, api_key=cfg.voyage_api_key, input_type="query"
            )
        except EmbeddingUnavailable as error:
            log.warning("query not embedded", reason=str(error))
            return None
        return to_pgvector(vectors[0])

    return run
