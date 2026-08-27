Separates the sections of a screen. 21px semibold in ink over a full-width ink rule, sentence case, so it is always larger and darker than the row titles beneath it. The rule is what does the separating, so sections never collide.

```jsx
<SectionHeader count={8}>Priority</SectionHeader>
<SectionHeader action="Open calendar">On the clock</SectionHeader>
```

Counts go in `count` (a grey pill beside the title, tabular figures) and affordances in `action`. Both sit in the same left-aligned run as the title, so the eye reads title, count, action in one pass; pass `alignAction="right"` only when an action genuinely belongs at the far edge. 32px of space above, 20px below, so the section that follows has room. Sentence case, never uppercase.
