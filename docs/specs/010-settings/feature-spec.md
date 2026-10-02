# 010 Settings, feature spec

**Status:** drafted 2026-09-07, revised the same day against three reviews
**Surfaces:** web, iOS, Android
**Amended by 031 (2026-10-02):** every page's sections now open with a glyph, a heading and a caption, Connected apps is cards, Help gains See the tutorial again, and My account gains Sign out and a Signed in on that never says *Nothing else*. Where the two disagree, `docs/specs/031-settings/` is current.

## Why

There is nowhere to go. The phones have no settings screen at all, so the only
way to sign out is `TempSignOut`, a red dashed debug control sitting in the
Today app bar where the kit puts a settings button. Web has one Appearance page
reached directly from the nav foot, with no index above it and nothing else in
it.

The kits have drawn this for a long time: `SettingsScreen` and `SettingsDetail`
on both phones, `WSettings` on web, ten pages in four groups. **Most of those
ten have nothing behind them**, and this feature is deliberately not an attempt
to build the features they imply. It builds the shape, and the pages whose
content is already true.

The point is not the pages. It is that a person can find who they are signed in
as, change how the app looks, and sign out, on every surface, without a debug
control.

## What

An index and three pages, on all three clients.

**The index** is the identity, then rows in groups. Name, email, initials, and
Sign out, because signing out acts on the identity and belongs beside it. Then
one row per page: what it is, and its current value on the right.

**My account** is who you are: name, email, and sign out again where somebody
looking for it would go second.

**Appearance** is theme and text size, on every client, as segmented controls.
Three themes and two text sizes everywhere: `system` is as meaningful on a
phone as on a laptop, and the phone kits' two-option list predates web gaining
the third. Web already has both;
the phones have neither, and the phones are pinned to light in
`app/_layout.tsx` with a comment saying "when Settings gains a theme choice,
this reads it instead". This is that. It is a value stored on the device, laid
out as choices.

**Help and about** is the version, and the way to the privacy policy.

### What ships

- The settings index on web, iOS and Android, reachable from each client's own
  place: the nav foot on web, and on the phones a real app bar on Today.
- **Today's app bar on the phones**, which does not exist yet: the wordmark,
  then notifications and settings, in `DayOneBar`'s order. **The bell is drawn
  and does nothing**, deliberately: it is the one exception to the rule below,
  because the bar's shape should not move under somebody the day notifications
  land, and an icon that has never claimed to do anything is not a control that
  was refused. It carries no unread state, because there is nothing to be
  unread.
- My account, Appearance, and Help and about.
- **Only the two row pieces these pages actually use**: a group, and a row with
  an optional note, value and chevron. The kits also draw a toggle row, a
  danger tone and a radio choice group; none has a caller here, because every
  page that uses them is out of scope, and this repository does not build
  speculative abstraction. They arrive with the page that needs them.
- **Appearance is `SegmentedControl` on all three clients**, not the kits'
  radio list. `decisions.md`, "The design queue, applied", surface **all**,
  already settled this and the phone kits predate it exactly as the web one
  did. Web's Appearance pane already uses it.
- `TempSignOut` and `signOutForTesting()` removed, which closes 009 G3.
- **A reword of the privacy policy, in the same change.** See below: shipping a
  settings screen makes a sentence on that page untrue, and the page is a claim
  surface.

### What does not

Six of the kits' ten pages, because nothing is behind them:

| Page | Why not |
| --- | --- |
| My people | There is no `people` table on any client or in the schema. |
| Communication | There are no notifications, no push, and no quiet hours. |
| Connected apps | There are no integrations. |
| Language and region | Nothing is localised and no region is stored. |
| Privacy | The toggles store nothing. See below, this one is not a gap, it is a refusal. |
| Memory and data | The counts are real, the page's own actions are not: "Forget everything" needs an endpoint and a confirmation model. Offered to the product owner and cut, so this row records a decision rather than an omission. |
| Conversations kept | Retired. See below, and note the one row on it that is not. |

**Delete account is not drawn.** 001 specifies it and nothing implements it. An
invite-only alpha with a handful of accounts can be asked directly; a clay panel
that does nothing is worse than its absence. It belongs in the spec that builds
deletion.

**Search on the index is not drawn.** The kit has it because the kit has ten
rows. Three rows do not need a search field, and an empty-state for "nothing
matches" on a list you can see all of is furniture. It arrives when the list
does.

### Shipping this makes the privacy policy untrue, so it is rewritten here

`privacy/page.tsx` says "some of the controls below **arrive with the settings
screen**. Until they do, email us and we will do any of it by hand", and lists
five: the three toggles refused above, Export everything, and Delete. **010 is
the first settings screen this product ships and delivers none of them.** The
sentence is true today and false on merge, because it is keyed to a screen
rather than to a date.

The page is rewritten to stop conditioning those controls on the settings
screen: they are not built, and email does them by hand. Nothing is walked
back, every promise it makes stays exactly as strong, and it lands in the same
change as the screen so the two documents can never disagree in between. The
product owner chose this over delivering one of the five, because the two that
could plausibly be delivered, export and delete, are both real API features
rather than screens.

