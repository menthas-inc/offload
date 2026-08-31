import { buildApp } from "./app.js";
import { env } from "./env.js";
import { closeDb } from "./db.js";

const app = await buildApp();

const shutdown = async (signal: string): Promise<void> => {
  app.log.info({ signal }, "shutting down");
  await app.close();
  await closeDb();
  process.exit(0);
};

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

await app.listen({ port: env.API_PORT, host: "0.0.0.0" });
