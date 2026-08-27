The standard text action, one solid ink button per screen at most, everything else secondary, quiet or ghost.

```jsx
<Button variant="primary" size="lg" block>Save to offload</Button>
<Button variant="secondary" icon="users">Share</Button>
<Button variant="ghost" size="sm" iconAfter="chevron-right">See all</Button>
```

Variants: `primary` (ink fill, white label), `secondary` (hairline outline on paper), `quiet` (grey fill, no border), `ghost` (chromeless). Hover darkens or fills; press scales to 0.98. Use `shape="pill"` only for floating actions.

Drawn height and touch height are separate: `sm` paints 32px tall but is 44px tappable (`hitArea`, 44 by default), with the extra height cancelled by a negative margin so layout is unaffected.
