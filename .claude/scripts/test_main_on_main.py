"""The main checkout stays on main (.claude/hooks/main_on_main.py).

On 2026-10-26 two sessions worked in the main checkout at once, each on a branch
of its own, and one `git switch` moved the other's work onto a different branch.
Branches live in worktrees; the main checkout refuses to leave main.
"""
import os
import subprocess
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "hooks"))
from main_on_main import verdict  # noqa: E402


def git(cwd, *args):
    subprocess.run(["git", "-C", cwd, *args], check=True, capture_output=True)


class MainOnMain(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.main = os.path.join(cls.tmp.name, "repo")
        os.makedirs(cls.main)
        git(cls.main, "init", "-q", "-b", "main")
        git(cls.main, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "--allow-empty", "-m", "x")
        git(cls.main, "branch", "feat/other")
        with open(os.path.join(cls.main, "file.txt"), "w") as f:
            f.write("x")
        cls.wt = os.path.join(cls.tmp.name, "repo-wt")
        git(cls.main, "worktree", "add", "-q", "-b", "feat/wt", cls.wt)

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def refused(self, cmd, cwd=None):
        self.assertIsNotNone(verdict(cmd, cwd or self.main), cmd)

    def allowed(self, cmd, cwd=None):
        self.assertIsNone(verdict(cmd, cwd or self.main), cmd)

    def test_refuses_leaving_main_in_the_main_checkout(self):
        self.refused("git switch -c chore/x")
        self.refused("git switch -q -c docs/ota-first")
        self.refused("git switch feat/other")
        self.refused("git checkout -b chore/x")
        self.refused("git checkout feat/other")
        self.refused("git checkout -")
        self.refused("git switch --detach HEAD")
        self.refused("git fetch && git checkout -q feat/other")
        self.refused("gh pr checkout 141")

    def test_refuses_through_cd_and_dash_c(self):
        self.refused(f"cd {self.wt} && cd {self.main} && git switch feat/other", cwd=self.wt)
        self.refused(f"git -C {self.main} switch feat/other", cwd=self.wt)

    def test_allows_main_and_files(self):
        self.allowed("git switch main")
        self.allowed("git switch -q main && git pull -q --ff-only origin main")
        self.allowed("git checkout main")
        self.allowed("git checkout -- file.txt")
        self.allowed("git checkout file.txt")
        self.allowed("git status && git log --oneline -3")
        self.allowed("echo 'git switch feat/other'")

    def test_allows_anything_in_a_worktree(self):
        self.allowed("git switch -c feat/next", cwd=self.wt)
        self.allowed("git checkout feat/other", cwd=self.wt)
        self.allowed(f"git -C {self.wt} switch -c feat/next")
        self.allowed("gh pr checkout 141", cwd=self.wt)


if __name__ == "__main__":
    unittest.main()
