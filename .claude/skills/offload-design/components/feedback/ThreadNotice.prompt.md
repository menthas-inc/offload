A full-width strip under a thread's bar: who it's from, one line of at most two lines, one underlined word to act on, and an x.

```jsx
<ThreadNotice message="Looks like a trip or event, switch to the Events layout?" action="Switch" onAction={switchLayout} onDismiss={dismiss} />
<ThreadNotice from="person" initials="SK" hue="var(--label-7)" message="Sam switched this to the Events layout" action="Change" onAction={openLayout} onDismiss={seen} />
```

- offload's notices are moss with white text; a person's are ink. Never the soft moss tint.
- Write the line to fit two lines at 375 wide: about 55 characters.
- After the action, draw `UndoLine form="under"` in its place. For a layout switch the message is *Showing as Events. You can always change this in thread settings.*
- Dismiss is permanent and server side.
