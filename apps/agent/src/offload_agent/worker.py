"""The worker. Claims a dump, files it, posts the reply back.

Long-running and single-purpose. It holds no HTTP surface because nothing calls
it: work arrives by polling the jobs table, which is also the admission control
that bounds how many model calls can be in flight at once.

It writes nothing to the canonical tables. The reply goes back through the Core
API's internal endpoint, which is what keeps one writer.
"""

import asyncio
import contextlib
import signal
import uuid
from collections.abc import Awaitable, Callable

import httpx
import structlog
from anthropic import AsyncAnthropic
from sqlalchemy.ext.asyncio import create_async_engine

from offload_agent import context as ctx_mod
from offload_agent.config import Config
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

KINDS = ["dump.answer", "thread.quick_add", *EMBED_KINDS]


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


def _tool_caller(
    http: httpx.AsyncClient,
    cfg: Config,
    job_id: str,
    embedder: "Callable[[str], Awaitable[str | None]] | None" = None,
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
            log.exception("embed failed", kind=job.kind, error=type(exc).__name__)
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
        outcome = await plan(
            anthropic, fitted, cfg.model, _tool_caller(http, cfg, job.id)
        )

        # Not finished means either the loop ran out of round trips or a tool
        # failed. Both are partial, and in both the reply is ours: a model that
        # could not do something is not a reliable narrator of what it did.
        if not outcome.finished:
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
                },
            )
            log.warning(
                "dump partial",
                job_id=job.id,
                calls=len(outcome.usage),
                filed=len(outcome.landed),
                failed=len(outcome.failed),
            )
            return

        if outcome.reply is None:
            raise InvalidOutput("model finished without a reply")

        await _post_result(
            http,
            cfg,
            {
                "outcome": "answered",
                "jobId": job.id,
                "replyText": outcome.reply,
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
    if not names:
        return "Nothing saved."
    placed = names[0] if len(names) == 1 else ", ".join(names[:-1]) + " and " + names[-1]
    return f"Saved to {placed}."


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

                await handle(job, cfg=cfg, engine=engine, anthropic=anthropic, http=http)

            except Exception as exc:  # noqa: BLE001
                # The loop itself must not die. A worker that exits on a
                # transient database blip stops answering everybody.
                log.error("worker loop error", error_type=type(exc).__name__)
                await asyncio.sleep(cfg.poll_seconds)

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

        caller = _tool_caller(http, cfg, job.id, embedder=_embed_query(cfg, http))
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
