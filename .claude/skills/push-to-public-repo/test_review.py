"""review.py against a throwaway repo: run with `python3 -I test_review.py`."""
import os, subprocess, sys, tempfile

here = os.path.dirname(os.path.abspath(__file__))
fake = "_".join(["re", "abcd1234", "abcdefgh5678"])  # assembled, so no scanner mistakes this file for a key
with tempfile.TemporaryDirectory() as d:
    run = lambda *a: subprocess.run(a, cwd=d, check=True, capture_output=True)
    run("git", "init", "-q", "-b", "main")
    os.makedirs(f"{d}/docs")
    open(f"{d}/docs/a.md", "w").write(
        "[ok](b.md) [gone](missing.md) [web](https://x.example)\n"
        "see menthas-inc/offload_app/pull/1 and /Users/someone/dev\n")
    open(f"{d}/docs/b.md", "w").write("fixture ana@example.com, real jo@realmail.com\n")
    open(f"{d}/.env.sample", "w").write(f"MAILER={fake}\n")
    run("git", "add", "-A")
    run("git", "-c", "user.name=t", "-c", "user.email=t@example.com", "commit", "-qm", "one")
    r = subprocess.run([sys.executable, "-I", f"{here}/review.py", d, "", "main"], capture_output=True, text=True)
    out = r.stdout

assert r.returncode == 1, "a secret shape exits 1"
assert "SECRET resend key: .env.sample" in out and fake not in out, "named, never printed"
assert "jo@realmail.com" in out and "ana@example.com" not in out, "fixture domains pass, others are flagged"
assert "docs/a.md:1 -> missing.md" in out and "-> b.md" not in out and "x.example" not in out, "only the dead link"
assert "links into the private repository: 1" in out and "absolute home paths: 1" in out
print("ok")
