Glyph-only action. Default is ghost so it disappears into the chrome until touched.

```jsx
<IconButton icon="ellipsis" label="More" />
<IconButton icon="arrow-up" label="Send" variant="primary" size="md" />
```

Ghost in app bars and list rows; `primary` circle for send/capture; `quiet` for attachment rails. Always pass `label`.

The drawn box and the touch box are separate: a `sm` button paints at 32px but stays 44px tappable via `hitArea` (44 by default), with negative margins so layout still measures from the visual. Pass `hitArea={0}` only for a glyph sitting inside a row that is already tappable.
