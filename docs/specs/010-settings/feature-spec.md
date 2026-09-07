# 010 Settings, feature spec

**Status:** drafted 2026-09-07
**Surfaces:** web, iOS, Android

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

**Appearance** is theme and text size, on every client. Web already has both;
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
- The row vocabulary the kits are built from, as real components: a group, a
  row with an optional note, value, control and danger tone, a toggle row, and
  a single-select choice group. **This is most of the work and most of the
  value**: the six pages not built here cost a screen each once their features
  exist, rather than a screen and a design.
- `TempSignOut` and `signOutForTesting()` removed, which closes 009 G3.

### What does not

Six of the kits' ten pages, because nothing is behind them:

| Page | Why not |
| --- | --- |
| My people | There is no `people` table on any client or in the schema. |
| Communication | There are no notifications, no push, and no quiet hours. |
| Connected apps | There are no integrations. |
| Language and region | Nothing is localised and no region is stored. |
| Privacy | The toggles store nothing. See below, this one is not a gap, it is a refusal. |
| Conversations kept | Retired. See below. |

**Delete account is not drawn.** 001 specifies it and nothing implements it. An
invite-only alpha with a handful of accounts can be asked directly; a clay panel
that does nothing is worse than its absence. It belongs in the spec that builds
deletion.

**Search on the index is not drawn.** The kit has it because the kit has ten
rows. Three rows do not need a search field, and an empty-state for "nothing
matches" on a list you can see all of is furniture. It arrives when the list
does.

### Two things where the kit is wrong, and the code is right

**Conversations kept is retired and the kit still draws it.** The 27 August
decision retired the retention line and the 5 September design pass removed it
from the readme's own Settings list, where it read "Conversations kept · 60
days". The kits were not updated. Building it would put a number on screen that
nothing enforces, about a retention window nobody has set. It is not in this
feature and the kits have to catch up.

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
one, email, and initials derived from the name. The email is the account's own,
read from the server rather than from anything cached at sign-in.

**AC-3** The index carries a Sign out control that ends the session and returns
to the gate on every client.

**AC-4** The index lists exactly the pages that exist, each with its current
value where it has one, in the kit's group shape.

**AC-5** My account shows name and email and offers sign out. It does not
offer account deletion.

**AC-6** Appearance offers theme and text size as single-select choices on all
three clients, reads the value the device already holds, and changing either
takes effect immediately and survives a restart.

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
index.

**AC-8** Help and about shows the application version, read from the build
rather than typed, and links to the privacy policy.

**AC-9** No screen in this feature draws a control that does nothing. A page
that would only apologise for an unbuilt feature is not drawn at all.

**AC-10** `TempSignOut` and `signOutForTesting()` are gone from the phones, and
signing out is reachable only through Settings.

**AC-11** Back works: the detail pages return to the index, and the index
returns where it was opened from, on all three clients.

**AC-12** The row vocabulary is one implementation per client, not one per
page: a page is a list of groups and rows, and adding a page adds no layout.

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

## Open

- **Whether Appearance should offer more than two text sizes.** The kit offers
  four, Small through Larger; the token set defines one alternate scale, so two
  is what the tokens can express. Four would mean three new scales, which is
  the design system's call and not this feature's.
- **What dark looks like on the phones in practice.** The tokens are complete,
  `.dark:root` is in the generated stylesheet and every class resolves through
  it, but no screen has ever been looked at in dark. Expect this to find things,
  and expect them to be real: the light pin exists because somebody saw it go
  wrong once.
