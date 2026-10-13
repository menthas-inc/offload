"""Cut a worker's candidate.patch down to the code: no RESULT.md, no copy of
the patch, no eval run logs (HISTORY.md, cases.jsonl, history.jsonl), no
records. What is left applies to a clean worktree at the base.

    python3 .claude/scripts/swarm-codepatch.py <candidate.patch> [out.patch]
"""

import re
import sys
from pathlib import Path

DROP = re.compile(
    r"^(RESULT\.md|candidate\.patch|code\.patch|.*/evals/HISTORY\.md|.*/evals/cases\.jsonl|"
    r".*/evals/history\.jsonl|.*/evals/results/.*|.*/evals/BASELINE\.md)$"
)


def cut(text: str) -> str:
    out = []
    for block in re.split(r"(?m)^(?=diff --git )", text):
        if not block.strip():
            continue
        m = re.match(r"diff --git a/(\S+) b/(\S+)", block)
        path = m.group(2) if m else ""
        if DROP.match(path):
            continue
        out.append(block)
    return "".join(out)


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print(__doc__)
        return 2
    src = Path(argv[1])
    dst = Path(argv[2]) if len(argv) > 2 else src.with_name("code.patch")
    dst.write_text(cut(src.read_text(encoding="utf-8")), encoding="utf-8")
    kept = len(re.findall(r"(?m)^diff --git ", dst.read_text(encoding="utf-8")))
    print(f"{dst}: {kept} files")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
