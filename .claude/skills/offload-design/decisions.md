# Decision log

Append only. Newest first. Both the codebase and the design system write here.

Format and the meaning of each field: `handoff/CONTRIBUTING.md`.

When design and code disagree, **code leads**. A decision recorded here from the codebase is
the new truth, and the design system is updated to match on the next sync.

---

## Open

### 2026-09-04 · A screen catches up on its own, and the mark for it is moss
**Surface:** web, and mobile owes the same
**Raised by:** the product owner.

**offload can file into the thread you are looking at**, because the composer floats over every
tab. Until now the page went on showing what it held a moment ago while the reply said otherwise,
which is the same class of untruth 004 exists to retire, arriving from the other direction. The
thread the turn wrote to now refetches itself, and whatever was not there before is marked for
1400ms.

**The mark is moss, and the product owner asked for blue.** Worth recording because the request was
reasonable and the answer is in this system's own colour rules: `--blue-600` means *this needs you*,
for something waiting, unresolved or about to expire, and `--moss-600` means *offload did this, you
didn't*, with the "what moved" surfaces already among its listed uses. A row offload filed correctly
needs nothing from anybody. Blue would also break the rule that the two accents never appear on the
same row, on any flashed row that is also a task waiting on you. The product owner agreed. *There is
no signature blue: the mark itself is one colour, ink or paper, no accent.*

**The memory editor opens inside the chip it belongs to.** It used to sit at the foot of the
section, so editing the third memory looked like editing the last one. The chip now grows to hold
its own editor, animated on `grid-template-rows` from `0fr` to `1fr`, which gets a real height
transition with no magic number in it; a `max-height` guess has to clear the longest memory and then
spends most of the close above the content, which reads as slow.

**A section with nothing in it draws nothing at all**, Memories and the content list alike. A
heading over an empty row is a section announcing its own absence, which is what the standing
summary already refuses to do. The consequence is that the way into an empty Memories section has to
come from outside it, so the pane head gained a `plus` tool beside the rename pencil.

**Design system impact:** three things, none of them none. The kits have **no change mark at all**,
and one is now needed on any surface offload can write to while somebody is looking at it: the
thread page, Today, and the phones. The **memory chip has an open state** that no kit draws, where a
pill becomes a container holding a field and four controls. And the **thread pane head now carries
two tools plus Open full**, where `WThing.jsx` draws `maximize-2` and `ellipsis`; the honest reading
is that these belong behind the `ellipsis` the kit already has, and the kit should say what is in it.

### 2026-09-04 · A memories section, and the kits are behind the contracts
**Surface:** web
**Raised by:** 008, and by the client review of its spec.

**A thread now has a Memories section**, between the widgets and "Everything in here". Up to ten
chips, each a standing rule the thread holds about itself. Clicking one edits its full text, the
author gets Delete, every other member gets Mute, and a trailing outline chip adds one.

**No kit draws it**, and the interesting part is what happened when I looked for the nearest thing
that did. `WThing` has no memories section. `WMemories` and `WPerson` both have chip rows, and both
pass `Chip variant="soft"`, which the governed contract does not declare, which the generated lint
rule rejects, and which `readme.md` retired on the grounds that the soft tints sat too close to
paper to read as colour at chip size. `WSection` is kit-local scaffolding rather than the governed
`SectionHeader`, and it invents a toned count pill `SectionHeader` has no prop for.

**So this was built from the component contracts with the kits as shape reference.** That is the
opposite of the usual failure here, which is reading the readme instead of the kit. The kits were
read whole, and the kits are what is stale.

**Two things the `Chip` contract does not have**, both worked around rather than added to it:
`disabled`, so at ten the add control is replaced by the sentence "This thread already holds ten.
Delete one to add another" rather than greyed out, which also puts the way forward where the
affordance was. And any width handling: `Chip` is `nowrap` with no `max-width` and no ellipsis,
every label in every kit is under twenty characters, and a memory runs to sixty on the chip, so the
ceiling and the ellipsis live in the screen.

**Design system impact:** not none, four things. The kits' own chip rows still pass the retired
`variant="soft"` and need it removed. A memories section is needed on the thread screen across web,
mobile and android, and nothing in any kit draws one. **Authorship on a chip has no precedent
anywhere**: `MemoryChip`'s dot marks which person a memory is *about*, not who wrote it, so a shared
thread showing who wrote each rule needs a real pass. And `Chip` has no disabled state, which this
screen avoided needing; the next screen may not be able to.

### 2026-09-04 · Larger text scales text, not the layout
**Surface:** web
**Raised by:** the product owner, the same day the control shipped.

**`zoom` was the wrong mechanism and it failed in the obvious way.** Larger text was one line,
`shell.style.zoom = 1.15`, and `zoom` scales layout with it: the 248px sidebar became 285px, the
520px pane became 598px, and the right-hand pane went off the edge of a laptop screen. What
somebody asking for bigger text wants is text taking more of the space it already has, not the
same layout rendered on a smaller screen.

**So the scale is real now, and it is only type.** `--type-scale` on `:root`, `1.15` under
`:root[data-type="large"]`, and every text size in the shell reads `calc(Npx * var(--type-scale))`
while every width, gutter, radius and icon stays a literal pixel. The four token sizes in use
(`--size-body`, `--size-body-sm`, `--size-caption`, `--size-label`) are overridden in the same
block, because the rules that set `font: var(--text-body-role)` would otherwise be the only text
on the screen that did not move.

Two details worth keeping. The `font:` shorthand had to be split into longhand in 21 rules: a
calc in the size slot sits directly before the `/` that introduces the leading, and that is
ambiguous enough that it is not worth relying on. And the map pin keeps its literal 11px, because
it is centred in a fixed 22px circle by its own line-height, so growing the text there would break
the circle rather than fill it.

**Design system impact:** this is the type scale the previous entry said the token set should
own, built in the app because the app needed it that day. When the design system takes it, it
takes `--type-scale` and the size overrides and the app reads them instead of defining them. The
rest of that entry stands: the kit still has no theme switch and no type-size control and needs a
view on both.

### 2026-09-04 · Open full goes on the pane, and a link opens one pane
**Surface:** web
**Raised by:** the product owner, on a run of divergences from the kits.

**Open full was in the crumb bar and belongs on the pane.** `WThing` passes
`tools={[["maximize-2","Open full"],["ellipsis","More"]]}` to `WPaneHead`, so it sits at the end
of the pane's own head, after the faces and Share. It is a thing you do to this pane, so it lives
on the pane; in the trail it read as navigation.

