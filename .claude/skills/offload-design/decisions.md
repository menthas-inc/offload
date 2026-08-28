# Decision log

Append only. Newest first. Both the codebase and the design system write here.

Format and the meaning of each field: `handoff/CONTRIBUTING.md`.

When design and code disagree, **code leads**. A decision recorded here from the codebase is
the new truth, and the design system is updated to match on the next sync.

---

## Open

### 2026-08-28 · One dump can now become several things, and nothing draws that
**Surface:** iOS, Android, web
**Raised by:** the codebase, after the product owner asked for it from earlier story notes.
**What changed:** a dump is no longer always one thing. Describing your day in a voice note should
produce the tasks in it, so the sorter can now extract several things from one dump. The record of
what was handed over stays a thing in its own right, and everything extracted from it points back
at that record, which is what keeps Undo a single action.
**What is missing, three questions:** what appears on Today in the moment a dump lands, before the
sorter has decided whether it is one thing or four. What the toast says, since "Saved to Lisbon
trip" assumes one destination and four things may land in three threads. And whether the verbatim
record should sit on Today alongside the tasks it produced, which is honest but duplicative when
the record is a paragraph of speech and the tasks restate it, or fold away behind them, which is
cleaner but hides what the person actually said.
**Worth knowing:** the kits already draw a dumped voice note as a row in its own right, `Oak
brackets, 30cm, matte black · Bookshelf build · voice note, 0:14`, so the record-as-a-thing idea
is already in the design. What is new is the case where that record also spawns others.
**Design system impact:** the Today row spec and the undo toast copy in all three kits, and
possibly a grouping treatment for a record and its derived things. The schema supports whichever
answer design picks. Not yet done.

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
