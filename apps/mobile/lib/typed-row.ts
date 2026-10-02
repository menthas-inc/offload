// 032. A row typed into a section is saved as typed. Pure, so the test runner
// can load it without React Native.

/** What the field a section's + opens says before anything is typed. */
export const TYPED_ROW_PLACEHOLDER = "Add to this";

/** The address, when a typed line is one web address and nothing else,
 *  mirroring the server's own check. Words around one keep it words. */
export function typedAddress(text: string): string | null {
  const trimmed = text.trim();
  return /^https?:\/\/\S+$/.test(trimmed) ? trimmed : null;
}
