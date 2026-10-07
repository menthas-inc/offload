"""The worker started as `python -m offload_agent.worker` has the whole module
defined before it runs.

The `__main__` guard once sat above `_handle_answer` and `_embed_query`, so
`main()` ran before Python had read them and every filing turn failed with a
NameError. `uv run offload-worker` imports the module first and never saw it.
"""

from __future__ import annotations

import ast
import asyncio
import runpy
from pathlib import Path

import offload_agent.worker as worker_module
from offload_agent.config import Config


def test_python_dash_m_runs_main_with_every_function_defined(monkeypatch) -> None:
    defined = {
        node.name
        for node in ast.parse(Path(worker_module.__file__).read_text()).body
        if isinstance(node, ast.FunctionDef | ast.AsyncFunctionDef)
    }
    seen: dict[str, object] = {}

    def run(coro, *args, **kwargs):
        # What the worker loop would see, without running it.
        seen.update(coro.cr_frame.f_globals)
        coro.close()

    # The module run as __main__ imports the same Config, so this reaches it.
    monkeypatch.setattr(Config, "from_env", classmethod(lambda cls: object()))
    monkeypatch.setattr(asyncio, "run", run)
    runpy.run_module("offload_agent.worker", run_name="__main__")
    assert seen, "main() never reached asyncio.run"
    assert sorted(defined - seen.keys()) == []
