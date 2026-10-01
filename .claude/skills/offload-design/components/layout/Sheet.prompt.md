Everything modal is a bottom sheet, no centre dialogs, no full-screen takeovers. Positioned absolutely, so give the parent `position:relative`.

```jsx
<Sheet title="Move to a space" onClose={close}
  footer={<><Button variant="secondary" block>Cancel</Button><Button variant="primary" block>Move</Button></>}>
  <ListRow title="Lisbon trip" meta="6 notes" border={false} />
</Sheet>
```

**A row sheet's foot is three 30px pills**: the way out on the left (Delete in clay, Archive, Put back, or Clear), Cancel and the confirming action on the right. Save where it writes, Done where it hands back to a sheet that will. They wrap at a large text size rather than pushing Save off the edge. **A sub-section opens in place**, as a panel inside the same sheet, and confirms with Done; it does not open a second sheet over the first.

**Every sheet drags** (30 September): a grabber on every sheet, 36 by 4 on iOS widening to 44 while held, M3's 32 by 4 on Android; to a screen reader it is the Close button. A release past a quarter of its travel or a flick closes it on `--spring-sheet-stiffness` and `--spring-sheet-damping`, and a drag is Cancel. **A field in a sheet is focused as the sheet starts to rise**, and the sheet opens from the keyboard's edge; closing any sheet puts its keyboard away. **The scrim is `--surface-scrim`, dark ink in both themes, 35% in light.** **A sheet over a sheet draws no scrim of its own**, so the page stays at one dim however many sheets are up.
