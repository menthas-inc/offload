// The content security policy as the built app serves it.
//
// Security review 2026-09-22, M4, the step after it shipped. The policy allowed
// inline scripts because the App Router bootstraps with them. Now
// src/middleware.ts mints a nonce per request, Next puts it on its own scripts,
// and a script without it does not run. Only a built app shows whether every
// script in the HTML carries the nonce the header names, and a page where one
// does not is dead in the browser with nothing in the server log.
//
// It builds the app and starts it, so `pnpm test` skips it and CI runs it
// after the build. By hand:
//
//   WEB_CSP_TEST=1 pnpm -C apps/web exec vitest run test/csp-built.test.ts
//
// The build writes apps/web/.next, as `pnpm -C apps/web build` does, so do not
// run it beside a dev server. The server it starts listens on 127.0.0.1 on a
// free port and is stopped at the end. A machine that cannot start either
// process skips it and says why; a build that starts and fails is a failure.

import { spawn, type ChildProcess } from "node:child_process";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it, type TestContext } from "vitest";

const RUN = process.env["WEB_CSP_TEST"] === "1";
const WEB = fileURLToPath(new URL("..", import.meta.url));
const ENV: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1" };

let base = "";
let server: ChildProcess | undefined;
let log = "";
/** Why this machine cannot run the test, when it cannot. */
let unavailable: string | undefined;

function next(args: string[], options: { detached?: boolean } = {}): ChildProcess {
  const bin = createRequire(import.meta.url).resolve("next/dist/bin/next");
  const child = spawn(process.execPath, [bin, ...args], { cwd: WEB, env: ENV, ...options });
  child.stdout?.on("data", (chunk) => (log += chunk));
  child.stderr?.on("data", (chunk) => (log += chunk));
  return child;
}

function exit(child: ChildProcess): Promise<number | null> {
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  });
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      probe.close(() => resolve(typeof address === "object" && address ? address.port : 0));
    });
  });
}

