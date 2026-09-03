import type { Metadata, Viewport } from "next";
import "./globals.css";

// Instrument Sans and Literata are the real faces of this system, confirmed,
// served from the Google CDN for now. tokens/fonts.css becomes self-hosted
// @font-face whenever hosting matters.
const FONTS =
  "https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600&family=Literata:opsz,wght@7..72,400;7..72,500&display=swap";

export const metadata: Metadata = {
  // Lowercase always, including at the start of a sentence.
  title: "offload",
  description:
    "Dump half a thought, a photo, a voice note. offload files it into threads and speaks up when something needs you.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Light is the default theme for a new account, not the device setting.
  return (
    <html lang="en" data-theme="light">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href={FONTS} />
      </head>
      <body>{children}</body>
    </html>
  );
}
