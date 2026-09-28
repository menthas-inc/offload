Filter and thread pill, 30px tall. Moss tone marks something offload did rather than something you typed; a label is never moss.

```jsx
<Chip selected onClick={()=>{}}>All</Chip>
<Chip label={1} selected onClick={()=>{}}>Lisbon 3</Chip>
<Chip label={2} onClick={()=>{}}>Paris 3</Chip>
<Chip icon="lasso">Lisbon trip</Chip>
<Chip tone="outline" onRemove={()=>{}}>bookshelf</Chip>
```

`selected` reads on every tone, not just neutral: each tint inverts to its own filled colour (accent to moss-600, attention to blue-600), so a filter chip always shows whether it is the active filter. **With `label` it fills with the label's own colour**, and the dot turns white.

The label filter bar: All, each label with its count, No label in outline, and a trailing `plus` chip pinned to the edge. With no labels yet, on a thread of six or more things, the bar is one outline chip, "Group with labels".

Drawn 30px tall; an interactive chip still accepts a 44px tap via `hitArea`, with the extra height cancelled by a negative margin.
