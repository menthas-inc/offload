A person's label inside a thread, on the row's marks line after the date chip. The label's own solid, white words, 20px tall.

```jsx
<LabelMark color={1}>Lisbon</LabelMark>
<LabelMark color={2} size={24} onClick={openLabel}>Paris</LabelMark>
```

- A row can carry several. They wrap on the marks line with the date chip; a row with no date and no label has no marks line.
- The colour is the label's, stored as 1 to 10. A new label takes the lowest number its thread is not using. Never moss: an offload-applied label looks like any other.
- The filter bar is `Chip` with `label`, which draws the dot and fills with the label's colour when selected.
- In the turn footer it is `size={30}`, the footer's height, three and then "and N more".
- On a note row the phones draw a label as a dot at the trailing edge, not a mark.
