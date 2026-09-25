// The typecheck reads dist/tokens.json, and this package's build is what
// writes it. Turbo orders a task after the builds of the packages it depends
// on (^build), which says nothing about a package's own build, so without an
// edge of its own the typecheck could start while generate.mjs was still
// rewriting the file it imports. CI hit exactly that on 2026-09-24: tsc read
// an empty tokens.json and typed it as {}.
//
// Asked of turbo's own graph rather than of turbo.json, because what matters
// is the order turbo will actually run, and only its loader knows that.

import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");

type DryRun = {
  tasks: { taskId: string; dependencies: string[]; resolvedTaskDefinition: { dependsOn: string[] } }[];
};

/** Turbo's dry run for one task id, `package#task`, scoped to that package. */
function planned(taskId: string) {
  const [pkg, task] = taskId.split("#");
  const out = execFileSync(
    join(root, "node_modules/.bin/turbo"),
    ["run", task!, "--dry=json", `--filter=${pkg}`],
    { cwd: root, encoding: "utf8", env: { ...process.env, TURBO_TELEMETRY_DISABLED: "1" } }
  );
  const entry = (JSON.parse(out) as DryRun).tasks.find((t) => t.taskId === taskId);
  if (!entry) throw new Error(`${taskId} is not in turbo's graph`);
  return entry;
}

describe("the tokens typecheck", () => {
  it("waits for this package's own build, which writes the file it imports", () => {
    expect(planned("@offload/tokens#typecheck").dependencies).toContain("@offload/tokens#build");
  });

  // A package-specific task in turbo.json replaces the generic one rather than
  // adding to it, so the edge above has to restate ^build or it is gone. Inert
  // while this package depends on nothing, and exactly this bug the day it does.
  it("still waits for the builds of anything it comes to depend on", () => {
    expect(planned("@offload/tokens#typecheck").resolvedTaskDefinition.dependsOn).toContain("^build");
  });
});
