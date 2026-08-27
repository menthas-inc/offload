Everything modal is a bottom sheet, no centre dialogs, no full-screen takeovers. Positioned absolutely, so give the parent `position:relative`.

```jsx
<Sheet title="Move to a space" onClose={close}
  footer={<><Button variant="secondary" block>Cancel</Button><Button variant="primary" block>Move</Button></>}>
  <ListRow title="Lisbon trip" meta="6 notes" border={false} />
</Sheet>
```
