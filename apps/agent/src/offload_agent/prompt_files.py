"""032. The system prompts, read from `prompts/` and assembled once.

Every prompt the worker sends is a file, so the harness map, /test-llm and
anybody grepping the folder see all of them. A prompt may pull in a shared part
with `<!-- include: shared/<name> -->` on a line of its own: the filing and
answering prompts share what offload is and the policy both paths hold, and a
rule written twice is a rule that drifts. Assembly happens at import, so what
is sent is still one fixed text per prompt and still caches.
"""

import re
from pathlib import Path

PROMPTS = Path(__file__).parent / "prompts"

_INCLUDE = re.compile(r"^<!-- include: ([\w/-]+) -->$", re.MULTILINE)


def load(name: str, *, root: Path = PROMPTS) -> str:
    """The prompt `name`, with every include replaced by the file it names.

    Raises at import rather than sending a prompt with a hole in it, and on an
    included file that itself includes another."""
    text = (root / f"{name}.md").read_text()

    def part(match: re.Match[str]) -> str:
        path = root / f"{match.group(1)}.md"
        if not path.is_file():
            raise RuntimeError(f"{name}.md includes {match.group(1)}, which does not exist")
        included = path.read_text().strip()
        # One level only. No shared part includes another, so a nested
        # include is refused by name rather than expanded.
        nested = _INCLUDE.search(included)
        if nested:
            raise RuntimeError(
                f"{match.group(1)} includes {nested.group(1)}, and includes do not nest"
            )
        return included

    assembled = _INCLUDE.sub(part, text)
    if "<!-- include" in assembled:
        raise RuntimeError(f"{name}.md has an include marker that is not on a line of its own")
    return assembled
