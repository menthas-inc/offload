"""Paths that hold a secret value, shared by the hooks that refuse to print or open one.

One list, so the Bash hook and the Read hook cannot drift on what counts. A match
is by name or by directory, never by content, because a hook cannot read intent.
"""
import re

SECRET = re.compile(
    r"(^|/)(\.env(\.[A-Za-z0-9_-]+)?|id_ed25519|id_rsa|id_ecdsa|credentials\.json|credentials\.db"
    r"|access_tokens\.db|\.netrc|\.npmrc|\.pgpass)$"
    r"|\.(p8|pem|key|p12|pfx|jks|keystore)$"
    r"|(^|/)\.(config/gcloud|aws|railway|ssh)/"
    r"|(^|/)\.expo/state\.json$"
    r"|service-?account[^/]*\.json$|fcm[^/]*\.json$"
)


def is_secret(path: str) -> bool:
    path = (path or "").strip().strip("\"'")
    if not path:
        return False
    # Committed templates hold placeholders, not secrets.
    if path.endswith((".env.example", ".env.sample")):
        return False
    return bool(SECRET.search(path))
