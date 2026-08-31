// Environment, validated once at boot.
//
// Parsed rather than read ad hoc so a missing variable fails at startup with a
// name, not at 3am inside a request with a stack trace. Nothing here is ever
// logged: see logger.ts for why that rule exists (OFF-1, SEC-1).

import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().int().positive().default(4701),
  DATABASE_URL: z.string().min(1),
  API_URL: z.string().url(),
  WEB_URL: z.string().url(),
  COOKIE_DOMAIN: z.string().min(1),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const missing = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
  throw new Error(`Environment is not valid. Check: ${missing}. See .env.example.`);
}

export const env = parsed.data;
export const isProduction = env.NODE_ENV === "production";
