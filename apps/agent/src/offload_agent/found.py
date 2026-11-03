"""050. What a dump says that one tap can act on: a web address to open, a
phone number to call, an email address to write to.

Gathered here, deterministically, before the filing turn, from the dump's own
words (typed, a voice note's transcript, a forwarded mail) and, in 044's child,
from a PDF's printed text. The set goes to the model as numbered data and the
model names an action by its number, so it never writes a destination itself.
A picture's words are the one exception: the model reads them in the same turn,
so it quotes the destination and `found_in` keeps it only if gathering the
row's own `Text:` line finds the same one.

Every destination comes out normalised, `https://...`, `tel:+` and digits, or
`mailto:` and one address, which is also the only shape the Core API and the
clients accept (`packages/widgets/src/actions.ts`). Both are held to the same
table, `actions.fixtures.json`.

Every pattern is linear and the input is cut first: these run over a stranger's
mail as readily as over the person's own words (SEC-1).
"""

from __future__ import annotations

import re
import unicodedata
from urllib.parse import urlsplit

#: The most destinations one source gives the turn (044's cap per PDF).
MAX_FOUND = 24
#: How much text is read. A mail body is already clamped by 026; this bounds a
#: long typed dump or a transcript the same way.
MAX_GATHER_BYTES = 32_000
MAX_URL = 2048
MAX_HOST = 255

#: 044's printed-URL pattern, moved here so a PDF and a dump share one rule.
URL_RE = re.compile(r"https?://[^\s<>\"'\]\)}]{1,2100}", re.IGNORECASE)
_URL_TAIL = ".,;:!?'\""

# The interim on-device detector's two patterns (020, 2026-11-02), ported: a
# North American number in its usual forms, or a + and another country's.
_US = re.compile(
    r"(?<![\w+.,-])(?:\+?1[ .-]?)?\(?([2-9]\d{2})\)?[ .-]?([2-9]\d{2})[ .-]?(\d{4})(?![\w-])",
    re.ASCII,
)
_OTHER = re.compile(r"(?<![\w+])\+(?!1)\d[\d ().-]{6,20}\d(?![\w-])", re.ASCII)
_EMAIL = re.compile(
    r"(?<![\w.+-])([A-Za-z0-9._+-]{1,64})@([A-Za-z0-9-]{1,63}(?:\.[A-Za-z0-9-]{1,63}){0,8}\.[A-Za-z]{2,24})(?![\w-])"
)

_TEL = re.compile(r"tel:\+\d{8,15}", re.ASCII)
_MAILTO = re.compile(
    r"mailto:[A-Za-z0-9._+-]{1,64}@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,24}", re.ASCII
)

_DIGIT_WORDS = {
    "zero": "0",
    "oh": "0",
    "one": "1",
    "two": "2",
    "three": "3",
    "four": "4",
    "five": "5",
    "six": "6",
    "seven": "7",
    "eight": "8",
    "nine": "9",
}
# A word that says the run beside it is not a plain run of digits.
_NUMBER_WORDS = {
    "double",
    "triple",
    "ten",
    "eleven",
    "twelve",
    "thirteen",
    "fourteen",
    "fifteen",
    "sixteen",
    "seventeen",
    "eighteen",
    "nineteen",
    "twenty",
    "thirty",
    "forty",
    "fifty",
    "sixty",
    "seventy",
    "eighty",
    "ninety",
    "hundred",
    "thousand",
    "million",
    "point",
}


def ok_url(url: str) -> bool:
    """http/https only, within bounds, with a host (044, SEC-1)."""
    if len(url.encode()) > MAX_URL:
        return False
    try:
        parts = urlsplit(url)
        host = parts.hostname or ""
    except ValueError:
        return False
    if parts.scheme.lower() not in ("http", "https"):
        return False
    return bool(host) and len(host.encode()) <= MAX_HOST


def is_action_url(url: str | None) -> bool:
    """The shape every surface accepts, the twin of `isActionUrl`."""
    if not url or len(url) > MAX_URL:
        return False
    if re.match(r"https?://", url, re.IGNORECASE):
        return ok_url(url)
    if url.startswith("tel:"):
        return _TEL.fullmatch(url) is not None
    if url.startswith("mailto:"):
        return len(url) <= 7 + 254 and _MAILTO.fullmatch(url) is not None
    return False


