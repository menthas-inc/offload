// offload's only icon primitive. From the design system's `core/Icon.jsx`.
//
// A Lucide glyph rendered as a CSS mask over `currentColor`, so an icon takes
// the colour of whatever it sits in and needs no variant per surface. The kit
// serves these from a CDN by default and from a vendored copy when
// `OFFLOAD_ICON_BASE` is set; we vendor, because the alternative is a third
// party on the critical path of every screen for eighty small files.
//
// `public/icons/` is a copy of `.claude/skills/offload-design/assets/icons/`.
// Copied rather than imported across the workspace boundary, which is the rule
// `apps/mobile/global.css` taught us the hard way.

const BASE = "/icons/";

export interface IconProps {
  /** Lucide slug, kebab-case. Must exist in `public/icons/`. */
  name: string;
  /** 18 inside rows, 20 in bars, 24 for primary actions. */
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

/** The name as a CSS url(), or `none` when it is not a plain slug.
 *
 *  A thread's icon name comes from the server, and a `")` in it would close
 *  the url() and open another: a fetch to wherever the rest of the string
 *  says (security review 2026-09-22, L30). */
export function iconUrl(name: string): string {
  return /^[a-z0-9-]+$/.test(name) ? `url("${BASE}${name}.svg")` : "none";
}

export function Icon({ name, size = 20, className, style }: IconProps) {
  const url = iconUrl(name);
  return (
    <span
      aria-hidden="true"
      className={className}
      style={{
        display: "inline-block",
        width: size,
        height: size,
        flex: "0 0 auto",
        background: "currentColor",
        WebkitMaskImage: url,
        maskImage: url,
        WebkitMaskSize: "contain",
        maskSize: "contain",
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat",
        WebkitMaskPosition: "center",
        maskPosition: "center",
        ...style,
      }}
    />
  );
}
