Wraps a list row so a left swipe parks it open over a Delete action, for lists where removing something should be quick but never accidental.

```jsx
<SwipeRow onDelete={() => remove(item.id)}>
  <ListRow title={item.title} meta={item.meta} onClick={open} />
</SwipeRow>
```

Nothing is deleted by the gesture itself: the row parks open and waits for a tap, and the tap should raise an undo toast rather than destroy the record. Opening one row closes any other. Pass `background` when the row sits on something other than the page, e.g. `background="var(--surface-fill)"` inside a settings group, or the action shows through the sliding surface. `label` renames the action and `revealWidth` widens the reveal.
