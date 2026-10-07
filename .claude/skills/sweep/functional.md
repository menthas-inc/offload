# The functional lane

The lead's own lane, run while the review fan-out works: the product on web, iOS
and Android against the sweep's local stack, signed in as people from the cast.
Suites and stubs have shipped defects here that a single real turn found; this lane
is that real turn, for every main journey, on every platform.

## Set up

1. **Servers** on free ports in 4700 to 4719 (check the board for ports in use):
   temporary entries in main's `.claude/launch.json` that `source` the sweep's
   `env-offload_sweep.sh` and `cd` into the worktree (memory: feature-session-loop).
   API, web and worker. The worker needs the model keys, so a dump runs a real
   turn: that costs cents per dump, not the eval budget, but keep the dumps few.
   The phones' Google sign-in needs the API on 4701; a local test session avoids it.
2. **The cast**: `pnpm -C apps/core-api seed:cast <name> <cookie-file>` against
   `offload_sweep`, for Behrooz, Meera and Ana at least (connected, connected, alone).
3. **Holds**: `board.py hold sim-<device> "sweep: functional pass"` and
   `board.py hold pixel "..."`. A refusal means wait or skip that platform and say so
   in the report. Never take a device another session is using.
4. **Builds**: the installed development builds if they carry every native module on
   the branch, else local builds only (memories: testing-on-ios-simulator,
   testing-on-the-phone, eas-cloud-builds-for-prod-only). Metro on its own port,
   restarted with `--clear` after edits, since it does not see worktree changes.
5. **Before touching a device**, read and write down every setting the pass will
   change, and put each back in the same batch (memory: leave-the-phone-as-found).

## The journeys

Each one on web, iOS and Android unless it exists on fewer. For each: works,
broken, or diverges from its kit (`find-kit.sh <screen>`, and look at the kit, not
the readme). A screenshot for every broken or divergent result, saved under
`<scratchpad>/sweep/shots/`.

- **Getting in**: first run for a fresh account, the gate, no-invite.
- **The dump**: text, a link, a photo, a voice note. The turn names what landed and
  links to it; the writing indicator shows and goes.
- **The thread page**: what was dumped, rows, widgets, Undo within its window.
- **Asking**: a question that should be answered from the person's threads, and one
  that should be asked back.
- **Today and loose**: rows from the dumps above appear where they should.
- **Memories**: the tab, the map, a card for something the cast knows.
- **Sharing**: Behrooz shares a thread with Meera; Meera sees it, Ana cannot.
- **Labels, the calendar and maps**: one action each that writes something.
- **Settings**: name, notifications, the storage line, export, and account deletion
  on a throwaway account (never a cast member the other journeys need).
- **Admin panel** (web only): signed in as staff, the pages that read data load.
- **The marketing site**: landing, privacy, terms render and link to each other.
- **Keyboard and safe area** on both phones, for every screen with a text field:
  the field stays above the keyboard. The kits cannot show this.

Check the console and the server logs after each journey: an error logged during a
journey that looked fine is a finding.

## Report

A table in the sweep report: journey by platform, each cell works, broken or
divergent, with the finding id for anything that is not "works". Findings join the
worklist with the other lanes' in Phase 3.
