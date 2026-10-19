/**
 * A thread layout, drawn small (19 October 2026). The picker's option in Edit thread and New
 * thread on all three surfaces: a row of six, scrolling sideways on the phones, wrapping on the
 * web, inside a `radiogroup` labelled "Layout".
 *
 * Six layouts, a closed set mirrored by `threads.layout`: **default** (the page as built),
 * **todo** ("Todo list"), **events**, **gallery**, **project**, **timeline**. The marks are
 * abstract and never show the thread's own content.
 *
 * md is 64 by 78, radius 11, the picker size. sm is 44 by 54, radius 9, for menus and rows.
 * Selected: `--surface-raised` with a 2px `--text-primary` ring and the name in semibold.
 * Unselected: `--surface-fill` with a hairline. The name sits 6px under the tile, 12px.
 */
export interface LayoutTileProps {
  layout?: "default" | "todo" | "events" | "gallery" | "project" | "timeline";
  /** Default md. */
  size?: "sm" | "md";
  selected?: boolean;
  /** Override the name under the tile; pass "" to draw the tile alone. */
  label?: string;
  onPress?: () => void;
  style?: React.CSSProperties;
}
export declare function LayoutTile(props: LayoutTileProps): JSX.Element;
