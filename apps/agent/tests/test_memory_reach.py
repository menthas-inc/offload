"""038 AC-14. Exactly four calls are given a person's memories: filing,
answering, the nightly thread pass and the memory pass. Named here rather than
derived, so a new call that starts reading them is a decision someone makes."""

import re
from pathlib import Path

SRC = Path(__file__).resolve().parents[1] / "src" / "offload_agent"

READERS = {
    # The filing and answering contexts, and the thread pass, read them here.
    "context.py": {"memories_of", "memories_for"},
    "nightly.py": {"memories_for"},
    # The memory pass reads its bounded set through the same query (040).
    "memories.py": {"memories_for"},
    # 040. The sweep's job embeds a memory's sentence on its own row, and
    # sends it nowhere but the embedding provider the companies page names.
    "embed_jobs.py": set(),
    # The two turns put the block in front of the model.
    "harness/plan.py": {"memories_blocks"},
}


def test_only_the_four_calls_read_memories():
    found: dict[str, set[str]] = {}
    for path in SRC.rglob("*.py"):
        source = path.read_text()
        names = set(re.findall(r"\b(memories_of|memories_for|memories_blocks|_MEMORIES)\(", source))
        names |= (
            set(re.findall(r"\b(_MEMORIES)\b", source)) if path.name == "memories.py" else set()
        )
        if "scope = 'account'" in source:
            names.add("scope = 'account'")
        if names:
            found[str(path.relative_to(SRC))] = names
    # The account-scope query lives in exactly the two readers that own one.
    assert {p for p, n in found.items() if "scope = 'account'" in n} == {
        "context.py",
        "embed_jobs.py",
    }
    for path, names in found.items():
        assert path in READERS, f"{path} reads memories: {names}"


def test_the_quarantined_calls_never_see_them():
    for name in ("reader.py", "look.py", "judge.py", "thread_icons.py"):
        for path in SRC.rglob(name):
            assert "memories" not in path.read_text(), path
