"""Tests for sweep_due.py, which says when the repo sweep is due.

Run: python3 .claude/scripts/test_sweep_due.py
Each test builds its own throwaway repository, so nothing here reads the real one.
"""
import json
import os
import subprocess
import sys
import tempfile
import importlib.util
import unittest
from datetime import date, timedelta

SCRIPT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "sweep_due.py")
_spec = importlib.util.spec_from_file_location("sweep_due", SCRIPT)
due = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(due)


class SweepDueTest(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.repo = os.path.join(tmp.name, "repo")
        self.state = os.path.join(tmp.name, "state")
        os.makedirs(self.repo)
        self.git("init", "-q", "-b", "main")
        self.write("README.md", "offload\n")
        self.commit("start")
        self.write("docs/sweeps/last.json", json.dumps({"date": "2026-10-01"}))
        self.commit("the last sweep")

    def git(self, *args):
        env = dict(os.environ, GIT_AUTHOR_NAME="t", GIT_AUTHOR_EMAIL="t@t",
                   GIT_COMMITTER_NAME="t", GIT_COMMITTER_EMAIL="t@t")
        return subprocess.run(["git", *args], cwd=self.repo, env=env, check=True,
                              capture_output=True, text=True).stdout.strip()

    def write(self, path, text):
        full = os.path.join(self.repo, path)
        os.makedirs(os.path.dirname(full), exist_ok=True)
        with open(full, "w") as f:
            f.write(text)

    def commit(self, message):
        self.git("add", "-A")
        self.git("commit", "-q", "-m", message)

    def merge_feature(self, name, files):
        self.git("checkout", "-q", "-b", name)
        for path, lines in files.items():
            self.write(path, "".join(f"line {i}\n" for i in range(lines)))
        self.commit(name)
        self.git("checkout", "-q", "main")
        self.git("merge", "-q", "--no-ff", "-m", f"Merge {name}", name)

    def run_script(self, *args, today="2026-10-07", stdin=""):
        env = dict(os.environ, SWEEP_STATE_DIR=self.state, SWEEP_TODAY=today)
        return subprocess.run([sys.executable, SCRIPT, *args], cwd=self.repo, env=env,
                              input=stdin, capture_output=True, text=True)

    def measure(self, today="2026-10-07"):
        out = self.run_script("check", "--json", today=today)
        self.assertEqual(out.returncode, 0, out.stderr)
        return json.loads(out.stdout)

    def test_counts_merges_lines_and_risky_lines_since_the_last_sweep(self):
        self.merge_feature("feat/a", {"apps/web/src/today.tsx": 100})
        self.merge_feature("feat/b", {"apps/core-api/migrations/0090_x.sql": 10,
                                      "apps/core-api/src/auth/gate.ts": 20})
        m = self.measure()
        self.assertEqual(m["merges"], 2)
        self.assertEqual(m["lines"], 130)
        self.assertEqual(m["risky"], 30)
        self.assertEqual(m["migrations"], 1)
        self.assertEqual(m["days"], 6)
        self.assertFalse(m["due"])

    def test_an_explicit_base_counts_from_there_instead(self):
        start = self.git("rev-list", "--max-parents=0", "HEAD")
        self.merge_feature("feat/a", {"apps/web/src/today.tsx": 100})
        self.write("docs/sweeps/last.json", json.dumps({"date": "2026-10-01", "base": start}))
        self.commit("bootstrap the ledger at an older review")
        m = self.measure()
        self.assertEqual(m["merges"], 1)
        self.assertEqual(m["lines"], 100)

    def test_generated_files_and_lockfiles_do_not_count(self):
        self.merge_feature("chore/deps", {"pnpm-lock.yaml": 5000,
                                          "apps/agent/uv.lock": 3000,
                                          ".claude/skills/offload-design/_ds_bundle.js": 9000,
                                          ".claude/skills/offload-design/ui_kits/web_app/WThing.jsx": 400,
                                          "docs/tech/harness-map.html": 2000,
                                          "docs/tech/vendor-terms/voyage/terms.md": 900})
        self.assertEqual(self.measure()["lines"], 0)

    def test_due_on_volume(self):
        self.merge_feature("feat/big", {"apps/web/src/big.tsx": due.LINES})
        m = self.measure()
        self.assertTrue(m["due"])
        self.assertIn("lines", m["why"])

    def test_due_on_risky_lines_well_under_the_volume_bar(self):
        self.merge_feature("feat/auth", {"apps/core-api/src/auth/new.ts": due.RISKY})
        m = self.measure()
        self.assertTrue(m["due"])
        self.assertIn("risky", m["why"])

    def test_due_on_merge_count(self):
        for i in range(due.MERGES):
            self.merge_feature(f"fix/{i}", {f"apps/web/src/f{i}.tsx": 5})
        m = self.measure()
        self.assertTrue(m["due"])
        self.assertIn("merges", m["why"])

    def test_due_on_age_once_anything_has_merged(self):
        later = date(2026, 10, 1) + timedelta(days=due.DAYS)
        self.assertFalse(self.measure(today="2027-01-30")["due"])
        self.merge_feature("fix/one", {"apps/web/src/one.tsx": 5})
        self.assertFalse(self.measure(today=(later - timedelta(days=1)).isoformat())["due"])
        m = self.measure(today=later.isoformat())
        self.assertTrue(m["due"])
        self.assertIn("days", m["why"])

    def test_missing_ledger_is_due_and_says_so(self):
        os.remove(os.path.join(self.repo, "docs/sweeps/last.json"))
        self.commit("drop the ledger")
        m = self.measure()
        self.assertTrue(m["due"])
        self.assertIn("no sweep", m["why"])
        self.assertIsNone(m["base"])

    def test_a_base_that_is_not_in_history_says_so_instead_of_a_traceback(self):
        self.write("docs/sweeps/last.json", json.dumps({"date": "2026-10-01", "base": "0" * 40}))
        self.commit("a ledger pointing at a rewritten commit")
        out = self.run_script("check")
        self.assertEqual(out.returncode, 1)
        self.assertEqual(out.stderr, "")
        self.assertIn("cannot measure", out.stdout)

    def big_change(self):
        self.merge_feature("feat/big", {"apps/web/src/big.tsx": due.LINES})

    def hook(self, today="2026-10-07"):
        out = self.run_script("hook", today=today, stdin=json.dumps({"hook_event_name": "SessionStart"}))
        self.assertEqual(out.returncode, 0, out.stderr)
        return out.stdout

    def test_hook_tells_the_session_to_flag_it_and_offer_a_worktree(self):
        self.big_change()
        out = json.loads(self.hook())
        context = out["hookSpecificOutput"]["additionalContext"]
        self.assertEqual(out["hookSpecificOutput"]["hookEventName"], "SessionStart")
        self.assertIn("/sweep", context)
        self.assertIn("worktree", context)
        self.assertLess(len(context), 1200)

    def test_hook_says_nothing_when_not_due(self):
        self.merge_feature("fix/one", {"apps/web/src/one.tsx": 5})
        self.assertEqual(self.hook(), "")

    def test_hook_nudges_once_a_day(self):
        self.big_change()
        self.assertNotEqual(self.hook(), "")
        self.assertEqual(self.hook(), "")
        self.assertNotEqual(self.hook(today="2026-10-08"), "")

    def test_hook_is_quiet_while_a_sweep_worktree_exists(self):
        self.big_change()
        self.git("worktree", "add", "-q", "-b", "feat/sweep-2026-10-07",
                 os.path.join(os.path.dirname(self.repo), "repo-sweep"))
        self.assertEqual(self.hook(), "")

    def test_a_feature_with_sweep_in_its_name_does_not_silence_the_nudge(self):
        self.big_change()
        self.git("worktree", "add", "-q", "-b", "feat/041-sweep-ui",
                 os.path.join(os.path.dirname(self.repo), "repo-041"))
        self.assertNotEqual(self.hook(), "")

    def test_hook_is_quiet_inside_a_feature_worktree(self):
        self.big_change()
        wt = os.path.join(os.path.dirname(self.repo), "repo-041-pdfs")
        self.git("worktree", "add", "-q", "-b", "feat/041-pdfs", wt)
        env = dict(os.environ, SWEEP_STATE_DIR=self.state, SWEEP_TODAY="2026-10-07")
        out = subprocess.run([sys.executable, SCRIPT, "hook"], cwd=wt, env=env, input="{}",
                             capture_output=True, text=True)
        self.assertEqual(out.returncode, 0, out.stderr)
        self.assertEqual(out.stdout, "")

    def test_hook_never_fails_a_session_outside_a_repository(self):
        env = dict(os.environ, SWEEP_STATE_DIR=self.state)
        out = subprocess.run([sys.executable, SCRIPT, "hook"], cwd=os.path.dirname(self.repo),
                             env=env, input="{}",
                             capture_output=True, text=True)
        self.assertEqual(out.returncode, 0)
        self.assertEqual(out.stdout, "")


if __name__ == "__main__":
    unittest.main()
