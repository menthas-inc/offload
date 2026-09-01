// The mark: a dot above an open vessel, a thought let go of downwards into
// something that catches it. One colour, no greys, no accent. The vessel never
// gains a lid and the dot never touches it.
//
// The wordmark beside it is live text in Instrument Sans 600 at -0.03em, always
// lowercase, not an outlined file.

export function Logo({ size = 22 }: { size?: number }) {
  return (
    <span
      style={{
        display: "flex",
        alignItems: "center",
        gap: 9,
        font: `var(--weight-semibold) ${size - 2}px/1 var(--font-core)`,
        letterSpacing: "-0.03em",
        color: "var(--text-primary)",
      }}
    >
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
      offload
    </span>
  );
}
