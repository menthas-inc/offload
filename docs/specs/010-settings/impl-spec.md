# 010 Settings, implementation spec

## Shape

Three clients, one server change, one marketing change.

```
/api/me  ──────────────►  index identity (name, email, initials)
                          web:    lib/use-me.ts (exists)
                          phones: lib/me.ts     (new, same shape)

appearance  ───────────►  web:    localStorage      (exists)
                          phones: SecureStore.getItem, synchronous

sign out  ─────────────►  awaited server revocation, then the gate
```

No new tables, no new job kinds, no migration.

## Volume and access

Nothing here is a feed, and the one list is three rows written in the source.
The numbers that matter are reads of the identity.

| Field | Value |
| --- | --- |
| Records per account | One account row. Three settings rows, static. |
| Read pattern | `/api/me` once per settings open, per client. Already read on every web shell mount, so web adds nothing. |
| Write pattern | Appearance only, on tap, to device storage. Never to the server. |
| Sort and filter | None. The order is written down. |

**Pagination:** none, and none possible. **Indexes:** none added; `/api/me`
reads `accounts` by primary key. **Normalisation:** initials are computed, never
stored.

## The server: `initials` on `/api/me`

`AC-2` says initials come from one rule, not three. `routes/threads.ts` already
has `initialsOf`, unexported, used for thread members. Move it to a shared place
and add `initials` to `meResponse`.

**Computed server-side rather than shared as a function**, which is the same
call `content.meta` already made: three clients each running their own split on
a name is three chances to disagree about "Ana de Sousa". The server says what
the initials are.

`displayName` is already nullable. Where it is null the index shows the email
alone and the avatar shows `?`, which is what `initialsOf` already returns for
an empty name.

## Sign out

`AC-3`, `AC-3a`, `AC-3b`. One behaviour, two implementations.

**It awaits the server.** The existing `signOutForTesting` races the call
against three seconds and clears local state either way. That is wrong for the
real control for the reason AC-3 gives, and the fix is not to remove the bound:
an unbounded `signOut()` is what cost an afternoon before. The bound stays and
**what changes is what happens when it expires**.

```
sign out
  ├─ await signOut(), bounded at 8s
  ├─ resolved  → clear local credentials → gate
  └─ expired or threw
       → do NOT clear, do NOT navigate
       → "That didn't go through." + Try again
```

Not clearing on failure is the point. A phone that clears its keys after a
failed call is a device that looks signed out while the session is live for
thirty days, and the person has no way left to try again because the client
forgot who it was.

**Web** has no local credential to clear: the session is an httpOnly cookie and
only the server's response can clear it. So on web the awaited call *is* the
whole of signing out, and a failed call must not navigate to the gate, or the
next person on that browser is in the account.

**The phones** clear `offload_cookie` and `offload_session_data` after the
server confirms. `AC-3b` says the whole credential surface: those two keys are
it today, and the sign-out helper is the one place that knows, so anything
added later is added there.

The failure line follows the house rule: it says what happened and offers the
way forward, next to a control that acts on it. It does not guess why.

## Appearance

**Web** already has `lib/appearance.ts` with theme (`light`/`dark`/`system`)
and size (`normal`/`large`) in `localStorage`, synchronised across mount points
by a custom event. Unchanged. The Appearance pane moves under the settings
index and `SegmentedControl` stays.

**The phones** get `lib/appearance.ts` with the same three theme values and no
size, per `AC-6c`.

- **Stored in `SecureStore`.** It is the only key-value store the app has, and
  `SecureStore.getItem` is synchronous, which is what matters: the theme is
  read before first paint, so there is no frame of light theme on a dark
  device. Adding `@react-native-async-storage/async-storage` for one string
  would mean a native rebuild of the dev client and every EAS build. **It is
  the wrong store for a non-secret and the right one available**: if a second
  device preference ever needs storing, that is the moment to add a real one.
- **Applied through `colorScheme.set`.** `app/_layout.tsx:30` pins `"light"`
  today with a comment saying Settings should read the choice instead. It now
  does. `system` calls `colorScheme.set("system")`, which is NativeWind's own
  follow-the-device.
- Every `bg-*` and `text-*` class already resolves through the generated
  `.dark:root` scope, so no class changes anywhere.

### The theme was locked in a native resource, and nothing in JavaScript could say so

`AC-6a`. Dark did not paint. The store held `dark`, the segmented control showed
Dark, `storedTheme()` returned `dark` during the first render, `applyTheme` ran
before any child mounted, and the screen stayed light. **Four fixes were tried
and all four were wrong**, which is worth recording because each looked
plausible:

- **Module scope.** Ruled out on a device: disabling it changed nothing.
- **An effect.** No change.
- **A `useState` initialiser**, so it runs during the root's first render
  before children mount. No change, and a log proved the value was `dark` at
  that moment.
- **Keying the navigator on the scheme**, to force a remount. No change, and
  that one was informative: `useColorScheme()` itself returned `light`, so
  there was nothing to key on. NativeWind's scheme was never becoming dark at
  all.

