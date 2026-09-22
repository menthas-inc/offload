import type { Metadata, Viewport } from "next";
import "./globals.css";

// Instrument Sans and Literata are the real faces of this system, served from
// /fonts by the @font-face rules in globals.css. Not the Google CDN: a font
// host on every page is a company receiving every visitor's address, and the
// privacy page names every company (security review 2026-09-22, M16).

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
      <body>{children}</body>
    </html>
  );
}
