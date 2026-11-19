"""Mechanical review of a public catch-up. Never prints a secret value.

    python3 -I review.py <public repo> <base or ""> <head>

1. Secrets and personal data in lines added since base (all history if base is "").
2. Images and other binaries added since base, which only a person or a model can look at.
3. Docs a visitor would trip over, across the whole head tree: dead relative links in
   markdown, links into the private repository, absolute home paths.
Exit 1 if section 1 found a secret shape, so a script can stop on it.
"""
import os, re, subprocess, sys

repo, base, head = sys.argv[1], sys.argv[2], sys.argv[3]
rng = f"{base}..{head}" if base else head
git = lambda *a: subprocess.run(["git", "-C", repo, *a], capture_output=True, text=True, errors="replace").stdout

SECRETS = {
    "private key": r"-----BEGIN [A-Z ]*PRIVATE KEY-----",
    "anthropic key": r"sk-ant-[A-Za-z0-9_-]{20,}",
    "openai key": r"\bsk-(?:proj-)?[A-Za-z0-9]{32,}",
    "aws key": r"AKIA[0-9A-Z]{16}",
    "google key": r"AIza[0-9A-Za-z_-]{35}",
    "google oauth secret": r"GOCSPX-[A-Za-z0-9_-]{20,}",
    "github token": r"(?:ghp|gho|ghs|ghu)_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}",
    "resend key": r"\bre_[A-Za-z0-9]{8,}_[A-Za-z0-9]{8,}",
    "slack token": r"xox[bpas]-[A-Za-z0-9-]{10,}",
    "stripe key": r"\b[sr]k_live_[A-Za-z0-9]{10,}",
    "jwt": r"eyJ[A-Za-z0-9_-]{20,}\.eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}",
    "session cookie": r"better-auth\.session_token=[A-Za-z0-9_.%-]{16,}",
    "db url with password": r"postgres(?:ql)?://[^:@/\s]+:(?!offload@|postgres@|password@|\$)[^@/\s]{6,}@(?!localhost|127\.|host\.docker|db\.example)",
    "assigned secret": r"(?i)\b[A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|API_KEY|PRIVATE_KEY|VAULT_KEY)\s*[=:]\s*['\"]?[A-Za-z0-9_\-/+=]{24,}",
}
PERSONAL = {
    "email": r"[A-Za-z0-9._%+-]+@(?!(?:[a-z0-9-]+\.)*(?:example\.(?:com|org|net)|offload\.club|users\.noreply\.github\.com|anthropic\.com)\b)(?![a-z0-9.-]*\.(?:test|example|invalid)\b)[A-Za-z0-9.-]+\.[A-Za-z]{2,}",
    "phone": r"(?<![\w.-])\+?\d{1,3}[ .-]?\(?\d{3}\)?[ .-]\d{3}[ .-]\d{4}(?![\w-])",
    "private ip": r"\b(?:10|192\.168|172\.(?:1[6-9]|2\d|3[01]))\.\d{1,3}\.\d{1,3}(?:\.\d{1,3})?\b",
    "home path": r"/Users/[a-z][a-z0-9_]+/",
    "railway host": r"[a-z0-9-]+\.(?:up\.railway\.app|railway\.internal)",
}
ALL = {**{k: (re.compile(v), True) for k, v in SECRETS.items()},
       **{k: (re.compile(v), False) for k, v in PERSONAL.items()}}

found_secret = False
hits = {}
commit = path = None
for line in git("log", "-p", "--no-color", "-U0", "--format=COMMIT %h", rng).splitlines():
    if line.startswith("COMMIT "):
        commit = line[7:]; continue
    if line.startswith("+++ b/"):
        path = line[6:]; continue
    if not line.startswith("+") or line.startswith("+++"):
        continue
    for kind, (rx, secret) in ALL.items():
        m = rx.search(line)
        if m:
            found_secret |= secret
            shown = f"len {len(m.group(0))}" if secret else m.group(0)[:60]
            hits.setdefault((kind, path), []).append(f"{commit} {shown}")

print(f"## 1. Secrets and personal data added in {rng}")
if not hits:
    print("none found")
for (kind, p), where in sorted(hits.items(), key=lambda kv: (kv[0][0] not in SECRETS, kv[0])):
    tag = "SECRET" if kind in SECRETS else "check"
    print(f"- {tag} {kind}: {p} x{len(where)} ({'; '.join(sorted(set(where))[:3])})")

print(f"\n## 2. Binaries added or changed in {rng} (look at each)")
binaries = [l.split("\t")[-1] for l in git("log", "--no-color", "--numstat", "--format=", rng).splitlines()
            if l.startswith("-\t-\t")]
binaries = sorted(set(b for b in binaries if b))
print("\n".join(f"- {b}" for b in binaries) if binaries else "none")

print("\n## 3. Docs a visitor would trip over (whole tree)")
tree = set(git("ls-tree", "-r", "--name-only", head).splitlines())
dirs = {os.path.dirname(t) for t in tree}
while True:
    more = {os.path.dirname(d) for d in dirs} - dirs
    if not more: break
    dirs |= more
link = re.compile(r"\]\(([^)\s]+)(?:\s+\"[^\"]*\")?\)")
dead, private, homes = [], [], []
for f in sorted(t for t in tree if t.endswith(".md")):
    text = git("show", f"{head}:{f}")
    for n, l in enumerate(text.splitlines(), 1):
        for target in link.findall(l):
            if re.match(r"^(?:[a-z]+:|#|<)", target):
                continue
            t = os.path.normpath(os.path.join(os.path.dirname(f), target.split("#")[0]))
            if t and t not in tree and t not in dirs:
                dead.append(f"{f}:{n} -> {target}")
        if "menthas-inc/offload_app" in l:
            private.append(f"{f}:{n}")
        if re.search(PERSONAL["home path"], l):
            homes.append(f"{f}:{n}")
for title, items in (("dead relative links", dead), ("links into the private repository", private),
                     ("absolute home paths", homes)):
    print(f"- {title}: {len(items)}")
    for i in items[:25]:
        print(f"    {i}")
    if len(items) > 25:
        print(f"    ... {len(items) - 25} more")

sys.exit(1 if found_secret else 0)
