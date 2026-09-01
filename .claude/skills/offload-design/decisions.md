# Decision log

Append only. Newest first. Both the codebase and the design system write here.

Format and the meaning of each field: `handoff/CONTRIBUTING.md`.

When design and code disagree, **code leads**. A decision recorded here from the codebase is
the new truth, and the design system is updated to match on the next sync.

---

## Open

### 2026-08-31 · Today's composer is inert while feature 002 is the only thing built
**Surface:** iOS, Android, web
**Raised by:** the codebase, during the spec review for 002.
**Was, and will be again:** every empty screen keeps a working composer, "because on every one
of them the answer is to dump something", and day one on Today shows three dashed examples that
fill it. First run's third screen teaches exactly that, one screen before landing there.
**Is, temporarily:** feature 002 builds the way in, the waitlist, the invite, sign in and first
run, and nothing that can accept a dump. So Today renders its designed empty state with a
composer that cannot submit.
**Why this is not a design change:** nobody real is invited during this window. The feature is
done when the team can get in, not when a stranger can, and the promotion path runs against our
own accounts until the dump loop ships in 003. A person invited into an app that just taught
them to dump, and then cannot take a dump, would be the worst possible first impression, and
not sending the invite avoids it entirely.
**Design system impact:** none, and deliberately so. Nothing in the kits changes and no copy is
rewritten. This entry exists because OFF-7 requires a divergence to be logged even when it is
temporary and self-resolving, and because the resolution is a scheduling promise rather than a
code change: **this entry is closed by 003 shipping, not by anything in 002.**

### 2026-08-28 · One dump can become several things, and it lives in the composer
**Surface:** iOS, Android, web
**Raised by:** the codebase, then corrected by the product owner.
**Withdrawn, the part about Today.** An earlier version of this entry asked what a dump looks like
on Today. That question was based on a misreading: Today is a summary assembled from threads and
calendars, not a feed of dumps, so a dump never appears there at all. The voice-note row the kits
show, `Oak brackets, 30cm, matte black · Bookshelf build · voice note, 0:14`, is a thing in a
thread that came from a voice note. Apologies for the noise.
**What is actually true:** a dump is a message in a composer session, of a kind that is not
necessarily text, and offload replies to it in the same composer. One dump can now produce several
things, each filed into its own thread. A dump is visible in conversation history and nowhere else.
**What may need design:** the composer's reply when one dump became several things in several
threads. "Saved to Lisbon trip" assumes one destination. Also the share-sheet case, where someone
shares from Safari with the app closed and later opens it to find the dump and offload's reply
waiting in a conversation they did not start.
**Design system impact:** composer reply copy in all three kits, and possibly the conversation
entry point for a dump that arrived while the app was closed. Lower priority than it looked
yesterday, since no list screen is affected. Not yet done.

### 2026-08-27 · Removing a shared thread is leaving it, and the kits draw one control
**Surface:** iOS, Android, web
**Raised by:** the codebase, while settling how threads are owned.
**What the codebase decided:** a thread has members and no owner, because an owner would be a
role and the single permission rules roles out. So removing a thread other people are in cannot
destroy it, since that would delete things you did not author. It removes your membership and
your key, and every other member's view is untouched. The thread and its contents are deleted
only when the last member leaves, at which point nobody remains who could read them.
**What is missing:** the kits give a thread one destructive control, the same swipe-to-delete and
the same undo toast as anything else. That control now does two different things depending on
whether anyone else is in the thread, and the difference matters: one is reversible and private,
the other removes you from something shared with other people.
**Questions for design:** does a shared thread show a different word, Leave rather than Delete,
and does it need a different confirmation given the swipe is the same gesture? Does the toast say
something different? And is there anything to show for the case where you are the last member and
leaving really does destroy everything, which is the one place the action is not recoverable
after the undo window.
**Design system impact:** the thread row's swipe action and its toast copy in all three kits, and
the thread menu on web. The Ending things settings page may also want a line, since it covers
deleting things without mentioning shared threads. Not yet done.

