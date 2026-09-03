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
from offload_agent.queue import ClaimedJob, claim

log = structlog.get_logger()

KINDS = ["dump.answer"]


async def _post_result(client: httpx.AsyncClient, cfg: Config, body: dict) -> None:
    response = await client.post(
        f"{cfg.api_url}/internal/v1/turn-result",
        json=body,
        headers={"authorization": f"Bearer {cfg.internal_token}"},
        timeout=30.0,
    )
    response.raise_for_status()


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

    except InvalidOutput:
        log.warning("model output invalid", job_id=job.id)
        await _post_result(
            http, cfg, {"outcome": "failed", "jobId": job.id, "reason": "invalid_output"}
        )
    except Exception as exc:  # noqa: BLE001
        # The type, never the message. An SDK exception can embed the request
        # body, which is the person's dump, and this line would carry it into a
        # log (OFF-1).
        log.error("dump failed", job_id=job.id, error_type=type(exc).__name__)
        await _post_result(
            http, cfg, {"outcome": "failed", "jobId": job.id, "reason": "model_error"}
        )


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
