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
//
// 030. A build made with a map key and a map id also talks to Google's map:
// its requests to maps.googleapis.com and the faces its labels are drawn in.
// Its script is loaded by a script that carries the nonce, so 'strict-dynamic'
// already admits it and nothing is added to what may run. A build without the
// key names no Google host at all.

export function contentSecurityPolicy({
  nonce,
  api,
  dev,
  maps = false,
}: {
  nonce: string;
  api: string;
  dev: boolean;
  maps?: boolean;
}): string {
  return [
    "default-src 'self'",
    // Next's dev server evaluates strings for source maps and fast refresh, so
    // development alone admits eval. A build never does.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    `font-src 'self' data:${maps ? " https://fonts.gstatic.com" : ""}`,
    `img-src 'self' ${api} https: data: blob:`,
    `media-src 'self' ${api} blob:`,
    `connect-src 'self' ${api}${maps ? " https://maps.googleapis.com" : ""}`,
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}
