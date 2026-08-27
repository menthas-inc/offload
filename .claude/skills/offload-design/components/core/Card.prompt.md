A grouping surface with a 14px radius and a hairline border. Reach for `raised` only when the card genuinely floats above content. Passing `onClick` makes it interactive: the hairline goes ink blue on hover (never grey, which reads as disabled) and the card scales to 0.995 on press.

```jsx
<Card>
  <div style={{font:"var(--text-title-3)"}}>Lisbon trip</div>
  <div style={{color:"var(--text-secondary)",font:"var(--text-body-sm-role)"}}>6 notes · 2 people</div>
</Card>
```
