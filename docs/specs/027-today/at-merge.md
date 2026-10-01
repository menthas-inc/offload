# 027 Today, at merge

What was built differently from the specs, and what the logs need. Written during the build on 2026-10-01.

## Built differently

- **No new thread index.** `content_thread_due_idx (thread_id, due_at)` already existed from 0027 and serves the day read and the picks; 0064 adds only `content_picks_idx` and `questions_open_account_idx`. The impl-spec is corrected.
- **Today's To do rows are tighter than the thread page's**, at the owner's request on seeing the simulator: 12 at the sides, 8 between the checkbox and the title, and the checkbox in its own width rather than a tile's slot (the phones' `ContentRow` gains `dense`; the web targets `[data-row]` inside Today's card). Titles start about 40 from the card's edge, near the kit's 44, where they started at 68 on the phones and 56 on the web.
- **The row paints the card's fill under its swipe** (`ground`), so Today's rows sit on `--surface-fill` as the kit draws them; they painted the page colour before.
- **The calendar card's line** is the account's address when more than one Google account is connected, and *Sign in again to see its events here.* otherwise.
- **The invitation card's line** is 022's own preview line, *3 in it. You can add to it, and you cannot delete anything of Ana's.*, ellipsised, on both surfaces.
- **N of M counts from the load** on the phones: a settled card stays settled when the stack rebuilds between reads (the zone card leaving once Keep lands brought a put-off card back before this). The web keeps settled cards for the screen's life; its *M* can drop by one when the zone card leaves.
- **The day swipe on the phones is on the stepper and the next line**, not the whole day, so it never competes with a row's swipe or the events strip's scroll.
- **A question card's chips are 30 on the web**, `QuickReplies`' own height, and 34 on the phones beside the other cards' pills.
- **Past a hundred due on one day**, To do says *and N more* in quiet ink; the day read does not carry those rows, so they do not open in place.
- ***N more late* is quiet ink** (`--text-secondary`) on every surface, not danger or accent.
- **Customize Today's switches are Settings' own switch** on each platform, ink when on, rather than the kit's moss.
- **The evening digest's day** rides the push data as `day`; Activity's door derives it from the row's `occurredAt` in the account's zone.
- **`Retry-After` is exposed to the web** through CORS (`exposedHeaders`), so the web's launch can honour it; the phones read it from `send`.
- **Launch on the phones** uses `expo-network`, already in the development build, so no new build was needed.

- **A repeating event that spans several days** shows on the first day of each occurrence only; a single multi-day event shows on every day it covers. Rare enough to leave, and written down rather than silent.
- **One link pattern** (`GOOGLE_EVENT_LINK` in `@offload/widgets`) is what the sync keeps and both clients open; the column's check says the same.
- **A failed Customize write undoes only itself** (`afterWrite`): a quicker second gesture is never put back by the first one failing.

## Verified on devices

- **iOS simulator (iPhone 17)** against the worktree's API on an isolated database: Needs you (put off, the zone card's Keep, the count), the stepper and its names through Sunday, Tomorrow with another member's event, a three-day all-day event, To do with late, timed and plain rows, + Today with its toast, the row sheet's Labels panel, Customize Today's switch, drag and Reset, and the Today tab's reset.
- **Pixel 9**: the same Today in Material, and the tabs gone under the soft keyboard with the composer riding it.
- **Web (1280 wide)**: Needs you with slivers and put-off, the crumb's date, the stepper, the strip, To do, Customize Today as the second pane.
- **Not verified on a device**: dark mode on any surface, the largest type size, reduced motion, the Google Calendar hand-off, the launch states with the API down.

## For the logs, on main after merge

- **`.claude/skills/offload-design/decisions.md`**, one entry, *Today as built*, carrying the feature spec's design system impact list plus: Today's tighter To do rows; the row on the card's fill; the invitation card's 022 line; *N more late* in quiet ink; Customize Today's switches as Settings'; the web's Customize as a second pane at `/today?customize=1` with Today at 520; question chips at 30 on the web.
- **Dated amendment lines**: 023's strip (now a Needs you card), 024's AC-22 (replaced, `/v1/today` kept for installed phones), 019's AC-10 (drawn), the readme's launch line (two states).
- **`docs/tech/decisions.md`**: nothing moved on the reversible allowlist; + Today is `edit_content`.