**How it got there is the part worth recording.** I found the right file and grepped it for the
line I expected. `WThing` puts the title and the tools on consecutive lines, so searching for the
title returns everything except where the button goes, and a grep that returns something makes
you stop looking. The same habit produced the badge tones the wrong way round, the missing first
group heading, the seam on the wrong pane and a composer with no header. `.claude/scripts/
kit-component.sh` prints a component whole for this reason, and `CLAUDE.md` now says to run it
after `find-kit.sh`.

**A link opens one pane.** Two panes are what you get by walking from one screen into another,
which is a fact about the journey rather than about the destination, so the journey carries it
in a `from` query. Opening `/threads/:id` cold shows that thread alone: a link somebody sends
should open the thing it names, not the thing plus a list. *This reverses the reasoning recorded
on 2026-09-03, which made the stack purely route-derived so a shared link would reproduce both
panes. That was the wrong instinct about what a shared link is for.*

**Two controls that are not in the kit at all**, at the foot of the nav beside Settings: light
and dark, and larger text. The type scale was checked first and the app already matches the kit
exactly (13, 13.5, 14, 14.5, 15.5, 18, 20, 25); the kit only looks larger because it renders in a
fixed 1440px canvas.

**Design system impact:** the kit has no theme switch and no type-size control, and it needs a
view on both. **Larger text was `zoom` here and is not any more**: it scaled the
layout with the text and pushed a pane off the screen, so it is a real type scale as of the entry
above, still defined in the app rather than in the token set. There is also no `minimize-2` in the vendored icon set,
so Open full uses the same glyph both ways and lets the label carry the direction.

### 2026-09-03 · The mark, in the four places it was missing
**Surface:** web, marketing
**Raised by:** the product owner.

**The sidebar's logo was the threads icon.** `lasso` is the glyph a thread carries, so the
product's own name was wearing one of its nouns. It is `Logo tone="inverse"` now, which is the
component that already existed and matches the contract in `components/brand/Logo.d.ts`.

**The composer's conversation header used sparkles**, which the kit does. Sparkles is the glyph
for anything **offload derived**, and that is a different claim: it belongs on a tag it inferred,
not on the product saying something. The mark, at 15px. *Worth raising with the kit rather than
just changing: the fixture there shows a thread name beside it, and the sparkle reads correctly
for a summary offload wrote. It reads as a claim when the thing beside it is your own sentence.*

**There was no favicon at all**, so every tab said nothing. `app/icon.svg` is the design system's
`assets/app-icon.svg` verbatim: the ink tile with the mark in white, which is the one version
that reads on both a light and a dark browser chrome. A bare mark would have vanished on dark.

**The marketing mark went nowhere.** It is the first thing anybody tries on a marketing site, and
on `/privacy` it is the only navigation there is, so a reader who followed a link had no way back
to what the product is.

**Design system impact:** one question for the kit. `WComposer` puts sparkles on the open
conversation's header, and the mark is the better glyph there for the reason above. Everything
else was the code catching up.

### 2026-09-03 · The pane slide, and printing a thread's contents once
**Surface:** web
**Raised by:** the product owner, watching the running app beside the kit.

**The pane animation read as a glitch rather than a reveal, and the animation was not the
problem.** Every route fetched its own copy of My threads, so opening a thread unmounted the
list, showed nothing, and filled it back in a moment later, while the pane it lives in was also
sliding. Two things were moving and one of them was empty. No amount of tuning the curve would
have fixed it: the pane had no content to show while it moved. The list is fetched once by the
shell now and read by everything under it, and **only the arriving pane animates**, on the kit's
own curve, in from the right over 260ms. The pane behind stays still, which is what makes the
new one look revealed rather than everything look redrawn.

**A thread's contents are printed once.** A widget lifts its rows out of the list below rather
than duplicating them, and that list is headed **"Everything else"** once anything has been
lifted, or "Everything in here" when nothing has, because otherwise it is else to nothing. The
kit only ever draws the second heading, having no widgets in its web pane to lift anything.
Printing a task in the to-do list and again underneath is the same information twice and makes a
thread look longer than it is.

**The count follows the list.** It is shown only when the whole list is loaded, because a number
that counts one page disagrees with the list under it the moment somebody scrolls.

**The composer gained its header.** An open conversation had no way to be closed: the kit's
sparkles, title, expand and close were missing entirely, so the composer grew and stayed grown.
Expand is inert, since a conversation of its own is not built. The title is your own opening
line rather than a thread name, because offload does not name conversations yet and the kit's
fixture has one where a real conversation does not.

**Design system impact:** the "Everything else" heading is new and the kit should carry both,
with the rule for which appears. The composer's title needs a decision the kit has already made
for a case that does not exist yet: it shows a thread name, and a conversation is not about one
thread.

### 2026-09-03 · A pass over the web UI against the kit, and what it exposed
**Surface:** web
**Raised by:** the product owner, with screenshots of the kit beside the running app.

**The build had drifted a long way from `ui_kits/web_app` and most of it was one omission.**
There were no icons at all: the shell used text glyphs where every kit uses Lucide. The design
system vendors eighty of them in `assets/icons/`, so they are copied into `public/icons` and
rendered as a `currentColor` mask, which is the kit's own `Icon` primitive rather than a new
one. `.claude/scripts/dead-icons.mjs` now checks every slug resolves, because a name that does
not exist renders an empty box and nothing complains: no error, no warning, no build failure.
Same invisible failure as a Tailwind class nobody defined, which is why it sits beside the two
scanners that already exist for that.

**Fixed to match the kit:** crumbs are chips with glyphs and the current one inverts to ink;
the top pane is raised and the ones behind it are the page, which is what makes a stack read as
a stack; head and body share the 700px reading measure; a section rule is solid ink rather than
a hairline, which is what makes it a break rather than a divider; rows carry a 32px tile, a
15.5px title and an inset separator so a row that loses one does not change height; the composer
is the rounded card with a blue ring rather than a bar with a border; delete asks in the row's
own place before the eight seconds.

**Two things I had backwards and would not have found without the screenshots.** The badge
tones: `WThings` gives "Always on" the accent and leaves "Older threads" on the default, so the
solid blue lands on the group that is finished rather than the one that never closes. And the
first group has no heading at all, which reads as obvious on screen and as an omission in code.