async function answering(url: string, child: ChildProcess): Promise<void> {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (unavailable) return;
    if (child.exitCode !== null) throw new Error(`next start exited:\n${log}`);
    try {
      await fetch(url);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error(`next start did not answer within a minute:\n${log}`);
}

/** Runs a step this machine may not be able to take, and records why not. */
async function attempt<T>(what: string, step: () => Promise<T>): Promise<T | undefined> {
  try {
    return await step();
  } catch (error) {
    unavailable = `${what}: ${String(error)}`;
    return undefined;
  }
}

function ready(ctx: TestContext) {
  if (unavailable) ctx.skip(`cannot run here, ${unavailable}`);
}

async function get(path: string) {
  const response = await fetch(base + path);
  expect(response.status, path).toBe(200);
  const csp = response.headers.get("content-security-policy") ?? "";
  return { headers: response.headers, csp, html: await response.text() };
}

function directive(csp: string, name: string): string {
  return (
    csp
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${name} `)) ?? ""
  );
}

function nonceOf(csp: string): string | undefined {
  return /'nonce-([^']+)'/.exec(directive(csp, "script-src"))?.[1];
}

/** Every script tag in the page, with the nonce it carries and what it holds. */
function scripts(html: string) {
  const tags = html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi);
  return [...tags].map(([, attributes = "", body = ""]) => ({
    tag: `<script${attributes}>`,
    nonce: /\bnonce="([^"]*)"/.exec(attributes)?.[1],
    src: /\bsrc="([^"]*)"/.exec(attributes)?.[1],
    inline: body.trim().length > 0,
  }));
}

describe.skipIf(!RUN)("the built app (WEB_CSP_TEST=1; builds and starts the app)", () => {
  beforeAll(async () => {
    const code = await attempt("next build could not start", () => exit(next(["build"])));
    if (unavailable) return;
    if (code !== 0) throw new Error(`next build failed with ${code}:\n${log.slice(-4000)}`);

    const port = await attempt("no local port to listen on", freePort);
    if (port === undefined) return;
    base = `http://127.0.0.1:${port}`;
    log = "";
    // Its own process group, so the stop at the end reaches whatever it spawns.
    server = next(["start", "-H", "127.0.0.1", "-p", String(port)], { detached: true });
    server.once("error", (error) => (unavailable = `next start could not start: ${String(error)}`));
    await answering(`${base}/privacy`, server);
  }, 600_000);

  afterAll(async () => {
    if (!server?.pid || server.exitCode !== null) return;
    const closed = exit(server);
    try {
      process.kill(-server.pid, "SIGTERM");
    } catch {
      return; // Already gone.
    }
    await closed;
  });

  const pages = ["/", "/privacy", "/sign-in"];
  it.for(pages)("serves %s with a nonce that every script carries", { timeout: 30_000 }, async (path, ctx) => {
    ready(ctx);
    const { headers, csp, html } = await get(path);

    const scriptSrc = directive(csp, "script-src");
    expect(scriptSrc).toContain("'strict-dynamic'");
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    // Eval is for the dev server, and this is a build.
    expect(scriptSrc).not.toContain("'unsafe-eval'");
    const nonce = nonceOf(csp);
    expect(nonce).toBeTruthy();
    // One policy, the middleware's. A second from next.config.mjs would be
    // enforced beside it.
    expect(csp.match(/script-src/g)).toHaveLength(1);

    // Under 'strict-dynamic' a script's address counts for nothing: a tag the
    // server wrote runs only with the nonce, inline or not.
    const tags = scripts(html);
    expect(tags.filter((tag) => tag.inline).length).toBeGreaterThan(0);
    expect(tags.filter((tag) => tag.nonce !== nonce).map((tag) => tag.tag)).toEqual([]);

    // A cache that kept this page would hand one nonce to everybody.
    expect(headers.get("cache-control")).toContain("no-store");

    // The other headers stay in next.config.mjs and still arrive.
    expect(headers.get("strict-transport-security")).toBe("max-age=31536000; includeSubDomains");
    expect(headers.get("x-frame-options")).toBe("DENY");
  });

  it("gives every response a nonce of its own, and renders the page to match", async (ctx) => {
    ready(ctx);
    const first = await get("/privacy");
    const second = await get("/privacy");
    expect(nonceOf(first.csp)).toBeTruthy();
    expect(nonceOf(second.csp)).toBeTruthy();
    expect(nonceOf(first.csp)).not.toBe(nonceOf(second.csp));
    // A page rendered once at build time would repeat whatever it was built with.
    expect(scripts(second.html)[0]?.nonce).toBe(nonceOf(second.csp));
  }, 30_000);

  it("leaves build output without a policy, and nothing else", async (ctx) => {
    ready(ctx);
    const chunk = scripts((await get("/privacy")).html).find((tag) => tag.src?.startsWith("/_next/static/"))?.src;
    expect(chunk).toBeTruthy();
    const built = await fetch(base + chunk!);
    expect(built.status).toBe(200);
    // No policy on a chunk means the middleware never ran for it, which is the
    // one exclusion: build output is the same for everyone and never HTML.
    expect(built.headers.get("content-security-policy")).toBeNull();
    // A face or an icon carries the policy, harmlessly, because the middleware
    // has to run for those paths: a file that is not there is answered with
    // the not-found page, which is HTML with scripts of its own, and a page
    // with no policy at all is the state the review closed.
    for (const path of ["/fonts/InstrumentSans_400Regular.ttf", "/icons/inbox.svg", "/icon.svg"]) {
      const response = await fetch(base + path);
      expect(response.status, path).toBe(200);
      expect(nonceOf(response.headers.get("content-security-policy") ?? ""), path).toBeTruthy();
    }
  }, 30_000);

  it("answers a missing file under a static path with a page that carries the policy", async (ctx) => {
    ready(ctx);
    const response = await fetch(base + "/fonts/does-not-exist.ttf");
    expect(response.status).toBe(404);
    const csp = response.headers.get("content-security-policy") ?? "";
    expect(nonceOf(csp)).toBeTruthy();
    const tags = scripts(await response.text());
    expect(tags.length).toBeGreaterThan(0);
    for (const tag of tags) expect(tag.nonce, tag.tag).toBe(nonceOf(csp));
  }, 30_000);
});
