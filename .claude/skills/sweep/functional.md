# The functional lane

The lead's own lane, run while the review fan-out works: the product on web, iOS
and Android against the sweep's local stack, signed in as people from the cast.
Suites and stubs have shipped defects here that a single real turn found; this lane
is that real turn, for every main journey, on every platform.

## Set up

1. **Servers** on free ports in 4700 to 4719 (check the board for ports in use).
   A worktree-isolated session cannot write main's `.claude/launch.json`, which is
   the only one `preview_start` reads, and other sessions edit it too. So a
   scratchpad `run.sh api|web|worker` loads the repo `.env` and the sweep's env file,
   sets `API_PORT`, `API_URL`, `WEB_URL` and `NEXT_PUBLIC_API_URL`, unsets
   `MAIL_LIVE`, and execs the process; start each with Bash in the background, logs
   to the scratchpad, and open the browser pane with `preview_start {url}`. Check the
   API's boot line says the memory mailer, and `ps eww` on the port's process names
   `offload_sweep`. The worker needs the model keys, so a dump runs a real turn: that
   costs cents per dump, not the eval budget, but keep the dumps few.
2. **The cast**: seed it once for every person the pass needs (`seedCast()` then
   `signInAs()` per name, in one script). Each run of the seed clears the cast first,
   which ends every session minted before it and every dump made since. On the web,
   set the cookie from the file with `document.cookie` on the web's origin; the API
   on another port reads it (cookies ignore ports).
3. **Holds**: `board.py hold sim-<device> "sweep: functional pass"` and
   `board.py hold pixel "..."`. A refusal means wait or skip that platform and say so
   in the report. Never take a device another session is using.
4. **Builds**: the installed development builds if they carry every native module on
   the branch, else local builds only (memories: testing-on-ios-simulator,
   testing-on-the-phone, eas-cloud-builds-for-prod-only). Metro on its own port,
   restarted with `--clear` after edits, since it does not see worktree changes.
   The phones sign in through a two-line, never-committed hook in `lib/auth.ts` that
   writes `EXPO_PUBLIC_DEV_COOKIE` to SecureStore's `offload_cookie` (the expo
   plugin's JSON); revert it before any test run or commit. Taps land with a lag on a
   development build and the panel's screenshot can show an older frame: capture with
   `xcrun simctl io <udid> screenshot`, scale with `sips -Z 874`, and tap from that.
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
