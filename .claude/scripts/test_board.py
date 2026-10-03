"""Tests for board.py, the message board the coding sessions share.

Run: python3 .claude/scripts/test_board.py
Each test gets its own board directory, so nothing here touches the real one.
"""
import json
import os
import subprocess
import sys
import tempfile
import unittest

BOARD = os.path.join(os.path.dirname(os.path.abspath(__file__)), "board.py")


class BoardTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)

    def run_board(self, session, *args, stdin=None):
        env = dict(os.environ, BOARD_DIR=self.tmp.name, BOARD_AS=session,
                   CLAUDE_CODE_SESSION_ID="sid-" + session)
        return subprocess.run([sys.executable, BOARD, *args], env=env, input=stdin,
                              capture_output=True, text=True)

    def hook(self, session, event="PreToolUse"):
        payload = json.dumps({"session_id": "sid-" + session, "hook_event_name": event})
        return self.run_board(session, "hook", stdin=payload)

    def test_a_message_reaches_the_other_session_once_and_never_its_author(self):
        self.run_board("b", "inbox")
        self.run_board("a", "inbox")
        self.assertEqual(self.run_board("a", "say", "building 033, touching apps/web/gate").returncode, 0)
        first = self.run_board("b", "inbox").stdout
        self.assertIn("building 033", first)
        self.assertIn("a", first)
        self.assertEqual(self.run_board("b", "inbox").stdout.strip(), "")
        self.assertEqual(self.run_board("a", "inbox").stdout.strip(), "")

    def test_a_hold_refuses_a_second_holder_until_it_is_released(self):
        self.assertEqual(self.run_board("a", "hold", "suite", "pnpm test on the shared database").returncode, 0)
        refused = self.run_board("b", "hold", "suite", "committing")
        self.assertEqual(refused.returncode, 1)
        self.assertIn("a", refused.stdout)
        self.assertIn("pnpm test on the shared database", refused.stdout)
        self.assertEqual(self.run_board("a", "release", "suite").returncode, 0)
        self.assertEqual(self.run_board("b", "hold", "suite", "committing").returncode, 0)

    def test_the_holder_can_extend_its_own_hold(self):
        self.run_board("a", "hold", "suite", "first")
        self.assertEqual(self.run_board("a", "hold", "suite", "still going").returncode, 0)

    def test_only_the_holder_releases(self):
        self.run_board("a", "hold", "suite", "mine")
        self.assertEqual(self.run_board("b", "release", "suite").returncode, 1)
        self.assertEqual(self.run_board("b", "hold", "suite", "x").returncode, 1)

    def test_an_expired_hold_does_not_block(self):
        self.run_board("a", "hold", "suite", "crashed mid run", "--for", "0")
        self.assertEqual(self.run_board("b", "hold", "suite", "next").returncode, 0)

    def test_a_new_session_starts_with_what_is_live(self):
        self.run_board("a", "hold", "sim-iphone-17", "device test")
        self.run_board("a", "plan", "docs/specs/033-first-run/impl-spec.md", "first run, web gate")
        out = self.run_board("c", "inbox").stdout
        self.assertIn("sim-iphone-17", out)
        self.assertIn(os.path.abspath("docs/specs/033-first-run/impl-spec.md"), out)
        self.assertEqual(self.run_board("c", "inbox").stdout.strip(), "")

    def test_status_lists_holds_and_plans_for_everyone(self):
        self.run_board("a", "hold", "suite", "running")
        self.run_board("a", "plan", "docs/specs/x/impl-spec.md")
        out = self.run_board("a", "status").stdout
        self.assertIn("suite", out)
        self.assertIn("impl-spec.md", out)

    def test_the_hook_delivers_as_context_then_stays_quiet(self):
        self.hook("b")
        self.run_board("a", "say", "migration 0061 is mine")
        out = self.hook("b").stdout
        body = json.loads(out)["hookSpecificOutput"]
        self.assertEqual(body["hookEventName"], "PreToolUse")
        self.assertIn("migration 0061 is mine", body["additionalContext"])
        self.assertEqual(self.hook("b").stdout.strip(), "")

    def test_a_session_can_name_itself_when_the_directory_cannot(self):
        env = {k: v for k, v in os.environ.items() if k != "BOARD_AS"}
        env.update(BOARD_DIR=self.tmp.name, CLAUDE_CODE_SESSION_ID="sid-x")
        run = lambda *a: subprocess.run([sys.executable, BOARD, *a], env=env, capture_output=True, text=True)
        self.assertEqual(run("as", "034-admin").returncode, 0)
        run("say", "taking migrations 0074 to 0079")
        run("hold", "suite", "one run")
        out = self.run_board("b", "inbox").stdout
        self.assertIn("034-admin] taking migrations", out)
        self.assertIn("034-admin] holds suite", out)

    def test_the_hook_never_fails_a_tool_call(self):
        result = self.run_board("b", "hook", stdin="not json")
        self.assertEqual(result.returncode, 0)


if __name__ == "__main__":
    unittest.main()