### 2026-08-27 · A thing has no designed appearance between being dumped and being sorted (name resolved, row state open)
**Surface:** iOS, Android, web
**Raised by:** the codebase, while settling the processing model.
**What is missing:** sorting is asynchronous by design, because putting something down must be
instant and the filing happens afterwards. So there is a window, usually short but not always,
where a thing exists and its thread is not yet decided. Today rows show the thread as metadata,
`Lisbon trip · from Safari`, and there is no drawn state for a row that does not have one yet.
**What the codebase decided:** every thing has a thread from the moment it is written, and a new
dump lands in a default thread that every account has, which the sorter then moves it out of if
it belongs somewhere better. That keeps the data model free of an unsorted state, but it means
the row's metadata changes shortly after it appears, which is a visible thing that needs
designing rather than happening by accident.
**The name is answered.** The brand owner named it **Miscellaneous** on 27 August 2026. Set in
sentence case to match every other thread name in the kits, "Read later", "Gift ideas", "Flat
admin". It is an ordinary thread: it opens, holds things, and can be renamed.
**What is still open:** what a row looks like in the moment before its thread is known. Options
might be showing Miscellaneous and letting it change, showing nothing where the thread would go,
or a quiet marker. The row must not reflow when it settles.
**Design system impact:** the Today row spec in all three kits, the My threads list which will
show the default thread among the others, and the empty-state copy for it. Not yet done.

### 2026-08-26 · The share sheet does not say what happens when a member deletes their account
**Surface:** iOS, Android, web
**Raised by:** the codebase, while settling how shared content is keyed.
**What is missing:** the share sheet states one permission, "they can add to it, they can never
delete what is yours", and that is the whole of what a person is told before they share. It says
nothing about what happens to their things in that thread if they later delete their account.
**What the codebase decided:** a shared thread is co-owned and outlives any one member. Deleting
an account removes that person's private things and their access, and leaves their things inside
the shared thread in place, because the thread belongs to the others too. Account deletion never
cascades into a shared thread.
**Why it needs design:** that is a consequence a person should agree to in advance rather than
discover afterwards, and it is the kind of thing that reads as a betrayal if it surfaces later.
It is also the natural counterpart to the permission line that is already there: one sentence
about what they can do, one about what happens if they go.
**Design system impact:** needs a second line in the share sheet in all three kits, and probably
a line in the Ending things settings page, which currently covers deleting an account without
mentioning shared threads. Copy is design's call, not the codebase's. Not yet done.

---

## 2026-08-27

### 2026-08-27 · Nothing a person puts in is deleted on a clock
**Surface:** all
**Was:** "offload only keeps conversations from the past 60 days", stated in `readme.md` and drawn
in Settings as a Keep conversations for page with a Conversations kept row, options including
Forever, and a Delete all conversations action.
**Is:** things, media, conversations and memories are kept until the person deletes them. There is
no purge clock on anything they put in. Retention now applies only to data that exists for us
rather than for them: analytics events, application logs, traces and LLM metadata, all minimised
on a short clock and none of it visible in the product.
**Why:** deleting someone's photos on a timer is not privacy, it is losing their things. The
product's promise is that offload is the one place you put things and they are still there, and
the kits already rely on that, showing a wedding thread from last year holding 44 things "mostly
photos and the seating plan" and a finished trip whose blurb says everything is still here if you
want the addresses again. A 60-day clock would empty both. Minimising our own operational data
achieves the privacy intent without costing anyone their stuff.
**One thing this fixes rather than breaks:** the kits draw a memory with the things it came from.
Because raw content no longer ages out, that provenance stays true forever, instead of degrading
into a memory that cannot say where it came from.
**Design system impact:** the Keep conversations for settings page and the Conversations kept row
become vestigial unless they are re-drawn as a Forever-only statement or removed. The retention
sentence in `readme.md` under Content fundamentals is now wrong. Delete all conversations is
unaffected and should stay, since manual deletion is still real, immediate and cascading. Not yet
done, and the copy is design's call.

