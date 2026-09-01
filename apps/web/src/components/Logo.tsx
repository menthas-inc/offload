// The mark: a dot above an open vessel, a thought let go of downwards into
// something that catches it. One colour, no greys, no accent. The vessel never
// gains a lid and the dot never touches it.
//
// Props match the design system's contract in components/brand/Logo.d.ts.
// They did not: this took no props at all and hardcoded ink, so the admin
// nav's logo was near-black on moss-700, about 1.6:1, effectively invisible.

export interface LogoProps {
  /** lockup = mark + wordmark (default); mark = the symbol alone. */
  variant?: "lockup" | "mark";
  /** Height of the mark in px. The wordmark scales from it. Never below 16. */
  size?: number;
  /** ink on light surfaces, inverse on ink surfaces. */
  tone?: "ink" | "inverse";
}

export function Logo({ variant = "lockup", size = 22, tone = "ink" }: LogoProps) {
  const color = tone === "inverse" ? "var(--text-inverse)" : "var(--text-primary)";

  return (
    <span style={{ display: "flex", alignItems: "center", gap: 9, color }}>
      <svg width={size} height={size} viewBox="0 0 96 96" aria-hidden="true" style={{ display: "block" }}>
        <circle cx="48" cy="21" r="10" fill="currentColor" />
        <path
          d="M22 46 V62 a12 12 0 0 0 12 12 h28 a12 12 0 0 0 12 -12 V46"
          fill="none"
          stroke="currentColor"
          strokeWidth="10"
          strokeLinecap="round"
        />
      </svg>

      {variant === "lockup" ? (
        /* Live text, always lowercase, never an outlined file. */
        <span
          style={{
            font: `var(--weight-semibold) ${size - 2}px/1 var(--font-core)`,
            letterSpacing: "-0.03em",
          }}
        >
          offload
        </span>
      ) : null}
    </span>
  );
}