**One thing the kit draws that the code should not have.** The sidebar's Pinned group took the
first three threads by recency and called them pinned, so a thread created a minute ago appeared
pinned to itself. Nothing pins, so nothing is shown as pinned. **Real pinning is `pinned_at` on
`thread_members`**, per person because threads are shared, and it arrives with the control that
sets it. A group that looks like a feature misbehaving is worse than one that is absent.

**One behaviour changed on the product owner's call, and it is a good rule.** A ticked task
sinks to the bottom of its list rather than leaving it: its importance drops below everything
still outstanding the moment it is finished. It stays visible, struck through, because something
you did this morning disappearing is how you end up wondering whether you did it, and the tick
is the reward for doing the work.

**Design system impact:** none of the above is a change to the design, it is the code catching
up. Two things do belong to the kit. **Pinned needs a source**: it is drawn with a `+`, which
implies somebody chose what is in it, and nothing in the data model says what. And the kit has
no completed-task state in a list, which it now needs, because a ticked row stays.

### 2026-09-03 · Widgets, and a group heading that had to be invented
**Surface:** web, and the phones next
**Raised by:** the codebase, building feature 007.

**Built to the kit.** `M3ThreadWidgets.jsx` states the rule and the code follows it: widgets a
thread earns from its own contents, a map when it has places, a timeline when it has dated
steps, a file grid when it has assets. None is ever drawn empty and none is configured into
existence. The map is pins on a plain surface with "drawn from real coordinates" behind them,
which is exactly what the kit draws and is now a decision rather than a placeholder: real tiles
would mean a map company receiving where somebody has been, and nobody needs that yet.

**One: the kit filters, the code groups.** `ChipRow` is a single-select filter above a flat
list. The product owner asked for grouping, which is headed sections, and both may eventually be
wanted. **Shipping both without deciding which is primary is how a screen ends up with two ways
to do one thing**, so only grouping is drawn. The kit should decide, and if the answer is both,
it should say which one a thread uses by default.

**Two: a group heading is new surface, and there was nothing to reuse.** The 21 components offer
`SectionHeader`, 21px semibold over an ink rule, which is far too heavy for a sub-group inside a
widget that already has one, and `Chip`, which the kit uses with `tone="accent"` and a sparkles
glyph for anything offload derived. The heading is built from that vocabulary: 12.5px, accent,
lowercase, with a small mark. **It is the weakest thing in this feature** because it is the only
part with no drawn precedent, and it is the first thing to look at on the next sync.

**Three: the unnamed group has no heading at all.** Rows carrying no tag in the dimension a
thread groups by go last, under nothing, or under "Everything else" when there is more than one
group. Not "Other", and not "Untagged": both are labels offload would be inventing for content
nobody categorised, and the whole pitch is that nobody has to categorise anything.

**Four: a ticked row stays in the list, struck through.** No kit draws a completed task in
place. It does not vanish, because Undo needs something to point at and so does the person
wondering whether they already did it.

**Design system impact:** the group heading first, then the filter-versus-group question, then
the completed and archived states. The widget contract is defined once in code
(`lib/widgets.ts`, mirrored in the Core API) so the phones render the same four widgets from the
same data when their turn comes, which is what parity means here.

### 2026-09-03 · The thread page, and four places the kit and the code disagree
**Surface:** web
**Raised by:** the codebase, building feature 005.
**What shipped:** the shell, My threads, a thread page and a content pane, built from
`WApp.jsx`, `WMisc.jsx` and `WThing.jsx`. What follows is only where the code came out
different, and each one is deliberate.

**One: no summary, nothing drawn, and the web kit was right.** `WThing.jsx` has
`{st ? ... : null}`; the phones render "offload has not summarised this one yet" from a
`Standing` component. This shipped with the phones' line and the product owner reversed it the
same day: **a line saying offload has not done something is not information, it is an apology
occupying the most prominent space on the screen.** Nothing writes summaries yet, so the block
is simply absent, and the day one lands it appears with something in it. **The phones should
drop the placeholder**, which is the opposite of what this entry first said.

**Two: delete is drawn on every row and belongs to the author.** Both kits put `trash-2` on
every row unconditionally. OFF-3 says a member can never delete what is not theirs, so the
control is conditional now, and the server computes the flag rather than the client inferring
it. **The kits should draw the row tools as conditional.**

**Three: archive has a control everywhere and a destination nowhere.** Every kit draws an
`archive` tool and no kit draws what an archived thing looks like or where it goes. 005 gives it
one: a section header that toggles between "Everything in here" and "Archived N", with archived
rows dimmed. Invented here, and the weakest of the four, because it is the only one with no
drawn precedent. **Worth designing properly.**

**Four: the composer was still on Today, and is not any more.** `WMisc.jsx` states it plainly:
"one composer, under both panes, spanning the window. It never belongs to a pane." 005 shipped
it on Today anyway and logged the difference as a debt. **The product owner reversed that within
hours**, and the readme already held the argument: the composer is a tool rather than a chat, so
a place you can say things cannot be one tab. It is in the shell now, on every tab, and the kit
and the code agree again. *Left in this entry rather than deleted, because "the kit says X and
we are doing Y for now" appearing twice in one feature is the thing worth noticing.*

**Five, new: offload's reply links to the threads it wrote to.** No kit draws this. A reply
saying "Added to Flat admin" now carries Flat admin as a pill you can open, built from the
content rows the turn actually produced rather than from the words in the sentence. **The kits
should draw it**, and the honest place is beneath offload's turn in the composer. It matters
more than it looks: it is the first time the composer does something other than talk, and the
readme's claim that any UI task can be said rather than tapped starts here.

**Design system impact:** two, three and five are kit changes on the next sync, listed in the
order they matter. One is now a change to the *phones* rather than to web, and it is a deletion.
Four is closed. Separately,
the design system has **no breakpoint tokens**, and the shell needs one: 1180 comes from
`WApp.jsx`'s own preview toggle and now lives as a literal in one stylesheet, deliberately in
one place rather than two. A `--breakpoint-*` family would be worth adding.

