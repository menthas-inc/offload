// Provider glyphs, shared by both platforms.
//
// Apple's is one path in currentColor so it inverts on a dark button. Google's
// four brand colours are fixed by Google's branding requirements and are the
// one place in this app a colour is not a token, because it is not ours.

/* eslint-disable no-restricted-syntax -- Google's brand colours, see above. */
import Svg, { Path } from "react-native-svg";

export function AppleGlyph({ size = 18, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        fill={color}
        d="M16.37 1.43c0 1.14-.42 2.2-1.25 3.02-.9.9-2.02 1.42-3.02 1.33-.06-1.08.44-2.2 1.26-3.03.86-.87 2.1-1.4 3.01-1.32zM20.9 8.6c-1.7-.1-3.1.96-3.9.96-.83 0-2.05-.92-3.38-.9-1.74.03-3.35 1.01-4.24 2.57-1.82 3.15-.47 7.82 1.3 10.38.86 1.25 1.9 2.65 3.25 2.6 1.3-.05 1.8-.84 3.37-.84 1.57 0 2.02.84 3.38.82 1.4-.03 2.29-1.27 3.15-2.53.98-1.45 1.38-2.85 1.4-2.92-.03-.01-2.7-1.04-2.72-4.12-.03-2.58 2.1-3.82 2.2-3.88-1.2-1.77-3.07-1.97-3.71-2.01z"
      />
    </Svg>
  );
}

export function GoogleGlyph({ size = 18 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <Path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <Path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24s.92 7.54 2.56 10.78l7.97-6.19z" />
      <Path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </Svg>
  );
}
/* eslint-enable no-restricted-syntax */
