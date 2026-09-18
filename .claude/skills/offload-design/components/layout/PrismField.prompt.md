Colour on the phones. Frozen at rest, warps for two seconds when offload files something.

Two surfaces only: inside the bottom plate, and behind the sign-in lockup. Never under a scrolling list, because `--text-tertiary` has no contrast headroom and every row's trailing time uses it.

The host page sets `window.OFFLOAD_PRISM_BASE` once, the way it already sets `OFFLOAD_ICON_BASE`.

Inside a plate the plate gives up its own fill: the field goes in as the first child, `veil="graded"` supplies the fill above it, and the plate needs `overflow:hidden` so the field is clipped to its rounded top corners.

```jsx
// the bottom plate, App.jsx
<div style={{position:"relative",zIndex:9,overflow:"hidden",background:"transparent",
  borderRadius:"var(--radius-xl) var(--radius-xl) 0 0",boxShadow:"var(--shadow-sheet)"}}>
  <PrismField variant="band" veil="graded" pulse={filedCount}/>
  <Composer bare .../>
  <TabBar style={{background:"transparent",borderTop:"1px solid transparent"}} .../>
</div>

// the gate, FirstRun.jsx
<PrismField variant="bloom" veil="none" arriveOnMount
  style={{left:"-34%",top:"-20%",width:"120%",height:"58%",inset:"auto"}}/>
```
