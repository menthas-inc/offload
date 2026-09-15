# Decision log

Append only. Newest first. Both the codebase and the design system write here.

Format and the meaning of each field: `handoff/CONTRIBUTING.md`.

When design and code disagree, **code leads**. A decision recorded here from the codebase is
the new truth, and the design system is updated to match on the next sync.

---

## Open

### 2026-09-14 · What offload is doing, and the way out of it
**Surface:** iOS, Android, web

**Is:** a progress line and a Stop control, both in the conversation area, and
neither has a mock.

017 gives a turn that reaches the web two things it has never needed: one line
saying what it is doing, and after ten seconds a way to stop it. The kits have
neither, because until a turn could take twenty seconds the three dots were the
whole truth.

**Both live exactly where the three dots already were**: offload's side, at the
log's gutter, the line above and the control under it. The alternative was a
toast, and a toast clears itself and takes the only control away with it, which
is the same reason 003's failure line is inline and not a toast.

Two thresholds, deliberately different numbers. **2.5 seconds for the line**,
because under that a sentence appears and is replaced before anybody reads it and
most turns finish there. **10 seconds for the control**, the product owner's
number. One number for both would either delay the reassurance or offer an escape
to somebody who did not need one.

**A turn with no step falls back to the dots rather than to a filler sentence.**
A turn that is thinking rather than looking something up has nothing to report,
and writing "Working on it" for it would be offload narrating itself.

The line is the model's own words, capped at 80 characters by the server. It is
written on the `look_up` call rather than after it returns, so it cannot contain
anything the page said: a page title reading "Payment failed, verify your card",
drawn in offload's voice, is a phishing message the product rendered itself.

A stopped turn says **"Stopped."** and offers nothing. `partial` offers Finish
because offload stopped by accident; this one they stopped, and offering to undo
their own decision is the product arguing with them. Secondary rather than clay,
because nothing went wrong.

**Design system impact:** two things to draw. A progress line with its
2.5-second appearance and its relationship to the writing indicator, and a Stop
affordance at 10 seconds; both belong in the conversation component rather than
in a new one. The "Stopped." state joins `failed` and `partial` as a third
ending, and the kits draw neither of the first two on a sent bubble yet. Worth
deciding whether Stop is a text button, as it is now, or something with more
weight: it is the only control in the product that interrupts offload, and it
currently looks exactly like Finish and Try again.


### 2026-09-14 · PrismField's contract is missing the prop React Native cannot do without
**Surface:** iOS, Android

**Is:** `shift`, a Reanimated shared value, belongs in `PrismField`'s declared props.

The 14 September sync put `PrismField` into the enforced set for the first time, and its generated
rule lists `variant, basePath, density, veil, pulse, arriveOnMount, style`. The phones pass one
more, and have since 8 September: the web component attaches its own capture-phase scroll listener
so no screen has to know the field exists, React Native has no equivalent, and the plate lives above
the router while the lists live in the tab screens, so they are in different trees and cannot pass a
prop at all. A single shared value spans it, written by whatever is scrolling and read by the field,
both on the UI thread. That is the 8 September entry, "the parallax is handed in rather than
listened for", and it was logged at the time.

So the lint is enforcing a contract that predates a divergence this log already carries. Code wins
and the contract catches up (OFF-7). Disabled at the one call site, with the reason and a pointer to
that entry, rather than removing a working parallax to satisfy a generated file.

**Design system impact:** add `shift?: SharedValue<number>` to `PrismField`'s props, native only,
and regenerate `_adherence.oxlintrc.json`. Once that lands the disable comes out. Worth checking the
same way for any other component entering the enforced set: a first-time rule is the moment every
undeclared prop surfaces at once, and this one surfaced as a build failure rather than a review note.


### 2026-09-14 · The rail stops saying "something here" in blue, and gains a second tier
**Surface:** web, iOS, Android
**Raised by:** the design system, off the open question in the 10 September rail entry: blue now means two more things on one surface.

**Was:** a day with something on it drew a <code>--border-focus</code> ring plus a blurred <code>--border-attention</code> glow. With the waiting chip, today's ring, the day being read and the task dot, blue was carrying five meanings on one screen, two of them introduced by 015.

**Is:** two tiers, neither of them blue. A day with content is a **lift**: `--surface-raised` with `--border-lift` and the shadow its theme has. A day carrying a decision adds a 1px `--border-decision` **inset ring**.

**Both marks are new aliases rather than ramp references**, which is the same fix `--surface-noticed` got on 10 September and for the same reason: an un-aliased colour gets reached for from the ramp and the lint file has nothing to point at. `--border-lift` resolves to `--border-hairline` in light and `--ink-300` in dark; `--border-decision` and `--text-noticed` are both `--amber-700` in both themes, and they are two tokens rather than one because a day needing an answer and a thing offload noticed are two meanings that happen to share a value. Blue keeps today, as its border, and the day being read, as its fill.

**Seven options were drawn, in both themes, and the themes decided it.** Three variations on the shipped treatment, then four replacements for the lit state: a paper lift, an ink ring, ink weight alone, and amber. Every one of them looked fine in light. The dark frame is where they separated, and three findings came out of it that no light mock could have produced.

1. **`--shadow-1` is the keyword `none` in dark**, so the paper lift had no lift there at all: a 1.07:1 fill and a 1.23:1 hairline. That is why the chosen version takes a different border token in dark, which is the one state in the system where the two themes deliberately diverge.
2. **Every tint darkens by design**, so no glow can be the load-bearing mark. The shipped blue glow measures 1.88:1 in dark and the amber tint 1.31:1.
3. **A ring holds its value in both themes**, which is why the second tier is a ring and why `--border-decision` resolves to the ink amber rather than to `--surface-noticed`: 600 measures 2.03:1 as a 1px ring on white, the ink amber measures 7.2:1 on the lift in light and 10.27:1 in dark.

**Moving the ground moved the dots.** Two of the four kinds failed on the lift, the task dot at 2.62:1 in dark and the note dot at 2.03:1 in light, both because they used fill aliases that are fixed across themes while their backdrop now moves. **A dot on a lift takes the text alias of its kind**, `--text-attention` and the newly minted `--text-noticed`, which flip with it; event and other already did and already passed. The note dot's 2.03:1 is also the figure that disqualified `--amber-600` as the ring, so the same standard now applies to the same colour on the same ground.

**A wash dulls and an edge advances**, which is the finding behind the whole thing. The grey version of the lit state made a day with something on it read as *less* prominent than an empty one, because the tint darkened the ground under its number. So the lit day advances and **the empty day steps back**: `--text-tertiary` at regular weight, with today exempt, since a day with nothing on it is still today.

**What the glow was and was not.** An earlier pass of this exploration claimed the shipped lit state disappears in dark. It does not: its ring measures 3.55:1 there and the glow only grades it. The reason to move off blue is the five meanings, not legibility, and the log should say so rather than the stronger thing.

**Design system impact:** **three new aliases in `tokens/colors.css`, in all three scopes.** `--border-lift`, the edge of a raised cell, resolving to `--border-hairline` in light and `--ink-300` in dark, which is the only token in the system that deliberately takes a different step per theme and the reason is that dark has no drop shadow. `--border-decision`, the ring on something needing an answer. `--text-noticed`, the ink-weight counterpart to `--surface-noticed`, minted because the fill alias measures 2.03:1 as a dot on a raised surface and because borrowing the decision ring's token would have said the wrong thing. The last two share a value and are two tokens on purpose.

Both palette cards are updated: `guidelines/colors-surfaces.html` gains a border-alias row, and `guidelines/colors-semantic.html`'s footer names the two meanings the amber step now carries. That is the lesson of the 10 September entry applied on the way in rather than a month later: a token nobody can see on a card is a token the next person reaches past.

`readme.md` gains a Timeline rail section. `handoff/APPLY-2026-09-14-rail.md` carries the values per surface. **Still outstanding, and larger than this entry:** there is no governed component for a day cell or a week rail on any surface, and the kits' `TimelineWidget` is now three shapes behind. Two things want an answer before it is built: what counts as needing a decision, where an overdue thing is arguably louder than a due one, and whether one ink amber reading at two levels holds: the dot rule takes the note dot to `--text-noticed` and the day ring is `--border-decision`, which resolve to the same value today, so the day is a 1px edge and the thing is a 5px fill in one colour. If that is one amber too many the dot moves rather than the ring.

---

### 2026-09-14 · The turn footer, and the Done mark leaves the bubble
**Surface:** web, iOS, Android
**Raised by:** the design system, answering `handoff/DESIGN-2026-09-14-reaching-the-web.md` for 016.

**Was:** two elements in two bubbles. `StatusChip` absolutely positioned into the person's own sent bubble, 10px up and 6px into its bottom left corner; the reference pills rendered inside offload's reply, gated on `t.from === "offload"`.

**Is:** one row belonging to the turn, on offload's side, left aligned at the log's own gutter, holding the state mark, the thread pills and the source chips in that order. Drawn whether or not offload wrote a sentence.

**Why it had to change rather than grow:** 004 settled that an ordinary filing turn says nothing, so it has no reply bubble, and 016 gives that same turn something to report. There was no container for a chip on any of the three surfaces. And the mark could not simply gain chips where it sat: it is positioned *into* the bubble's corner, so a row growing sideways from there runs back under the bubble it is tucked inside.

**Three placements were drawn.** Keeping it in the sent bubble's column was rejected because the footer then inherits an 84% measure and wraps three chips onto two lines with the whole gutter free beside it, and because everything in the row is offload speaking, hung off the half of the log that is the person's own voice. Keeping the mark where it is and putting chips under the reply was rejected because it is exactly today, and today has no home for the silent turn.

**Fixed order, state then threads then sources**, so a turn can be read at a glance without being read. Wraps rather than scrolls; **min-height, never height**; no fill, no hairline, no card, because the chips are the only painted things in it. An empty footer is no footer rather than a 26px gap.

**An answering turn passes no state and no refs.** It wrote nothing and filed nothing, so it has no Done mark and no filed chips; the result card's own header stays the one link to the thread.

**Design system impact:** new component `components/conversation/TurnFooter`, with its card. Wired into `mobile_app/LiveConversation.jsx`, `android_app/M3LiveConversation.jsx` and `web_app/WMisc.jsx`, each of which loses its in-bubble ref row and its in-bubble mark. **Still outstanding:** the older full-screen `ConversationScreen` in both phone kits and its web twin still draw `StatusChip` inside the bubble, so the kit now shows both patterns until those catch up. `readme.md` gains a Reaching the web section.

---

### 2026-09-14 · The source chip is outline, and it is the one external link in the conversation
**Surface:** web, iOS, Android
**Raised by:** 016, where the tone was already decided and the reasoning is what needed recording.

**Is:** a `source` kind in `LIVE_REF_TONE` and `LIVE_REF_ICON` in all three kits, `tone="outline"` with the `link` glyph. The label is the registrable domain and nothing else: no path, no title, no scheme, no `www.`, at a 22ch max-width so only a genuinely long host truncates, from the end. Three chips, then a count.

**Why not moss:** moss means "offload did this, you didn't" throughout this system. A citation is the opposite claim, evidence of where a fact came from, and `MemoryChip` already reserves outline for the external and non-inferred. Drawn both ways in the exploration: beside a moss thread pill, two moss chips make the thread and the domain the same kind of thing and the row loses its order.

**The count is text, not a chip and not a control**, because there is no screen listing what a turn read and a chip would promise one. Threads are never counted this way: three sources is a footnote problem, three threads is a turn that did three things, each somewhere a person may want to go.

**The rule that matters, stated as a rule about the source of the string rather than as an exception:** a reply may not carry an external link, because its words are page-authored and a link in offload's voice is a phishing surface. A source chip's label comes from the record of what was read and its target is the URL that was read, so it is a fact about where a request went. That is why this one is allowed and a link in a sentence is not.

**A read that failed leaves no chip and no mention.** A chip is a record; there is nothing to record.

**Design system impact:** `TurnFooter` renders sources as an anchor rather than a `Chip`, because it leaves the app and `Chip` has no `href`, using the outline tone's own values so it stays the same object. Worth knowing that `Chip` cannot be a link today, and that this is the second component to want one.

---

### 2026-09-14 · The sentence starts with the verb, and contractions are in
**Surface:** all
**Raised by:** 016's refusal line, "I don't search that.", against `readme.md`'s rule that offload never says "I".

**Was:** third person, never "I", and three shipped lines that said "I" anyway: "I could not find that.", "I do not know. Theme is set on this phone...", and the briefed refusal. One line said "offload" as a subject: "offload did not finish that one."

**Is:** in what offload says, **the sentence starts with the verb and names no subject.** "Can't search that.", "Couldn't find that.", "Didn't finish that one.", "Filed both.", "Stopped." Neither "I" nor "offload". Where the interface describes offload rather than speaking as it, the name is used, because a settings row has to say what it governs.

**Why this rather than the amendment 016 proposed.** The brief offered first person for offload's own limits, third person otherwise. "Its own limits" licenses "I filed that", "I couldn't finish", "I'm slow today", and the voice drifts one string at a time, which is how it drifted to begin with. Dropping the subject splits nothing and is shorter, and every existing string already reads better without one. The product owner's call, made against both options.

