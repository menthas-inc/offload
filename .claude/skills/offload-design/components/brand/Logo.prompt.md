The offload mark, a dot falling into an open vessel. Use `lockup` in app bars, headers and sign-in; `mark` alone only where the name is already present (app icon, favicon, avatar).

```jsx
<Logo size={21} />
<Logo variant="mark" size={28} tone="inverse" />
```

Rules: the vessel never gains a lid, the dot never touches it, the mark is one colour, ink on light, paper on ink, no greys and no accent. Clear space on all sides equals the diameter of the dot. Minimum size 16px; below that use the wordmark alone. Static SVGs live in `assets/mark.svg`, `assets/mark-inverse.svg` and `assets/app-icon.svg`.