### 2026-09-03 · Undo is the Toast as drawn; the partial reply is new surface
**Surface:** web
**Raised by:** the codebase, building feature 004.
**Undo, and why there is nothing to decide here:** offload now files what you dump, so it needs the
one way back the readme promises. That is `Toast`, whose contract already says it: ink bar, one
optional action, "float it above the composer with 16px of side gutter", eight seconds. Built to the
contract, with the message naming the threads from offload's own reply so the toast and the
conversation cannot disagree about where something went. `role="status"` rather than `alert`,
because a confirmation is announced without interrupting.
**The partial reply, which is new:** a turn can now file some of what you dumped and not the rest.
No kit draws that. It reuses the treatment 003 invented for a failed message, inline and persistent
rather than a toast, for the same reason: a toast clears itself after eight seconds and would take
the only way forward with it. The copy differs because the situations differ. A failed dump says
"offload could not answer that one. Your dump is saved." with **Try again**, which puts the text
back in the composer. A partial one says "offload did not finish that one." with **Finish it**,
which asks offload to do the rest. Saying "try again" on a partial turn would invite somebody to
re-send a dump that is already half filed.
**Why two words and not one control:** the two states want opposite actions. One has nothing in a
thread and everything in the composer; the other has the reverse. A single "retry" that did the
wrong one of those in either case would file half a dump twice.
**Not on screen together:** a finished turn offers Undo, a partial one offers Finish it, never both.
Asking somebody to choose between finishing and undoing inside eight seconds is not a choice.
**Design system impact:** two things for the next sync. **One:** the web kit has no failed and no
partial state for a composer turn, and now both exist in code. `WToday.jsx` should draw them, and
the phones need the same pair when their composer stops being inert. **Two:** the readme's Undo
section describes the toast for a delete. It now also covers an automatic action offload took on
its own, which is the commoner case by far and reads slightly differently: "Sorted into Lisbon trip"
rather than "Lisbon trip deleted". Worth a line.

### 2026-09-03 · The retired word gets a name in code, and still has none in copy
**Surface:** iOS, Android, web, admin
**Raised by:** the codebase, building feature 004.
**Was:** "thing" was the product's noun for one piece inside a thread, in the kits, in the specs
and in the schema. It was retired on 2026-09-02 as user-facing copy, with the instruction to
reword around it rather than swap in a synonym, which is why a count in the kits now reads "4"
and not "4 things".
**Is:** the split is now explicit and runs along the audience line. **In schema and code the noun
is `content`**: feature 004 creates the table and the identifier families that go with it
(`content_count`, `content_blobs`, `content_id`, `readable_content`). **In anything a person
reads there is still no noun at all.** A thread holds what you dumped in, a count stands on its
own, and no screen ever says "content" any more than it said "thing".
**Why a synonym in code and none in copy:** a table needs a name and `content` is the plainest
one available, but the same word on a screen would be worse than the one it replaced. "Thing" at
least sounded like a person talking. "Content" sounds like a CMS, and the whole argument for
retiring the word was that naming the unit makes people think about filing, which is the thing
offload exists to take off them.
**One collision, accepted:** `content` is also the general word for what people dump, in OFF-1
and in the model API's own content blocks. Disambiguated locally in code, not by finding a third
word.
**Design system impact:** the kits and `data.js` still say `thing` and `things` throughout, and
the explorations do too. **The kits should catch up; the explorations should not.** An
exploration log is a record of what was tried on a date, and rewriting one to match a decision
taken afterwards falsifies it. The concrete list for the next sync: `WThing.jsx` and its route,
the `things` arrays in `ui_kits/mobile_app/data.js`, and the vocabulary section of `readme.md`,
which is the contract rather than a record and is the one that matters most.

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

**Amended 2026-09-02:** 003 is web only, so it closes this for web and leaves it open on the
phones. Their composer stays inert until their own feature lands, and the promotion discipline
above, no real invites while a composer cannot take a dump, still binds because a person invited
today reaches a phone before they reach a browser. *Amended rather than rewritten: the entry
promised a resolution on three surfaces and one of them is arriving, which is exactly the kind of
half-kept promise that reads as kept if nobody writes the other half down.*

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

**Parked, following the kits.** The brand owner's call, 1 September: ship what the kits say for now and revisit after testing it on a device. So Android keeps its blue primaries and no code changes. The fix stays one token either way whenever that revisit happens.

**Design system impact:** either `readme.md`'s rule gains an explicit Android exception, or the Android kit gains a semantic `--a-primary` that is not the attention accent and `M3FirstRun.jsx` stops reaching for `--blue-600` directly. Until then this is a divergence with a log entry rather than a silent one.

### 2026-09-01 · The admin waitlist notes describe this product, not the kit's
**Surface:** admin
**Is:** The "what an invite does" notes under the waitlist table are rewritten from `ui_kits/admin_web/AdminApp.jsx`. The kit says an invite "creates nothing: the account exists when they sign in", and that it is "single use, expires in 14 days, and resend voids the old link". Neither is true here: promotion creates the account, its keys, its Miscellaneous thread and its membership in one transaction (AC-2), and there is no link at all, because sign-in is by provider on the invited address. Resend re-sends the email.

**Why the code wins:** the spec, not the mock, defines what promotion does, and copy that describes a mechanism the product does not have is worse than no copy. Support reads this panel.

**Design system impact:** `ui_kits/admin_web/AdminApp.jsx`'s `NOTES` array should be corrected to match, and the "single use, expires in 14 days" line dropped until such a mechanism exists.

### 2026-09-01 · Removing a waitlist address, which the kit leaves out
**Surface:** admin
**Is:** The waitlist table has a Remove action beside Invite, for rows still waiting only. It confirms first and names the address.

**The kit says not to have it.** `AdminApp.jsx`'s notes read "Removing an address from the waitlist is not here on purpose. Support does it from People once the account exists." Two things make that unworkable today: People does not exist, and an address that arrived by typo or by bot has no account to remove it from, because until an invite goes out there is nothing but a row.

**Kept narrow so the kit's reasoning still holds where it applies.** The route refuses anything past `waitlist`, so an invited or active account can never be removed this way; that account has keys, a thread and a membership, and removing it here would orphan all three. It is also a soft delete, because the unique index on the address only covers rows where `deleted_at` is null: a hard delete would let the same address rejoin and be counted as new, and the rate limiter would lose sight of it.

**Design system impact:** the kit's notes array should describe Remove and keep the "belongs on People" rule for accounts that exist, rather than forbidding removal outright.

### 2026-09-01 · The admin nav, and a link back the other way
**Surface:** admin, web
**Is:** The nav was rebuilt against `A.jsx`'s `ASideNav`, which it had only partly followed: the wordmark beside the mark, a count on Waitlist, the signed-in address rather than the role, and "Back to the app" were all specified and all missing.

**One addition the kit does not have:** a moss `admin` link in the web app, top right, rendered only for staff. The kit gives the panel a way back to the app and the app no way in, which leaves typing a URL as the only route. It reuses the nav's own moss so the destination is legible before the click, and it is the only moss chrome in the app. The staff check is the same request the panel makes, which 404s for everyone else, so a non-staff account cannot learn the panel exists from it.