**Scope:** replies, progress lines, empty states, notification copy and onboarding. Not settings notes, where the name is the subject of the sentence by design. The admin panel is untouched: it is a staff tool in a different register and offload is not speaking in it.

**Contractions are in**, as a second and wider change: every line before this wrote "did not" and "could not" in full.

**Design system impact:** `readme.md`'s Person rule is rewritten. Copy changed in `mobile_app/data.js` (three replies, one notification title and body, one memory blurb), both sign-in screens, and both phone settings pages. **The one shipped line is "offload did not finish that one."**, which lives in `Conversation.tsx`, its web twin and the readme, and becomes "Didn't finish that one." That is code's to move.

---

### 2026-09-14 · The phone's row draws what the web row draws, and the repeat box comes off
**Surface:** web, iOS, Android

**Was:** the phone's row drew a trash and nothing else, so renaming still meant a long press. The rail's day + carried a "Repeats weekly" tick on the web and a chip of the same name on the phones.

**Is:** every row draws the pair `RowTools` has drawn on the web since 007, edit and one way out, and the repeat control is gone from both surfaces.

**"Two controls, never three" is now one rule on two surfaces**, and which way out you get is still decided by the row: Delete for your own, Archive for somebody else's, Put back for an archived one. The phone adds one thing the web version does not have: the pencil and the way out are drawn only where `canDelete` is true, because `edit_content` and the delete need the same authorship the server checks, and the readme's rule is conditional, never refused. The web's pencil is still drawn unconditionally, which is a latent divergence on a shared thread and is worth closing when threads are actually shared.

**The repeat box was a structural answer to a question that turned out to be conversational.** The argument for it was real: `edit_content` carries no repeat field, so a repeat set later can never be corrected, and the day beneath the + is already structural. What that missed is that nothing has to be set later. Typed into the day's + on a device: "weekly bin collection monday 7am" came back as **Bin collection, Weekly, Monday 7am**, a real weekly rule with a real time, because the model reads the words at the moment it writes the row. A box, meanwhile, asks somebody to choose a format before they can put something down, which is the one thing this product does not do.

**The day stays structural.** It is not something anybody said; it is the heading they pressed +  on.

**Design system impact:** `ThreadWidgets.jsx` and any row in the mobile kits want the `RowTools` pair rather than a single control, at 17px with `--space-6` between them, and the conditional rule stated: a row that cannot be edited draws no pencil. Any mock of the rail's day add should lose its repeat control; the field and the day heading are the whole of it.

### 2026-09-11 · A row draws its own delete, and a section's two controls stop being one target
**Surface:** iOS, Android

**Was:** a content row carried a swipe and a long press and nothing you could see. A section heading carried its two controls, the finished-work toggle and the +, six pixels apart at 18px. The sheet's scrim faded in over 140ms while the sheet itself took 220.

**Is:** a row you may delete draws a trash at its right edge. The two heading controls are 22px and a full gutter apart. The scrim and the sheet move together, and the plate fades out with them rather than leaving the screen in one frame.

**Three ways to the same action, deliberately.** `ContentRow`'s own contract says a swipe deletes and a long press opens the rest, and this adds a third. The product owner asked for it after an evening of tidying a list, in those words: a swipe is a gesture you have to remember and a trash is a thing you can see. Drawn only where it is honest, so somebody else's row and an archived row show nothing and fall through to the long press, which offers what they can actually do.

**"It fades black real quick and looks broken" was literal, and the first answer made it worse.** The scrim is an opaque ink drawn at `opacity: 0.35`, and a Reanimated `entering` animation takes that property over and runs it 0 to 1: the screen faded to solid `ink-950` and snapped back to 0.35 only when the animation ended. A screen recording off the device, 30fps, put the darkest frame at 24/255 before it jumped back to 178. Lengthening the fade to 220ms, which is what this entry said first, made the black frame last longer. The scrim is translucent in itself now, through `atOpacity`, so the animation runs to 100% of the dim that was wanted: measured again, the same press falls 254 to 178 in six frames with nothing dark in between.

**It also arrives with the sheet rather than before it.** 140ms against the sheet's 220 read as two movements where one thing is happening. Both are 220, and the plate, which had been disappearing in a single frame since the sheet was put above it, fades on the same beat.

**Six pixels between two controls that do opposite things.** One hides finished work, the other adds more; at 18px with a 6px gap and 10px of hit slop, the two hit areas touched, and the wrong one got pressed. This is the cost of a heading with two controls instead of one, and the answer is space rather than fewer controls.

**Design system impact:** `ThreadWidgets.jsx` and any section heading in the kits want the larger pair and the wider gap, and the numbers are 22px and `--space-6`. `ContentRow`'s contract should name the trash as a third affordance alongside the swipe and the long press, with the rule that it is drawn only for a row this account may actually delete. The sheet contracts should carry the scrim timing, since a scrim that beats its own sheet is a fault nobody can see in a still mock.

### 2026-09-11 · A screen's own sheet takes the plate off the screen
**Surface:** iOS, Android

**Was:** the row actions, the edit sheet and the note editor are anchored to the bottom of the screen they belong to. The plate is mounted above the router, so it painted over all three: a long press showed the word Edit and nothing else, and everything below it, Mark done and Delete, was under the composer and the tabs.

**Is:** a screen sheet says it is up and the plate comes off the screen while it is. The scrim, which was already covering the screen, now covers everything.

**"There is no way to delete a task" was this.** Reported as a missing control, and the control had been there since the sheet was written. A sheet that opens underneath another surface is indistinguishable from a feature nobody built, which is why this is worth a log entry rather than a line in a commit.

**Counted, not a boolean.** Two sheets overlap for the length of one animation while one closes into another, and a boolean let the first one back bring the plate with it.

**Same family as the two the pinned composer already hit.** `Plate` and `ConversationScrim` each deciding `raised` for themselves, and now this. The rule the three of them arrived at: anything mounted above the router decides what it covers in one place, and screens ask rather than assume.

**Design system impact:** `RowActionSheet`, and any sheet contract that opens from inside a screen, should state that the plate is not part of it. The kits draw one screen at a time and cannot show this: the plate and the sheet are the same colour and the same shape, so a mock of either looks right on its own.

### 2026-09-11 · The day heading gets its + on the phone, and the edit sheet gets a way out
**Surface:** iOS, Android

**Was:** the rail's selected-day heading had a + on the web and nothing on the phones, so a day was the one section on the screen you could not add to. Opening a row to edit it offered Cancel and Save and no way to be rid of it.

**Is:** the day heading carries the same + every other section has. It raises the pinned composer, headed "Add to Thursday, 11 September", with two things in the conversation area: the thread pill, and a "Repeats weekly" tick. Ticking it repeats weekly from the open day.

**The tick is a selectable pill, not the web's checkbox.** The phones have no bare-checkbox pattern and the composer's options live in the conversation area rather than under the field, which is the product owner's rule for this composer: there is room up there, and the keyboard is not.

**The tick is final, on both surfaces.** `edit_content` is offload's only tool on the row afterwards and it carries neither a date nor a repeat field, so the day and the tick are what they are from the moment the row is written.

**The edit sheet carries the row's one way out**, Delete for your own, Archive for somebody else's, Put back for an archived one. Same question, same answer as the long-press sheet: having opened something to change it, the other thing you wanted is to be rid of it, and going back out to a long press for that is a menu trip for the second commonest thing there is.

**The field starts out holding the title**, which it did not on a device. It was filled from an effect, so the sheet mounted empty and caught up a tick later, and a controlled `TextInput` that takes focus on mount and has its value replaced a tick later keeps the empty one. Keyed by the row now, so it mounts with the title already in it.

**Design system impact:** `mobile_app/TimelineWidget.jsx` has no day heading and so no +; when it catches up with the rail it wants one, and a pinned-composer option row beside the thread chip. `RowActionSheet`'s contract and the note editor both describe the one-way-out rule; the content edit sheet now follows it too and the contract should say so rather than leaving it to two implementations to agree.

### 2026-09-11 · A + opens the keyboard, and putting one away closes it
**Surface:** iOS, Android

**Was:** the pinned composer arrived with the keyboard down, and stayed focused after a `+`'s write had landed.

**Is:** raising a pin focuses the field, and the pin clearing, written or dismissed, blurs it.

**Found on a device, which is the only place it could be.** The inline fields the pinned composer replaced all carried `autoFocus`, so pressing + used to put the cursor in the field. Routing through a composer that is always mounted lost that: two taps to type one line, on the control whose entire argument was that the keyboard already works there.

**The other half is the one that writes something by accident.** After a pinned add the sheet drops and the same field becomes the ordinary dump composer. Leaving the keyboard up over it means the next thing typed is a dump nobody meant to send.

**An ordinary dump still never opens the keyboard on its own.** The composer is on screen at all times, and a keyboard that raises itself takes the page away from somebody who was reading it.

**Design system impact:** none. The kits have no keyboard to show, which is the third time that has cost something here.

### 2026-09-11 · The composer says where a dump will land
**Surface:** web, iOS, Android

**Was:** the field said "Dump anything" wherever you were, and a dump made from inside a thread went wherever the model thought best.

**Is:** with a thread open, the composer reads "in thread Sustain", and the dump carries that thread to the planner as a default. On the web it sits in front of the field inside the input pill; on a phone it is one line above the pill, at the counter's size and colour.

**A default that changes where things go has to be visible, or it is a surprise.** The whole risk of filing somewhere by default is that somebody does not know it happened; one quiet line is what turns it into something they can see and override by writing "add this to Flat admin". The line is deliberately the quietest text in the composer, `--text-tertiary` at 12.5, because it is the answer to a question nobody asked out loud.

**Nothing is drawn while the composer is pinned by a `+`.** That case already says what it is adding to twice, in the header and in the pill, and this entry's own predecessor drew the distinction: a pin cannot choose a thread, a default can. A third statement of the same thing is noise.

**No mock for it.** `WComposer` and `Composer.jsx` are a field and three controls, with the live header as the only text slot either has, and that slot belongs to the conversation title.

**Design system impact:** `web_app/WMisc.jsx`'s `WComposer` and `mobile_app/Composer.jsx` / `android_app/M3Composer.jsx` want an optional `inThread` name: a quiet prefix inside the pill on web, a quiet line above it on the phones. It is mutually exclusive with the pinned variant from 2026-09-10, and a kit showing both at once would be showing a state the product cannot reach.

### 2026-09-10 · The composer is the single input for adding on a phone
**Surface:** mobile

**Is:** every `+` on a thread (a widget section's, and Notes') now raises the same shell-level composer instead of opening its own field. `Widgets.tsx` lost its inline `TextInput` and `Notes.tsx` lost its "adding" path through the sheet Editor; only editing an existing note still opens that sheet, since that needs mute, delete and a second field the composer has no room for. The `+` still keeps the write it always had, quick add or `addNote`, called on submit rather than routed through a dump.

**The pin is drawn in two places, on purpose split by what each is honest about.** The header shows what kind of write this is, "Add to To do" or "Add a note", the caller's own copy carried over unchanged. The conversation area, where turns would otherwise be, shows a pill, "In thread Sustain", the same shape and tokens as the `Filed` chip that already names where a dump landed. That pill is drawn only for a `+`, because a `+` genuinely cannot choose a thread; an ordinary dump made from a thread screen may default there without being pinned to it, which is a different, weaker claim and this entry draws nothing for it.

**A pin never folds.** `FoldedHeader` in `Plate.tsx` reads `live`, not `pin`, and a `+`'s add has no header row to collapse into, so pulling the sheet down, tapping its handle, or tapping the scrim all close it outright rather than folding it to the plate. The chevron-down control is not drawn while pinned for the same reason.

**Two latent two-composer bugs, found while wiring this.** `Plate.tsx` and `ConversationScrim` each recomputed their own `raised` from `conversation.live`/`folded`, and neither knew about a pin. A `+` with no live conversation underneath would have raised the sheet while the plate kept drawing its own composer beneath it, the exact two-composer failure `PrismField`'s own contract warns about. Fixed by computing `raised` once in `conversation-context.tsx` and having the sheet, its scrim and the plate all read that instead of each other's business.

**Composer gained three props no kit's `Composer.jsx` has**: `maxLength` and `showCounter` (so a note keeps its 200-character running count and quick add keeps its silent 500-character cap), and `submitLabel` (so the button reads "Add" while pinned rather than "Send", which described a dump).

**Design system impact:** `mobile_app/Composer.jsx` and `android_app/M3Composer.jsx` want an optional cap and running-count prop, and a submit-label override. `mobile_app/LiveConversation.jsx` wants a pinned variant: header title from the caller, a threadName chip in place of turns, no fold control, and the pull/scrim/handle all closing rather than folding. `ThreadWidgets.jsx` and any note-adding mock should show their `+` opening that pinned composer rather than an inline field or their own sheet.

### 2026-09-10 · The rail's day heading gets a +, and its repeat box is not the Checkbox component
**Surface:** web

