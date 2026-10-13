"""Filing runs on Haiku 5.5. The second swarm run measured it, with no prompt
written for it, on block1 (28 of 30), block2 (26 of 30), principles 13 and
01 (50 of 56, 17 of 17) and the composite screen (66 of 68, z +0.82 against
the history), at a warm day of x0.27 and a p90 filing latency of x0.77
(2026-10-13). The holdout decides whether it stays.
"""

from dataclasses import fields

from offload_agent.config import Config


def test_filing_runs_on_haiku_5_5():
    default = {f.name: f.default for f in fields(Config)}["model"]
    assert default == "claude-haiku-5-5"


def test_answering_stays_on_opus_5():
    """answer.md was rewritten for a small model in the second swarm run and
    Haiku 5.5 reads it well (principle 17 at 36 of 37), but on the sealed
    holdout it answered 31 of 35 against Opus 5's 35 of 35, so Opus stays
    until the owner takes the switch (2026-10-13)."""
    default = {f.name: f.default for f in fields(Config)}["answer_model"]
    assert default == "claude-opus-5"
