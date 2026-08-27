/** Lucide glyph rendered as a currentColor mask. offload's only icon primitive. */
export interface IconProps {
  /** Lucide icon slug, kebab-case (e.g. "mic", "map-pin", "check-check"). */
  name: string;
  /** Square px size. 18 inside rows, 20 in bars, 24 for primary actions. */
  size?: number;
  /** Override the glyph source. Defaults to window.OFFLOAD_ICON_BASE, else the CDN. */
  basePath?: string;
  style?: React.CSSProperties;
}
export declare function Icon(props: IconProps): JSX.Element;
