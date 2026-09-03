"""The suite loads its own environment.

The TypeScript side has done this since 003, in `test/setup.ts`, and this side
did not. The consequence was quiet rather than loud: `test_isolation.py` skips
itself when the two database urls are absent, so the three tests standing
between one account's private text and another account's model call reported as
skipped in any shell that had not sourced `.env` by hand. That is the recorded
lesson in CLAUDE.md, "a test that passes only in your shell is not passing",
arriving a second time as a test that skips only outside your shell.

Parsed rather than pulled from a library, because the only alternative is adding
a dependency to the production image to read a file the production image never
has. The parser handles the quoted multi-line values `.env` supports, which is
the exact thing a naive line-by-line read got wrong here once before.
"""

import os
import re
from pathlib import Path

_ENV = Path(__file__).resolve().parents[3] / ".env"

_LINE = re.compile(
    r"""^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(
        "(?:[^"\\]|\\.)*"      # double quoted, escapes and newlines allowed
      | '(?:[^'\\]|\\.)*'      # single quoted
      | [^\n]*                 # bare, to end of line
    )""",
    re.VERBOSE | re.MULTILINE | re.DOTALL,
)


def _load() -> None:
    if not _ENV.exists():
        return
    text = _ENV.read_text()
    for name, raw in _LINE.findall(text):
        # Never overwrite. A value already in the environment was chosen
        # deliberately, by CI or by the person running the command.
        if name in os.environ:
            continue
        value = raw.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
            if raw.strip()[0] == '"':
                value = value.replace("\\n", "\n")
        os.environ[name] = value


_load()
