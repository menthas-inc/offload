# Decision log

Append only. Newest first. Both the codebase and the design system write here.

Format and the meaning of each field: `handoff/CONTRIBUTING.md`.

When design and code disagree, **code leads**. A decision recorded here from the codebase is
the new truth, and the design system is updated to match on the next sync.

---

## Open

Nothing open.

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
