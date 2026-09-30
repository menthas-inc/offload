A long press on a content row opens this, and so does a tap on somebody else's row, which has no edit sheet; a swipe still deletes. In a thread it carries When, Edit, **Labels**, Move, Mark done and the one way out, in that order. Sheet's geometry, an action list instead of a body.

Never draw an action this account cannot take. On web the same set belongs behind the row's More glyph rather than in a sheet.

```jsx
<RowActionSheet open={open} onClose={close} subject="Tram 28 route map"
  actions={[
    {label:"Edit",icon:"pencil",onSelect:edit},
    {label:"Archive",icon:"archive",onSelect:archive},
    ...(row.canDelete?[{label:"Delete",icon:"trash-2",danger:true,onSelect:remove}]:[])
  ]}/>
```