---

## 2026-08-26

### 2026-08-26 · Thread screens renamed from space
**Surface:** iOS, Android
**Was:** `SpaceScreen.jsx`, `SpacesScreen.jsx`, `M3SpaceScreen.jsx`, `M3SpacesScreen.jsx`, exporting `SpaceScreen` and `SpacesScreen`.
**Is:** `ThreadScreen.jsx`, `ThreadsScreen.jsx`, `M3ThreadScreen.jsx`, `M3ThreadsScreen.jsx`, exporting `ThreadScreen` and `ThreadsScreen`.
**Why:** Catching the filenames up with the vocabulary decision of 25 August.
**Design system impact:** Done. The prototype fixture still uses `D.spaces`, a `space` prop and the `"spaces"` tab key, left alone because all three kits share that one file. The real data model should say thread from the first commit.

### 2026-08-26 · Two stale four-second undo references corrected
**Surface:** iOS, web
**Was:** `ui_kits/mobile_app/README.md` and a comment in `ui_kits/web_app/WApp.jsx` both said four seconds.
**Is:** Eight, matching the decision of 25 August.
**Design system impact:** Done. Docs only, no behaviour changed.

---

## Closed before handoff

These were settled in the design system between 11 and 26 August 2026, before any code
existed. They are recorded here as the starting state, not as decisions the codebase made.
Full reasoning for each is in `readme.md`.

### 2026-08-25 · A collection is a thread
**Surface:** all
**Is:** thread for the container, thing for one item inside it. The second tab is My threads, glyph `lasso`.
**Why:** Chosen over loop, stack, bundle, pile and case. It was already the word the kits used in code and data.
**Design system impact:** Done in copy. Not done in filenames, see the drift note in CONTRIBUTING.

### 2026-08-25 · Contrast floors raised
**Surface:** all
**Was:** `--text-tertiary` #9E9E9E at 2.55:1, `--border-strong` #DEDEDE at 1.28:1.
**Is:** `--text-tertiary` #6E6E6E light and #959595 dark, 4.5:1 or better everywhere. `--border-strong` #8C8C8C light and #777777 dark, 3:1 everywhere.
**Why:** Tertiary carries metadata, counts, timestamps and captions, so it failed on real copy. Border-strong is the only thing that says a field or checkbox is there.
**Design system impact:** `tokens/colors.css`. Secondary and tertiary are now closer than they were, so separate the two ranks by size and weight, not colour alone.

### 2026-08-25 · Reduced motion is a cut, not a shortening
**Surface:** all
**Is:** `prefers-reduced-motion: reduce` removes movement entirely. No pane slide, no iOS push, no shared axis, no drawn tick, no toast rise, no hover transition. The new state is simply there.
**Why:** A shortened animation is still an animation.
**Design system impact:** `tokens/motion.css`, inherited by every kit and card.

### 2026-08-25 · Undo lasts eight seconds
**Surface:** all
**Was:** Four seconds.
**Is:** Eight, and nothing is destroyed while the toast is up.
**Why:** Four is not enough time to read a toast, reach for a pointer, or hear a screen reader announce it.
**Design system impact:** Toast spec.

### 2026-08-25 · Light is the default theme
**Surface:** all
**Is:** A new account opens in light regardless of the device setting. Dark is a choice in Settings.
**Design system impact:** All three kits default to light.

### 2026-08-25 · Sharing is connections only
**Surface:** all
**Is:** No public links. The share sheet's last row makes a new connection, matched against accounts that exist. One permission, stated identically everywhere: they can add to it, they can never delete what is yours.
**Why:** Sharing never lets anyone new into offload. Someone without an account comes through the waitlist.
**Design system impact:** Share sheet in all three kits.

