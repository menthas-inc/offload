# 031 Settings, tightened, feature spec

**Status:** drafted 2026-10-02 from the design system's *Settings, tightened* (decisions.md, 2026-10-02; readme **Settings**; `handoff/APPLY-2026-10-02-settings.md`; `explorations/settings-v2.html`) and the owner's answers of the same day
**Surfaces:** iOS, Android, web, and one field on the Core API
**Depends on:** 010 (the pages), 011 (Name), 016 (Reaching the web), 019 (calendars), 022 (people and connecting), 023 (date and time), 024 (notifications), 026 (mail), first run (002)
**Amends:** 010's page layouts and its Connected apps rows; 022's rule that connecting starts only from the Share sheet; 019's Connected apps row and the web's inline calendar block; 024's Notifications groups; 026's Mail row; first run, whose tutorial can be seen again

## Why

The settings pages work and read badly. Read from the code on 2 October:

- **Section labels are smaller than the rows they head.** 12px tertiary over 15px rows on every page and surface, so a page reads as one long list.
- **Signed in on says "Nothing else" when its read failed.** `listSignedIn` errors are caught as an empty list. The current device is always in a list that worked, so an empty list only ever meant a failure, and the page told the person there was nothing.
- **Country and Time zone on the web are native `select`s** with no colour scheme: in dark the closed control is a white field with light grey text.
- **My people has no way in.** Connecting starts only from a thread's Share sheet, so on day one the page is a sentence and a Blocked row.
- **Connected apps is four labelled groups of one row each**, two of them not built and one a paragraph.
- **Theme and Week starts on** are a bare segmented control that shows nothing of what it chooses.

## What

Everything not listed here stays as built: the routes, the rows' behaviour, every write, every failure line.

### 1. Section heading

A labelled section opens with **a glyph tile, a heading and an optional caption**, with an optional count pill beside the heading. The label stops being a caption.

- **Phones:** a 32px tile (iOS radius 9 on `--surface-accent-soft`, glyph 17px `--moss-700`; Android a circle on `--surface-attention-soft`, glyph `--blue-700`), a 17px semibold heading with -0.01em tracking, a 13px/1.45 `--text-secondary` caption, the card 12px under it, sections 26px apart.
- **Web:** the same tile, a 16px heading, the caption, a hairline under the heading and open rows under it, sections 34px apart.
- A section with **no label** (Sign out, the identity block) draws no heading.
- **A label with no glyph keeps today's small label.** That is the picker pages' region groups and the Calendar and Mail pages one level down, which the design does not redraw. The web index keeps its small labels: it is a navigation list.

Glyph per section:

| Page | Sections |
| --- | --- |
| Index (phones) | You `circle-dot`, Reaching you `bell`, What offload does with it `lock`, The app `sliders-horizontal` |
| My account | Profile `circle-dot`, Where you are `map-pin`, Signed in on `smartphone` (web `monitor`), Sign out with no heading |
| My people | Waiting on you `bell`, Connect with someone `user-plus`, Connected `users`, Asked by you `clock`, Blocked `ban` |
| Notifications | Dates `calendar`, People `users`, On this phone `smartphone` (web: On your phones) |
| Connected apps | Connected `link` |
| Reaching the web | Reaching the web `globe` |
| Date and time | Your clock `clock`, Week starts on `calendar` |
| Appearance | Theme `blend`, Text size `type` (web) |
| Help and about | Learn `compass`, About `text-quote` |

**Rows** keep their shape, with three changes: the value is 15px `--text-secondary`; a row that acts in place (End, Withdraw, Copy) draws a 32px outline pill instead of a value and a chevron (Android 40px); a status (*This device*, *Connected*, *On*) is a 24px moss pill with a 6px dot.

**Eight glyphs** join both clients' sets: `smartphone` `monitor` `user-plus` `globe` `copy` `log-out` `ban` `type`.

### 2. Choice tiles

Theme, Week starts on and the web's Text size are **preview tiles**, `ChoiceTiles`, beside `Segmented` (which stays for view switches). Equal columns with a 10px gap (web: at most 170px each for three, 220px for two). A tile is `--surface-raised`, radius 14 (Android 18), a hairline ring, 8px padding, a 62px preview at radius 9, and under it an 18px radio and the label at 14px medium. **Picked:** a 2px `--ink-950` inset ring and a filled radio; Android a 2px `--blue-600` ring on `--surface-attention-soft` with a blue radio.

Previews: Light `#FAF9F7` with three grey bars, Dark `#1C1B19` with darker bars, System split down the middle; Monday and Sunday the seven day initials with the first in a filled 22px circle (Android blue) and the weekend tertiary; Default and Larger *Aa* at 20 and 28px. **The preview colours are what they depict and do not follow the theme.** One tap writes. Each is a radio group to a screen reader, named by its heading.