def kind_of(url: str | None) -> str | None:
    if not is_action_url(url):
        return None
    assert url is not None
    return "call" if url.startswith("tel:") else "email" if url.startswith("mailto:") else "open"


def label_ok(label: str | None) -> bool:
    """The twin of `labelOk`: what the tap does, never where it goes."""
    # Look-alike dots fold to "." first, as `labelOk` does.
    text = unicodedata.normalize("NFKC", label or "").replace("\u3002", ".").strip()
    if not 1 <= len(text) <= 24:
        return False
    if re.search(r"[‐-―−]", text):
        return False
    if re.search(r"[a-z][a-z0-9+.-]*:\S", text, re.IGNORECASE):
        return False
    if "@" in text:
        return False
    if re.search(r"[\w-]+\.[a-z]{2,}", text, re.IGNORECASE | re.ASCII):
        return False
    return re.search(r"\d(?:[\s.()-]?\d){3,}", text) is None


def _spoken_digits(text: str) -> str:
    """A transcript's run of digit words, as digits, when it can only be a
    phone number: one unbroken run of 10 or 11 digit words, or 8 to 15 led by
    *plus*, with nothing but spaces and commas between, and no number word
    beside it. Everything else is left as it was said."""
    tokens = list(re.finditer(r"\S+", text))
    out: list[str] = []
    last = 0
    i = 0
    while i < len(tokens):
        word = tokens[i].group().lower().rstrip(",")
        if word not in _DIGIT_WORDS:
            i += 1
            continue
        start = i
        digits = ""
        while i < len(tokens):
            raw = tokens[i].group().lower()
            word = raw.rstrip(",")
            if word not in _DIGIT_WORDS:
                break
            digits += _DIGIT_WORDS[word]
            i += 1
        before = tokens[start - 1].group().lower().rstrip(",") if start > 0 else ""
        after = tokens[i].group().lower().rstrip(",.") if i < len(tokens) else ""
        plus = before == "plus"
        fits = 8 <= len(digits) <= 15 if plus else len(digits) in (10, 11)
        if fits and before not in _NUMBER_WORDS and after not in _NUMBER_WORDS:
            begin = tokens[start - 1].start() if plus else tokens[start].start()
            out.append(text[last:begin])
            out.append(("+" if plus else "") + digits + " ")
            last = tokens[i - 1].end()
    out.append(text[last:])
    return "".join(out)


def gather(text: str | None, *, spoken: bool = False) -> list[str]:
    """The destinations in `text`, normalised, in text order, deduped, capped."""
    if not text:
        return []
    text = text.encode()[:MAX_GATHER_BYTES].decode(errors="ignore")
    if spoken:
        text = _spoken_digits(text)
    hits: list[tuple[int, str]] = []
    taken: list[tuple[int, int]] = []

    for match in URL_RE.finditer(text):
        url = match.group().rstrip(_URL_TAIL)
        if ok_url(url):
            hits.append((match.start(), url))
        taken.append(match.span())
    for match in _EMAIL.finditer(text):
        if any(a <= match.start() < b for a, b in taken):
            continue
        local, host = match.groups()
        address = f"mailto:{local}@{host.lower()}"
        if is_action_url(address):
            hits.append((match.start(), address))
        taken.append(match.span())

    def free(span: tuple[int, int]) -> bool:
        return not any(a < span[1] and span[0] < b for a, b in taken)

    for match in _US.finditer(text):
        if free(match.span()):
            area, exchange, line = match.groups()
            hits.append((match.start(), f"tel:+1{area}{exchange}{line}"))
    for match in _OTHER.finditer(text):
        digits = re.sub(r"\D", "", match.group())
        if free(match.span()) and 8 <= len(digits) <= 15:
            hits.append((match.start(), f"tel:+{digits}"))

    out: list[str] = []
    for _, dest in sorted(hits, key=lambda hit: hit[0]):
        if dest not in out:
            out.append(dest)
        if len(out) >= MAX_FOUND:
            break
    return out


def found_in(quoted: str | None, text_line: str | None) -> str | None:
    """050. A picture's action: the destination the model quoted, kept only
    when it is exactly one destination and gathering the row's own `Text:`
    line finds it too. Both sides are normalised, so `+1 (212) 555-0142`
    quoted against `212 555 0142` in the line is the same number."""
    mine = gather(quoted)
    if len(mine) != 1:
        return None
    return mine[0] if mine[0] in gather(text_line) else None
