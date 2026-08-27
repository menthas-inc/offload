Tick for lists and tasks, checking it strikes and greys the label, which is how a captured item reads as done.

```jsx
<Checkbox checked={done} onChange={setDone} label="Order the oak brackets" meta="added Tuesday" />
<Checkbox shape="circle" label="Book the hostel" />
```

The tick is an inline path, not an icon glyph, so it draws itself along its length in 220ms
when a task is ticked off. Both phone kits rely on that; do not swap it for `<Icon name="check">`.