**Design system impact:** `ui_kits/web_app/` gains the staff link on the app side; `A.jsx` is already correct and was simply not followed.

### 2026-09-01 · Clay at rest on Remove, and a selection bar that floats
**Surface:** admin
**Is:** Two changes to the waitlist table the kit does not describe, both from watching it used.

**The selection bar floats instead of sitting above the table.** `AdminApp.jsx` puts it in the flow, which pushes the whole table down the moment a row is ticked, moving every other row out from under the pointer that just ticked one. Selecting a second row means finding it again. It is now a fixed pill at the bottom of the pane, so the table never moves.

**Remove is clay at rest, not on hover.** `ADanger` in `A.jsx` keeps a destructive row action grey until the pointer is on it: "clay is only ever on a destructive control, and it only turns red once the pointer is on it." The product owner asked for it to read as destructive before you touch it, which is the trade this makes: a clay outline and clay text at rest, filling to `--clay-100` on hover. The solid confirmation stays exactly as `ADanger` specifies, and clay still appears nowhere that is not destructive.

**Design system impact:** `A.jsx`'s `ADanger` gains a resting variant, or the rule in its comment gains an exception for a row action that sits beside a non-destructive one, where grey-until-hover makes the two look alike. The bulk bar's position should change in `AdminApp.jsx` regardless of the clay question.

### 2026-09-01 · The pre-account screens get a moving background, and the gate joins the landing page
**Surface:** web

**Is:** The landing page is rebuilt from a new design by the brand owner, and the gate is moved onto the same frame. Behind both there is now a drifting watercolour field: four blurred colour clouds across the page, a halo, and the mark filled with six masked layers, five gradient washes and a WebGL thin-film prism, each pushed through its own SVG turbulence displacement and each lagging the pointer at a different depth. The headline is `offload <verb> for you`, the verb cycling every five seconds through remembers, organizes, sorts, files, keeps, tracks, dissolving out through a turbulence bleed with three coloured ghosts spreading behind it.

**This contradicts `readme.md`, knowingly.** "Backgrounds. Flat, never imagery. No photography, no illustration, no pattern, no texture, no full-bleed imagery, no gradient fields." That rule is right and stays right for the product: it exists so a screen full of someone's dumped things is never competing with its own wallpaper. It has nothing to say about the two screens where there is nothing of theirs on the page yet and the job is to make a claim, which is what the landing page and the gate are. The rule now has a boundary, and the boundary is the account.

**The gate moved rather than the landing page compromising.** `WFirstRunGate.jsx` puts the card on `--surface-sunken` with the wordmark at a 44px gutter and `Terms · Privacy` bottom left. The landing page sits on `--surface-page` at a 64px gutter with `Privacy` bottom right. Two screens one click apart cannot each be right, and the whole point of the new landing page is that the background is continuous, so the gate takes the landing page's frame: same mark position, same header row height, same Privacy line, same drifting page. Clicking `Sign in` now moves a card in over a background that does not change. `components/Screen.tsx` renders that frame for both, so they cannot drift apart again.

**Three smaller divergences it drags in.** The header row is pinned to 40px, the height of the design system's `Button` at `md`, whether or not the screen has a button in it, so the mark does not sit 9px higher on the gate. `Terms` is dropped from the footer, which cost nothing: it was static text with no route behind it. And the hero type is outside the ramp, a viewport-driven `clamp(38px, min(7.2vw, 11.5vh), 104px)` at `-0.042em`, because the landing page is one screen sized to the window rather than a document.

**New tokens:** `tokens/atmosphere.css`. Two steps per hue for the washes, `--wash-{blue,violet,sand,moss}-{100,200}` plus `--wash-straw-200` and `--wash-glow`, and `--prism-{violet,amber,blue}` for the ghosts. Light only. The atmosphere has never been drawn on a dark page and inventing five values for one here would put a design decision in a token file instead of in a review; the pre-account screens are forced light until it is made.

**Design system impact:** `readme.md`'s Backgrounds paragraph needs the boundary written into it: flat is the rule behind the account, and the landing page and gate are the exception. `ui_kits/web_app/WFirstRunGate.jsx` should be reframed onto the landing page's chrome, gutter, header row and footer, or its own comment should say it describes first run only. `ui_kits/marketing_site/index.html` is superseded by this page entirely. And the type scale should say in one line that the marketing headline is deliberately not on it.

### 2026-09-01 · The privacy policy, a screen with no kit, and the gate's legal line
**Surface:** web, iOS, Android

**Is:** `/privacy` exists, a first draft written from `docs/constitution/principles.md` and `docs/tech/stack.md` rather than from a template, so every claim on it is one the code supports. It opens with a summary in eight bullets, boxed and explicitly labelled as not the legal document, and the sixteen sections under it are the policy. Legal review is still to come and every undecided value is drawn in amber so it cannot be published by accident.

**No kit, so it was built from the ramp.** `find-kit.sh privacy` returns the mobile and web *settings* pages and nothing else: there is no mock of a long-form document anywhere in the system, and this is the first one. It takes the landing page's frame with the atmosphere switched off, because the effect is centred on the mark and drifts, and a page of running text over it is neither readable nor worth the frames. Everything else is the type ramp, `--surface-raised` for the summary card, `--surface-attention-soft` for the disclaimer and `--surface-accent-soft` for the two dated asides.

**The gate's legal line is now one word and a link.** Both phone kits draw `Terms · Privacy` under the provider buttons, `FirstRun.jsx` and `M3FirstRun.jsx`, and the web gate drew the same bottom left. In all three it was static text pointing at nothing, and there is no terms page. It is `Privacy` alone until there is a second document to name, and it opens the policy. On the phones it gains a 44px touch box around the 12.5px line the kits draw, since the drawn size is right and the hit area was missing.

**One thing the policy claims that the product does not have yet.** Section 11 describes the privacy switches from `SettingsDetail.jsx` and `WSettings.jsx`, including "Improve offload with my data", off by default. Settings is not built. Rather than describe a control that does not exist, the section carries a dated note saying so and offering to do any of it by hand, which is true and stops being needed the day the screen ships.

**Design system impact:** the kits need a long-form document page, since this is the first of at least two and terms will want the same one. `FirstRun.jsx`, `M3FirstRun.jsx` and `WFirstRunGate.jsx` should drop `Terms` from the legal line until a terms page exists, and should draw it as a link with a real hit area rather than as a caption. The settings kits are already right and the code is what has to catch up to them.

