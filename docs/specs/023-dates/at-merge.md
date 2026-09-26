# 023, at merge

The entries below go on `main` in the same change as the merge, per task A3: three in `docs/tech/decisions.md`, one in `.claude/skills/offload-design/decisions.md`. They are written here, in the worktree, because both logs are shared state edited on `main` only.

## docs/tech/decisions.md

### 2026-09-22 · One clock per account, under the city's current name

`accounts.time_zone` is the clock every timed date is drawn and scheduled in, set at first run from the device, backfilled for an older account from the last zone a message carried or its next dump, and changed by the person alone: in Settings, or by the strip on Today when the phone is somewhere else. `follow_device` gates the strip and `kept_time_zone` holds the one device zone answered Keep to, so a two-week trip asks once. No travel signal beside it: the 0051 header stays on the three model-bound routes and is never widened, because the privacy page says the zone is kept with a message and once at first run, and nothing else.

**The stored name is the city's current one.** Node's ICU still resolves Asia/Kolkata to Asia/Calcutta and Europe/Kyiv to Europe/Kiev while a phone reports the current name; stored as ICU spelt it, the clock a phone set and the phone's own word differed by spelling alone and the strip offered a switch to the zone it was in. Every writer and every comparison goes through one table of renames in the widgets package, renames only, never the merges tzdata made in 2022. Hermes has no `Intl.supportedValuesOf`, so the zone list is checked in beside the function and held to Node's own list by a test.

**Design system impact:** none here; the visual side is in the design log.

### 2026-09-22 · Recurrence is an RFC 5545 rule in a closed grammar, and the server is canonical

`rrule` replaces the six-value enum on `content` and `notes`. The grammar is closed to what the sheet can draw: FREQ of the four, INTERVAL 1 to 99, BYDAY as a weekly set or a monthly ordinal of 1 to 4 or -1, BYMONTHDAY, UNTIL or COUNT, WKST. One parser and one serialiser in the widgets package; the server stores only its own serialisation, refuses the rest by name, and the same shape check runs in Python before a call reaches the API. A rule anchors on the type's own column, an event's occurrence and everything else's due date, and clearing the anchor clears the rule. Migration 0057 rewrote the enum and moved a repeating task's anchor to its due date, dropping the occurrence it anchored on, which the rail had drawn twice.

**Design system impact:** none here.

### 2026-09-22 · A person-facing edit route with a snapshot for Undo

`PATCH /v1/content/:id` takes title, body, the three dates, all day, the rule and the reminder flag in one write, distinguishing absent from null so Clear is an edit, refuses by name (`bad_date`, `bad_rule`, `on_calendar`), and returns the previous values so Undo is one request. Two things the review found are now rules: the snapshot is a body the route accepts, so a day travels as a day and not the noon instant it is stored at; and a date change is a value that differs from what the row holds, not a field that was merely sent. The membership check runs inside the transaction that writes. The route takes `isReminder` either way because Undo has to restore it, while no screen draws a way to set it: a reminder stays the model's, and Remind me is only the way out of one.

**Design system impact:** none here.

## .claude/skills/offload-design/decisions.md

### 2026-09-22 · Dates: the chip, the When sheet, the strip and Date and time, as built
**Surface:** iOS, Android, web

**Is:** the row draws its date as a chip at the trailing edge of the title line, late in the clay soft ground, soon in the amber one, plain past that, and a done row loses the colour; a bell mark on a reminder. The edit sheet holds the title, the details, When and Repeats, and Remind me only while a row is one. When opens a grid with today outlined and the pick filled, All day and the platform's hour, Ends at on an event, seven presets and Custom. The strip on Today says "Showing times in Lisbon. This phone says Tokyo." with Use and Keep inside the card; the web says "This browser says". Date and time sits in The app above Appearance, with Starts on moved out of Appearance on every surface.

**Where the code diverged, and why.** Two aliases were minted for the chip's soft grounds, `--surface-noticed-soft` and `--surface-danger-soft`, because the code may not consume ramps. The strip's disc is `--text-accent` as a background, because the tokens name the accent only as text and the handoff names the same ramp step for both. Week starts on is a `Segmented` under a heading rather than the mock's Week group with a Starts on row. Custom's unit is four pills where the mock draws a select. The Android hour row says Time on a task and Starts on an event. The edit sheet's three pills wrap at an accessibility text size, seen on the simulator. The mock's dashed slot for a row with no date is not drawn, per principle 04. The action sheet's When row says "Fri 25", not the chip's "Due Fri 25", and is offered to every member as the sheet behind Edit is. "Every weekday" carries no trailing "Mon to Fri" note.

**Design system impact:** the two soft aliases are in `tokens/colors.css` already. Worth carrying into the kits: a solid accent surface alias, since two components now paint the accent as a fill; the strip's web wording; the Segmented under a heading for Starts on and the pills for Custom's unit, or a ruling that the mock wins; the Time versus Starts label by type; and the note that a sheet's action row must wrap at large text.
