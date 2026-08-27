Filter / thread / tag pill, 30px tall. Moss tone marks something offload inferred rather than something you typed.

```jsx
<Chip selected onClick={()=>{}}>All</Chip>
<Chip icon="sparkles" tone="accent">Lisbon trip</Chip>
<Chip tone="outline" onRemove={()=>{}}>bookshelf</Chip>
```

`selected` reads on every tone, not just neutral: each tint inverts to its own filled colour (accent to moss-600, attention to blue-600), so a filter chip always shows whether it is the active filter.

Drawn 30px tall; an interactive chip still accepts a 44px tap via `hitArea`, with the extra height cancelled by a negative margin.
