# Apply: the rail's two tiers

Design for 015's rail, decided 14 September 2026 off `explorations/rail-blue.html` with the product
owner. Seven options drawn, in light and dark; the dark frame is what decided it.

**Nothing here changes what the rail is or how it behaves.** Same cells, same dots, same month
mode, same picking. What changes is how a day says it has something on it, plus one state that did
not exist.

The rule behind all of it: **blue keeps the two meanings that are about time**, today and the day
being read. Everything about content moved off the hue, because with the waiting chip and the task
dot included, blue was carrying five meanings on one screen.

---

## 1. Tier one: a day with something on it is a lift

Replaces the ring and glow entirely. **Delete** the current `[data-has]` box-shadow.

| | Light | Dark |
| --- | --- | --- |
| Background | `--surface-raised` | `--surface-raised` |
| Border | `1px --border-lift` | `1px --border-lift` |
| Shadow | `--shadow-1` | `--shadow-2` |

**`--border-lift` is new and resolves per theme**: `--border-hairline` in light, `--ink-300` in
dark. It is an alias rather than a ramp reference on purpose, the same fix `--surface-noticed` got.

**Why the two themes differ.** `--shadow-1` is the keyword `none` in the dark scope, so there the
edge is the whole of the lift: the hairline measures 1.23:1 against the page and `--ink-300`
measures 1.94:1. The light ratios are lower still, a 1.05:1 fill and a 1.14:1 hairline, and they
are fine, because **a ratio is the wrong instrument for a shadow**: light has a blurred `0 1px 2px`
drop that reads as depth, and `--shadow-2` in dark is a hard 1px line at 4% that adds none.

**Do not write `box-shadow: var(--shadow-1), var(--shadow-2)` to cover both.** `none` is not a legal
item in a comma-separated shadow list, so the whole declaration is dropped in dark. Scope the two
rules per theme.

## 2. Tier two: a day carrying a decision takes an amber ring

New state. A due date, a proposal waiting, a question nobody answered.

```css
/* light: the ring plus the drop shadow that scope has */
.railDay[data-decision] {
  box-shadow: inset 0 0 0 1px var(--border-decision), var(--shadow-1);
}
/* dark: the same ring plus the only shadow that scope has. Two rules, never one list:
   --shadow-1 is the keyword `none` here and `none` is not legal in a shadow list, so a
   combined declaration is dropped and the ring disappears with it. */
[data-theme="dark"] .railDay[data-decision] {
  box-shadow: inset 0 0 0 1px var(--border-decision), var(--shadow-2);
}
```

**`--border-decision` is new too**, resolving to the ink amber in each scope, #7A4E02 on white and
#F6C86A on #212121, measuring 7.2:1 and 10.27:1 on the lift. **Never `--surface-noticed`**, which is
a fill: as a 1px ring on the white lift it measures 2.03:1.

**It layers with tier one rather than replacing it**, because a day with a decision on it also has
content.

## 3. How the two tiers layer with the date states

**The border says things about the date. The inset says things about the content.** That is the
architecture the rail already had, and both tiers follow it.

- **Today** is `border-color: --border-focus`, over either tier. Today with a decision on it is a
  blue border with an amber ring 1px inside it, which is the one composite worth looking at on a
  device before this ships.
- **The day being read** is unchanged: the `--surface-attention` fill, its border painted to match
  the fill, `box-shadow: none`, and the number, the weekday and every dot going `--text-on-solid`.
  It suppresses both tiers, because that day's contents are listed directly underneath it.

**One ordering trap.** The lift sets a border colour at the same specificity as today's rule, so if
today is declared first it loses and today comes out wearing the hairline. **Declare today's border
after the lift**, and exclude the read day from both.

## 4. An empty day steps back, and today never does

```css
/* a day with nothing on it */
color: var(--text-tertiary); font-weight: var(--weight-regular);
```

