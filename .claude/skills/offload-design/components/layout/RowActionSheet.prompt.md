A long press on a content row opens this; a swipe still deletes. Sheet's geometry, an action list instead of a body.

Never draw an action this account cannot take. On web the same set belongs behind the row's More glyph rather than in a sheet.

```jsx
<RowActionSheet open={open} onClose={close} subject="Tram 28 route map"
  actions={[
    {label:"Edit",icon:"pencil",onSelect:edit},
    {label:"Archive",icon:"archive",onSelect:archive},
    ...(row.canDelete?[{label:"Delete",icon:"trash-2",danger:true,onSelect:remove}]:[])
  ]}/>
```
