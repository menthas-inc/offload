// 033. First run's two skins, one table.
//
// Every first-run piece takes a `tone` rather than existing twice: the words
// and the layout are the same on both phones, and only colour, radius and a
// few sizes fork. Measurements are the exploration's (`onboarding-v2.html`),
// which sit off the spacing scale the way the kits' do; colours are tokens.

export type Tone = "ios" | "android";

export const SKIN = {
  ios: {
    page: "bg-surface-page",
    text: "text-text-primary",
    quiet: "text-text-secondary",
    main: "bg-ink-950",
    mainText: "text-text-inverse",
    skip: "bg-surface-fill-strong",
    skipText: "text-text-primary",
    barFill: "bg-ink-950",
    card: "border border-border-hairline bg-surface-raised",
    well: "bg-surface-fill",
    ring: "border-ink-950",
  },
  android: {
    page: "bg-a-surface",
    text: "text-a-on",
    quiet: "text-a-on-var",
    main: "bg-blue-600",
    mainText: "text-text-on-solid",
    // Material's outlined button. The exploration's #79786F is Material's
    // outline, which 031 mapped to --border-strong.
    skip: "border border-border-strong",
    skipText: "text-blue-700",
    barFill: "bg-blue-600",
    card: "bg-a-c-low",
    well: "bg-a-c-high",
    ring: "border-blue-600",
  },
} as const;

export const SIZE = {
  ios: { title: 34, button: 54, buttonText: 17, cardRadius: 18, cardButton: 38 },
  android: { title: 36, button: 56, buttonText: 16, cardRadius: 24, cardButton: 40 },
} as const;

/** The first-run title: large, tight and balanced where the platform can. */
export function titleStyle(tone: Tone) {
  const size = SIZE[tone].title;
  return { fontSize: size, lineHeight: Math.round(size * 1.08), letterSpacing: size * -0.025 };
}

export const GUTTER = 24;
