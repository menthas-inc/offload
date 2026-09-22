// What an anchor may point at.
//
// A row's link is something a person pasted, in a thread other members may
// share, and a reply's source is the address of a page the model read. Both
// become hrefs, and an href is opened by the browser with whatever scheme it
// carries: `mailto:`, `tel:`, another app's own. A web page is the only thing
// the product ever meant to open (security review 2026-09-22, L22).

/** The address as an href, or nothing when it is not a web address. */
export function webHref(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  return /^https?:\/\//i.test(url) ? url : undefined;
}
