A follow-up question answered with a tap instead of a sentence.

```jsx
// A proposal: one primary, one plain way out. 012's calendar control is this shape.
<QuickReplies onPick={answer} options={[
  {id:"yes",label:"Add it",kind:"primary"},
  {id:"no",label:"No",kind:"plain"}
]} />

// A choice among equals: no primary, because offload does not know which.
<QuickReplies onPick={answer} note="Or name another one." options={[
  {id:"lisbon",label:"Lisbon trip",kind:"thread",icon:"lasso"},
  {id:"istanbul",label:"Istanbul, October",kind:"thread",icon:"lasso"}
]} />
```

- Picking writes the label into the log as an ordinary turn of yours, and the chips go.
- One open question at a time. The next turn closes the last one, whatever it says, so a
  yes cannot arrive four turns late.
- Nothing that deletes, archives or empties gets a chip.
- If the write is reversible, do it and offer Undo instead of asking at all.