### 2026-09-01 · First run gains a fourth screen, and it asks for something
**Surface:** web, iOS, Android

**Is:** First run ends on a consent screen. Two ticks, "I have read the privacy policy" with the policy linked, and a specific one naming what offload will hold. Under them, one line of advice: never dump a password, a card number or a government id, into offload or into any other AI tool. Get started is inert until both are ticked, and the server refuses `POST /api/onboarding/complete` without both, so the button being disabled is a courtesy rather than the control.

**Why the kits say not to.** `FirstRun.jsx`, `M3FirstRun.jsx` and `WFirstRunGate.jsx` all build first run as three screens with nothing to fill in, and the reasoning in the code was ours: "asking a new person to configure the filing would contradict the product on its first screen." That reasoning is still right and this does not break it. Writing the privacy policy turned up something else: the product is designed to receive whatever a person has on their mind, which means health, money, beliefs and relationships, and holding those lawfully in Europe needs consent that is explicit and specific. There was none, anywhere.

**So the tutorial is untouched and the consent is a fourth screen.** Three screens, still nothing to fill in, still carrying the three dots. The consent has no dot, because it is not one of the three, and it has no illustration, because a consent that has to be specific cannot sit under a picture about notifications where it reads as small print on something else. **Skip now lands on it rather than completing first run**, which is the one behaviour that changes: nobody has to read the tutorial and everybody has to answer this.

**One deliberate divergence from `Checkbox`.** The component greys and strikes through a ticked label, which is right for a task being crossed off and wrong here: a struck-through consent line reads as one that has been withdrawn. The box, the 6px radius, the ink fill and the tick drawing itself along its length are all as specified; only the label treatment is dropped. React Native has no checkbox primitive, so the phones draw the same box by hand in `components/ConsentTicks.tsx`, forked only on colour: ink on iOS, Material's primary on Android, which is the pair their gates already use.

**Design system impact:** all three first-run kits need the fourth screen, and their "nothing to fill in" comments need the sentence that says the tutorial is what has nothing to fill in. `Checkbox` should say that the strike-through is for task ticks and name the exception, or gain a variant without it. `WSettings.jsx` and `SettingsDetail.jsx` already draw "Improve offload with my data", off by default, and are already right; what they still lack is anywhere to see or withdraw the consent given here, which the Privacy settings page should show.

### 2026-09-02 · The phones were never wearing the design system
**Surface:** iOS, Android

**Is:** They are now. Nothing about the screens changed; what changed is that the tokens and the faces they name actually reach the device.

**Two faults in `packages/tokens`, both silent by construction.** The generator filtered colours from the raw light scope, and its hex-to-channels helper returns null for anything holding a `var()`. Semantic tokens are almost all aliases, so 27 of 81 colours were dropped and 24 of them were semantic: `text-primary`, `text-inverse`, `text-accent`, `text-link`, `surface-raised`, `border-hairline` and their neighbours. Separately the Android platform scope was inserted into the stylesheet by a pattern that hard-coded two spaces of indentation, correct while those variables sat inside `@layer base` and matching nothing once that wrapper came off, so every `a-` class was dead too. Neither failure raised: Tailwind emitted `rgb(var(--c-text-inverse) / 1)`, the variable did not exist, and the platform substituted its own default. The gate rendered in system greys with a black label on the black Apple button and every file involved read correctly.

**And no font was ever loaded.** `--font-core` names Instrument Sans, no such family exists on either OS, and both quietly substituted Roboto or SF. Every screen built so far has been rendered in the wrong typeface. The faces are registered natively now, all three weights under one family name, because that is what makes a weight class resolve to the cut it names rather than to nothing.

**Design system impact:** none to the tokens or the kits, which were right throughout. The generator now asserts instead of failing quietly, and `.claude/scripts/dead-classes.mjs` checks every class in the app against the generated theme, which is the check that would have caught this on the day. Worth knowing when reading any screenshot of the phones taken before this date: it is not showing this design system.

### 2026-09-02 · The gate lockup is 40% larger than the kits draw
**Surface:** iOS, Android

**Is:** The mark is 129 and the wordmark 42, against the 92 and 30 that `FirstRun.jsx` and `M3FirstRun.jsx` both draw. Tracking is computed from the size rather than frozen at the `-0.9` that was only `-0.03em` at 30px.

**Why:** it read as too small on a real device. The kits are drawn in a 390-wide frame in a browser and the lockup is the first thing anyone sees, so this is exactly the kind of judgement that only survives contact with a phone in a hand. Deliberate, at the user's request, and it is the current answer rather than a settled one.

**It also stopped moving between screens.** The lockup sat in a `flex-1` container, taking whatever the content below did not want, so it hung lower on the waitlist than on sign in purely because the waitlist has a field: moving between them, the mark visibly dropped. It is a share of the screen height now, and it lands at the same y on every gate screen. Two limits keep that honest on a small screen or under a keyboard: it shrinks before the copy does, since the lockup is decoration and the words are not, and it stops shrinking at the height of its own contents, because `justify-center` on a box smaller than what it holds overflows in both directions and put the wordmark on top of the waitlist's title.

**Design system impact:** if this size is kept, `FirstRun.jsx` and `M3FirstRun.jsx` want 129 and 42 and the web gate should be looked at beside them, since a lockup that differs by 40% across surfaces is worse than either size. The kits should also say that the lockup's band is a share of the screen rather than the leftover space, because the drift they encode is invisible in a prototype where every screen is viewed alone.

### 2026-09-02 · A waitlist screen the kits do not draw
**Surface:** iOS, Android

**Is:** `Waitlist.{ios,android}.tsx`, reached by tapping "Join the waitlist" on the gate. It is the no-invite screen with a field added, built from the same primitives at the same measurements, and its copy follows the marketing page's form because that is the same waitlist.

**Why there is no kit for it.** Both phone kits draw "Join the waitlist" on the gate as a bold span with no click, and their no-invite screen is where joining happens. That works in the kits because the only way onto no-invite is a sign-in attempt that was refused, so the screen always knows the address. From the gate there is no address, and the line did nothing at all: tapping it was the bug that started this. The web gate points at the landing page's form, which the phones have no equivalent of.

**One thing a prototype cannot show.** The keyboard covered the whole form on the device, field and both buttons. The fix is `behavior="padding"` on both platforms, against the usual advice, because that advice assumes Android resizes the window and this app runs edge to edge, where Android ignores `adjustResize` outright.

