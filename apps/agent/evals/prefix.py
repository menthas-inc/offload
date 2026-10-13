"""The frozen prefix of each surface, measured through the real loader.

    uv run python evals/prefix.py                      # the sizes, as JSON
    uv run python evals/prefix.py --write base.json    # save them
    uv run python evals/prefix.py --against base.json  # grown or shrunk, exit 2 if grown

A candidate that touches a prompt, a tool description or a schema changes
what every call of that surface re-sends. Characters, not tokens: no network,
deterministic, and the gate reads a ratio on the same measure for the base
and the candidate, which is what the decision needs. A prefix that grew with
nothing else changed is refused before any model call is spent; a prefix
that shrank is credited in the findings. The tools of the nightly and memory
passes are built inline at the call site and are not counted; their prompt
is.

No model, no network.
"""

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))


def measure() -> dict[str, dict[str, int]]:
    from offload_agent import memories, nightly
    from offload_agent.harness import look, plan, tools

    file_tools = (
        tools.TOOLS
        + tools.CALENDAR_TOOL_DEFS
        + [tools.SHARE_TOOL_DEF, tools.LOOK_UP_TOOL, tools.SAY_TOOL, tools.ASK_TOOL]
    )
    answer_tools = tools.ANSWER_TOOLS + tools.ANSWER_CALENDAR_TOOL_DEFS
    plain_tools = tools.TOOLS + [tools.SAY_TOOL, tools.ASK_TOOL]
    out = {
        "file": {"chars": len(plan.filing_prompt(True)), "tools_chars": _chars(file_tools)},
        "file_no_calendar": {
            "chars": len(plan.filing_prompt(False)),
            "tools_chars": _chars(plain_tools),
        },
        "answer": {"chars": len(plan._ANSWER_PROMPT), "tools_chars": _chars(answer_tools)},
        "classify": {"chars": len(plan._CLASSIFY_PROMPT), "tools_chars": 0},
        "judge": {"chars": len(plan._JUDGE_PROMPT), "tools_chars": 0},
        "nightly": {"chars": len(nightly._PROMPT), "tools_chars": 0},
        "memory": {"chars": len(memories._PROMPT), "tools_chars": 0},
        "look": {"chars": len(look._PROMPT), "tools_chars": 0},
    }
    for v in out.values():
        v["approx_tokens"] = (v["chars"] + v["tools_chars"]) // 4
    return out


def _chars(defs: list[dict]) -> int:
    return len(json.dumps(defs, ensure_ascii=False, separators=(",", ":")))


def against(base: dict, cand: dict, tolerance: float = 0.01) -> dict:
    """Which surfaces' prefixes grew past the tolerance, which shrank, and the
    ratio of each, candidate over base, on prompt plus tools."""
    ratio: dict[str, float] = {}
    for s, b in base.items():
        if s not in cand:
            continue
        size_b = b["chars"] + b.get("tools_chars", 0)
        size_c = cand[s]["chars"] + cand[s].get("tools_chars", 0)
        ratio[s] = (size_c / size_b) if size_b else 1.0
    return {
        "ratio": ratio,
        "grown": sorted(s for s, r in ratio.items() if r > 1 + tolerance),
        "shrunk": sorted(s for s, r in ratio.items() if r < 1 - tolerance),
    }


def main(argv: list[str]) -> int:
    m = measure()
    if "--write" in argv:
        path = Path(argv[argv.index("--write") + 1])
        path.write_text(json.dumps(m, indent=2) + "\n", encoding="utf-8")
        print(f"wrote {path}")
        return 0
    if "--against" in argv:
        base = json.loads(Path(argv[argv.index("--against") + 1]).read_text(encoding="utf-8"))
        d = against(base, m)
        for s, r in sorted(d["ratio"].items()):
            print(f"{s:<18} x{r:.3f}  {m[s]['chars'] + m[s]['tools_chars']:>7} chars")
        if d["grown"]:
            print(f"grown: {', '.join(d['grown'])}")
            return 2
        print("shrunk: " + ", ".join(d["shrunk"]) if d["shrunk"] else "unchanged")
        return 0
    print(json.dumps(m, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
