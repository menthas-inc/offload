// The generator, run against a copy of what it reads, so a test can break one
// input and see whether it says so. Every fault this script has shipped did
// nothing rather than raise: these check that a broken input fails the build
// and that the two copies of the phones' stylesheet agree.

import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

const repo = join(import.meta.dirname, "../../..");
const DS = ".claude/skills/offload-design";
const KIT = `${DS}/ui_kits/android_app/index.html`;

function copy(root: string, path: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  cpSync(join(repo, path), join(root, path), { recursive: true });
}

/** The repo's layout, with only the generator and its inputs, then one edit. */
function run(edit: (root: string) => void = () => {}, app = true) {
  const root = mkdtempSync(join(tmpdir(), "tokens-"));
  copy(root, "packages/tokens/src/generate.mjs");
  copy(root, `${DS}/tokens`);
  copy(root, KIT);
  if (app) mkdirSync(join(root, "apps/mobile"), { recursive: true });
  edit(root);
  const result = spawnSync(process.execPath, [join(root, "packages/tokens/src/generate.mjs")], { encoding: "utf8" });
  return { ...result, read: (path: string) => readFileSync(join(root, path), "utf8") };
}

/** The `--c-` variables of one block of the phones' stylesheet. */
function block(css: string, selector: string): Map<string, string> {
  const body = new RegExp(`^${selector.replace(/[.:]/g, "\\$&")} \\{\\n([\\s\\S]*?)^\\}`, "m").exec(css)?.[1] ?? "";
  return new Map([...body.matchAll(/--(c-[a-z0-9-]+):\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!]));
}

describe("the generator", () => {
  it("writes the phones' stylesheet into the app exactly as the package copy, Android included", () => {
    const out = run();
    expect(out.status, out.stderr).toBe(0);
    const css = out.read("packages/tokens/dist/nativewind.css");
    expect(out.read("apps/mobile/global.css")).toBe(css);
    expect(block(css, ":root").has("c-a-surface")).toBe(true);
    expect(out.read("packages/tokens/dist/tailwind-preset.cjs")).toContain('"a-surface"');
  });

  it("builds without the app, as a web-only checkout does", () => {
    const out = run(undefined, false);
    expect(out.status, out.stderr).toBe(0);
  });

  it("fails when an Android reference names a token that does not exist", () => {
    const out = run((root) => {
      const html = readFileSync(join(root, KIT), "utf8");
      const at = html.indexOf("var(--", html.indexOf('[data-platform="android"]'));
      writeFileSync(join(root, KIT), `${html.slice(0, at)}var(--no-such-token${html.slice(at + "var(--".length).replace(/^[a-z0-9-]+/, "")}`);
    });
    expect(out.status).not.toBe(0);
    expect(out.stderr).toContain("no-such-token");
  });

  it("fails when the app's stylesheet is there and cannot be written", () => {
    const out = run((root) => mkdirSync(join(root, "apps/mobile/global.css")));
    expect(out.status).not.toBe(0);
  });

  it("restates nothing in dark that light already says", () => {
    const out = run();
    const css = out.read("packages/tokens/dist/nativewind.css");
    const light = block(css, ":root");
    const same = [...block(css, ".dark:root")].filter(([name, value]) => light.get(name) === value);
    expect(same.map(([name]) => name)).toEqual([]);
  });
});