**The cause is `expo_system_ui_user_interface_style` in
`android/app/src/main/res/values/strings.xml`**, generated from `app.json`'s
`userInterfaceStyle: "light"`. `SystemUIReactActivityLifecycleListener` reads it
and calls `AppCompatDelegate.setDefaultNightMode(MODE_NIGHT_NO)`, which locks
the activity to light. `colorScheme.set` is a thin wrapper over
`Appearance.setColorScheme`, and against that lock it can do nothing. **No
amount of JavaScript could have fixed this**, which is why four JavaScript fixes
in a row did nothing, and why the app went dark exactly once: when an app-state
transition let NativeWind read the *device's* scheme, not ours.

It is `automatic` now, and the light default is enforced where it belongs, in
JavaScript: an unset preference is `light`, so a new account still opens light
regardless of the device, which is the 25 August decision. The native layer
stops having an opinion.

**A comment in `_layout.tsx` asserted the opposite** — "app.json's
`userInterfaceStyle` only governs native chrome" — and it was wrong. It was
written when nothing depended on it being right.

### The ground a transition fades through is a third thing again

Dark shipped and switching tabs flashed light grey. Neither the classes nor
`useColors` was wrong: **a screen mid-fade is see-through, and what shows is the
navigator's own background**, which nothing had ever set. It stayed React
Navigation's `rgb(242, 242, 242)` in both themes, and the Stack's
`contentStyle: transparent` meant there was nothing in between.

A `ThemeProvider` supplies it now, built from our tokens rather than taken from
the library: its dark background is `rgb(1, 1, 1)` and ours is a warm ink, so
using theirs would have traded a light flash for a black one. The ground under a
transition is the colour the screens paint, so there is nothing to see through
to in either theme.

**Three places a colour can live on this platform, and each fails differently.**
A class, which follows the theme by itself. A React Native prop, which needs
`useColors`. And a navigator's background, which needs the navigation theme.
Dark found all three, in that order, and only the first was free.

### `COLOR` has to move with it

`AC-6b`. `lib/colors.ts` resolves `resolved.light` and `android.light` at module
load and exports a frozen object used at 43 call sites. Those are the colours
that reach React Native props rather than classes: SVG stroke, `ActivityIndicator`,
scrim, tab tint.

**A hook, not a proxy.** A `Proxy` reading the live scheme would need no call
site changed and is the wrong answer: several of these values are read inside
Reanimated worklets, where a JS getter cannot run. So `useColors()` returns the
resolved object for the current scheme, and the 43 sites take it from there.
Mechanical, and the type stops a missed one compiling.

`COLOR` stays exported as the light scope for the two places that genuinely
have no component to hook from, and is marked as such.

## Navigation

**Web.** `/settings` is the index pane; `/settings/appearance`, `/settings/account`
and `/settings/help` are second panes beside it, which is what `Panes` already
does for threads. The nav foot's Settings row goes to `/settings`. The existing
`/settings/appearance` URL keeps working because it is the same route.

Above the pane breakpoint there is no back, there is a second pane; below it the
crumb is the way back. Both already exist and neither is new.

**The phones.** `app/settings/index.tsx` and `app/settings/[page].tsx`, pushed
with the same platform animation every other push uses. Back is the bar's
chevron.

## Today's app bar

`AC-1`. Today has a 52px bar holding the wordmark. It gains, on the right, a
bell and a gear, in `DayOneBar`'s order.

The bell is `IconButton`-shaped and does nothing: no handler, no unread dot,
and an accessible name that says what it is rather than promising what it does.
It is the feature's one deliberate exception and is commented as such where it
is written, not only in the spec.

## The row vocabulary

Two pieces, per the client review: `Group` and `Row`. Toggle, danger and the
choice group are not built, because no page in scope uses them.

**Per client, and the shapes differ**, which `AC-12` states:

| | Phones | Web |
| --- | --- | --- |
| Group | fill-backed card, `--radius-lg`, inset divider per row | open block, section label, no container |
| Row | 56px minimum, icon well, title, value, chevron | `min-height` row, title, value, chevron |

`Group` on the phones is close to `Card variant="fill"` and is built as one
rather than a fresh box, per the client review.

Rows use `min-height`, never `height`, so 200% type grows them.

## The privacy policy

`AC-13`. `privacy/page.tsx` section 13 currently conditions five controls on
"the settings screen". The conditional goes; the controls stay listed with the
same words and the same states, and the sentence says they are not built and
email does them by hand.

**It ships in the same commit as the screen.** The page is true before and
after, and never in between.

## What this removes

- `components/TempSignOut.tsx`, its two mount points, and `signOutForTesting`.
- Nothing else. `AC-10`.

## Principles that apply

- **OFF-1**: no event this feature fires carries a name or an email. `AC-14`.
- **OFF-6**: sign out is not undoable and is not a destructive action either;
  it takes no confirmation, which is what every client already does.
- **OFF-7**: three divergences from the kits, each needing a `decisions.md`
  entry with a filled Design system impact.
- **QUAL-1**: the suite stays green, and the sign-out failure path is the part
  worth a test, because it is the one nobody exercises by hand.

## Edge cases

| Case | Behaviour |
| --- | --- |
| No display name | Email alone, avatar shows `?`. |
| `/api/me` fails on the settings index | The rows still work; the identity block shows nothing rather than a guess. Appearance and Help need no server. |
| Sign out fails | Stays signed in, says so, offers Try again. Never navigates. |
| Theme set to `system`, device changes | Follows, because `colorScheme.set("system")` is NativeWind's own listener. |
| Settings opened while signed out | Cannot happen: it is inside the shell, behind the gate. |
