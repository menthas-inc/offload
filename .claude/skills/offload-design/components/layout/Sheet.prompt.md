Everything modal is a bottom sheet, no centre dialogs, no full-screen takeovers. Positioned absolutely, so give the parent `position:relative`.

```jsx
<Sheet title="Move to a space" onClose={close}
  footer={<><Button variant="secondary" block>Cancel</Button><Button variant="primary" block>Move</Button></>}>
  <ListRow title="Lisbon trip" meta="6 notes" border={false} />
</Sheet>
```

**A row sheet's foot is three 30px pills**: the way out on the left (Delete in clay, Archive, Put back, or Clear), Cancel and the confirming action on the right. Save where it writes, Done where it hands back to a sheet that will. They wrap at a large text size rather than pushing Save off the edge. **A sub-section opens in place**, as a panel inside the same sheet, and confirms with Done; it does not open a second sheet over the first.
