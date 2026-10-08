# Apply: dark theme, edges

Drawn in `explorations/dark-contrast.html` (twelve screens of `main` at `60d4e15` on iOS, Android and web, four
options, contrast measured from the rendered colours) with the product owner on 7 October 2026. Option **B, Edges**.
Reference: `handoff/dark-contrast-standalone.html`. Readme: **Dark theme**, then **Edges**. Log: *2026-10-07 · Dark
theme: edges*. **Light does not change anywhere.**

## 1. Tokens: run `pnpm tokens`

Everything in this section is in `tokens/colors.css` and `ui_kits/android_app/index.html`, which `generate.mjs`
already reads. Nothing to type by hand: web CSS, NativeWind classes, `resolved` and `android` all follow.

| Token, dark | Was | Is | Measured |
| --- | --- | --- | --- |
| `--surface-page` | #1C1B19 | #1A1A19 | |
| `--surface-raised`, `--surface-card` | #212121 | #232323 | |
| `--surface-sunken` | #101010 | #0E0E0E | |
| `--ink-100` (so `--surface-fill`, `--state-selected`) | #232323 | #2B2B2B | fill on page 1.10 → 1.23 |
| `--ink-150` (`--surface-fill-strong`) | #2C2C2C | #333333 | |
| `--ink-200` | #383838 | #575757 | spinner track, scrollbar |
| `--ink-300` | #4A4A4A | #5C5C5C | waveform remainder |
| `--border-hairline` | `var(--ink-150)` | #444444 | on a card 1.15 → 1.61 |
| `--border-lift` | `var(--ink-300)` | #5C5C5C | on the page 1.94 → 2.60; the web's off switch 1.82 → 2.35 |
| `--border-strong` | #777777 | #8C8C8C | 3.60 → 4.67 |
| `--text-tertiary` | #959595 | #A0A0A0 | on the fill 5.41 |
| `--blue-700` | #5273E8 | #8BA1F7 | on blue-100 3.27 → 5.60; Android's `text-blue-700` links |
| `--moss-700` | #5A8E6C | #80B994 | on moss-50 3.81 → 6.40; Suggestion's Move, the Mail mark |
| Android `--a-outline` | #3A3937 | #4A4948 | on `a-c-low` 1.38 → 1.77 |
| Android `--a-on-quiet` | #8B8B87 | #9C9C98 | |

**New, in all three scopes.** Transparent in light, so a component paints its edge unconditionally:

| Token | Light | Dark | For |
| --- | --- | --- | --- |
| `--edge-card` | transparent | `--border-lift` | a grouped list of rows; a neutral chip; Android's `a-c-low` cards |
| `--edge-well` | transparent | `--border-hairline` | a well inside a list: tile, search field, segmented track, event card |
| `--edge-noticed` | transparent | #84682D | the soon chip, a noticed tag (2.50:1 on its ground) |
| `--edge-danger` | transparent | #82423B | the late chip, a failure block (2.06:1) |
| `--edge-accent` | transparent | `--border-accent` | anything on `--surface-accent-soft` |
| `--edge-attention` | transparent | `--border-attention` | anything on `--surface-attention-soft` |
| `--edge-hue` | 0% | 38% | a memory kind's or label's ring, as a share of its hue |
| `--hue-ink-mix` | 78% | 50% | a memory kind's words, mixed with `--text-primary` |

`generate.mjs`: `transparent` and the two percentages are not colours, so `toChannels` drops them and no
NativeWind class is made. That is fine: the phones read them from `resolved` (item 3). The `unresolved` check passes.

## 2. Web: the edge, one line per surface

`box-shadow: inset 0 0 0 1px var(--edge-…)`, added to (not replacing) any shadow already there. No
`[data-theme]` selector, since light is transparent.

| File | Class | Edge |
| --- | --- | --- |
| `today.module.css` | the To do and If you have time cards (the `--surface-fill` boxes at 250, 355, 407) | `--edge-card` |
| `today.module.css` | the Needs you card by tone | `--edge-danger`, `--edge-attention`, `--edge-accent` |
| `shell.module.css` | `.chip` (3051) | `--edge-card`; `.chipLate` `--edge-danger`; `.chipSoon` `--edge-noticed` |
| `shell.module.css` | every `--surface-fill` box that holds rows (thread lists, settings groups, row tools) | `--edge-card` |
| `shell.module.css` | `.segment` tracks, the search field, row tiles | `--edge-well` |
| `shell.module.css` | `--surface-accent-soft` boxes (515, 1806, 1864, 1959, 3420) | `--edge-accent` |
| `shell.module.css` | `--surface-noticed-soft` (3368), `--surface-danger-soft` (3466) | `--edge-noticed`, `--edge-danger` |
| `labels.module.css` | `.chip` at rest (123) | `--edge-card` |
| `memories.module.css` | `.searchField`, `.why`, `.head em` | `--edge-well` |
| `memories.module.css` | `.kind` at rest | `inset 0 0 0 1px color-mix(in oklch, var(--k) var(--edge-hue), transparent)` |
| `memories.module.css` | the `[data-k]` block | `--ki: color-mix(in oklch, var(--k) var(--hue-ink-mix), var(--text-primary))` |
| `answer.module.css` | the accent rows (41, 184); the fill rows (113, 169) | `--edge-accent`; `--edge-well` |
| `people.module.css` | `--surface-accent-soft` cards (204, 463); fill lists (66, 335, 394, 534, 661) | `--edge-accent`; `--edge-card` |
| `loose/loose.module.css` | the suggestion (100); the group (188) | `--edge-accent`; `--edge-card` |
| `auth.module.css` | `.refusal` | `--edge-attention` |
| `shell.module.css` | `.sidebar` | `:global(html[data-theme="dark"]) .sidebar { box-shadow: inset -1px 0 0 var(--border-lift) }`. The sidebar is a dark region in both themes, so its own `--edge-card` is always dark; key it off the page. |