This is the half that makes tier one work. A tint darkens the ground under a number, which is why
the grey version of the lit state read as *less* prominent than an empty day: **a wash dulls, an
edge and a lift advance.** So the lit day advances and the empty day recedes.

**Today is exempt.** A day with nothing on it is still today, and before this only past and outside
days were demoted. A rule that demotes empty days will catch today on any week where today is
empty, which is most weeks.

## 5. A dot on a lift takes the text alias of its kind

Moving the ground moved the dots. Measured on the lift, two of the four kinds failed:

| Kind | Was | On the lift | Now |
| --- | --- | --- | --- |
| task | `--surface-attention` | 6.16:1 light, **2.62:1 dark** | `--text-attention`, 6.16 / 7.13 |
| note | `--surface-noticed` | **2.03:1 light**, 7.92 dark | `--text-noticed`, 7.2 / 10.27 |
| event | `--text-primary` | 19.68 / 13.75 | unchanged |
| other | `--text-tertiary` | 5.1 / 5.38 | unchanged |

**Same cause in both: a fill alias on a ground that moves.** `--surface-attention` and
`--surface-noticed` are deliberately fixed across themes, which is right for a chip and wrong for a
5px mark whose backdrop now changes with the theme. Event and other already used text aliases and
already passed, which is what makes this a rule rather than two patches.

The note dot at 2.03:1 was also the exact figure that disqualifies `--amber-600` as a ring, so this
applies the same standard to the same colour on the same ground.

**`--text-noticed` is new**, the ink-weight counterpart to `--surface-noticed`, sitting beside it the
way `--text-accent` sits beside `--surface-accent-soft`. It resolves to the same value as
`--border-decision` today and is a separate token on purpose: one means "offload noticed this" and
the other means "this needs an answer", and a note dot painted with the decision token would tell a
reader the note needs one.

**The read day is unchanged:** every dot still goes `--text-on-solid` there.
## 6. Two things that are no longer needed

- **The `--text-secondary` fix for `.railDow` and `.railMore` is off.** It was needed because both
  sat on the blue tint at 3.5:1 in light and 3.0:1 in dark. With the tint gone they sit on the lift
  and measure **5.1:1 and 5.38:1**, so leave them `--text-tertiary`.
- **The dark pass the earlier draft asked for is off.** The shipped lit state does not disappear in
  dark: its ring measures 3.55:1 there and the glow only grades it. The reason for this change is
  blue carrying five meanings, not legibility, and the log records the correction.

## 7. Surface notes

- **The phones and the web disagree on two numbers**, both intentional: the weekday letter is 11px
  on the phones against `--size-caption` on web, and the overflow count is 10px against
  `--size-caption`.
- **`decisions.md`'s 11 September entry is out of date about React Native.** It says the phones hold
  the rail's geometry with a 1px border because RN has no inset shadow. `Timeline.tsx` already draws
  the same blurred inset `boxShadow` the web does, natively on RN 0.86. Nothing in this note depends
  on it, since neither tier uses a blurred inset, but that entry wants a line.

## Open, and it needs a product answer before this is built

> **Parked 14 September 2026.** Put to the product owner with 016 and 017 and
> answered "doesn't matter for now". Both questions below stand unanswered
> rather than resolved, so this is where to start when the tier is wanted.

- **What counts as needing a decision.** A due date and an unanswered proposal are clear. An
  overdue thing is arguably louder than either and nobody has said so. A task with no date is not a
  decision.
- **One amber at two levels.** Once section 5 lands, `--text-noticed` and `--border-decision` resolve
  to the same ink amber. The question is whether one amber reading at two levels, the
  thing and the day, a 5px fill against a 1px edge, is legible as two signals. I think it is. **If it
  is not, the note dot moves rather than the ring**, since the ring is the newer signal and the one
  with nowhere else to go.

## Still not drawn anywhere

There is no governed component for a day cell or a week rail on any surface, and the kits'
`TimelineWidget` is three shapes behind the shipped rail. That is the next thing to build, and it is
bigger than this note.
