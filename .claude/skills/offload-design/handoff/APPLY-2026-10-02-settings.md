# Apply: Settings, tightened

Drawn in `explorations/settings-v2.html` with the product owner on 2 October 2026, against `main` read
on 2 October (the settings code: `apps/mobile/app/settings/`, `apps/mobile/components/settings/`,
`apps/mobile/components/people/PeoplePage.tsx`, `apps/web/src/components/panes/Settings*.tsx`,
`Account.tsx`, `DateTime.tsx`, `Appearance.tsx`). All three surfaces. Standalone copy:
`handoff/settings-standalone.html`, with the iOS, Android and web switch.

**Ready to build. Nothing is open.** The readme's **Settings** is the lasting statement; this file is
the build order. Decisions log: *2026-10-02 · Settings, tightened*. The kits are not redrawn; the
exploration is the reference.

The **eight new glyphs** are vendored in `assets/icons/` (Lucide, the set's stroke format) and copied
into `glyphs/` beside this file in the bundle: `smartphone` `monitor` `user-plus` `globe` `copy`
`log-out` `ban` `type`. Add them to the web's `public/icons/` and the phones' `Glyph` map. 95 in all.

---

## 1. Section heading (all pages, all surfaces)

`Group` (`components/settings/Rows.tsx`, `panes/SettingsRows.tsx`) gains `icon`, `caption` and keeps
`count`. The label stops being a caption and becomes the section's heading.

| | iOS | Android | Web |
| --- | --- | --- | --- |
| Glyph tile | 32px, radius 9, `--surface-accent-soft`, glyph 17px `--moss-700` | 32px circle, `--surface-attention-soft`, glyph `--blue-700` | as iOS |
| Heading | 17px semibold, `--text-primary`, tracking -0.01em | same | 16px semibold |
| Caption | 13px/1.45 `--text-secondary`, optional | same | same |
| Count | pill beside the heading, 12px medium on `--surface-fill-strong` | same | same |
| Under it | the fill card, 12px gap | the `#F1EFEA` card, radius 22, rows split by a 2px page-coloured gap | open rows, a hairline under the heading |
| Between sections | 26px | 26px | 34px |

Tile and heading sit in one row, the heading's text column 5px down so its first line centres on the
tile. A group with no `label` (Sign out, the identity block) keeps no heading and no tile. **Every page's
existing `label` gets an `icon`**; the glyph per section is in the table in item 9.

Rows are unchanged except: the value is `--text-secondary` 15px; a row that acts in place (End,
Withdraw, Copy) draws a 32px outline pill (`--surface-raised` with a hairline; Android 40px, outline
`#79786F`) rather than a value plus chevron; a status (*This device*, *Connected*, *On*) is a 24px pill
on `--surface-accent-soft`, `--moss-700`, with a 6px moss dot.

## 2. Preview tiles for a choice of a few

New `ChoiceTiles` beside `Segmented` on both clients, used by **Theme**, **Week starts on**, and on the
web **Text size**. `Segmented` stays for view switches.

- A grid of equal columns, 10px gap (web: tiles at most 170px for three, 220px for two).
- A tile is `--surface-raised`, radius 14 (Android 18), a hairline ring, 8px padding; a 62px preview
  on top, radius 9; under it an 18px radio and the label, 14px medium.
- **Picked:** a 2px `--ink-950` inset ring and the radio filled (5.5px ink border). Android: a 2px
  `--blue-600` ring on `--surface-attention-soft`, the radio blue.
- Previews: **Light** `#FAF9F7` with three grey bars; **Dark** `#1C1B19` with darker bars; **System**
  split down the middle; **Monday** and **Sunday** the seven day initials with the first in a filled
  22px circle (ink; Android blue) and the weekend in tertiary; **Default** and **Larger** *Aa* at 20 and
  28px.
- One tap writes, as `Segmented` does now. The caption under the heading stays (*System follows
  whatever this device is set to.*, *Which day a thread's timeline begins its weeks on.*, the Text size
  line).

## 3. My account

- **Profile**: Name (the existing `EditableRow`), Email with the note *From your Google sign in.
  Changing it is not done here.* (Apple: *From your Apple sign in.*; read the provider from the session).
- **Where you are**: the caption is the web's Country note, *So a date or a forecast is the one where
  you are. Leave it unset and offload says it does not know rather than guessing.*; Country is the row.
- **Signed in on**, caption *Ending a session signs that device out on its next request.*
  - **This device is always the first row**, built from the session the client already holds
    (`getSession`), so it draws even when `listSessions` fails. Lead: `smartphone` (phones) or
    `monitor` (web) in the row's well; trailing: the *This device* status pill; no note.
  - Others under it: device name, *Since 14 Sep*, an **End** pill.
  - When there are others, a last row **End all other sessions** (medium weight, no chevron), which
    revokes every token but this one and reloads.
  - **Only this device:** a second row *Nowhere else*, note *Sign in on another device and it shows
    here.*
  - **The read failed:** this device's row, then under the card *Couldn't load your other devices.*
    in `--text-danger` beside a **Try again** link. **Remove the "Nothing else" row** and the
    `.catch(() => setSignedIn([]))` that produced it.
- **Sign out**: a last group with no heading, one row, `log-out` lead. The index keeps its Sign out
  button too.

## 4. Country and Time zone on the web

Replace both native `select`s in `Account.tsx` and `DateTime.tsx` with one `Combobox` in
`panes/SettingsRows.tsx`:

- **Closed:** a 34px field, radius 9, `--surface-input` (fallback `--paper`), a 1px `--border-strong`
  inset ring, the value at 14px, `chevron-down` 14px secondary on the right, at least 150px wide.
- **Open:** a 250px popover under the field's right edge, `--surface-raised`, radius 12, a hairline
  ring and a soft shadow, 6px padding. On top a 36px filter on `--surface-fill`, *Find a country* /
  *Find a city*, focused on open. Then **Not set** in secondary (Country only), a hairline, the list;
  rows 34px, radius 7, hover `--surface-fill`, a `check` on the current one. Time zone keeps its region
  groups as small headings. Filtering is the phones' rule: name contains, or code equals.
- Keyboard: arrows move, Enter picks, Escape closes and returns focus. `role="combobox"` with a
  `listbox`.
- Everything is tokens, so dark needs nothing extra. This is the fix for the light-grey-on-white closed
  control in dark.
- **Phones:** the picker pages stay; the current row's *Now* value becomes a `check` glyph, 16px,
  `--text-primary`.

## 5. My people

Sections in this order (`components/people/PeoplePage.tsx` and the web pane):

1. **Waiting on you** (`bell`, count): the existing `RequestCard`s. Hidden when none.
2. **Connect with someone** (`user-plus`): a 44px field (radius 12; Android 4 with the outline),
   `search` glyph, placeholder *Their email address*, and a **Find** button (primary). Under it, 12.5px
   secondary: *They need to be on offload already. You can also share a thread and ask from there.*
   **Reuse the Share sheet's new-connection step whole**: `lookup(email)`, then its found row with
   *Ask to connect*, its not-found line, its `rate_limited` line, and `requestConnection`'s refusals.
   A sent request appears in Asked by you without leaving the page.
3. **Connected** (`users`, count), caption *Who you can share a thread with.* Person rows as now (the
   prism avatar at 36, 40 on Android; shared threads as the note; *Nothing shared yet*). **Empty:** one
   row *Nobody yet*, note *A connection is somebody already on offload. Find them above, or open a
   thread and tap Share.*
4. **Asked by you** (`clock`, count): the Pending rows, with **Withdraw** as a pill. Hidden when none.
   Renamed from Pending.
5. **Blocked** (`ban`): the one row, *None* or the count, as now.

## 6. Notifications

- **Dates** (`calendar`), caption *What is due, said once a day rather than one by one.* The two switches
  as now; each hour row sits **indented 32px under its switch**, title 14.5px secondary, the hour in a
  raised 15px tabular pill (radius 8). Still greyed with its switch.
- **People** (`users`), caption *When someone reaches for you.*
- **On this phone** (`smartphone`): a row *Allowed* with an *On* status pill and the note *Sounds, the
  lock screen, and turning offload off entirely are in System settings.*, then **System settings** with
  `arrow-up-right`. The denied and undetermined states stay as built, as rows in this section.
- **Web:** the section reads **On your phones**, one row *These go to your phones*, note *offload for
  web does not send notifications. Each phone has its own switch in its system settings.*

## 7. Connected apps

One section, **Connected** (`link`), holding **one card per app**. A card is `--surface-raised`,
radius 16 (Android 22), a hairline ring. On the web the cards sit side by side, at least 280px each.

- **Card head:** a 42px mark (radius 11), the name (16px semibold), one 13px line, then a status pill
  or a button on the right.
- **Google Calendar, connected:** the real Google Calendar mark (`googleCalendarMark`); *jo@hey.com,
  connected 14 Sep* (several accounts: *2 Google accounts*); *Connected* pill. Under a hairline:
  **Calendars offload can use** with *4 of 7* and a chevron to the Calendar page, then **Ask before
  adding** with its switch and note, the same `setAskFirst` the Calendar page uses. A
  `needs_reauth` or `needsScope` connection swaps the pill for a *Sign in again* button.
- **Google Calendar, not connected:** the head only, line *See your week in offload, and let it add
  things for you.*, a primary **Connect** button that runs the same auth session as the Calendar page.
- **Calendar unavailable** (`!available`): the card is not drawn.
- **Mail, always shown**, whatever the calendar's state: a `mail` mark on `--surface-accent-soft` in
  `--moss-700`; *Forward an email and it's filed like anything you dump*; a *Ready* pill (neutral).
  Under a hairline: the address `over@to.offload.club` as the title (tabular) with the note *Only mail
  from jo@hey.com is accepted. Forward by hand.* and a **Copy** pill with `copy` (toast *Copied*), then
  **Add to contacts** with `arrow-up-right`. The Mail page stays, for *How it works*.
  An Apple hidden email: the head with `MAIL_RELAY_NOTE` as the line and an *Unavailable* pill, nothing
  under it.
- **Remove** the *Not built yet* group (Browser, Photos) and the *What offload may do* group.
- The index row's value becomes what is connected: *Calendar, Mail*, or *Mail*.

## 8. Help and about

- **Learn** (`compass`): **See the tutorial again**, note *The three screens from your first day.*,
  chevron. Opens first run's three tutorial screens as a modal stack, ending back on Help; nothing
  about the account changes and no onboarding flag is written.
- **About** (`text-quote`): Version (phones only, as now), Privacy policy with `arrow-up-right`.

## 9. Section glyphs, per page

| Page | Sections and glyph |
| --- | --- |
| Index | You `circle-dot`, Reaching you `bell`, What offload does with it `lock`, The app `sliders-horizontal` |
| My account | Profile `circle-dot`, Where you are `map-pin`, Signed in on `smartphone`, (Sign out, no heading) |
| My people | Waiting on you `bell`, Connect with someone `user-plus`, Connected `users`, Asked by you `clock`, Blocked `ban` |
| Notifications | Dates `calendar`, People `users`, On this phone `smartphone` |
| Connected apps | Connected `link` |
| Reaching the web | Reaching the web `globe` (caption *Each says what leaves, then the limit on it.*) |
| Date and time | Your clock `clock` (caption *Everything is shown and scheduled in this zone.*), Week starts on `calendar` |
| Appearance | Theme `blend`, Text size `type` (web) |
| Help and about | Learn `compass`, About `text-quote` |

The index row glyphs are unchanged. On the web the pane head's subtitle carries a one-line summary of
the page where one is computed (*Lisbon, weeks start Monday*, *On this device*); absent otherwise.

## Build order

1. The eight glyphs (top of this file) and `Group`'s heading (item 1): every page changes at once and nothing else
   depends on more.
2. Signed in on (item 3), the one bug in this pass.
3. The web combobox (item 4).
4. `ChoiceTiles` (item 2).
5. Connected apps cards (item 7), My people's Connect with someone (item 5).
6. Notifications indent, Help's tutorial (items 6, 8).

## Not in this pass

Considered with the owner and not taken: a Tonight after sunset switch, a Conversations kept row,
renaming Reaching the web to Privacy, radio cards, a summary head per page on the phones.
