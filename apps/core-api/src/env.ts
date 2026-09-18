// Environment, validated once at boot.
//
// Parsed rather than read ad hoc so a missing variable fails at startup with a
// name, not at 3am inside a request with a stack trace. Nothing here is ever
// logged: see logger.ts for why that rule exists (OFF-1, SEC-1).

import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  // PORT is what the platform injects and expects us to bind. API_PORT is the
  // local default from offload's reserved block. Platform wins, because a
  // service that insists on its own port is a service the proxy cannot reach.
  PORT: z.coerce.number().int().positive().optional(),
  API_PORT: z.coerce.number().int().positive().default(4701),
  DATABASE_URL: z.string().min(1),
  API_URL: z.string().url(),
  WEB_URL: z.string().url(),
  COOKIE_DOMAIN: z.string().min(1),
  // Additional origins the web app may be served from, comma separated. The
  // canonical one is WEB_URL; this is for the platform-generated domain during
  // setup and for staging later. Every entry is trusted for CORS and for
  // OAuth returns, so it is an allowlist and never a wildcard.
  EXTRA_WEB_ORIGINS: z.string().optional(),

  // Auth. The secret signs sessions; without it nothing can sign in, so it is
  // required rather than defaulted to something guessable.
  BETTER_AUTH_SECRET: z.string().min(32),
  /** Shared with the Python worker, which posts model results back through the
   *  internal endpoint. Long enough that guessing is not a strategy, and never
   *  compared with ===: a timing-safe compare costs nothing here. */
  INTERNAL_SERVICE_TOKEN: z.string().min(32),
  /** Google Maps Platform, for turning a place name into a point on a map.
   *
   *  A different Google product from the two below, which are sign-in and see
   *  nothing about what anybody dumps. Optional: without it a location is filed
   *  with a name and no pin, which is a state the product handles anyway
   *  because a provider can always be down. */
  GOOGLE_MAPS_API_KEY: z.string().min(1).optional(),
  /** 020. Whether a photo's coordinate may leave to be named, rounded, by
   *  the same provider. Its own switch and not the key: setting the key for
   *  place names must not start a second egress path the privacy policy has
   *  not described yet. On when the policy's row says so. */
  PHOTO_TOWNS: z.enum(["on", "off"]).default("off"),

  // Connectors, 012. **A different Google project from sign-in, on purpose.**
  // Calendar scopes are sensitive and pull a whole Cloud project into a heavier
  // verification review; sign-in works today on basic scopes and must not be
  // able to lose that because a calendar submission stalled.
  GOOGLE_CONNECTOR_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CONNECTOR_CLIENT_SECRET: z.string().min(1).optional(),
  // Seals third-party credentials. Separate from DATA_ROOT_KEY because these
  // are keys to somebody else's system and that one seals content: rotating or
  // losing one should never be a decision about the other.
  CONNECTOR_VAULT_KEY: z.string().min(1).optional(),
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),

  // Apple gives a signing key rather than a secret, so all four are needed to
  // mint one. See auth/apple.ts. APPLE_CLIENT_ID is the service id, not the
  // app bundle id; APPLE_BUNDLE_ID is the latter, which Apple requires when a
  // native sign-in and a web one share a service id.
  APPLE_CLIENT_ID: z.string().min(1).optional(),
  APPLE_TEAM_ID: z.string().min(1).optional(),
  APPLE_KEY_ID: z.string().min(1).optional(),
  APPLE_PRIVATE_KEY: z.string().min(1).optional(),
  APPLE_BUNDLE_ID: z.string().min(1).optional(),

  // Email. Optional so the API boots without it: a missing key means the
  // in-memory mailer, which is what development and tests want anyway.
  RESEND_API_KEY: z.string().min(1).optional(),
  EMAIL_FROM: z.string().email().default("offload@offload.club"),

  // The root of the key hierarchy, 32 bytes base64. Required in production and
  // derived from BETTER_AUTH_SECRET otherwise, so a test database needs no key
  // provisioning and a real one cannot run without a real key.
  DATA_ROOT_KEY: z.string().min(1).optional(),

  // 020. Cloudflare R2, where photos live as ciphertext. All four or none:
  // without them the in-memory store stands in, which is what development and
  // tests want and what production must never get, checked below.
  R2_ACCOUNT_ID: z.string().min(1).optional(),
  R2_ACCESS_KEY_ID: z.string().min(1).optional(),
  R2_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  R2_BUCKET: z.string().min(1).optional(),

  // Read once by seed:admins and never on a request path, so that an email in
  // an env var can never become an authorization decision at runtime.
  ADMIN_EMAILS: z.string().optional(),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const missing = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
  throw new Error(`Environment is not valid. Check: ${missing}. See .env.example.`);
}

export const env = parsed.data;
export const isProduction = env.NODE_ENV === "production";

/** Every origin the web app may legitimately be served from. */
export const webOrigins: string[] = [
  env.WEB_URL,
  ...(env.EXTRA_WEB_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/$/, ""))
    .filter(Boolean),
];

if (isProduction && !env.DATA_ROOT_KEY) {
  throw new Error("DATA_ROOT_KEY is required in production: account keys cannot be wrapped without it.");
}

/** Whether R2 is configured. Either every variable or none: two of four is a
 *  misconfiguration, not a partial store. */
export const r2Configured = Boolean(
  env.R2_ACCOUNT_ID && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.R2_BUCKET,
);
const r2Any = Boolean(env.R2_ACCOUNT_ID || env.R2_ACCESS_KEY_ID || env.R2_SECRET_ACCESS_KEY || env.R2_BUCKET);
if (r2Any && !r2Configured) {
  throw new Error("R2 is half configured: set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET together.");
}
// Not a boot failure: a deploy that carries this code before the bucket
// exists must still serve everything else. The upload route refuses with 503
// until the variables arrive, and the line below is the one thing that says
// why. Never the in-memory store in production: a photo held in a process is
// a photo lost on the next restart.
if (isProduction && !r2Configured) {
  console.warn(JSON.stringify({ level: "warn", msg: "R2 is not configured; photos are refused" }));
}

/** The port to actually bind. */
export const port = env.PORT ?? env.API_PORT;
