// Which service is this container?
//
// Railway runs `pnpm start` from the repository root, and Railpack ignores the
// per-service config file at prepare time (decisions.md), so the root start
// script is the only reliable place to decide. The CLI has no flag for a start
// command either, and the dashboard is the alternative, which means a setting
// that lives nowhere in the repository.
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
} else {
  throw new Error(
    `OFFLOAD_SERVICE is "${service}". Expected "core-api" or "web". ` +
      `An unrecognised value must fail here rather than silently start the wrong service.`
  );
}