Find the rest with `rg "background: var\(--surface-(fill|accent-soft|attention-soft|noticed-soft|danger-soft)\)" apps/web/src`:
a box that holds rows takes `--edge-card`, a control or well `--edge-well`, a tint its own.

**Two fixes the lighter `--moss-700` needs:** `auth.module.css` `.adminLink` and `admin.module.css` line 18 paint
`--moss-700` under white words. Move both to `--surface-accent` (moss 600 in both themes); hover `--moss-600`
becomes `color-mix(in srgb, var(--surface-accent) 88%, black)`. In dark `-700` is a text step, as `--clay-700` already is.

## 3. Phones

**`lib/colors.ts`** gains six colours and two shares, from `resolved` like the rest:

```ts
edgeCard: base["edge-card"]!, edgeWell: base["edge-well"]!, edgeNoticed: base["edge-noticed"]!,
edgeDanger: base["edge-danger"]!, edgeAccent: base["edge-accent"]!, edgeAttention: base["edge-attention"]!,
edgeHue: parseFloat(base["edge-hue"]!) / 100, hueInkMix: parseFloat(base["hue-ink-mix"]!) / 100,
```

Drawn as `style={{ boxShadow: \`inset 0 0 0 1px ${COLOR.edgeCard}\` }}`, the string form `shadowRaised` already
uses, so the edge takes no layout and a transparent one in light is nothing. **Not a `border`**, which would move
every row 1px in light.

| File | Where | Edge |
| --- | --- | --- |
| `today/TodayScreen.tsx` | `card` (256), both platforms | `edgeCard` |
| `today/DayParts.tsx` | 149, the unraised card; 48, the 40px well | `edgeCard`; `edgeWell` |
| `settings/Rows.tsx` | the group (77) | `edgeCard` |
| `shell/DateChip.tsx` | the chip, by tone | later `edgeCard`, soon `edgeNoticed`, late `edgeDanger` |
| `labels/Chip.tsx` | neutral (80) | `edgeCard` |
| `labels/FilterBar.tsx` | 93 | `edgeWell` |
| `Segmented.tsx` | both tracks (45 on iOS, 80) | `edgeWell` |
| `shell/ContentRow.tsx` | the tile (417, 446) | `edgeWell` |
| `screens/Memories.tsx` | the search field (176), the count pills (272) | `edgeWell` |
| `screens/MyThreads.tsx` 246, `screens/Thread.tsx` 1103 | count pills | `edgeWell` |
| `screens/Activity.tsx` | the tag (137) | noticed `edgeNoticed`, else `edgeWell` |
| `people/RequestCard.tsx` 44, `people/InvitationStrip.tsx` 23 | iOS `bg-surface-accent-soft`; Android `a-c-low` | `edgeAccent`; `edgeCard` |
| `loose/Suggestion.tsx` | the move suggestion (56) | `edgeAccent` |
| `ConsentTicks.tsx` 124, `SignIn.*` / `NoInvite.*` refusal | `bg-surface-attention-soft` | `edgeAttention` |
| `people/NewConnection.tsx` 203, `people/ConfirmSheet.tsx` 91 | fill rows | `edgeCard` |
| `memories/MemoryEditor.tsx` | kinds at rest (211); the why block (233) | the kind's hue at `edgeHue`; `edgeWell` |
| `memories/MemoryListRow.tsx`, `MemoriesMap.tsx` | the kind's words, where 0.78 is mixed by hand | `hueInkMix` |

Android: every `bg-a-c-low` card that holds rows takes `edgeCard`, as the iOS fill does.

## 4. Check

- Light: a screenshot diff of Today, a thread, Settings and Memories on each surface shows nothing.
- Dark: on the twelve screens of the reference file, every list, chip and tint has a visible edge.
- `apps/mobile/test/colors.test.ts`: `paletteFor(false).edgeCard === "transparent"`, and dark equals `resolved.dark["border-lift"]`.

## Not in this pass

A (Steps), C (Colour: tonal labels and thread icons in dark) and D. The kit's own `Chip` paints its selected
accent, attention and danger tones on the `-700` step, which in dark is a text step; nothing on `main` draws those,
so it waits.
