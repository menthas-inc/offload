Renders a Lucide glyph as a mask filled with `currentColor`, so it always matches the text it sits beside.

```jsx
<Icon name="mic" size={20} />
<span style={{color:"var(--text-tertiary)"}}><Icon name="clock" size={16} /></span>
```

Only Lucide, stroke 2, no fills. Sizes: 16 (metadata), 18 (list rows), 20 (bars, buttons), 24 (primary capture actions).

Glyphs come from the jsDelivr copy of `lucide-static` by default. To use the vendored SVGs in `assets/icons/` instead, offline-safe, and the only way to redirect the glyphs that other components render internally from an `icon` slug, set the base once before mounting:

```html
<script>window.OFFLOAD_ICON_BASE="../../assets/icons/"</script>
```
