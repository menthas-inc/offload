// Better Auth, remapped onto our tables.
//
// It does not run its own identity schema alongside ours. Two sources of truth
// for "who is this" works until they disagree, and then the disagreement is an
// authorization bug. So its `user` model is our `accounts` table and its
// `account` model is our `account_identities`.
//
// Where the gate runs, and why it is not where you would first put it:
//
//   user.create.before      always refuses. An account exists only because an
//                           admin made one, so nothing signing in may ever
//                           provision one (AC-5).
//
//   account.create.before   runs the real decision. This is the moment an
//                           identity is attached to an account, which is the
//                           moment that actually needs deciding.
//
//   session.create.before   refuses to issue for an account that is not
//                           invited or active.
//
// An earlier draft disabled Better Auth's accountLinking outright, reasoning
// that all linking should be ours. That was wrong in a way a test caught
// rather than a review: with linking off and user creation refused, an invited
// person has no path to sign in at all, because attaching their first identity
// IS a link. Linking stays enabled and the gate governs it, which is stricter
// than switching it off, since the gate also refuses waitlisted and disabled
// accounts that the library would happily have linked.
//
// The gate runs in three places rather than one because Better Auth has open
// issues about before-hooks not firing on every path and not always respecting
// a returned object, and this is the product's entire access control. It does
// not get to be the only thing standing there.

import { betterAuth } from "better-auth";
import { db } from "../db.js";
import { env, isProduction } from "../env.js";
import { decide } from "./gate.js";

/** 15 minutes. Bounds how long a disabled account keeps working, so it is a
 *  security parameter rather than a tuning knob. */
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

const cookieDomain = env.COOKIE_DOMAIN === "localhost" ? undefined : env.COOKIE_DOMAIN;

/** Is this account allowed to hold a session right now? Layer three, and the
 *  one that catches a hook that did not fire. */
async function accountMaySignIn(accountId: string): Promise<boolean> {
  const account = await db
    .selectFrom("accounts")
    .select(["state"])
    .where("id", "=", accountId)
    .where("deleted_at", "is", null)
    .executeTakeFirst();
  return account?.state === "invited" || account?.state === "active";
}

export const auth = betterAuth({
  baseURL: env.API_URL,
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: [env.WEB_URL],

  database: { db, type: "postgres" },

  user: {
    modelName: "accounts",
    fields: {
      name: "display_name",
      emailVerified: "email_verified",
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
    additionalFields: {
      state: { type: "string", required: false, input: false },
      default_thread_id: { type: "string", required: false, input: false },
      analytics_subject_id: { type: "string", required: false, input: false },
    },
  },

  account: {
    modelName: "account_identities",
    fields: {
      userId: "account_id",
      providerId: "provider",
      accountId: "subject",
      accessToken: "access_token",
      refreshToken: "refresh_token",
      idToken: "id_token",
      accessTokenExpiresAt: "access_token_expires_at",
      refreshTokenExpiresAt: "refresh_token_expires_at",
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
    // Enabled so an invited account can gain its first identity, and governed
    // by the hook below rather than by the library's own rules.
    accountLinking: { enabled: true, trustedProviders: ["google", "apple"] },
  },

  session: {
    modelName: "sessions",
    fields: {
      userId: "account_id",
      expiresAt: "expires_at",
      ipAddress: "ip_address",
      userAgent: "user_agent",
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: ACCESS_TOKEN_TTL_SECONDS,
  },

  verification: {
    modelName: "verifications",
    fields: { expiresAt: "expires_at", createdAt: "created_at", updatedAt: "updated_at" },
  },

  socialProviders:
    env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? { google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET } }
      : {},

  advanced: {
    // The web app and the API are different origins under one registrable
    // domain, so the cookie has to span subdomains. Lax rather than Strict so
    // a link from the invite email lands signed in, which is the point of it.
    crossSubDomainCookies: cookieDomain
      ? { enabled: true, domain: cookieDomain }
      : { enabled: false },
    defaultCookieAttributes: { httpOnly: true, sameSite: "lax", secure: isProduction },
  },

  databaseHooks: {
    user: {
      // Never provision. An account exists only because an admin made one.
      create: { before: async () => false },
    },

    account: {
      create: {
        before: async (identity) => {
          const verdict = await decide({
            provider: identity.providerId === "apple" ? "apple" : "google",
            subject: identity.accountId,
            email: null,
            emailVerified: false,
          });
          // decide() falls back to a subject lookup when it has no email, so a
          // refusal here means the identity is not attached to any account we
          // let in. Returning false leaves no row behind: a refusal has no
          // side effects (AC-5).
          return verdict.allow ? { data: identity } : false;
        },
      },
    },

    session: {
      create: {
        before: async (session) => {
          const allowed = await accountMaySignIn(session.userId);
          return allowed ? { data: session } : false;
        },
      },
    },
  },
});

export type Auth = typeof auth;