### Where this diverges from the kits, and why

Three, and each needs its line in `decisions.md` with a filled **Design system
impact**, per OFF-7.

**Sign out on the web index is new surface.** Both phone kits put a secondary
Button beside the identity block; `WSettings.jsx` has no sign out on its index
at all, only on the account page. Web gets one anyway, because AC-3 is one
product with one behaviour and a person on a laptop should not have to open a
page to leave.

**My account drops four rows the kit draws, and the reasons differ.** Phone and
Password go because this product is OAuth-only: there is no password to change
and no phone stored, so both would be controls that do nothing. Plan and the
identity subtitle's "· free plan" go because there are no plans, and inventing
a tier on a settings screen is a product claim nobody has made. Delete account
is separately out of scope above.

**Appearance is a segmented control, not a radio list**, per the decision named
above.

### Two more where the kit is wrong, and the code is right

**Conversations kept is retired and the kit still draws it.** The 27 August
decision retired the retention line and the 5 September design pass removed it
from the readme's own Settings list, where it read "Conversations kept · 60
days". The kits were not updated. Building it would put a number on screen that
nothing enforces, about a retention window nobody has set. It is not in this
feature and the kits have to catch up.

**One row on that page survives the retirement and is still not built here.**
The same decision says, in as many words, that "Delete all conversations is
unaffected and should stay, since manual deletion is still real, immediate and
cascading". Retiring the page took it down with it, which is the two-documents
failure this repository keeps paying for, so it is named rather than left to
fall out. It is not in 010 because it needs three things this feature does not
have: an endpoint, a confirmation model, since a bulk delete is not obviously
on OFF-6's reversible allowlist, and somewhere to live now that the page around
it is gone. It belongs with account deletion, in the spec that builds both.

**The privacy page's toggles are a claim surface, and drawing them would be a
lie.** The kit offers "Improve offload with my data — off by default. Nothing
you dump is used to train anything", "Let offload notice patterns", and
"Analytics". Not one has anywhere to be stored. The design system's own rule is
that a control drawn and then refused teaches somebody a rule that is not true,
and this repository holds the privacy policy to a stricter standard than that:
it is a claim surface, and a switch is a stronger claim than a sentence because
it implies somebody could have set it either way. **These are built the day
they are wired and not before.** What ships instead is the link to the policy,
on Help and about, which is true today.

**The rest of that page goes for its own reasons, which are not the same one.**
The kit also draws a sharing-granularity choice, "Everything in it" against
"Only what you pick", and a "Download everything offload has" row. Neither is a
toggle and neither is refused: sharing is thread-level by OFF-3 and there is no
per-item model to choose between, and export has no endpoint. Stating one
reason for a page cut for three is how a decision looks settled when it was
never made.

### The decisions this feature is built on

- **Sign out appears twice, on purpose.** In the index's identity header,
  because that is what it acts on and the kit puts it there, and on My account,
  because that is where somebody who did not see it the first time will look.
  It is one action in two places, not two behaviours.
- **The value on the right of a row is real or it is absent.** "System",
  "0.1.0" and an email are read from the thing they describe. No row shows a
  number nothing computes.
- **Appearance stays on the device.** It is not an account setting. Theme and
  text size are already stored in `localStorage` on web and belong in the same
  place on a phone: a person's dark mode on their laptop is not a fact about
  their account.
- **The index groups survive the cut.** Three rows in two groups reads thinner
  than the kit, and that is honest: the app is small. The group labels stay
  because they are where the missing pages will go, and adding a label later
  moves every row on the screen.

## Acceptance criteria

**AC-1** Settings is reachable on all three clients: from the nav foot on web,
and from a settings control in the Today app bar on iOS and Android, in the
position `FirstRun.jsx` gives it.

**AC-2** The index shows the signed-in identity: display name where there is
one, email, and initials derived from the name by the rule the server already
uses, `initialsOf` in `routes/threads.ts`, rather than three clients inventing
one. No display name falls back the way a thread member does. The email is the
account's own, read from the server rather than from anything cached at
sign-in.

**AC-3** The index carries a Sign out control that ends the session and returns
to the gate on every client. **It waits for the server to revoke the session
rather than assuming it.** The only sign out that exists today,
`signOutForTesting`, races the call against three seconds and clears the local
keys either way, which is right for a debug button and wrong for the real one:
on a shared device that shows "signed out" while the account's session lives
for up to thirty days, and on web the session is an httpOnly cookie the client
cannot clear itself, so a failed call leaves the next person in the account.

**AC-3a** A sign out that does not complete says so and offers the way forward,
rather than returning to the gate as though it had worked. It does not diagnose
itself: one short clause and a retry. The unbounded call is still not allowed,
which is what the three second race was protecting against; the difference is
what happens when it expires.

**AC-3b** Signing out clears the whole credential surface on the client, not
only the two keys: a second account on a shared device must not find anything
of the first.