### 2026-08-25 · Two accents, no third
**Surface:** all
**Is:** moss #3F6B4F for "offload did this", ink blue #3355D6 for "this needs you". They never appear on the same row. If something was sorted and is waiting, waiting wins.
**Design system impact:** `tokens/colors.css`, semantic aliases only.

### 2026-08-25 · Instrument Sans and Literata are the real faces
**Surface:** all
**Is:** Not placeholders. Served from the Google CDN for now.
**Design system impact:** `tokens/fonts.css` becomes self-hosted `@font-face` whenever hosting matters. No licence chase pending.

### 2026-08 · Two roles in the admin panel
**Surface:** admin
**Is:** Support gets waitlist and people. Owner also gets costs, limits and staff. Support does not see those pages at all rather than seeing them refused. Always at least one owner, and nobody can edit themselves out of the panel.
**Design system impact:** `ui_kits/admin_web/`.

### 2026-09-01 · Two gaps the token scale has, found by building the phones
**Surface:** mobile, web
**Is:** The mobile screens are built entirely from `packages/tokens`, and two values in the kits have no token behind them.

1. **Control height.** The gate's buttons, the primary button and the composer are all 52px. There is a `--composer-height` and an `--appbar-height` at that value, but no `--control-height`, so a button either borrows a token that means something else or hard-codes the number. The mobile app currently uses `min-h-composer-height` on buttons, which is honest about where the value came from and wrong about what it means.
2. **The first-run dot is 7px.** The spacing scale steps 6, 8; there is no 7. The dots use `space-3` at 6px.

**Why it matters here:** the design-adherence lint rejects a raw px in application code, which is the rule working. Both of these reached the point of being written as literals before being caught, which is the signal that the scale is missing a step rather than that the screen is wrong.

**Design system impact:** `tokens/space.css` or equivalent gains a `--control-height`, and either the dot becomes 6px in the kits or the scale gains a 7px step. Until then both deviations are commented at their use site.

### 2026-09-01 · The web gate was built without reading its kit
**Surface:** web
**Is:** The sign-in, no-invite and first-run screens were implemented from `readme.md` and the feature spec's acceptance criteria, and `ui_kits/web_app/WFirstRunGate.jsx` was never opened. They have been rebuilt against it. What differed:

- The card. The kit is a 440px raised card with a sheet shadow on a sunken page, wordmark top left, `Terms · Privacy` bottom left. The build had a bare centred column on the page background.
- The title. The kit says "Sign in to offload". The build had reused the marketing headline, "Offload what you would otherwise forget.", which is the site's argument and not a gate's instruction.
- The provider buttons. The kit fills Apple and outlines Google, both with their glyphs, at 48px. The build had two identical outlined buttons with no icons at 52px, which makes the pair read as an arbitrary choice.
- The refusal. The kit is a soft attention block above the buttons. The build had a line of danger-red text, which says the person made a mistake.
- The no-invite screen. The kit names the address inside the sentence, offers two full-width buttons, and closes with "Invited on another address? Sign in with that one instead.". The build had the address on its own line, a quiet text link for the secondary, and no footer.
- First run. The kit carries an illustration per screen, a 34px title, a 240px button, and progress dots below it whose active step is an 18px pill. The build had no art, a 26px title, a full-width button, and three equal dots at the top.

**Why it matters:** every one of these was individually defensible and collectively a different product. The rule that would have caught it is "read the kit for the screen you are building", not "read the design system".

**Two gaps found in the system while doing it:**
1. The kit used `--radius-2xl`, which does not exist. **Answered by design: `--radius-xl` (28px) is the largest rectangular radius, there is no 2xl and there will not be. The ladder is xs 6, sm 10, md 14, lg 20, xl 28, pill 999, plus the semantic aliases `--radius-card`, `--radius-sheet`, `--radius-field`.** The kit's `WGateCard` has been corrected to `--radius-xl`, which is also what the rebuild uses. It was not a gap in the tokens: the reference resolved to nothing, so the kit's own card was rendering square.
2. Google's four brand hexes cannot be tokens, because Google's branding requirements mandate them for the sign-in button. They are the one lint exception in the web app, scoped to that component with the reason at the use site.

