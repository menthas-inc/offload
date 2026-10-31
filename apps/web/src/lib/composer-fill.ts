// How words reach a composer that is nobody's child: Today's examples, and
// Search's Ask (049). Its own module so the shell does not import a pane.
export const FILL_COMPOSER = "offload:fill-composer";

/** Puts the words in the composer, unsent, and focuses it. */
export function fillComposer(text: string): void {
  window.dispatchEvent(new CustomEvent(FILL_COMPOSER, { detail: text }));
}
