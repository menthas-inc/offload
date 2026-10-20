`LayoutTile` is the option a thread's layout is picked by. Use it only in the Layout picker (Edit thread, New thread, the web's Edit thread popover) and, at `size="sm"`, in a menu row that names a layout.

- Six values, a closed set: `default`, `todo`, `events`, `gallery`, `project`, `timeline`. Shown names: Default, Todo list, Events, Gallery, Project, Timeline.
- Put six side by side in a `role="radiogroup"` labelled "Layout", in that order, gap 10. Phones scroll sideways; the web wraps.
- `selected` on exactly one. Never draw the thread's own content in the tile.
- Under the picker, when offload chose the layout and it is not Default, one line on `--surface-fill`, radius 12: sparkles glyph and "offload picked {Name} when it made this thread."
