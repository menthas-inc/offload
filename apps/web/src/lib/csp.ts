// The content security policy, one per response.
//
// Security review 2026-09-22, M4. It shipped allowing inline scripts, because
// the App Router bootstraps with them. Now every response carries a nonce of
// its own, and a script runs only when it carries that nonce or was loaded by
// one that did ('strict-dynamic'). src/middleware.ts mints the nonce and sends
// this; Next reads the nonce back out of it and puts it on its own scripts.
//
// Everything else is closed: nothing frames us, no plugins, no base tag, forms
// post here only, and the only origin the page talks to is the API. Pictures a
// link brought with it come from the site that published them, which is why
// images allow https. Inline styles are still allowed, which is a separate
// question from scripts.

export function contentSecurityPolicy({ nonce, api, dev }: { nonce: string; api: string; dev: boolean }): string {
  return [
    "default-src 'self'",
    // Next's dev server evaluates strings for source maps and fast refresh, so
    // development alone admits eval. A build never does.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    `img-src 'self' ${api} https: data: blob:`,
    `media-src 'self' ${api} blob:`,
    `connect-src 'self' ${api}`,
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}