**Design system impact:** `ui_kits/web_app/WFirstRunGate.jsx` corrected. **`_ds_bundle.js` still carries the old value at `WGateCard` and is generated, so it needs regenerating rather than hand-editing.** The mobile and Android gates have the same divergence from their kits and are not yet rebuilt.

### 2026-09-01 · Android is a real fork, and its palette is generated
**Surface:** android, ios
**Is:** The phones' gate, no-invite, first run and day-one Today are rebuilt from their kits. Android is a genuine fork rather than a skin, using Expo Router's platform route files (`sign-in.android.tsx` beside `sign-in.ios.tsx`), because the two kits differ in more than colour: Google leads on Android, the primary is a filled Material button at 56 rather than 52, the shape scale is Material's rather than offload's, the bar is `row-height-lg` rather than `tabbar-height`, and the type sits on Material's tracking.

**The palette is generated, not retyped.** `[data-platform="android"]` in the Android kit's `index.html` defines the Material surface roles, the replaced radii and the taller bars. The token generator now reads that scope and emits them as `a-*` colours, `a-*` radii and `a-*` heights, so the fork consumes tokens like everything else. A hex typed into the app is what OFF-7 exists to prevent, and "it was only for Android" is how that starts.

**Copy does not fork.** Both platforms read `lib/gate.ts`, so a copy change that reaches one and not the other is impossible by construction rather than by discipline.

**What the adherence lint caught during this, both correctly:** a `markOnly` prop invented for `Logo`, which declares `variant` and a `tone` of `ink` or `inverse`; and hard-coded hexes in SVG props, where NativeWind cannot reach and a literal is tempting. Those colours now come from the generated tokens through `lib/colors.ts`.

**Design system impact:** none. The Android platform scope stays where it is and is now consumed rather than copied.

### 2026-09-01 · Android's primary button wears the attention accent, unresolved
**Surface:** android
**Is:** Every primary action on Android is `--blue-600`: the filled Google button, Join the waitlist, Get started, and Skip's label at `--blue-700`.

**The problem is that the design system says two things.** `ui_kits/android_app/README.md` specifies "first-run buttons: ink primary on iOS, filled blue primary on Android", and `M3FirstRun.jsx` uses `var(--blue-600)` directly. `readme.md` says of the two accents that "neither accent fills a primary button (that is always ink)", and that ink blue means *this needs you*.

Both cannot hold. Following the Android kit, as the fork does, spends the "something is waiting for you" colour on every ordinary button on that platform, which is the signal Tonight and overdue things will need later.

**Not resolved in code.** The kit is the more specific instruction and the fork follows it, so Android ships blue primaries today. Raised here rather than decided, because the answer is a brand call and the fix is one token either way.

**Design system impact:** either `readme.md`'s rule gains an explicit Android exception, or the Android kit gains a semantic `--a-primary` that is not the attention accent and `M3FirstRun.jsx` stops reaching for `--blue-600` directly. Until then this is a divergence with a log entry rather than a silent one.

### 2026-09-01 · The admin waitlist notes describe this product, not the kit's
**Surface:** admin
**Is:** The "what an invite does" notes under the waitlist table are rewritten from `ui_kits/admin_web/AdminApp.jsx`. The kit says an invite "creates nothing: the account exists when they sign in", and that it is "single use, expires in 14 days, and resend voids the old link". Neither is true here: promotion creates the account, its keys, its Miscellaneous thread and its membership in one transaction (AC-2), and there is no link at all, because sign-in is by provider on the invited address. Resend re-sends the email.

**Why the code wins:** the spec, not the mock, defines what promotion does, and copy that describes a mechanism the product does not have is worse than no copy. Support reads this panel.

**Design system impact:** `ui_kits/admin_web/AdminApp.jsx`'s `NOTES` array should be corrected to match, and the "single use, expires in 14 days" line dropped until such a mechanism exists.