**Design system impact:** the phone kits need this screen, or they need the gate's "Join the waitlist" to be honestly inert. They also have no text field on any pre-account screen, so there is no drawn answer for what one looks like on the gate's surface; this borrows the composer's pill and the gate's outline. More generally the kits have no way to show a keyboard, and every screen with a field will hit the same thing, so the first-run kits should carry a note about what is on screen when one is up.

### 2026-09-02 · "thing" is retired as the product's noun
**Surface:** web, iOS, Android, marketing

**Is:** offload no longer has a word for the unit a person dumps in. Counts stand on their own with no unit, so a thread card reads `Lisbon trip  4` rather than `Lisbon trip  4 things`, and everywhere else the sentence is rewritten to avoid needing the noun at all: "what you dumped in", "your content", "a dump", or nothing.

**Why, and why not a synonym.** The word was doing two jobs badly. As a count label it is vague in the one place a number needs to be exact, and in long-form prose, which is where it was noticed, "your things" repeated two dozen times on the privacy policy reads as evasive on a page whose whole job is to be precise. Bit, detail and piece were all on the table and all rejected for the same reason: naming the unit at all is the mistake. The product's premise is that nobody has to classify anything before putting it down, so the interface should not classify it on their behalf either. A number beside a thread is unambiguous in context and says less.

**Where it actually was.** Only two places in the shipped product: the second first-run tutorial screen, whose illustration drew "4 things" on three thread cards, on both phones and the web; and the web's meta description, which is what search results and link previews show. Everything else was the privacy policy. That is why this was cheap now and would not have been in a month.

**Two things went with it.** The consent line said "other private things" and now says "other private matters", on all three clients, because the copy is shared by construction and had to move together. And the landing page's "Dump things that clutter your mind and let us organize them for you" was fixed for a second fault at the same time: the voice rule says offload never says "we" or "us", and that line did.

**Design system impact:** the kits are now wrong on this and are the larger half of the work. `thing` appears across roughly fifteen kit files as the count noun, heaviest in `WApp.jsx`, `WSettings.jsx`, `FirstRun.jsx`, `SettingsDetail.jsx`, `M3SettingsDetail.jsx`, `M3FirstRun.jsx` and both `Sharing.jsx` files, and every one of those is a screen not yet built. They should drop the unit from counts and reword the prose. `readme.md`'s vocabulary section needs the word removed from the allowed list and named as retired, next to the existing bans, so the next screen does not reintroduce it.

### 2026-09-02 · The composer answers, and two states no kit draws
**Surface:** web

**Is:** the web composer takes a dump, marks it seen, shows a thinking state and grows into a conversation in place. The turns sit above the field inside the same box, so the field stays where it was and nothing moves under the cursor when an answer arrives, which is the kit's live state in `WComposer`.

**The seen marker did not exist on web.** 👀 is drawn only in `ui_kits/mobile_app/LiveConversation.jsx`'s `StatusChip`; `WTurns` in `WMisc.jsx` renders a chip for `done` and has no branch for `seen` at all. Ported across at the mobile treatment: the pill on `--paper` with a hairline border, sitting under the person's message. **Its text alternative is the readme's fuller string, "seen, not answered yet", not the kit's shorter "Seen"**, because the marker exists to say offload has it and has not answered, and "Seen" alone drops the half that matters.

**No kit anywhere draws a failed message**, and `001-data-model` has named `failed` as one of four message states since it was written. Invented here: an inline line under the person's message in `--text-on-attention` with a Try again control. **Persistent, and deliberately not a Toast.** A Toast clears itself after eight seconds, and the failure it would carry is the one case where the person is most likely to have looked away, since it only happens after offload has been thinking for a while. A dump that went unanswered has to still be saying so when they come back to the tab.

**The camera and microphone are not rendered**, though `WComposer` draws them unconditionally. Text only in this feature, and a control that does nothing is worse than one that is absent.

**Design system impact:** `WTurns` needs a `seen` branch, and the seen treatment should be lifted out of the mobile kit so one definition serves both. The failed state needs drawing properly in all three kits, since it is a real message state and every surface will hit it. `WComposer` should say that the camera and microphone are conditional on attachments existing, rather than drawing them as though they always work. And the readme's Toast guidance is worth a sentence on when not to use one: an eight second dismissal is wrong for anything the person may not be present for.

### 2026-09-03 · The privacy policy's voice, and "upload" on that page only
**Surface:** marketing

**Is:** the whole of `/privacy` rewritten for tone. Short, professional, direct. The short version at the top took the heaviest pass, because it was the most casual part of the page and the part most people will actually read, but every section below it was tightened in the same direction.

**What the voice was doing wrong.** The page was casual in a way that read as pally rather than plain, and it kept reaching for a line when a fact would do: "written to be read rather than to be airtight", "there is no advertising business here that would want us to", "we would rather you heard it here than found it later", "we would rather tell you exactly where that line is than say 'your data is encrypted' and be wrong about it". Each of those is defensible alone and together they are a voice that is performing its own honesty. The rule applied throughout: say the thing, then stop. We are not the reader's friend and we are not their solicitor.

**Nothing in the substance moved**, with one exception below. Every legal basis, every right, the CCPA statements, the 30 day window, the shared-thread reasoning in section 10 and the precision of section 12 are intact. Two existing faults were fixed on the way past: the consent paragraph in section 4 pointed at "that fourth row" and the row it describes is the fifth, so it now names the row instead of counting it, and a sentence in section 10 was garbled mid-clause ("the reason the next four what you added to that thread says what it says").

**The one substantive change: the page now says we plan to encrypt text as well.** At the product owner's instruction. It sits as a note under section 12's three consequences and as a clause in the summary bullet, and it is a forward-looking commitment on a claim surface, so it is logged in `docs/tech/decisions.md` too, against the deferred-hardening item that used to say the opposite.

**"upload" replaces "dump", on this page only, deliberately.** The product's word is still dump everywhere else: the apps, the landing page, `readme.md`'s vocabulary list and this file. The product owner's call was to change the privacy page now and leave the question of whether the word changes everywhere for later. So this page is knowingly out of step with the rest of the product, and a header comment in `page.tsx` says so, because the next person to read it will otherwise fix it back.

**Design system impact:** none to the tokens or the components. Two things for whoever holds the vocabulary. `readme.md`'s vocabulary section should note that `/privacy` says upload, so the divergence is recorded where the rule lives rather than only here. And if upload is ever adopted product-wide, the note in `page.tsx` and this entry both come out in the same change. Kits are unaffected; none of them draw this page.