### 3. My account

- **Profile**: Name (as built) and Email, with the note *From your Google sign in. Changing it is not done here.* (*From your Apple sign in.* for Apple; *From your sign in.* when both are linked).
- **Where you are**: caption *So a date or a forecast is the one where you are. Leave it unset and offload says it does not know rather than guessing.*; Country is the row.
- **Signed in on**, caption *Ending a session signs that device out on its next request.*
  - **This device is always the first row**, built from the session the client holds, so it draws when the list fails. Lead `smartphone` (phones) or `monitor` (web), a *This device* status pill, no note.
  - Others under it: device, *Since 14 Sep*, an **End** pill.
  - With others present, a last row **End all other sessions**, medium weight, no chevron: revokes every session but this one, then reads the list again.
  - **Only this device:** a second row *Nowhere else*, note *Sign in on another device and it shows here.*
  - **The read failed:** this device's row, and under the card *Couldn't load your other devices.* in `--text-danger` beside **Try again**. *Nothing else* is gone.
- **Sign out**: a last section with no heading, one row with a `log-out` lead. The index keeps its own Sign out.

### 4. Country and Time zone on the web

A token-drawn **combobox** replaces both native `select`s. Closed: a 34px field, radius 9, `--surface-input`, a `--border-strong` ring, the value at 14px and a 14px `chevron-down`, at least 150px wide. Open: a 250px popover under the field's right edge, `--surface-raised`, radius 12, hairline ring and soft shadow, 6px padding; a 36px filter on `--surface-fill` focused on open (*Find a country*, *Find a city*); then *Not set* in secondary (Country only), a hairline, and the list; rows 34px, radius 7, hover `--surface-fill`, a `check` on the current one. Time zone keeps its region headings. Filtering is the phones' rule: name contains, or code equals. Arrows move, Enter picks, Escape closes and returns focus; `role="combobox"` over a `listbox`.

**Phones** keep their pushed picker pages; the current row's *Now* becomes a 16px `check` in `--text-primary`.

### 5. My people

In order:

1. **Waiting on you** (count): the request cards. Not drawn when there are none.
2. **Connect with someone**: a 44px field with a `search` glyph and *Their email address*, and a primary **Find**. Under it, 12.5px secondary: *They need to be on offload already. You can also share a thread and ask from there.* It is **the Share sheet's new-connection step, reused whole**: the lookup, the found row and every relation it can show, the not-found lines, the failure line, and the request's refusals. A sent request appears in Asked by you without leaving the page.
3. **Connected** (count), caption *Who you can share a thread with.* Person rows as built. **Empty:** one row *Nobody yet*, note *A connection is somebody already on offload. Find them above, or open a thread and tap Share.* (web: *click*).
4. **Asked by you** (count): the pending rows, renamed from Pending, with **Withdraw** as a pill. Not drawn when there are none.
5. **Blocked**: the one row, *None* or the count, as built.

**Two copy changes reach the Share sheet too**, because the step is one piece:
- The found row's button is **Ask to connect**, on every surface, where it said *Request* (owner, 2026-10-02).
- **A refused lookup has its own line**: *Too many lookups. Try again in a few minutes.*, with no retry control, where a 429 fell into *That didn't go through. Try again* (owner, 2026-10-02). It is a fact the server stated, not a diagnosis.

### 6. Notifications

- **Dates**, caption *What is due, said once a day rather than one by one.* The two switches as built; each hour row is **indented 32px under its switch**, title 14.5px secondary, the hour in a raised 15px tabular pill at radius 8, greyed with its switch.
- **People**, caption *When someone reaches for you.*
- **On this phone**: a row *Allowed* with an *On* pill and the note *Sounds, the lock screen, and turning offload off entirely are in System settings.*, then **System settings** with `arrow-up-right`. The denied and never-asked states stay as built, as rows here.
- **Web:** a section **On your phones**, one row *These go to your phones*, note *offload for web does not send notifications. Each phone has its own switch in its system settings.*

### 7. Connected apps

One section, **Connected**, holding **one card per app**: `--surface-raised`, radius 16 (Android 22), a hairline ring; side by side on the web at 280px or more each.

