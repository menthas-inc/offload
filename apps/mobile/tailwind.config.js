// The theme is generated, never written here.
//
// `@offload/tokens/tailwind-preset` is emitted by `pnpm tokens` from the design
// system's own CSS, so a design sync propagates by rerunning that rather than
// by someone editing a second copy of a value (OFF-7). Nothing in this file is
// a colour, a size or a radius.

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset"), require("@offload/tokens/tailwind-preset")],
  // class, not media: the design says light is the default theme for a new
  // account rather than the device setting, so the app decides and the CSS
  // follows. `.dark:root` in the generated stylesheet is the other half.
  darkMode: "class",
  theme: {},
  plugins: [],
};
