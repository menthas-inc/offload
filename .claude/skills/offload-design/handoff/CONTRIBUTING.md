# Working on offload with Claude Code

This file is the working agreement between the codebase and the offload design system.
Read it before changing anything that has a visual result.

## Where things live

The offload design system is checked into this repository at:

```
.claude/skills/offload-design/
```

That path is not decorative. It is where Claude Code looks for project skills, and the
folder ships a `SKILL.md`, so the design system is discovered automatically: ask for offload
design guidance and Claude Code reads `readme.md` and works from the real tokens rather than
from memory.

| Thing | Location | Who owns it |
| --- | --- | --- |
| Design system (tokens, components, guidelines, kits) | `.claude/skills/offload-design/` | Design, until code contradicts it |
| Application code | wherever the platform puts it | Code |
| Decision log | `.claude/skills/offload-design/decisions.md` | Both, append only |

**Every design system path below is relative to that folder.** `tokens/colors.css` means
`.claude/skills/offload-design/tokens/colors.css`.

## The rule when design and code disagree

**Code leads.** If the implementation had to diverge from the kit, the implementation is
correct and the kit is now stale. Do not bend the code back to match a mock.

What you owe in return, every time:

1. Make the change in code.
2. Append one line to `decisions.md` (format below).
3. If the change is a token value, edit the token file in `tokens/` in the same
   commit. Token values are the one thing that must never exist in two versions.

Steps 1 and 3 are the same commit. Step 2 is what lets the design system catch up without
anyone reconstructing the reasoning three weeks later.

## Tokens

`styles.css` is the entry point and it is `@import` lines only. Link it, or import
the individual files under `tokens/`:

```
fonts · colors · typography · spacing · radius · elevation · motion · base
```

Rules:

- Never retype a hex value, a spacing step, a radius or a duration into application CSS.
  Reference the custom property. A literal `#3F6B4F` in a component is a bug.
- Use the semantic aliases, not the ramps. `--text-accent`, not `--moss-600`.
- Changing a token value is a design system change. Edit `tokens/`, log it, and it
  propagates. Adding a new token is also fine; adding a local one-off variable beside the
  system is not.
- `prefers-reduced-motion` is handled once, in `tokens/motion.css`, and it removes
  motion rather than shortening it. Do not write a second reduced-motion rule per component.

## Components

The kits under `ui_kits/` are **design references written in HTML and JSX for the
browser**. They are not production code and they should not be lifted directly. Recreate
them in the target environment using its own patterns.

What to carry across exactly: layout, spacing, type roles, copy, states, motion durations,
and the props contract in each component's `.d.ts`. Those `.d.ts` files are the closest
thing to an API spec this system has, so match the prop names when you build the real
component. It makes future diffs legible on both sides.

What to adapt freely: how the component is constructed, state management, styling mechanism,
accessibility implementation details as long as the outcome holds.

## Never hand-edit

`_ds_bundle.js`, `_ds_manifest.json` and `_adherence.oxlintrc.json` are
generated. Edits to them are overwritten. Change the source and let them regenerate.

`_adherence.oxlintrc.json` is worth wiring into the lint step: it is the machine-readable
version of the token rules above.

## Non-negotiables

These are product decisions, not styling preferences, and they should survive
implementation. If one of them has to break, that is exactly the kind of thing the decision
log exists for.

- **Vocabulary.** thread, thing, memory, dump, sorted, Undo. Not folder, item, space,
  project, capture, classified. This includes identifiers in code, not just UI strings.
- **No em dashes** anywhere: UI copy, marketing, comments, commit messages.
- **Sentence case everywhere**, including buttons and headers. The brand name is lowercase
  even at the start of a sentence.
- **One emoji**, 👀, on a message offload has seen but not answered. It needs a text
  alternative wherever it appears.
- **Undo lasts eight seconds** and nothing is destroyed while the toast is up.
- **44px minimum hit area**, which may be larger than the drawn control.
- **Contrast floor 4.5:1** for text, 3:1 for anything that outlines a control. The values in
  the tokens were measured against every surface in both themes. Do not lighten them.
- **Light is the default theme** for a new account, not the device setting.
- **Rows and bars take `min-height`, never `height`.** Text scales to 200% and nothing that
  holds text may have a fixed height.

## Known drift to fix on the way in

The kits' prototype fixture still calls a thread a **space** below the surface: `D.spaces` in
`data.js`, a `space` prop on the thread screens, and `"spaces"` as the second tab's key. The
screen files and their exported symbols were renamed to thread in August 2026; the data keys
were left alone because all three kits read that one fixture and renaming it risks the content
staying consistent across platforms.

Name it `thread` in the real data model from the first commit: table, field, route, type, prop.
The fixture's key names are prototype residue, not a schema.

## Decision log format

One block per decision, newest at the top of the log, under the date:

```markdown
### 2026-09-02 · Composer send is a hold, not a tap
**Surface:** iOS, Android
**Was:** Tap arrow-up to send.
**Is:** Tap sends, hold opens the voice note recorder.
**Why:** Voice turned out to be the primary input in testing and a second button crowded the composer.
**Design system impact:** Composer spec in the two mobile kits, plus the mic glyph note in readme.md.
```

**Design system impact** is the field that matters. It is the instruction to whoever updates
the kits. If a change has no design system impact, say `none` rather than leaving it out.

## Syncing back

The design system project reads this repo. On a sync it diffs against the last synced
commit, reads `decisions.md` and the changed files, and updates the kits, the
component specs and `readme.md` to match what the code actually does.

So: keep the log current and keep token edits in `tokens/`. Those two habits are the
entire contract. Everything else is recoverable from the diff.
