"""The worker. Claims a dump, answers it, posts the answer back.

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

import httpx
import structlog
from anthropic import AsyncAnthropic
from sqlalchemy.ext.asyncio import create_async_engine

from offload_agent import context as ctx_mod
from offload_agent.config import Config
from offload_agent.harness.answer import InvalidOutput, answer
from offload_agent.queue import ClaimedJob, claim, release_for_retry

log = structlog.get_logger()


class ReportFailed(Exception):
    """The answer exists and could not be handed over. Distinct from a model
    failure, because the two want opposite responses: a model failure should be
    reported, and this one cannot be."""

KINDS = ["dump.answer"]


async def _post_result(client: httpx.AsyncClient, cfg: Config, body: dict) -> None:
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
                f"{cfg.api_url}/internal/v1/turn-result",
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
        result, usage = await answer(anthropic, fitted, cfg.model)

        await _post_result(
            http,
            cfg,
            {
                "outcome": "answered",
                "jobId": job.id,
                "replyText": result.reply,
                "usage": {
                    "model": usage.model,
                    "inputTokens": usage.input_tokens,
                    "outputTokens": usage.output_tokens,
                    "cacheReadTokens": usage.cache_read_tokens,
                    "costMicros": 0,
                    "latencyMs": usage.latency_ms,
                },
            },
        )
        # Ids and outcomes only. Never the dump, never the reply (OFF-1).
        log.info("dump answered", job_id=job.id, latency_ms=usage.latency_ms)

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