**AC-4** The index lists exactly the pages that exist, each with its current
value where it has one, in the kit's group shape.

**AC-5** My account shows name and email and offers sign out. It does not
offer account deletion.

**AC-6** Appearance offers theme on all three clients and text size on web,
reads the value the device already holds, and changing either takes effect
immediately and survives a restart.

**AC-6c** Text size is **not** offered on the phones, and the reason is
structural rather than a preference. Web scales because every size is a token
and `[data-type="large"]` overrides them; the phones do not, because mobile
type is 73 numeric `fontSize:` literals across 20 files in inline styles, with
no size variables in the generated stylesheet to swap. Offering it would mean
either a generator that emits a large scale to NativeWind and a rewrite of all
73, or a runtime multiplier threaded through every call site, which is a
hand-rolled scale off-token and exactly the OFF-7 violation nobody would catch
until an audit. It is its own piece of work.

**AC-6a** Theme on the phones actually themes. Every screen the app can reach
is legible in dark: no ink type on a dark surface, and no colour read from a
scope the switch does not move. `colorScheme.set("light")` in
`app/_layout.tsx` is replaced by the stored choice.

**AC-6b** Colours that reach React Native props rather than classes follow the
theme too. `lib/colors.ts` resolves at module load from the light scope and
feeds 43 call sites; a theme that moves the classes and not those is the exact
half-dark screen the pin was put there to avoid.

**AC-7** Appearance on web replaces the standalone `/settings/appearance` page
rather than sitting beside it, and the nav foot's Settings row goes to the
index. The old URL keeps working, as the same page reached through the index,
because it has been shipped and linked.

**AC-8** Help and about shows the application version on the phones, read from
the build rather than typed, and links to the privacy policy on every client.
**Web shows no version**: its `package.json` says `0.0.0`, it is continuously
deployed and has no version cycle to read, and printing `0.0.0` would be the
number-nothing-computes this feature refuses everywhere else.

**AC-9** No screen in this feature draws a control that does nothing. A page
that would only apologise for an unbuilt feature is not drawn at all.

**AC-10** `TempSignOut` and `signOutForTesting()` are gone from the phones, and
signing out is reachable only through Settings.

**AC-11** Back works: the detail pages return to the index, and the index
returns where it was opened from, on all three clients. **On web above the
pane breakpoint that is dismissing a pane rather than going back**, which is
what the shell already does everywhere else; below it, it is a back.

**AC-12** The row vocabulary is one implementation per client, not one per
page: a page is a list of groups and rows, and adding a page adds no layout.
**Per client, and the clients genuinely differ**: the phones draw boxed,
fill-backed cards with inset dividers, and web draws open blocks with no
container, which is what `WSettings.jsx` does and what the rest of the web
shell looks like. One vocabulary in two shapes, not one shape forced onto both.

**AC-12a** A row's height is a minimum, never a fixed height, so it grows with
the type scale rather than clipping at 200%.

*AC-12 and AC-12a are review gates rather than black-box tests, and are marked
as such: the first is an architectural property and the second is checked on a
device at 200%.*

**AC-13** The privacy policy no longer conditions any control on the settings
screen, and the change ships in the same commit as the screen.

**AC-14** Nothing this feature emits carries a name or an email. It is the
first screen built to surface both, so the rule is stated rather than assumed:
an event from Settings carries ids, counts and outcomes only (OFF-1).

## Depends on

- 002 for the session and the gate, which sign out returns to.
- 009 for the phones' navigation, which the settings push uses.
- The 5 September design pass for `SegmentedControl`, which web's Appearance
  already uses.

## Out of scope

- Account deletion, and everything it implies.
- The six pages listed above, until the features behind them exist.
- Changing the display name or the email. Both are shown; neither is editable
  here, because editing an email is an identity change with a verification
  flow behind it.
- Session and device listing. The kit's "Signed in on" block needs an endpoint
  that does not exist.

## Noted, and not fixed here

**The identity header is the highest-value frame in the app switcher.** Nothing
on the phones redacts a backgrounded screenshot: no `expo-screen-capture`, no
secure flag, no blur on background. That is an app-wide gap and thread content
is already exposed the same way, so this feature does not introduce the risk.
It does introduce the one screen whose whole purpose is showing who you are,
which makes it the frame worth catching. The fix belongs to whatever covers the
app switcher for every screen, not to Settings alone.

## Open

- **Text size on the phones, as its own piece of work.** See AC-6c: it needs
  either a generator that emits a large scale to NativeWind and a rewrite of 73
  literals, or a scale threaded through every call site. Worth doing, and not
  here.
- **Whether Appearance should offer more than two text sizes on web.** The kit
  offers four, Small through Larger; the token set defines one alternate scale,
  so two is what the tokens can express. Four would mean three new scales,
  which is the design system's call and not this feature's.
- **What dark looks like on the phones in practice.** The tokens are complete,
  `.dark:root` is in the generated stylesheet and every class resolves through
  it, but no screen has ever been looked at in dark. Expect this to find things,
  and expect them to be real: the light pin exists because somebody saw it go
  wrong once.