- **Card head:** a 42px mark at radius 11, the name at 16px semibold, one 13px line, and a status pill or a button.
- **Google Calendar, connected:** the Google Calendar mark; *jo@hey.com, connected 14 Sep* (several accounts: *2 Google accounts*); a *Connected* pill. Under a hairline: **Calendars offload can use**, *4 of 7*, chevron to the calendar page; then **Ask before adding** with its switch and note, the same write the calendar page makes. A connection needing sign-in again swaps the pill for a **Sign in again** button that runs the connect flow.
- **Not connected:** the head only, line *See your week in offload, and let it add things for you.*, a primary **Connect** that runs the same flow as the calendar page.
- **Calendar not available:** no card.
- **Mail, always shown:** a `mail` mark on `--surface-accent-soft` in `--moss-700`; *Forward an email and it's filed like anything you dump*; a *Ready* pill (neutral). Under a hairline: the address as the title, tabular, with the note *Only mail from jo@hey.com is accepted. Forward by hand.* and a **Copy** pill with `copy` (toast *Copied*); then **Add to contacts** with `arrow-up-right`. An Apple hidden email: the head with the relay note as its line and an *Unavailable* pill, nothing under it. **The phones' Mail page stays**, for How it works, reached from the card's head.
- **Removed:** *Not built yet* (Browser, Photos) and *What offload may do*.
- **The calendar page stays** one level down on the phones, and **becomes one on the web**, `/settings/apps/calendar`: the per-account list, Disconnect, and Ask before adding, as the web's inline block had them.
- **The index row's value** is what is connected: *Calendar, Mail*, *Mail*, *Calendar*, or nothing.

### 8. Help and about

- **Learn**: **See the tutorial again**, note *The three screens from your first day.*, chevron. Opens first run's three tutorial screens; Skip and the last screen's button close it back to Help. The last button reads **Done**. Nothing about the account changes, no onboarding write, no permission ask.
- **About**: Version (phones), Privacy policy with `arrow-up-right`.

### 9. Pane head summaries (web)

The web's pane head carries a one-line summary where the page already computes one: Date and time *Lisbon, weeks start Monday*; Appearance *On this device* (as built); My people *3 connected* and *, 1 waiting on you*; Connected apps *Calendar and Mail* (the index value with *and*); Notifications *Mornings at 08:00, evenings at 19:00* from the switches that are on. Absent otherwise.

## Not in this pass

From the design log: a Tonight after sunset switch, a Conversations kept row, renaming Reaching the web to Privacy, radio cards, a summary head per page on the phones. The kits are not redrawn; the exploration is the reference.

## Privacy

Nothing here moves a claim on the privacy page. No new data is stored or sent: the sign-in provider is read from the identity rows the server already keeps, the lookup and request are 022's, unchanged, and *What offload may do* repeated what the page already says about calendar writes. The page's *In Settings you can ask offload to check with you before every change* stays true on the card and on the calendar page.

## Acceptance criteria

- **AC-1** Every labelled section on every settings page, on all three surfaces, draws a glyph tile and a heading at the sizes above, with the table's glyph; sections with no label draw none; a label with no glyph draws the small label as before.
- **AC-2** Both clients carry the eight new glyphs, and the dead-icon check passes with them in use.
- **AC-3** Theme, Week starts on and (web) Text size are choice tiles; picking one writes as the segmented control did; the picked tile is announced as checked in a radio group.
- **AC-4** `/api/me` returns `signInProviders`, the account's linked providers in a fixed order; Email's note follows it.
- **AC-5** Signed in on draws this device first whatever the list does; *End* ends one other session; *End all other sessions* ends every other one and only those; *Nowhere else* when this is the only session; *Couldn't load your other devices.* with Try again when the list fails; *Nothing else* is never drawn.
- **AC-6** The web's Country and Time zone are comboboxes: filter by name or code, Not set first for Country, a check on the current value, keyboard operable, closed by Escape with focus returned; picking writes as the select did.
- **AC-7** The phones' picker pages mark the current row with a `check`, not *Now*.
- **AC-8** My people draws its five sections in order, hides Waiting on you and Asked by you when empty, and its Connect with someone runs the Share step's lookup; a request sent there appears in Asked by you without a reload.
- **AC-9** The found row's button says *Ask to connect* on My people and in the Share sheet, on all three surfaces.
- **AC-10** A 429 from the lookup draws *Too many lookups. Try again in a few minutes.* with no retry, in both places.
- **AC-11** Notifications draws Dates, People and On this phone (web: On your phones) with their captions; hour rows are indented under their switch with the hour in a pill.
- **AC-12** Connected apps draws a Calendar card in each of its four states (connected, needs sign-in, not connected, not available, which draws nothing) and a Mail card in its two (available, Apple hidden email), with Ask before adding and Copy working from the cards; Not built yet and What offload may do are gone.
- **AC-13** The web's calendar list and Disconnect live at `/settings/apps/calendar`.
- **AC-14** The index's Connected apps row carries the connected value.
- **AC-15** See the tutorial again shows the three screens and returns to Help without any write.
- **AC-16** No em or en dash, emoji or retired word in any new copy.
