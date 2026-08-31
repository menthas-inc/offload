import { buildApp } from "./app.js";
import { migrate } from "./migrate.js";
import { port } from "./env.js";
import { closeDb } from "./db.js";

// Migrate before serving. A deploy that starts answering requests against a
// schema older than its code is the failure this avoids, and the advisory lock
// inside makes it safe when more than one instance boots at once.
const app = await buildApp();
const applied = await migrate((msg) => app.log.info({ migration: msg }, "migrate"));
app.log.info({ applied }, "migrations up to date");

const shutdown = async (signal: string): Promise<void> => {
  app.log.info({ signal }, "shutting down");
  await app.close();
  await closeDb();
  process.exit(0);
};

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

await app.listen({ port, host: "0.0.0.0" });
