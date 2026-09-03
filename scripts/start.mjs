// Which service is this container?
//
// Railway runs `pnpm start` from the repository root for the TypeScript
// services, so this is where the decision lands.
//
// It used to say the root config file was the only reliable place to set a
// start command. That file is gone: Railway deprecated Config as Code, a
// service created after 2026-08-28 cannot opt into it, and it stops working
// entirely on 2026-12-01. Build and start commands live in the environment now,
// set with `railway environment edit`, which takes the whole config on stdin.
//
// This script stays anyway, because the two TypeScript services genuinely do
// share one image and one `pnpm start`, and something has to choose between
// them. The agent is not one of them: it is a Python service with its own root
// directory and its own start command, and it never reaches this file.
//
// So: one variable, OFFLOAD_SERVICE, set per service. It defaults to core-api
// because that service predates this file and its behaviour must not change
// when this lands.

import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const service = process.env["OFFLOAD_SERVICE"] ?? "core-api";

if (service === "core-api") {
  // Imported rather than spawned, so the API is PID 1 and receives SIGTERM
  // directly. A wrapper process between the platform and the server is a
  // wrapper that has to forward signals correctly, and usually does not.
  await import(join(root, "apps/core-api/dist/server.js"));
} else if (service === "web") {
  // Next has no importable server entry point, so this one is a spawn. stdio
  // is inherited so its logs are the container's logs, and the exit code is
  // forwarded so a crash is a crash rather than a healthy exit.
  const child = spawn("pnpm", ["--filter", "@offload/web", "start"], {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  });
  for (const signal of ["SIGTERM", "SIGINT"]) {
    process.on(signal, () => child.kill(signal));
  }
  child.on("exit", (code, signal) => process.exit(signal ? 1 : (code ?? 0)));
} else if (service === "agent") {
  // The Python worker. Spawned for the same reason web is: there is nothing to
  // import from Node, and uv owns resolving the interpreter and the lockfile.
  //
  // It gets the signals rather than this wrapper keeping them, because a
  // SIGTERM that does not reach the worker means the job it is holding stays
  // locked until its visibility timeout expires, and somebody is waiting on
  // that job.
  const child = spawn("uv", ["run", "offload-worker"], {
    cwd: join(root, "apps/agent"),
    stdio: "inherit",
    env: process.env,
  });
  for (const signal of ["SIGTERM", "SIGINT"]) {
    process.on(signal, () => child.kill(signal));
  }
  child.on("exit", (code, signal) => process.exit(signal ? 1 : (code ?? 0)));
} else {
  throw new Error(
    `OFFLOAD_SERVICE is "${service}". Expected "core-api", "web" or "agent". ` +
      `An unrecognised value must fail here rather than silently start the wrong service.`
  );
}