**Is:** the timeline's selected-day heading now has a + like every other section, opening one field under it, "Type it, offload will sort it out", plus a second control: a plain checkbox labelled "Repeats weekly". Ticking it makes the row repeat weekly from the open day. Neither the day nor the tick can be corrected afterwards from what gets typed, because `edit_content`, the only tool offload has on this row, carries no date and no repeat field. That is stated in `quick_add.md` now, since it used to imply the opposite for every typed row.

**The checkbox is a native `<input type="checkbox">` in a label, not `components/forms/Checkbox.jsx`.** That contract strikes its label through and greys it once checked, which is right for a task read as done and wrong here: checked means the row will repeat, not that it is finished, and a struck-through "Repeats weekly" reads as withdrawn rather than as set. `apps/web/src/components/panes/Apps.tsx` already reaches for a bare checkbox for the same reason, for two calendar settings ("Read this one", "Other people see this"), so this follows that rather than inventing a third pattern.

**There is no mock for any of this.** `Timeline.tsx`'s own header comment already says so for the rail; the + and the field match the shape every other section's + already has, and the checkbox has no shape to match.

**Design system impact:** `Checkbox.jsx` covers a task-list tick only. A plain boolean setting tick, checked meaning "on" rather than "done", has come up twice now without a contract of its own (`Apps.tsx`'s two settings checkboxes, and this one). Worth either a `variant` on `Checkbox` that skips the strike-through and grey, or a second, lighter contract for it.

### 2026-09-11 · A month arrives from the side you came from
**Surface:** web, iOS, Android
**Was:** Prev, month name, next, then Today beyond the next arrow. Changing month swapped the grid in place.
**Is:** Arrows at the two ends, the name and Today between them, and the new month slides in from the direction of travel. On a phone a sideways swipe changes it too.

**The arrows are a pair whose whole meaning is direction**, so they are the two ends of the bar and everything else sits between them. Today was beyond the next arrow, which put the two ways of moving through months on either side of a control that is not one of them.

**Today is always drawn, including on this month.** Appearing and disappearing would shift the month name beside it, which is the fault this bar was already fixed for once, and on this month it still does something: it takes the day selection back to today.

**140ms and 12px.** A grid that swaps in place says a month changed and not which way you went. Short and slight on purpose, because somebody stepping through six months in a row should feel six directions rather than wait for six animations. Reduced motion gets the change and none of the travel, through the media query on web and `ReduceMotion.System` on the phones.

**The swipe is the phone's real control and the arrows are the discoverable one.** `activeOffsetX` at 20px is what stops it fighting the thread's own scrolling: it only takes over once the movement is clearly sideways.

**Design system impact:** the month bar is now three slots rather than four, and there is a movement convention in it that nothing else in the product has: a keyed remount with a directional slide. If another surface ever pages through something, that is the pattern to copy, and 140ms and 12px are the numbers. No new tokens; the durations are literals, which is worth a look when motion is next given tokens of its own.

### 2026-09-11 · The lit day is blue, and the day you are reading is white on it
**Surface:** web, iOS, Android
**Was:** A day with something on it took a grey ground and a hairline ring. The day being read took the neutral fill.
**Is:** Blue, and white on blue.

**Grey said it so quietly that it read as nothing.** The first version used `--surface-sunken` and `--border-hairline`, which is the quietest pair in the system, on a cell 40px wide competing with six others. The hue does the work now: `--surface-attention-soft` as the ground with `--border-focus` set inside it, plus a second soft inset, which reads as lit from within rather than outlined.

**The day being read is `--surface-attention` with `--text-on-solid`.** It is the one cell that has to win every time, including over a lit cell beside it, so it takes the solid fill and everything on it goes white: the number, the weekday and the dots. `--text-on-solid` rather than `--text-inverse`, because the fill is blue in both themes and does not flip while the inverse token does, which is exactly how a near-black number ends up on blue.

**Everything stays inset.** A border adds a pixel and the whole row shuffles as things are added and ticked off. React Native has no inset shadow, so the phones keep a 1px border in every state including transparent, which holds the same geometry by a different route.

**The month name takes the whole middle.** Sized to its own text, the right arrow walked left and right between March and September, and further in a language with longer month names. It is `flex: 1` and centred now, so the arrows are the only fixed things in the bar and nothing moves between months.

**Design system impact:** blue now means two more things on one surface, "there is something on this day" and "this is the day you are reading", told apart by soft against solid. That is a real load on one hue and worth a look when the palette is next reviewed: the alternative was moss for the lit day, which would have collided with "offload did this". No new tokens.

### 2026-09-11 · A day with something on it is a cell, and a long span is a month
**Surface:** web, iOS, Android
**Was:** A dot under the day number, and a run of three or more empty weeks collapsed to a line saying how many.
**Is:** The cell itself carries a quiet inward edge and a ground, and a span past six weeks draws a month.

**Five pixels of colour across seven cells is easy to miss**, which is what the rail came back as from the first real thread. The dots stay and still say what kind and how many; the cell now says there is something here at all. An inset ring rather than a border, because a border moves the cell by a pixel and the whole row shuffles as things are added and ticked off. Today stays outlined and the day being read stays filled, so three states sit on one cell without collision.

**Past six weeks it is a month.** Weeks read as time passing, which is the whole reason the empty days are drawn, and a year of weeks is a scroll rather than a shape. A long span now draws one month, whole weeks including the days either side of it drawn quietly rather than blanked, with a step either way and a **Today** that returns to the current month and selects today. The collapsed run of empty weeks is deleted: it made a year of nothing short without making it navigable.

**Design system impact:** three new things with no governed component and no mock anywhere: the has-something cell treatment, the month bar (step, step, month name, Today), and the outside-this-month day. `--surface-sunken` and `--border-hairline` do the tint, so no new token. The month bar is the first time this product has drawn calendar navigation; the kits' `TimelineWidget` had an Overall/Daily toggle instead and is now two shapes behind.

### 2026-09-10 · The timeline stopped being a widget and became a rail
**Surface:** web, iOS, Android
**Was:** A Timeline widget: a flat list of dated rows in priority order, drawn only when a thread had something dated, collapsing a repeating series into one line that said "every week, 30 held".
**Is:** A rail of weeks at the top of every thread, and the day you pick open underneath it.

**It is drawn whether or not the thread has a single date on it**, which is why it left the widget set rather than becoming a widget that is always earned. Widgets split content by what it is; this is about time passing, and the empty days are most of what it says. A thread with nothing dated shows the current week.

**A dot per thing, coloured by what the thing is**: task blue, event ink, note amber, anything else quiet grey. A day with three things has three dots, four at most and then a count. **A done thing keeps its colour and loses its fill**, so the legend stays about kind and weight says state. Colour is never the only read: every day card carries a generated label saying what it holds in words.

**A span covers every day it touches and a repeating thing draws every occurrence.** The list collapsed thirty yoga classes into one row because a list spends a whole row saying what the row above said; a rail has a cell per day already, which is what `decisions.md` said the phone's daily view should do all along.

**Runs of three or more empty weeks collapse to one line** saying how many, and open on tap. Two are drawn. A note dated a year out would otherwise draw fifty empty week rows between here and there, which is the passage of time rendered as scrolling.

**The week starts on Monday, with Sunday in Settings under Appearance**, kept on the device beside theme and text size.

**Two token findings came out of the review and one of them is a gap in the system.** Amber has meant "offload noticed this" since the kits drew a Noticed memory and had no semantic alias to say so, so every use reached for the ramp, which the rules forbid and the lint file could not catch because there was nothing to point at. `--surface-noticed` exists now, in `tokens/colors.css`, and the rail is its second caller. The other is the dot itself: 5px is smaller than any size token the system has, so it is a literal on all three surfaces and named here so the three do not drift by hand.

**Design system impact:** the kits' `TimelineWidget` is the shape this started from and is now behind in four ways: one dot per day becomes several, the dot means kind rather than state, the Overall/Daily toggle is gone because picking a day is the toggle, and the gap row is new. There is no governed component for a day cell or a week rail on any surface, and no kit draws either. Web had no timeline mock at all before this and now has the primary one. Worth drawing properly, because the four states this ships with are the ones a mock would have argued about: a thread with nothing dated, a day past the dot cap, a collapsed run, and a past day that is quiet but still live. **`--surface-noticed` is new and belongs in the palette page.** And the dot cluster inside a 40px cell at the larger text size is the one thing nobody has looked at on a device.

### 2026-09-10 · Memories became notes, and the row grew what a note now carries
**Surface:** web, iOS, Android
**Was:** A Memories section of rows, each a rule in a sentence, capped at ten, with a line at the cap saying to delete one to add another.
**Is:** A Notes section. The same rows, and four things they did not have.

**A note is what any dumped sentence becomes now**, so the row carries a date when the note has one, a `more` mark when a longer body sits behind the 200 characters, and a tertiary treatment for a note that is on the thread and past the prompt budget. A hundred is a budget rather than a cap, so **the cap line is gone** and what replaced it says the opposite thing: not that you may not add another, but that some of these are not reaching offload, beside the rows that resolve it.

**The section also gained a folded history.** A daily job merges and drops what a thread no longer says, and the count of what it folded is one control away. Read, not worked with: those rows do not open and there is no restore. offload rewriting sentences somebody typed and saying nothing about it is the version of this nobody would trust.

**The screens that carry the word and the screen that carries the feature were not the same screens.** `WMemories.jsx`, `MemoriesScreen.jsx` and `M3MemoriesScreen.jsx` are the account-wide browsing screens, which this did not touch beyond the label. The thread's section has never had a mock in any kit, which 008 recorded when it built the section from the component contracts instead, and it is the one that grew.

**The phones' tab glyph stayed `cloudy`.** Looked at rather than inherited: it was chosen for the word Memories, and the screen is still what offload has collected about you, so the glyph was never about the noun.

**Design system impact:** `MemoryRow` needs renaming and four new props: a date, a body indicator, a quiet state for a note past the budget, and the folded-history variant that does not open. `readme.md`'s vocabulary table, its moss note, its pane-head More list, its Notes row entry and its tab glyph line are updated in this change. The three Memories screens in the kits need their label changed. **The thread's Notes section still has no mock anywhere and now carries four states nobody has drawn**: at zero, over the budget, mid-fold, and reading history. That is the gap worth closing first.

### 2026-09-10 · A long press on any row threw, and the row it threw on was a red herring
**Surface:** iOS, Android
**Raised by:** reported as a crash when long pressing a checked todo, hoping for edit options.

**It was not about the row being checked, and it was not about the tick.** `ContentRow.tsx` had a `settle` helper returning a spring, called from inside two Reanimated gesture worklets and read synchronously. Without a `"worklet"` directive it is a plain JS thread closure, which Reanimated proxies as a remote function, and reading a remote function's result from the UI thread throws rather than settling the row.

So it fired on **every** row, done or not, from a long press or from letting a swipe go. The "checked todo" framing came from the reproduction rather than the cause: a half swiped row and a lingering error overlay were eating the taps that would have shown it elsewhere.

Worth keeping because the report pointed at the wrong thing twice over, at the state of the row and at the colour change that had touched this file the same day, and both were wrong. **The stack trace named the line and the line was correct.**

**Design system impact:** none. Nothing about the row's drawing changed, only which thread its animation is created on.

### 2026-09-10 · A reply can be marked up, and the list of what it may contain is short enough to write down
**Surface:** web, iOS, Android
**Raised by:** an answer about connected apps that ran three facts into one paragraph, with no way to link the settings screen it was describing.

**Replies were plain text on every surface**, so a longer one had no shape at all and nothing could point anywhere. offload stays short, but bold, a line break, a list and a quote earn their place often enough that their absence was showing.

**A parser, not a markdown library.** Every package is a superset of what anybody wants: raw HTML, images, tables, autolinking. The honest question is not which library but what a reply may contain at all, and that is six things. Anything else stays as the characters it was.

**No HTML on any surface.** `@offload/markup` returns a tree and each client draws it with its own components, so there is no string a browser parses, no sanitiser to keep correct and no `dangerouslySetInnerHTML` for a later change to reintroduce. On the phones `Linking` is not imported at all, so there is no call that could open an external URL even if the parser changed.

**A link may address a screen offload owns and nothing else.** An external URL in a reply is a phishing surface wearing the product's voice, and the words in it can come from a row a stranger wrote. `https://`, `//host`, `javascript:` and `data:` are all left as literal characters, which is the failure direction that cannot be used against anybody.

**Nothing in the renderer sets a font.** The two bubbles disagree about size and typeface already, so the call site passes what it uses and every block inherits it. A reply that changed typeface partway through would read as two voices.

**The plain case pays nothing.** One sentence parses to one paragraph of one text piece and is returned as a bare string, so the markup never appears for the reply almost every reply is.

**Caps, and they keep what overflows.** Twelve blocks and ten items in a list. Past that a reply is a document and belongs on a screen instead, but the overflow is still said as paragraphs rather than dropped, because dropping is offload deciding somebody did not need to know.

**The prompt and the parser are in two languages**, so a test asserts they agree: everything the renderer draws is taught, and the things every model reaches for by habit and nothing draws, headings, fences, tables, images, are absent.

**Design system impact:** new. A reply bubble can now hold a list, a quote and a link, and none of that is in the kits. Worth drawing: the marker takes tertiary ink because a column of bullets at full weight reads louder than the sentences beside it, the quote takes a rule rather than italics because the reply is already set in the serif, and the list indents one space step rather than the browser's default, which at this measure pushes it halfway across the bubble.

### 2026-09-10 · A repeating event is one row in a list and every cell on a calendar
**Surface:** web, iOS, Android
**Raised by:** a thread whose Timeline was thirty rows of the word Yoga.

**The list and the calendar disagree about repetition, and both are right.** A calendar can draw the same event on thirty days for free: every day already has a cell, and an empty one costs the same as a full one. A list has no grid. Each occurrence spends a whole row to say what the row above already said, and the one-off things, the lawyer, the studio call, get pushed off the bottom by a class somebody goes to every week.

So the timeline collapses a series to one entry and says how often instead. **The occurrences are counted, never hidden**, and nothing changes on a calendar.

**Only the timeline splits.** A repeating event is still one task in To do and one file in Files. Collapsing anywhere else would hide rows that are genuinely separate things.

**The entry stands on the next occurrence that has not happened**, because a repeating thing is a question about what is coming. Once they have all passed it stands on the most recent, which is the same rule read from the other end rather than a special case.

**How often is inferred from the dates, and it declines rather than guesses.** The row carries no RRULE, only the series id the calendar sync wrote, so the cadence comes from the gaps between the occurrences held. Every gap the same gives "every week". One moved week gives nothing at all, and the entry says "12 dates" instead. Saying "every week" about a series with a moved week would be worse than saying nothing.

**A series holding one occurrence stays in the list**, whatever the calendar called it. Collapsing it would say "every week" about a single date.

**The heading is a label, not a section.** No rule above it, no count badge, no add button. 007 already removed headed groups from widgets once for leading with structure somebody has to read, and a repeating set is not a group anybody chose, it is one fact about the rows.

**Design system impact:** the kits' `TimelineWidget` draws a week rail and a granularity toggle and has nothing to say about repetition, so this is new. Web has no timeline mock at all. Worth drawing, because the phone kit's daily view is a calendar shape and should keep repeating every occurrence while its overall view should not.

### 2026-09-09 · Three things the review found in answering, and what each one is now
**Surface:** web, iOS, Android
**Raised by:** the review panel run before 013 merged. All three are gaps between the apply doc and the code that the first log entry did not name.

**`shown` is a prop now, which is what point 3 asked for.** It was two module constants read directly inside the component, so the right numbers landed by the wrong mechanism. A part that reaches for a module constant cannot be drawn twice on one page at two sizes, and the web pane and the composer log are already two places with different room. `ROWS_SHOWN` stays as each surface's default and the call sites can override it.

**Point 4's `20 of 46` header is dropped, deliberately, and this is the record of it.** The header shows the count of what arrived. The count of what exists would need a `COUNT(*)` per result on the read path, and `page()` avoids one by design: it asks for one row more than it needs and reports the overflow as a boolean. The truncated tail already says the rest is in the thread, and the thread page shows the real total when somebody follows it. **Design system impact:** the brief's point 4 should drop "and the header says `20 of 46`"; `AnswerResult.d.ts` should narrow `count` from `number | string` to `number`.

**The phones fold both tails into one, and that is a real divergence rather than an oversight.** Point 4 describes two behaviours: Show more expanding in place, and the thread for a cut-short read. Web does both. The phones do the thread for both, because the conversation is a sheet capped at 78% of the screen and expanding twenty rows in place pushes the sentence that answers the question off the top edge, which is the same measurement that put `shown` at 5. The thread is where somebody works through a long list on a phone anyway. **Design system impact:** the kits should draw the phone tail as the thread in both cases, or say why not.

**Design system impact:** the two fields above, plus `AnswerResult` is still absent from `_ds_bundle.js`, `_ds_manifest.json` and `_adherence.oxlintrc.json`, so none of its prop contract is enforced by `pnpm lint`. Those are generated and are the design system's to write on its next sync.

### 2026-09-09 · The mobile tick was drawn in the wrong white
**Surface:** iOS, Android
**Raised by:** the same review pass, checking 8a's ramp-value defect for others of its shape.

**`useColors().onSolid` is `--text-inverse`, and it flips with the theme.** That is correct on a fill that flips with it, which is `--surface-inverse` and also `--text-accent`, since the accent lightens in dark. It is wrong on moss, blue and clay, which do not flip at all: the glyph went to #191919 in dark and sat on moss green.

`--text-on-solid` is #FFFFFF in both themes and exists for exactly these fills. It was never exposed to the phones, so there was no way to reach it. It is `onBrand` now.

Three call sites were wrong. The answer row's tick, which is new. And `Conversation.tsx`'s Done mark, which drew its glyph with `onSolid` and its label with `text-text-on-solid`, so **one control disagreed with itself in dark**, a white word beside a near-black tick. The web stylesheet had `var(--text-on-solid)` right all along, so this is a parity fix rather than a new decision.

And `settings/Rows.tsx`'s Save, which the answering pass named as the twin of 8a's defect and left for the next settings change. It is worse than the twin: on Android the fill is `bg-blue-600`, which does not flip, while both the label and the spinner used tokens that do, so **"Save" was near-black on blue in dark**. Two fills need two foregrounds, and it has them now. The iOS branch also moves off the ramp value to `--surface-inverse`, which is what 8a asked for.

**Design system impact:** none to the tokens, which were already right. Worth knowing that a phone component reaching for "white on a fill" needs `onBrand` and that `onSolid` means the inverse surface. The rule to carry: a fill that flips takes a foreground that flips, a brand fill takes one that does not, and a control drawing one of each per platform needs both.

### 2026-09-09 · Answering, applied, and one divergence on the failure line
**Surface:** web, iOS, Android
**Raised by:** applying `handoff/APPLY-2026-09-09-answering.md`.

**Points 1 to 8a are built as drawn.** The card with the thread as its header, results below the bubble and controls inside it, `shown` at 8 on web and 5 on the phones, the two tails kept exclusive, the done row on tertiary ink with a strike, ticking as the only write, and the checkbox border at `--border-strong`.

**8a found a real one in shipped code.** `Conversation.tsx`'s calendar control drew its filled primary as `bg-ink-950` with `text-text-inverse`. Those resolve to the same pair as `--surface-inverse` and `--text-inverse` do today, which is luck rather than design: a ramp value pairs correctly only for as long as the two happen to flip together. It is the alias now. **`components/settings/Rows.tsx:257` has the identical shape and is untouched**, because it is outside this feature; it should move with the next settings change.

**The truncated tail needed a column.** `message_content` gained `truncated` in 0029. Without it a reply reopened tomorrow forgets which tail it had and offers to expand into rows nobody fetched. It sits on the join row rather than in a table of its own: one read is one thread here, so every row of a result carries the same value.

**Divergence, point 7.3: the failed treatment still applies to an answering turn.** Partial genuinely cannot happen, since an answer posts answered or failed and never partial. Failed can, and offload never leaves a dead end: a question that failed needs the same sentence and the same Try again a dump gets. The copy stays as it is because the message is saved either way.

**Not built: `QuickReplies`.** Points 9 to 11 are the shape 014 should land in and the brief says they do not block 013.

**Design system impact:** none outstanding for this pass. The kits already carry the parts; what is left is the settings primary named above, which is code's to move.

### 2026-09-09 · Answering has no mock, and three things the kits cannot express
**Surface:** web, iOS, Android
**Raised by:** building 013. The server half is complete and the clients are deliberately not started.

**`find-kit.sh search` and `answer` find nothing**, so this is one of the few screens designed rather than matched. The full brief is `handoff/DESIGN-2026-09-09-answering.md`; this entry is the contract.

**A tickable row does not exist anywhere.** `WRow`'s `check` is a bordered span with no behaviour, because nothing in the kits was ever tickable. In an answer a row is ticked for real, through the same endpoint the thread page uses.

**A done row is not dimmed.** `WThing.jsx:38` draws a completed row at `opacity: 0.5`, and both shipping components reject exactly that in a written comment: never opacity, because dimming a row on a warm page reads as a rendering fault and takes the label under the contrast floor. They use the moss fill, tertiary ink and a strikethrough. **This one is a correction to the kits rather than a new state**, and it applies to `WThing` and the mobile equivalent as they stand, not only to answering.

**A row has to say which thread it came from.** The thread page never needed it, because it draws one thread. `WRow`'s `meta` cannot carry it: it is plain text so it cannot be a link, and it already holds who and when, which matters more here than anywhere because a result in a shared thread can be somebody else's. Results group under the moss thread chip a reply already uses.

**And results sit below the reply bubble, not inside it.** A pane row's hover fill bleeds by `calc(-1 * var(--space-5))`, which is exactly an offload turn's horizontal padding, so inside a bubble it cancels the padding and runs under the 18px corner. Everything put inside a turn until now has been one small fixed control.

**Design system impact:** three things for the kits to gain and one to correct. Gain: a tickable row state, a thread chip above a group of results, and a **Show more** control on a result longer than what a reply draws. Correct: the completed-row treatment in `WThing` and its mobile twin, from opacity to the moss fill with tertiary ink and a strikethrough that both shipping components already use. `ROWS_SHOWN = 8` is a guess in the absence of a mock and is the number most likely to move.

### 2026-09-05 · The phones, and four divergences the kits do not cover
**Surface:** mobile, android
**Raised by:** building 009.

**`Glyph`, not `Icon`, on React Native.** The governed `Icon` contract is DOM-shaped: it masks an
SVG with `currentColor` and takes a `basePath`, which is a URL. React Native has neither, so a
component named `Icon` there would be claiming a contract it cannot implement, and the adherence
lint said so before anything shipped. The paths themselves are generated from the system's own 80
vendored SVGs by `pnpm icons`, so nothing is retyped.

**`ToastHost` wraps `Toast` rather than replacing it.** The first version took a state object and
called itself `Toast`, which the lint also caught. `Toast` now matches its contract and the thing
deciding when to draw it has its own name. That one was the lint being right rather than
inconvenient.

**A thread screen keeps the composer and loses the tabs.** `M3App.jsx:301` sets `showComposer`
false inside a thread and this does not. Dumping from where you are is the product's core move and
a thread is the likeliest place to want it. The tabs still go, so the thread has the screen.

**The bell and the settings icon are not drawn.** Every tab screen in the kit puts both in the app
bar and both destinations are out of scope. Drawing them would be the same thing the attachment
controls were rejected for: a control that does nothing is worse on a phone than absent.

**And Today's own composer is gone.** It was drawn and never wired, which its own comment admitted.
The plate holds the only one now and the day-one examples fill it.

**Design system impact:** four things. The system owes a **React Native icon contract**, since the
current one cannot be implemented there. The **change mark** now exists on three clients and should
be described in `readme.md` beside the two accents, because it is the first pattern that is a
moment rather than a state. **`SwipeRow` is delete-only** and the readme should say so: the glyph
and the clay ground are inside the component and the name reads generic. And **`Chip` still has no
`disabled` prop**, which was agreed and cannot be added here: `_adherence.oxlintrc.json` is
generated on the design system's side, so adding the prop without regenerating the rule would fail
the gate for every client. It needs a sync.

### 2026-09-05 · Six answers the phones needed, and four of them are new surface
**Surface:** web, mobile, android
**Raised by:** 009, which could not start without them.

Six questions had accumulated across 007 and 008 with no answer in any kit. Four blocked tasks in
009 and two change a component contract. All six were put to the product owner together, because
answering them once for three clients is the whole reason to do the phones now rather than later.

**Content row actions on a phone: the swipe deletes, and a long press opens the rest.** No kit
draws a content row action anywhere. `SwipeRow` reveals a delete and nothing else, its `trash-2`
glyph and `--clay-600` ground written into the component with only the label exposed, so a swipe
labelled Archive would show a trash can. And web's set is authorship-conditional, edit and archive
for any member but delete and move for the author alone, so a fixed gesture map is wrong for half
the rows. A sheet lists what you can actually do and omits the rest. *The cost, stated: archiving
is the commonest action and now takes two gestures.*

**Archived content: a toggle in the section header, as web.** The phones' `SectionHeader` already
has an `action` slot, currently carrying "See all", so the mechanism exists and the count stays
visible without going anywhere. *That slot now carries two meanings on one screen, which is the
thing to watch.*

**The memory chip opens into a sheet on a phone, and expands in place on web.** A deliberate
divergence rather than an oversight: the web answer was shaped by having width to spare, and a
phone has a third of it plus a keyboard that has to go somewhere. This is the one interaction here
where the keyboard problem is already solved by the pattern.

**Authorship on a memory chip is the name after the text, in a lighter weight.** What web already
does. `MemoryChip`'s small dot was the nearest precedent and it marks which person a memory is
*about*, not who wrote it, so borrowing it would have overloaded a meaning that already exists.

**The change mark is the moss fade, everywhere.** A moss background settling to transparent over
1400ms on anything that arrived while somebody was looking at the screen. It becomes the system's
pattern for *offload did this while you were watching*, unchanged on the phones, since it is a
background animation and Reanimated does it identically. Moss already means "offload did this, you
didn't", so this is the existing vocabulary rather than a new one. Reduced motion drops it to
nothing rather than shortening it.

**`Chip` gains a `disabled` prop.** The contract had none and the component derived interactivity
from whether it had a click handler, so an unavailable chip was indistinguishable from an
available one. The readme already specifies the treatment, an `--ink-100` surface with `--ink-400`
text and explicitly no opacity fade, so this is wiring an existing decision into the one component
that skipped it.

**Design system impact:** substantial and none of it optional. `Chip.d.ts` and `Chip.jsx` gain
`disabled` and the generated lint rule regenerates with it. The change mark needs describing in
`readme.md` beside the two accents, since it is the first pattern that is a moment rather than a
state. `SwipeRow` stays delete-only and the readme should say so, because "swipe row" reads
generic and it is not. And four things now exist in the product with no kit drawing: the memories
section, the memory editor sheet, the archived toggle, and the long-press action sheet.

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

**Done means something was done.** The tick on a dump meant the turn ended, so a question that got
an answer and a request that was refused both wore one: "delete the EU with fam thread" came back
"threads can't be deleted" under a green Done. It is gated on the same record the Undo toast uses,
which is what offload actually wrote rather than what it said about itself. A turn that answers
without doing gets no marker, which is right: nothing happened that could be undone or checked.

**The focus ring was being clipped in two places, and one of them was old.** `.paneTitle` carries
`overflow: hidden` so a long thread name gets an ellipsis, and renaming puts an input inside that
element, so the global 2px ring at 2px offset was cut down to four corner marks. The clip lifts
while there is a field in there, since the ellipsis is only wanted for the static title. The memory
editor had the same shape of bug from its own animation clip, and the fix there is 5px of room,
which is the first value that clears a ring reaching 4px past the box. *The version of this file
that shipped an hour earlier answered it by removing the ring on that one field, which `globals.css`
forbids in the same line that defines it: "it is never removed." Reverted.*

**There is no add control for the first memory on a thread, and that is deliberate.** A `plus` on
the pane head was tried and pulled: it said nothing about what it added, and nothing else on the
screen has an add. Combined with hiding empty sections, the consequence is that a thread with no
memories offers no way to type one, and the first one has to come from telling offload, which is
the product's usual way in and what `add_memory` is for. Every one after that is typed in the
section. *Flagged rather than buried: if that trade turns out wrong, the answer is the `ellipsis`
More menu `WThing.jsx` already draws and this app has never built.*

**A control that has to exist whatever a section holds belongs on the pane, not in the section.**
The archived pile was reached from a button inside the "Everything in here" heading, so that heading
had to survive an empty list in order to carry it, and a thread with nothing loose and one archived
row drew "Everything else 0" for no other reason. It is a tool in the pane head now, beside rename
and add memory, and inverts to ink while the archived view is on because the heading no longer says
which view you are in. Same reasoning that moved the add-memory control there.

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

## 2026-09-05

### 2026-09-05 · The design queue, answered
**Surface:** all
**Raised by:** the design system, then decided by the product owner off `explorations/design-queue.html`.

Fifteen things the codebase built without a kit to build from, put back as options with what the app
does today beside each one. Every answer below is the product owner's. Where an answer differs from
what shipped, the code changes: this is design leading on new surface, not overruling a divergence.

**1. Memories are rows, not chips.** A list is clearer, and a chip truncated a 200-character rule to a
window you had to click to read. `MemoryRow` is in the system, and the chip rows in `WMemories`,
`WMisc`, `MemoriesScreen` and `M3MemoriesScreen` are the shape reference rather than the answer.

**2. The editor opens inside the thing you clicked.** With rows that means the row expands, which is the
same principle the chip version had and one fewer object on the screen.

**3. The archive is a row at the foot of the list, not a tool on the pane.** It becomes a place you go
rather than a mode you toggle into, and the count reads without finding a highlighted icon. The pane
head loses the archive tool, and `Archived` is not in the More menu either: it is in the list.

**4. A finished task keeps its place, and past five the list collapses.** Tertiary ink and a 1px strike,
no opacity. Beyond five finished, the five most recent are shown with a "Show all" beneath them, so a
long-running thread's to-do list stays about what is left without hiding that the work happened.

**5. Row actions are conditional, and the fourth one goes behind More.** Edit and archive for any
member, delete for the author alone and absent otherwise. Anything beyond those three is in a
`RowActionSheet` on a phone or the row's `ellipsis` on web.

**6. The pane head gets a More menu.** Two tools, Open full and `ellipsis`, and the menu holds rename,
add memory and Leave. The kit already drew the ellipsis; now it says what is in it.

**7. The phones keep both gestures.** A swipe deletes, a long press opens the rest. It is the only
option where a swipe means the same thing in every list in the product, and `RowActionSheet` is now a
governed component rather than a screen's invention.

**8. `Glyph` is a second contract, not a rename.** Same 80 slugs, same sizes, a `color` prop in place of
inheritance, path data in place of a URL. The adherence lint was right to treat them as different
components.

**9. A widget filters, it does not group.** This one reverses what shipped: `Widgets.tsx` groups into
headed sections and the kit's `ChipRow` filter is the answer. A screen whose promise is that nothing
needs filing should not lead with structure somebody has to read; a filter answers "show me the
receipts" in one tap. **The group heading goes**, and with it the sub-heading rank the design system was
going to need. Code change, listed for the next sync.

**10. The turn carries its own failure.** A clay border on the message you wrote, one line beneath it.
Tighter than a tinted card in the middle of a conversation, and the failure is attached to the thing
that failed. Same treatment for failed and partial, different words and different action.

**11. The reply's thread pills stay**, with the single-thread refinement: when a turn touched exactly
one thread, the pill is the only mention and the sentence drops the name.

**12. Theme and text size are named rows in the nav foot, and a Settings page as well.** Both read the
same stored value. The two unlabelled glyphs go: an accessibility control nobody can name is not one.

**13. Leave and Delete are different words**, with the confirmation naming the other members. **No
last-member warning banner**: the confirmation already says nobody else is in it, and a second
paragraph in a tinted box over one sentence is more alarm than the situation earns. The clay stays on
the last-member action, because that is the one case where leaving destroys something.

**14. A row waiting on its thread says "filing", in moss.** The system's first per-row progress word,
taken deliberately: it reads as work happening rather than as a correction (Miscellaneous, then the
real thread) or as a bug (an empty slot). Nothing reflows when it settles.

**15. The share sheet says what a shared thread is, and stops stating the permission.** The longer
paragraph goes in, and the permission line comes out: "A shared thread belongs to everyone in it. If
somebody leaves offload, the thread and everything they added stay with the rest of you." Confirmed by
the product owner after the conflict was raised, so this is a deliberate reversal of the 25 August
decision that the permission appears identically everywhere. The permission itself is unchanged and
still enforced; what changed is that the sheet is one sentence long and now spends it on the thing
nothing else said. The Ending things settings page gains the account-deletion half, which is where
somebody goes looking for it, and that page also loses a retention line that the 27 August decision
had already retired.

**Design system impact:** `MemoryRow` and `RowActionSheet` are built, `readme.md` carries the finished,
archived, filing and conditional-action rules, the vocabulary table carries Leave, Delete and filing,
and the `Glyph` contract is described. **The kit screens are not done yet**: the thread page on three
clients, the composer on web, the nav foot and a Settings Appearance page, and the share sheet once 15
is settled. Two things for the codebase: **grouping comes out of the widgets** in favour of the filter,
and **the two preference glyphs get labels**.

### 2026-09-07 · Settings ships, and three things differ from the kits
**Surface:** all
**Raised by:** the code, building 010. The kits have drawn Settings for a long time; this is the first of it to exist.

**Is:** an index and three pages on all three clients, out of the kits' ten. Six of the seven not built have no feature behind them, and the seventh is named below. Three things differ from what the kits draw, each for its own reason.

**Sign out is on the web index, which no kit draws.** Both phone kits put a secondary button beside the identity block; `WSettings.jsx` has one only on the account page. It is on web's index anyway, because this is one product with one behaviour and somebody on a laptop should not have to open a page to leave. New surface, small, and worth the parity.

**My account drops four rows the kits draw, for three different reasons.** Phone and Password go because this product is OAuth-only: there is no password to change and no phone stored, so both would be controls that do nothing. The Plan group and the identity subtitle's "· free plan" go because there are no plans, and inventing a tier on a settings screen is a product claim nobody has made. The clay "Delete your account" panel goes because deletion is specified in 001 and not built; a panel that does nothing is worse than its absence.

**Appearance is a `SegmentedControl` on the phones too, not the kits' radio list.** The 5 September entry already said this with surface *all*; the phone kits predate that answer exactly as the web one did. Named here because that entry read as a web note and was nearly followed as one.

**Two pieces of the row vocabulary were built and three were not.** The kits draw a group, a row, a toggle, a danger tone and a radio choice group. Only the group and the row have a caller: every page that would use the others is out of scope, and building them anyway is a speculative abstraction. They arrive with the page that needs them.

**The shapes differ per client on purpose.** The phones draw fill-backed cards with inset dividers, which is what a phone list looks like; web draws open blocks with a section label and no container, which is what `WSettings.jsx` draws and what the rest of that shell looks like. Forcing one onto the other would have been a divergence from the kit dressed as consistency.

**Two things the kits are simply wrong about, and are not built.** "Conversations kept" is retired: the 27 August decision retired the retention clock and the 5 September pass removed it from `readme.md`'s Settings list. **The row on that page which is *not* retired is also not built**, and that is worth being explicit about, because retiring a page silently took it with it: the same 27 August entry says "Delete all conversations is unaffected and should stay". It needs an endpoint, a confirmation model and a home now the page around it is gone, so it belongs with account deletion. And the Privacy page's three toggles are refused rather than deferred: none has anywhere to be stored, and a switch is a stronger claim than a sentence because it implies somebody could have set it the other way.

**A bug this found, in the design system's favour.** "A new account opens in light regardless of the device setting", 25 August, surface all. Web's appearance shipped on 5 September resolving an unset preference to `system`, so a new account on a dark laptop opened dark. Offering `system` as a choice and defaulting to it are different things. Both clients default to light now.

**Design system impact:** three things. `WSettings.jsx` gains a sign out on its index. The kits' `SettingsDetail` account page loses Phone, Password and Plan, and the identity subtitle loses "· free plan". And the phones' Appearance page becomes a segmented control. The seven undrawn pages need no change: they are right, they are just ahead of the product. Text size is offered on web only, and the reason is in the code rather than the design: mobile type is 73 numeric `fontSize:` literals with no size variables in the generated stylesheet, so a size choice there is a generator change, not a screen.

### 2026-09-05 · A row offers one way out, not two
**Surface:** all
**Raised by:** the product owner, asking why a row needs both archive and delete.

**Is:** every row carries edit and exactly one way out. Your own content offers **Delete**; content somebody else wrote, in a shared thread, offers **Archive**. An archived row offers **Put back**, whoever is looking. Never two of the three at once.

**This reverses the row-actions rule from earlier the same day**, which said edit and archive sit on the row for any member and delete is the author's alone. That was three controls, and on a solo thread, where every row is yours, two of them answered the same question: archive and delete both mean *get this off my list*, and only one of them is honest about what it does afterwards.

**The rule is still the permission split, drawn more tightly.** Archive exists because OFF-3 says you may not destroy what another person wrote, and a shared thread still has to be tidyable by the people in it. So archive is not a gentler delete, it is **what you get instead of delete**, and drawing it beside delete made it look like a preference rather than a consequence of whose row it is.

**What is given up, named rather than discovered.** There is no longer a non-destructive way out for your own content: a stale link of yours is kept or deleted, with the eight second Undo as the only way back. The tick is not a substitute, because it only exists in the To do widget and a note cannot be ticked. Raised before the change and accepted.

**The phones need no separate answer.** `SwipeRow` stays delete-only and already refuses to park open on a row this account may not delete, so a non-owned row reaches Archive through the long press and never opens onto a control the server would refuse. The sheet follows the same one-way-out rule.

**Design system impact:** `readme.md`'s row-actions bullet is now wrong and should read: a row carries edit and one way out, delete for the author, archive for everybody else, put back for anything archived. The `RowActionSheet` contract is unaffected, it already says to omit what this account may not do. No kit draws a shared thread yet, so nothing to redraw until one does.

### 2026-09-05 · The design queue, applied
**Surface:** all
**Raised by:** the code, applying `handoff/APPLY-2026-09-05.md`.

Eleven instructions, nine of them with a surface to land on. What follows is what the codebase did and where it did something else.

**The two reversals both went in as written.** Widgets filter on all three clients, `All` first then each tag value in the thread's dimension, and the group heading and the bare "Everything else" heading are gone. The two preference glyphs are named rows saying what they are and what they are set to, with a Settings Appearance page beside them on `SegmentedControl`. Theme gained a third value, `system`, which is what an unset preference already did without a name for it.

**`filtersFor`, `matching` and `splitDone` are in `@offload/widgets`, not in each client.** Three clients deriving the same filter from the same tags is how two of them end up disagreeing about what `city:alfama` means, which is why `parseTag` is already there.

**Four divergences, each with a reason.**

- **The memory editor is a sheet on the phones, not an expanding row.** `MemoryRow` says the row grows to hold its own editor, which is right on web and is what web does. A phone has a third of the width and a keyboard that takes the bottom half of the screen, so a row opening halfway down a scrolling list opens underneath it. This is the repo's oldest lesson about the platform and no kit can show it.
- **`Chip`'s new `disabled` is not used for the at-cap Add.** The contract's own note says to say why in copy nearby rather than leave a dead pill, and with rows the sentence says it and names what to do about it.
- **The Settings Appearance page uses `SegmentedControl`, not `WSettings.jsx`'s `SPick`.** The kit's Appearance page is a radio list and predates this answer, which names the component. The same entry lists this page among the kit screens still to be drawn, so the contract led.
- **A pane head More menu is web only.** The phones have no pane head; the equivalent, a row's own actions, is `RowActionSheet`, which is now the governed component rather than a screen's invention.

**Two things were carried by the prompt rather than by a screen.** "One thread, one mention" is the model's sentence, so `plan_v2.md` now says to name a thread only when the dump went to more than one: the pills under the reply are built from what was actually filed and are the whole answer to "where". And the phones' partial-turn copy had drifted from the readme's and from web's, "Saved what landed. The rest didn't come through." against "offload did not finish that one."; there is one voice, so both now read the readme's.

**Two instructions have no surface yet and nothing was invented for them.** The share sheet's copy and the Leave/Delete wording both wait on sharing and leaving being built, which the handoff says. **Instruction 9, the row that says "filing", also has nowhere to land**: nothing in either client draws a row before its thread is known. There is no optimistic row and no pending list, so the word would have to be attached to a surface that does not exist. It is the one answer in this pass that is waiting on code rather than on design.

**Two gaps found while applying it, both in the system rather than in the code.**

- **There is no `--border-danger`.** The system has `--border-accent` and `--border-attention` and no clay counterpart, so the failed turn's clay border reads `--text-danger`, which is the one alias that is clay. A border alias would be the honest token.
- **`tokens/atmosphere.css` is not in the download and has to be kept from the repository.** It is the marketing site's, which has a different designer, and it is a real generator input: the fourteen `--wash-*` and `--prism-*` variables the landing page and the gate paint with come from it. A sync that replaces the folder wholesale removes them and nothing raises, because a stylesheet missing fourteen variables is still a valid stylesheet.

**A comment in `typography.css` broke the token generator, which is worth writing down.** The file explains that its large block is "scoped without `:root` on purpose, since the generator reads every `:root` block as the light theme". The scope regex found that `:root` inside the prose, ran its selector group through the rest of the comment to the next brace, and read the large sizes in as the base ones. Every size token shipped 15% bigger on every platform and nothing raised. The generator strips comments before parsing now, emits `[data-type="large"]` as its own scope, and throws if base and large ever come out equal.

**Design system impact:** three things for the next sync. `--border-danger` as an alias beside `--border-accent` and `--border-attention`. `atmosphere.css` either carried in the download or explicitly recorded as the marketing site's, so neither side deletes it by accident. And the kit screens this pass named as still to be drawn are now built in code, so the sync has something to read: the thread page's archive row and More menu on web and both phones, the widget filter row on all three, the memory rows, the nav foot, and the Settings Appearance page.

### 2026-09-05 · Sync: the design system catches up on eleven days of code
**Surface:** all
**Raised by:** the design system, reading this log after the first real commit.

The repository went from empty to 797 files and this log came back with eight entries carrying a
**Design system impact**. What follows is what the design system changed in response. Code led on
every one of them.

**`Chip` gains `disabled`.** Asked for twice, on 2026-09-04 and again on 2026-09-05, and
correctly not done in the app: the adherence rule is generated here, so a prop added on the client
would have failed the gate for every other client. `--state-disabled-surface` with `--state-disabled-text`, no
opacity fade, which is the treatment `readme.md` already specified. Not interactive while
disabled, so it takes no hover, no press and no 44px hit area.

**The retired `variant="soft"` is gone from the component, not just from the kits.** Five chip
rows in `WMemories`, `WMisc`, `MemoriesScreen` and `M3MemoriesScreen` still passed it. The
prop was never in the contract and the soft tints were retired for reading too close to paper at
chip size, so the branch is removed from `Chip.jsx` as well. A kit cannot pass it again.

**The change mark is in `readme.md`, beside the two accents.** A moss background settling to
transparent over 1400ms, on anything that arrived while somebody was looking at the screen. It is
the first pattern in this system that is a moment rather than a state, which is why it sits with
the accents rather than in the motion rules. Reduced motion drops it to nothing, per the standing
rule that a shortened animation is still an animation.

**`SwipeRow` is delete-only and now says so.** The glyph and the clay ground are inside the
component with only the label exposed, so a swipe labelled Archive would have shown a trash can.
Stated in the contract and in the readme rather than generalised, because generalising it is a
design job and the phones did not need it.

**The type scale is a token now.** `[data-type="large"]` overrides the eight size tokens with
whole-pixel values at 1.15, and `--type-scale` is there for a one-off literal that has to move
with them. Deliberately not `calc()` on the base sizes: the token generator resolves values for
clients that cannot follow a `var()`, and React Native cannot parse a calc. Deliberately not
scoped `:root[data-type="large"]` either, since the generator reads every `:root` block as the
light theme and would have taken the large sizes as the base.

**Breakpoints exist.** `--breakpoint-lg` is 1180, the value the web shell already uses, with sm,
md and xl around it.

**The retention line in `readme.md` was still wrong.** It quoted the 60-day conversation clock
that 2026-08-27 retired. Removed.

**A React Native icon contract is owed and not yet written.** `Icon` masks an SVG with
`currentColor` and takes a URL `basePath`, neither of which exists on React Native, so `Glyph`
is the right name and the right call. Noted in the readme so no client invents a second one, but
the contract itself is a design job for the next pass, not a rename.

**Design system impact:** done, except the drawing. What is still owed is new surface rather than
correction, and it is listed in `handoff/README.md` under Design queue: the memories section on
three clients, the open state of a memory chip, the archived toggle, the long-press action sheet,
the completed-task row, conditional row tools, the composer's failed and partial states, the reply
that links to threads, the pane head's tools, the theme switch and type-size control, and the
filter-versus-group question from 007. None of those can be answered by an edit to a token file.

---

## 2026-09-01

### 2026-09-01 · Radius ladder ends at xl, no 2xl
**Surface:** web
**Was:** `WFirstRunGate.jsx` used `var(--radius-2xl)` on the gate card, a token the set never defined.
**Is:** `var(--radius-xl)` (28px). The ladder stays xs 6, sm 10, md 14, lg 20, xl 28, pill 999.
**Why:** One accidental use in one file, not a missing step in the scale. A 440px modal card sits at the top of the existing ladder; adding a sixth step for a single surface would invite drift.
**Design system impact:** Done. Kit corrected, tokens unchanged. Code should use `--radius-xl` as the largest rectangular radius.

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

**Amended 2026-09-05:** the permission is unchanged and still the only one, but it is no longer stated in the share sheet. That sentence was the whole of what a person read before sharing, and it said nothing about what happens to a shared thread when somebody leaves, which is the consequence they cannot undo. The sheet now carries co-ownership instead, and the permission lives in the product's behaviour and on the Ending things settings page. *Amended rather than rewritten: "stated identically everywhere" was the decision, and it no longer holds.*

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

### 2026-09-05 · The plate rounds its top only when it is the top
**Surface:** mobile

**Is:** the bottom plate on Android and iOS keeps its rounded top corners while it is the topmost surface of the bottom stack, and drops them the moment a raised conversation sits on it. Under a keyboard the plate also loses its tabs and its safe-area inset, so the composer sits directly on the keyboard.

**The corners were cutting two notches out of a join.** A raised conversation is its own sheet with its own composer, stacked directly above the plate in one column. Both surfaces carry the same fill, so the join should be invisible; instead the plate's radius left a wedge at each end where the scrim behind showed through. Rounding is a property of being the top of a stack, not of being the plate, and the component now reads it that way. Folded, the plate is the top again and rounds again.

**A keyboard means somebody is writing, and nothing else on the plate is any use to them.** Three places to go while you are mid sentence, and a safe-area inset padding a nav bar the keyboard is already covering. Both go on `isVisible`, which reads slightly ahead of the animation, so the tabs are gone before the keyboard has finished arriving.

**A percentage height against a bottom-anchored parent is a trap, and this is the second layout bug from the same stack.** The sheet capped itself at `78%`. Its parent is the shell's column, anchored `bottom: 0` with no height of its own, so Yoga sized the column from the *unclamped* sheet, the sheet then shrank to 78% of that, and the surplus column height showed as a band of nothing below the tabs. It is a pixel height off the window now. The diagnosis came from painting the column magenta rather than from reading it: the column had been reaching the screen bottom the whole time.

**Design system impact:** worth a line in `readme.md` beside the plate. Two rules, both about the plate not being a fixed shape: it rounds its top only when nothing is stacked on it, and it clears itself to the composer alone whenever the keyboard is up. No kit draws either state, so the kits are what has to catch up.

### 2026-09-05 · The conversation leaves the way it arrived
**Surface:** mobile

**Is:** folding or closing a raised conversation rolls the sheet down off the bottom over 280ms while the scrim fades under it, and raising one rolls it back up. It used to disappear between two frames.

**Both surfaces unmounted on the flag rather than on the animation.** `if (!raised) return null` runs the moment the state changes, so the exit had nothing left to animate and only the entrance was ever seen. Each now stays mounted until the timing callback says it is off screen. It is the kind of defect that reads as "no animation was written" when in fact one was, which is worth knowing before anyone writes a second.

**It slides by its own height, measured, not by 60px.** The old offset was a nudge that read as a flicker at speed. The plate paints after the sheet, so the sheet goes down *behind* the bottom bar, and there is no fade on it: a slide and a dissolve at once looks like the sheet is coming apart on the way out. A drag that crosses the fold threshold hands straight over to the exit from wherever the finger let go, rather than snapping to the top first.

**Design system impact:** worth a line in `readme.md` beside the sheet. 280ms, ease, no fade, travel equal to the sheet's own height, and the same curve in both directions. No kit expresses motion, so this is the only place the number lives.

### 2026-09-05 · A swipe action carries its own opacity
**Surface:** mobile

**Is:** the clay Delete panel behind a swipeable row is drawn only while a swipe has actually moved that row. Closed, it is not painted at all. `ThreadRow` and `ContentRow` both.

**Every row wore a ghost Delete for the length of a tab change.** The panel sits behind the row and the row's own opaque background covers it, which holds until something fades the whole screen as one layer. Android's tab transition does exactly that: at 50% through the cross-fade the row's background is 50% transparent, so the clay behind it reads straight through, on every row at once. It looked like a rendering fault and it was ordinary group opacity.

**The rule generalises past this component.** Anything hidden only by an opaque sibling in front of it is visible during any group fade: a screen transition, a modal, a list that animates in. Hiding by stacking order is not hiding. Anything that must not appear needs its own opacity or must not be mounted.

**Design system impact:** worth a line on `SwipeRow` in the component contracts. The reveal is a property of the gesture, not of the row's existence, and the panel's opacity should be driven from the same value as its offset.

### 2026-09-07 · A name, and the two screens that ask for it
**Surface:** mobile, web

**Is:** first run gains a fourth screen, "What should we call you?", between the tutorial and the consent. Settings' My account gains a Name row that edits in place. Both use one field: `NameField` on the phones, toned per platform the way `ConsentTicks` already is, and `.nameField` on web, modelled on the marketing waitlist input.

**"Three screens and nothing to fill in" is now broken twice, and both breaks are the same break.** The kit's rule is about not making somebody configure the filing before they have put anything in. Consent broke it first. A name is not filing either: it is who you are, asked once, at the only moment somebody is already answering questions about their account. Asking later means asking in the middle of something else.

**Skip moved.** It has always meant "skip the tutorial", and it landed on the consent because that was the only screen behind it. It lands on the name now, because both screens that ask something sit behind it. A Skip that jumped a required field would be a dead end with a disabled button on the next screen.

**The row edits in place rather than pushing anywhere.** `SettingsDetail.jsx` draws a tappable Name row and does not say what tapping it opens. A pushed screen or a modal is more screen than one field needs, and the row already has somewhere to put it. It is `EditableRow` beside `Row` rather than an editing state inside `Row`: every static row would otherwise carry a draft, an async save and an error it never uses.

**The kit could not have shown the keyboard, and this is the second screen to learn it.** The field sits above the button that leaves first run, and this app is edge to edge, where Android ignores `adjustResize` outright. Without `KeyboardAvoidingView behavior="padding"` the button ends up underneath the keyboard, exactly as the waitlist form did.

**The same screen serves two arrivals.** A new account meets the name as step four of first run. An account that already existed meets it on its own, on the next launch, with the tutorial and the consent left off: they have read one and given the other, and showing them again would be asking twice. One screen, one field, two ways in, and the second is the one every account in the alpha will take.

**Design system impact:** four things for the kits to catch up on. `FirstRun.jsx`, `M3FirstRun.jsx` and `WFirstRunGate.jsx` are all a screen short and their Skip goes to the wrong place. None of them draws the name screen standing alone, which is the more common of its two uses and looks different: no dots, no Skip, one field and one button. `SettingsDetail.jsx` and `WSettings.jsx` need the Name row drawn in its editing state, which no kit currently expresses. And a text field on a phone screen wants a note that the mock cannot show its own failure mode: anything with a field above a button needs the keyboard drawn before it is called done.

### 2026-09-07 · Focus borders are ink, and `--border-focus` is blue
**Surface:** web

**Is:** every focused text field on the web draws `--ink-950`. `--border-focus` exists in the tokens, resolves to `--blue-500`, and nothing uses it.

**Found while adding the third caller rather than decided.** The marketing waitlist input set it, the gate copied it, and 011's name field and settings field copied it again. Each was individually consistent with the field beside it and none of them used the alias that exists for exactly this. Left as ink here, because switching one field to blue would have made the welcome screen's field focus differently from the waitlist field on the same flow, which is a worse outcome than the inconsistency being invisible.

**Design system impact:** one decision needed, not four call sites. Either `--border-focus` becomes ink and the ramp references collapse onto it, or the app moves to blue focus everywhere. Until then every new field re-bakes the same value, which is how a ramp reference spreads.

### 2026-09-07 · A preference is not the same thing as what it resolves to
**Surface:** mobile

**Is:** the stored theme has its own subscription, `useTheme`, and both settings screens read it through that rather than calling `storedTheme()` at render.

**The Settings index could sit there saying "Light" after somebody chose System.** Classes repaint through NativeWind and React Native props repaint through `useColors`, and both follow the *resolved* scheme. The preference is a third thing, and the two come apart exactly when the choice does not change the outcome: Light to System on a device already in light resolves to the same scheme, so nothing repaints, nothing re-renders, and the row goes on reporting the old answer until something unrelated forces a frame.

**The web already had this and said so.** `apps/web/src/lib/appearance.ts` carries a comment about two components each holding a copy of one stored key being how a screen disagrees with itself. The phone had the identical hole and no such note, which is the two-documents-days-apart shape in a single feature.

**Design system impact:** none visual. Worth one line wherever the design system talks about the appearance control: anything that *displays* a preference subscribes to the preference, and anything that just needs a colour uses the resolved scheme. Those are different reads and only one of them is `useColors`.

### 2026-09-09 · A result is a card, and the thread is its header
**Surface:** mobile, android, web
**Raised by:** the design system, answering `handoff/DESIGN-2026-09-09-answering.md` off branch `013-answering`.

**Was:** nothing. No kit had ever drawn a search or an answer, which is why the brief came from code to design rather than the other way round.

**Is:** one read is one card. The rows sit on a surface of their own, and the thread names them from a header row inside that card: moss, the lasso glyph, the count on the right, 44px, and it is the one link out of the result. Three framings were drawn. A chip above loose rows is the lightest and keeps the existing `Chip`, and it was rejected because the count has nowhere to live and a chip loose above a card reads as two objects where there is one result.

**Why:** the card is what says these rows arrived together as one read, which is the whole difference between two results and one blended list. It also bounds the row fill, so web needs no exception to the pane row's negative margin.

**The cost, stated so it is not rediscovered:** the header is a new part, not the chip. Everything else in the product names a thread with `Chip`, so this is a second way of doing it, allowed only inside a result. On a truncated read the header and the tail both point at the thread; that stands because they say different things, and it should not spread.

**Design system impact:** new component `components/answering/AnswerResult`, wired into all three kits. `readme.md` gains an Answering section.

---

### 2026-09-09 · ROWS_SHOWN is 5 on the phones and 8 on web
**Surface:** mobile, android, web
**Raised by:** the brief, which called eight a guess and asked for a mock to answer it.

**Was:** `ROWS_SHOWN = 8`, one number for every surface.

**Is:** five on the phones, eight on web.

**Why:** `Conversation.tsx` caps the sheet at 78% of the screen, which leaves about 446pt of log on a 844pt phone. Eight rows with the header and the control overrun that by roughly 165pt, so a new answer lands on rows with the sentence that answers the question already above the top edge. Five leaves the sentence, the header, all five rows and the control on screen together. Web has roughly twice the height and keeps eight.

**Design system impact:** `AnswerResult` takes `shown`, defaulting to 5. The web kit passes 8. One number for both surfaces is what makes one of them wrong.

---

### 2026-09-09 · A finished row is never dimmed, and this is not answering's alone
**Surface:** web, and any kit that draws a done row
**Raised by:** the brief, quoting `WThing.jsx:38`.

**Was:** `opacity: 0.5` on a ticked task in the web kit.

**Is:** tertiary ink, a 1px strike and the moss tick. The row keeps its place and its contrast.

**Why:** both shipping components already reject opacity in a written comment: dimming a row on a warm page reads as a rendering fault and takes the label under the contrast floor with it. The meta line fails first. Three signals already say done, so opacity adds nothing but the defect.

**Design system impact:** `WThing.jsx` loses the wrapper, `WRow` gains `done` and `onToggle` and draws a real checkbox. Its box border moves from `--ink-300` (2.5:1) to `--border-strong`, which is the 3:1 floor for anything outlining a control.

---

### 2026-09-09 · Three things a turn already carries, and what answering does with each
**Surface:** mobile, android, web
**Raised by:** the design system, reading `Conversation.tsx` while drawing the answer.

**Is:** three rules, all of which the code as it stands would get wrong.

1. **No Done mark on an answering turn.** The mark is driven by `turn.state === "answered" && turn.did`, and an answering turn writes nothing, so `did` stays false. The reply underneath is the receipt. 👀 is unchanged and does more work here than on a dump, because retrieval takes longer than filing.
2. **Inside the bubble is for a control, below it is for a result.** 012's calendar proposal stays inside; a result is an unbounded list of live rows with its own surface and goes below.
3. **`turn.threads` is empty on an answering turn.** The filed chips answer "where did this go", which is a question about a write. Drawing them beside a result names one thread twice in two different components.

**Design system impact:** the three kits' `Turns` now draw results below the bubble, options inside it, and suppress `refs` on any turn carrying results. Recorded in `readme.md`.

---

### 2026-09-09 · A filled primary is the inverse pair, never a ramp value
**Surface:** all
**Raised by:** the design system, drawing answering in dark.

**Was:** `QuickReplies`' primary painted `--ink-950` with `--text-on-solid`, copied from the way 012's calendar control is written in `Conversation.tsx` (`bg-ink-950` with `text-text-inverse`).

**Is:** `--surface-inverse` with `--text-inverse`. A light pill with dark ink in dark, the reverse on light.

**Why:** the ink ramp flips between themes, so `--ink-950` is #EDEDED in dark and white on it is unreadable. The white in `--text-on-solid` is the pair for moss, blue and clay, which hold their value in both themes; ink does not, so it needs the inverse pair instead. Worth checking wherever else a fill is written as a ramp value.

**The rest of dark needed nothing.** The plate is #0F0F11 and the card is `--surface-raised` at #212121, so the card is the lighter object and the plate between the bubble and the card keeps two same-value surfaces legible as two. Moss holds, so the tick, the header and the truncated tail have no dark variant.

**Design system impact:** `components/answering/QuickReplies.jsx`, one line. Section 8 of `explorations/answering-options.html` draws it. `readme.md` carries the rule.

---

### 2026-09-09 · Follow-ups are 012's control generalised, and the best one is not asked
**Surface:** mobile, android, web
**Raised by:** the product owner, ahead of the multi-turn spec.

**Is:** a question offload asks can be answered with a tap. Three options at most, all of them typeable, labels in the words somebody would say. A proposal has one primary and one plain way out; a choice among equals has no primary, because dark ink means offload is recommending and on a disambiguation it does not know. No option destroys anything. Picking writes your turn into the log exactly as typing would, and the chips go. One open question at a time, closed by the next turn whatever it says, because a yes arriving four turns late is a yes to something else.

**The trust boundary, which is the part that does not depend on the model:** the turn that asks carries no write tools; the turn your tap creates does. A sentence in a shared thread therefore has nothing to talk offload into calling.

**Three accelerators that are not a chip row.** Do it and say so, when the write is reversible, because the eight second toast is already insuring it: ask only when it is not reversible, reaches somebody else, or is a genuine coin flip. Offer to remember a disambiguation that keeps recurring, which deletes next week's question rather than this one. And answer a "which of these" on the result rows themselves, which needs no new control at all.

**Design system impact:** new component `components/answering/QuickReplies`, wired into all three kits and drawn in section 7 of `explorations/answering-options.html`.

---

## 2026-09-08

### 2026-09-08 · Connecting a calendar, and the promise that is no longer true
**Surface:** mobile, android, web
**Raised by:** the design system, building the connect-apps onboarding.

**Is:** first run ends with an optional screen offering one connection, Google Calendar. The chosen
shape is a single app on a single screen: the provider's mark at 88px, two sentences, one primary
button and `Not now`. Not a list, because a list of one reads as a list that is missing something, and
not a preview of the day, because the mark stops being the largest thing on screen. A second provider
becomes a sixth screen or turns this into the list; nothing on the screen claims a list exists.

**The mark is the provider's own asset, never redrawn.** offload's mark comes from `Logo.jsx` because
that geometry is ours and written down. A third-party mark's radius, colours and letterforms are
somebody else's specification, and an approximation that is 90% right is the kind of wrong a person
spots instantly on a logo they see every day. The kits carry a drop slot; the build carries the
official SVG.

**`Not now`, never `Skip`.** Skip belongs to the name screen and means skip the tutorial. Declining a
connection is a different answer to a different question, and it gets its own word.

**Writes are allowed, and the read-only promise is retired.** Every surface that offered a connection
said offload reads your days and never writes to them. That is no longer the product: offload may add
to a connected calendar. The sentence is gone from the onboarding screen and from web Settings'
Connected block. What replaced it is a placeholder and reads as one.

**All copy on this screen is placeholder, and the two sentences under the mark especially.** They are
the only strings in the product that make a commitment about what offload does with somebody else's
data, which is the app's call rather than the design system's. The design fixes the *shape*: two
sentences, what it reads and what it does back, as prose rather than toggles, per the 5 September
Privacy refusal. The wording is open, and the write side needs more than wording: what appears, under
whose name, and whether it can be undone are all unanswered, and may need their own Settings row
rather than a line here.

**Open, and not for the design system to close:** whether the screen appears for accounts that already
exist, since every alpha account does; and whether `Not now` is remembered or asked again, because
"every launch until you say yes" is how a prompt becomes something people dismiss without reading.

**Design system impact:** `ConnectScreen` in `FirstRun.jsx` and `M3ConnectScreen` in
`M3FirstRun.jsx`, both wired as a `connect` phase between the tutorial and day one. Not on web: web
has no first run, and its Connected block in `WSettings` is where the same connection is managed, so
only that block's note and Calendar card changed there.

No new design system components and no token changes. The screen is `AppBar`/`ABar`, `Logo`, a
provider mark passed in as a prop, `--text-title-1` and the gate's 52px pill buttons, which are now
factored out of `ProviderButton` as `GateButton` so the last screen of first run and the first one
share their geometry rather than each carrying a copy. Android gained an `AButton tone="text"`, which
that kit needed anyway for a Material text button.

**Connecting is a step, not an epilogue,** which settles the indicator: the dots span the tutorial
plus this screen, so `STEPS` is `TUTORIAL.length + 1` and both screens draw four. The tutorial's last
card therefore says **Next** rather than Get started, because nothing has started while another card
is still ahead. The dots and the top-right way out are one shared `StepBar` / `AStepBar`, so the two
screens cannot drift apart, and the connect screen has no app bar: it is the tutorial's frame with a
provider mark where the art goes, one button where Next sits, and `Not now` where `Skip` sits.

---

### 2026-09-08 · The prism field: colour on the phones, and it is frozen
**Surface:** mobile, android
**Raised by:** the product owner. "The app currently lacks colour."

**Is:** a baked prism texture on exactly two phone surfaces, inside the bottom plate and behind
the sign-in lockup, held **frozen** until offload files something, at which point a real
displacement shader runs for `--prism-run` and eases its clock to a stop over `--prism-settle`.
Explored in `explorations/prism-phones.html`, `prism-motion.html` and `prism-motion-v2.html`;
settled in `explorations/prism-design.html`; built as `components/layout/PrismField.jsx`.

**It comes from the marketing atmosphere and it is not that.** The web version is a WebGL shader
pushed through an SVG turbulence filter, and it costs ~96ms of raster a frame, which is why it has
to freeze behind the privacy page. React Native has neither the filter nor a cheap route to the
shader, so the same thin-film math ran once offline and the phones ship the result as a PNG. What
survived is the picture; what went is the loop.

**Density is not a taste value.** 140%, chosen by the product owner from a live control, and
measured with the veil against `--text-tertiary`, which sits at exactly 4.5:1 on paper with no
headroom and is used by every row's trailing time, the agenda's time column and a digest's line
times. At the shipped pair the worst tab label is 4.86:1 with none of the strip failing.

**Two mistakes worth recording, because both were the same mistake.** The field was first sized to
a literal 210px behind the plate, which left 77px of it under the scrolling list with nothing
muting it, and `--text-tertiary` failed 35% of that strip. Clipping it inside the plate fixed the
contrast and made the field invisible, because a flat 86% fill eats whatever density adds. The
answer was two things at once: a **graded** veil, light where nothing sits and full by the label
band, and **flipping the texture**, whose alpha had been baked rising toward the bottom for a field
that needed to fade up into the page. Unflipped, the field's density sat exactly where the veil was
heaviest and the two gradients cancelled. Together they took it from a sixth of the gate's strength
to three quarters.

**Arrival, not weather.** Perpetual drift was built and rejected: on the plate most of the field is
under a fill and three tab labels, so a 4px drift spends battery on pixels nobody sees. Frozen with
a two-second warp on arrival costs nothing at rest, and it makes the field the change mark in a
second place. A row takes a moss ground settling over `--duration-mark`; the field takes two
seconds of flow. They fire together. The gate has no arrival, so the screen's own appearance is the
trigger.

**Skia is the dependency.** `react-native-skia` for the runtime shader, several MB of bundle. The
shader itself is trivial per frame; the usual cost is the render loop staying awake, and here it is
awake for two seconds after somebody puts something down.

**Design system impact:** `tokens/atmosphere.css` is new, `styles.css` imports it, and
`components/layout/PrismField.{jsx,d.ts,prompt.md}` plus `components/layout/prism.card.html` are
new. The textures live in `assets/prism/`. Both plates and both gates are wired in the kits:
`App.jsx`, `M3App.jsx`, `FirstRun.jsx`, `M3FirstRun.jsx`. `handoff/APPLY-2026-09-08-prism.md` is
the instruction set, fifteen points.

`readme.md` carries the rules, and five of them were learned by getting them wrong first:

- The field is confined to two surfaces and may never sit under a scrolling list.
- **What has to be symmetric is the composite, not either layer.** The eye sees the field's alpha
  times what the veil passes. Shaping the field alone still opened in 25px at the top and smeared
  over 61px at the bottom, because at the top the two ramps coincide and at the bottom they
  stagger. Both layers on the same window measures 27px at each end.
- **`--prism-veil-reach` is the only stop that is not free to move**, since full fill has to be
  reached above the tab labels at 64% of the band. That fixes the visible window; everything else
  is derived from it.
- **`--surface-plate` is new**: the ground the field sits on and the colour its veil is made of,
  one token so the two cannot disagree. `--paper` on light, `#0F0F11` on dark, deliberately darker
  than `--surface-card`. The plate, a raised conversation and the folded title row all take it.
- **The composer never leaves the plate**, which is now a field constraint as well as a layout one:
  each field maps the whole texture into its own box, so splitting it in two squashes the pattern.
- **The field is the composer-and-tabs band only**, never a folded conversation's title row.
- **The gate's bloom covers all of first run**, mounted once in `GateShell`.

Dark works by re-pointing the fill rather than re-baking. **What is owed:** a dark set of textures
would be better than light tints veiled against a dark ground, and nobody has baked one.

**One thing that is not the design and cost three rounds of review.** The kit pages carry a `?v=`
on `_ds_bundle.js` and `styles.css` and it has to be bumped whenever either changes. With a stale
value the page pins an old build; with no query at all it takes whatever HTTP cached. Both look
exactly like "I refreshed and I cannot see your change".

---

## 2026-09-05

### 2026-09-08 · offload writes to one thing, and the kits said it wrote to nothing
**Surface:** mobile, web

**Is:** the Connected apps page's standing promise changes from "Read only. offload never sends mail, moves events, or deletes photos." to "What offload may do: it writes to your calendar when you ask. It never sends mail or deletes photos."

**Half a promise stopped being true and the other half got sharper.** 012 lets offload add, change and delete calendar events, which the old line ruled out in as many words. The replacement is narrower than the original rather than vaguer: it names the one thing offload writes to and keeps the two it does not. A page that says "read only" while the product writes to a calendar is the kind of defect this repository treats as a defect even when the code is correct.

**The line lives in a claim surface, so it moved in both places at once.** `ui_kits/mobile_app/SettingsDetail.jsx` and `ui_kits/android_app/M3SettingsDetail.jsx` both carried it, and the privacy policy carried the same commitment in prose. All three changed in one commit.

**What a person sees before a write that reaches somebody.** An event with guests, or on a calendar somebody else can see, confirms first and names who finds out: "Ana will be told", "Everyone on this calendar will see it." An event nobody else can see gets the ordinary Undo instead. That is a control this design system has no component for yet, and no kit draws it.

**Design system impact:** two things. The Connected apps page in both phone kits and in `WSettings.jsx` needs Calendar drawn as a live row with its calendars under it, each with a thread, a shared toggle, and an on switch; the current mock is four static rows. And the confirmation described above wants a real component contract: it is not a destructive-action dialog, because nothing is being destroyed, and it is not a toast, because it has to be answered before anything happens. Naming who finds out is the whole content of it.

### 2026-09-08 · A shaped logo does not get a rounded container
**Surface:** mobile, web

**Is:** the connect screen's provider mark is drawn at 88px with no corner radius. The dashed stand-in behind it keeps one.

**Both kits round the mark**, `radius={18}` on iOS and `20` on Material, and that is right for the general case and wrong for the asset that actually arrived. Google Calendar's product icon is not a square bitmap: it carries its own silhouette, including the folded corner at the bottom right, and a container radius on top of it clips geometry its owner already specified. The rule the kits are reaching for is "a provider's bare square should not sit on the screen as a hard-edged rectangle", and an asset that is already shaped has answered that question itself.

**The stand-in keeps its radius, and the difference is the point.** It genuinely is a bare square, and the radius is what makes a dashed box read as the slot an icon goes into rather than as an image that failed to load. So the two states differ on purpose rather than by oversight.

**The mark is Google's own file**, from their asset CDN, committed unmodified: an SVG on web and a 512px PNG on the phones, because this app draws icons from generated path data and carries no SVG transformer, so Metro cannot turn an `.svg` into something `Image` can render.

**Design system impact:** `ProviderMark` and `AProviderMark` want the radius to be a property of the asset rather than of the component. Either default it to none and let a caller pass one for a bare square, or take the shape as a prop. Also unresolved and worth a look with the real file in place: Google's terms set a minimum clear space, and whether the 88px box satisfies it is a question for their current spec rather than for either kit.

### 2026-09-08 · The prism field on the phones
**Surface:** mobile

**Is:** the baked prism texture on two surfaces, frozen at rest, warped for two seconds when offload files something. `PrismField` is a `react-native-skia` runtime shader; the design system's canvas implementation is the reference and the flow field, the alpha rescale and the veil stops are ports of it rather than re-derivations, so the two stay comparable.

**Applied from `handoff/APPLY-2026-09-08-prism.md`.** The five points it said were learned by getting them wrong all hold here: the composite is what has to be symmetric rather than either layer, `--prism-veil-reach` is the only fixed stop, `--surface-plate` is one token for the surface and the veil both, the composer never leaves the plate, and the field is the composer-and-tabs band only.

**Three divergences.**

**The gate mounts its bloom per screen rather than once.** The handoff asks for one field in a `GateShell` around sign-in, the refusal, the tutorial and connect. Those are four Expo Router routes here, and mounting one component across them means a shared navigator whose screens would all have to be transparent. What the rule protects against does not happen regardless: the tutorial, name, consent and connect steps are internal state inside one screen, so moving between them mounts nothing. What is left is a warp when the gate appears and a warp when first run appears, which is what "the screen appearing" means.

**The parallax is handed in rather than listened for.** The web component attaches a capture-phase scroll listener so no screen has to know the field exists. React Native has no equivalent, and the plate lives above the router in `Shell` while the lists live in the tab screens, so the two are in different trees and cannot pass a prop at all. A single Reanimated shared value spans it, written by whatever is scrolling and read by the field, both on the UI thread.

**The field's container is painted rather than transparent.** The handoff has the plate wrapper drop its background for `transparent`; here the plate is painted `--surface-plate` and the field is its first child. The result is the same ground under the same field, and it avoids a transparent plate showing the page through the veil's 86% at the edges.

**And one thing that was not the design at all.** `turbo.json` declared `outputs` for `build` and no `inputs`, while `packages/tokens/src/generate.mjs` reads the design system's token CSS from outside any package. Turbo's default inputs are a package's own files, so it could not see a token change: it called the build cached and restored a stale `dist/` over freshly generated tokens. `pnpm tokens` wrote the right files and the next turbo task overwrote them, so the app compiled against tokens that no longer matched the CSS they came from. The design system is a `globalDependencies` entry now. **That was latent for every token change, not just this one**, and it is the same shape as the generator faults already in this log: a generated artifact failing by doing nothing.

**Design system impact:** two things worth carrying back. `assets/brands/README.md`-style guidance would help for `assets/prism/`: the textures ship as PNG and both clients want WebP, which more than halved them here, partly because the PNGs carry C2PA metadata. And the handoff's step 1 says to replace `.claude/skills/offload-design/` wholesale, which would have deleted thirteen `--wash-*` tokens that seven files in `apps/web` read: the project's `tokens/atmosphere.css` is now the prism tokens alone, while the checked-in one is the marketing atmosphere. The two want different filenames, or the handoff wants a warning.

### 2026-09-08 · The field follows the composer, because the composer is what it is for
**Surface:** mobile

**Is:** the prism band renders behind whichever composer is on screen. With nothing raised that is the plate's, with a conversation raised it is the sheet's, and it is never both at once. The tab row carries no field of its own.

**The design's model does not survive this app's layout, and the difference is old.** The handoff is explicit: one field over one continuous plate whose height never changes, and a raised sheet *rests on* the plate rather than taking the composer up with it. That works because in the kit the plate keeps its composer while raised. This app hides it, because the raised sheet brings its own and two composers would compete for the keyboard, which is a decision that predates the field by weeks.

**What that cost, seen on a Pixel rather than reasoned about.** With the field pinned to the plate, a raised conversation collapsed its box to the tab row: the whole texture and its veil squashed into about seventy points, `--prism-veil-reach` landed mid-label instead of above it, and colour sat behind Tonight, My threads and Memories. That is the one outcome the veil's stops exist to prevent, since `--text-tertiary` is exactly 4.5:1 with nothing spare.

**Moving the field rather than splitting it.** The warning against two fields is about two *simultaneous* boxes, each mapping the whole texture, squashed and broken at a seam. There is only ever one here. And the band the eye sees is unchanged: the sheet's composer sits directly on top of the tabs, so it is the same composer-above-tabs strip, just owned by a different component.

**Design system impact:** worth a line on `PrismField`. The contract assumes the field's box is stable, and the thing that actually has to be stable is the composer band, whoever draws it. A host whose composer moves between surfaces needs the field to move with it, and the rule to state is one field on screen at a time rather than one field per surface. Also worth knowing that at a tab-row height the veil's stops stop protecting the labels, which is a failure mode nothing in the contract currently warns about.

### 2026-09-08 · A proposed calendar write is answered in the reply that mentions it
**Surface:** mobile, web

**Is:** when offload proposes a calendar write it cannot make on its own, the reply carries the control that answers it: one line naming who finds out, then **Add it** and **Not now**.

**It shipped without one, which made the safety mechanism a dead end.** A write that reaches somebody else, guests or a calendar marked shared, becomes a proposal rather than a write. The server side was complete: a row, an endpoint, the outward test re-run against live state on confirm. Nothing rendered it. offload announced that it was waiting, and the proposal expired an hour later having done nothing. For a calendar shared with somebody, which is the common case, that was every write.

**In the reply, not a screen of its own**, and the reason is the house rule this product already follows for failures: a sentence cannot be clicked, so the thing that acts on it sits next to the thing that said it. It is also the only place it could be: the sole origin of an outward write is a model tool call inside a turn, since no screen writes to a calendar.

**One line, two controls, no explanation.** "Ana will be told." or "Everyone on this calendar will see it." Nothing about why offload is asking, because the controls beside it are the answer and a paragraph would be offload diagnosing itself.

**It survives a reload**, returned with the conversation as well as with the turn, so backgrounding the app mid-decision comes back to the same question rather than to a reply about something that never happened.

**Design system impact:** this is the control the 8 September entry said nothing draws yet, and now something does. It is not a destructive-action dialog, because nothing is being destroyed, and not a toast, because it has to be answered before anything happens. Worth a contract: a reply-attached decision with a named consequence, a primary action and a quiet decline, on both phone kits and `WMisc.jsx`'s conversation. The wording of the consequence line is the app's, not the design system's, since it is a claim about somebody else's data.