### 2026-09-03 · The privacy page gets the atmosphere, and a wider measure
**Surface:** marketing

**Is:** `/privacy` now sits on the same background as the landing page and the gate, mark and prism and all, and its column is 88ch rather than 68ch.

**Why the atmosphere was off, and why that reasoning was wrong.** `Screen` has had an `atmosphere={false}` since it was written, with a comment saying that behind a page of running text the effect is unreadable and a rAF nobody is looking at. The first half is not true at these opacities: the washes are pale enough that body text over them reads as well as it does on paper, which the built page settles. The second half was true and is now the trade being made on purpose: the shader and the pointer loop run for as long as somebody has the page open. Requested by the product owner, who wanted the page to look like the rest of the site rather than like a separate document.

**Pinned, not absolute, and that is the whole of the work.** The atmosphere is centred on its own box. On a page fifteen screens tall an absolute one puts the mark seven screens down the article, where nobody will ever see it, and leaves only the two top-anchored clouds visible at the top. `position: fixed` makes it the window's background and the text scrolls over it. Everything else about it is unchanged: the mark, the halo and the clouds were already sized in viewport units, so nothing needed re-tuning. `Atmosphere` takes a `pinned` prop and `Screen`'s `atmosphere` prop takes `"pinned"` beside its boolean, so the landing page and the gate are untouched.

**Most of the mark is behind the summary card, by accident of layout.** The card is opaque `--surface-raised` and lands almost exactly over the centre of the first screen, so what you see on load is the halo and the clouds around it. The mark comes out from under the card as you scroll. Worth knowing before anyone concludes the effect is not working.

**88ch is a wide measure and is deliberate.** 68ch is inside the usual 45 to 75 characters for long prose and 88ch is outside it, at roughly 105 characters a line. The product owner read the page at 68ch and found it too narrow, and asked for 30% more. The same judgement as the gate lockup on 2026-09-02: the current answer rather than a settled one, and the kind of call that only survives contact with the real page.

**Design system impact:** none to the tokens or the components. `readme.md` says nothing about document pages, and there is now one: worth a line saying that a document uses the shared frame with a pinned atmosphere, and that its measure is 88ch, so the next long page does not re-derive both. If the measure moves back, this entry and the one above it move together.

### 2026-09-03 · A pinned atmosphere is a still one
**Surface:** marketing

**Is:** `/privacy` keeps the background it gained earlier today, and nothing in it moves. No drift on the washes or the clouds, no pointer parallax, one draw of the prism shader. The landing page and the gate are untouched and still move.

**The symptom was text arriving a second or two after the scroll**, in bands, as though the page were loading. It was reported as "something weird about the new page" and the guess was the background, which was right.

**What the compositor actually said.** The document column is promoted to its own layer, 938 by 9,655 pixels, for the reason "Overlaps other composited content": it sits over a fixed element that has to be composited. That layer paints in **2.7ms**, so it is not the problem. The nine atmosphere layers paint in **96ms** between them, five 602px flares at ~9ms each, three blurred clouds at 6 to 9ms, the halo at 4.4ms. Every drift moves a wash *inside* a parent carrying an SVG turbulence filter, which re-runs the filter and repaints the layer, so that 96ms was being spent every frame, forever. The text tiles were queued behind it on the same raster thread and lost.

**Why the landing page never showed this.** Same cost, nothing competing for it. A one-screen page rasters once and then has nothing else to draw, so 96ms a frame is invisible. A document is many screens of text waiting on the same thread. The lesson is the one about kits not showing a keyboard, in a different costume: an effect built for a screen that does not scroll has a failure mode that only appears on one that does.

**Frozen rather than removed, and it is the same picture.** `animation: none` lands each loop on its first keyframe and the shader draws at a fixed clock, which is exactly what `prefers-reduced-motion` already does, so this is the view a good share of visitors to the landing page were already getting. Verified after the change: 0 running CSS animations and 0 rAF callbacks a second on `/privacy`, against 10 and 181 on `/`.

**Design system impact:** worth a line in `readme.md` where the atmosphere is described. It is a one-screen effect. Behind anything that scrolls it has to be still, and the reason is measurable rather than aesthetic. If the effect is ever put behind another long page, `pinned` is the prop that does both halves.

### 2026-09-03 · The atmosphere costs what it should now, everywhere
**Surface:** marketing

**Is:** the same effect on every page, drawn far less often. Four changes, all in the shared component, so the landing page and the gate get them too rather than only the document that exposed the problem.

**The loops step instead of easing.** Every drift and every cloud now runs on `steps(duration × 2)`, so a wash moves twice a second rather than sixty times. Each one drifts *inside* a parent carrying a turbulence filter, so any change re-runs the filter and repaints the layer, measured at 96ms across the nine of them. The loops run 47 to 86 seconds and travel about 2%, which makes one step about a third of a pixel. The easing is the only thing given up: a 54 second drift that eases and one that does not are the same drift.

**The prism draws ten times a second, and wakes ten times a second to do it.** Its own clock advances at 0.03, so a second of it is a thirtieth of a cycle and fifty frames in sixty were redrawing something indistinguishable. It was already throttled once in this pass and still scheduling at 60fps to draw at 10; the timer now sets the rate.

**Two easing loops ran forever with nowhere to go.** The pointer parallax eased towards a target it had already reached, on a page usually sitting still with nobody's pointer on it. The landing page's word dissolve was worse: a permanent 60fps loop that called `getComputedStyle` for the font size and wrote the displacement scale every frame, including the seconds between swaps when the value never changed. Both stop when they arrive and are woken by the thing that gives them somewhere to go. **The dissolve is untouched as an animation** and was checked rather than assumed: 34 distinct scale values across a cycle, peaking where it did before.

**Numbers, from a trace of a production build.** Main thread busy per second: the landing page 301ms to 212ms, the gate 100ms to 73ms, privacy 2ms. Idle rAF callbacks a second: the landing page 181 to 68, the gate 60 to 8.5, privacy 0. *Measured in headless Chrome on software rendering, so the absolute numbers are worse than any real machine and only the ratios should be believed. What is left on the landing page above the gate is the word dissolve actually running, which is the animation working rather than waste.*

**Design system impact:** none to the tokens, the components or the look. The rule worth carrying into `readme.md` beside the atmosphere: an effect that sits behind a turbulence filter must not be animated at frame rate, and an easing loop must stop when it arrives. Both were written the expensive way here and neither was visible as a defect until a page with text on it had to share the thread.
