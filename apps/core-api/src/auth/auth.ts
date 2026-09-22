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
import { expo } from "@better-auth/expo";
import { db } from "../db.js";
import { env, isProduction, webOrigins } from "../env.js";
import { decideLink } from "./gate.js";
import { providerName, recordAttempt, recordProviderName } from "./attempt.js";
import { emit } from "../analytics.js";
import { uuidv7 } from "../uuid.js";
import { appleClientSecret, appleConfigured } from "./apple.js";
import { cleanNameLossy } from "../accounts/name.js";

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

/** Emit first_sign_in exactly once per account, ever.
 *
 *  The claim is the update: first_signed_in_at only moves off null once, so
 *  two devices signing in at the same moment produce one winner and one
 *  no-op. It is a column rather than a count of sessions because a session
 *  count is right only until the first session expires. */
async function emitFirstSignInOnce(accountId: string): Promise<void> {
  try {
    const claimed = await db
      .updateTable("accounts")
      .set({ first_signed_in_at: new Date(), updated_at: new Date() })
      .where("id", "=", accountId)
      .where("first_signed_in_at", "is", null)
      .returning("analytics_subject_id")
      .executeTakeFirst();

    if (!claimed) return;
    await emit({ name: "first_sign_in", subjectId: claimed.analytics_subject_id });
  } catch {
    // Analytics never breaks sign-in. Losing one event is a reporting gap;
    // throwing here would be an outage.
  }
}

/** Both providers' `mapProfileToUser`: record the name, map nothing.
 *
 *  **The one point at which Google and Apple agree.** Reading
 *  `identity.idToken` in the account hook is the obvious alternative and it
 *  works for Google and silently does nothing for Apple, whose ID token has no
 *  name claim: Apple sends the name once, in the form post of the very first
 *  authorization, and `@better-auth/core` folds it into the profile before
 *  calling this. Both providers arrive here with the name already resolved.
 *
 *  Mapping nothing is the point. The signature has to return a field map, and
 *  this returns an empty one, because the user row those fields would land on
 *  is never created: `user.create.before` always refuses. */
function rememberName(profile: { name?: unknown }): Record<string, never> {
  recordProviderName(typeof profile.name === "string" ? profile.name : null);
  return {};
}

/** What the provider called them, held where only they will see it. 011 AC-1.
 *
 *  **It writes `provider_name`, never `display_name`.** That is the whole
 *  design: `display_name` is what everybody in a shared thread sees, and a name
 *  that went from Google straight there would appear beside somebody's work,
 *  for people who know them, without them ever having seen it. `provider_name`
 *  is read by nobody but its own account, to fill in the field where they
 *  confirm it. Confirming is what makes it public, and confirming is a screen
 *  they cannot get past without answering.
 *
 *  **The rule is the where clause**, in the idiom `completeFirstRun` uses.
 *  AC-2, never overwrite, is that clause: once somebody has a name of their
 *  own, offload stops having an opinion about what the provider calls them, so
 *  a second provider linked later and a hundredth sign-in are the same case. */
export async function backfillName(accountId: string, raw: string | null): Promise<void> {
  const name = cleanNameLossy(raw);
  if (!name) {
    // **The one way this feature fails silently**, and the only place it can be
    // seen. The name crosses from `mapProfileToUser` to here through an
    // AsyncLocalStorage store: if that context is ever broken, by a library
    // change or by something that does not keep the promise chain, this reads
    // null and the backfill quietly does nothing. No error, no failing test.
    //
    // Apple legitimately sends nothing when somebody declines to share their
    // name, so an empty value is not on its own worth saying anything about.
    // Google always sends one with the `profile` scope it always asks for, so
    // an empty value from Google is the signal, and it is close to noiseless.
    //
    // `console.warn` rather than the Fastify logger: this runs inside a Better
    // Auth hook, several layers below the route, with no request and no app
    // instance to log through. Written as one JSON line so it is greppable in
    // the platform's log view, which is the only place it will ever be read.
    //
    // Not conditioned on the provider any more, because this hook does not know
    // which one signed in. Apple legitimately sends nothing, so this line is
    // expected traffic rather than an alarm; it is here so that "the slot was
    // empty" is a thing somebody can see at all.
    console.warn(JSON.stringify({ at: "name.backfill", name: "absent" }));
    return;
  }

  await db
    .updateTable("accounts")
    .set({ provider_name: name, updated_at: new Date() })
    .where("id", "=", accountId)
    // Only while they have no name of their own. After that this column is
    // dead weight and the provider's opinion is not wanted.
    .where("display_name", "is", null)
    .execute();
}

export const auth = betterAuth({
  baseURL: env.API_URL,
  secret: env.BETTER_AUTH_SECRET,
  // The phones return through a custom scheme rather than an https origin, so
  // it has to be trusted explicitly. Narrow on purpose: "offload://" and not a
  // wildcard, because a permissive entry here is an open redirect at the end of
  // an authenticated flow.
  trustedOrigins: [...webOrigins, "offload://"],

  // Rewrites the session cookie into a form a React Native client can store,
  // and accepts it back on the header the client sends. Without it the phones
  // authenticate successfully and then have nowhere to keep the result.
  plugins: [expo()],

  // Built-in endpoints the product does not use, switched off rather than
  // left reachable. `update-user` took any `name` for the signed-in account
  // and wrote it to `display_name` around the one rule `/api/me` enforces, so
  // a member could give every shared thread a paragraph for a name. Linking
  // happens on sign-in through the gate, never by a call from a client.
  // `delete-user` and `change-email` are off by default and stay off; the
  // sessions endpoints stay on for the sessions page.
  disabledPaths: ["/update-user", "/link-social", "/unlink-account"],

  database: { db, type: "postgres" },

  // Where a failure inside the callback lands.
  //
  // Better Auth's default is baseURL-relative, so a server-side error during
  // the provider round trip redirected to the API's own "/", which has no
  // route: the person saw a raw Fastify 404 with an error code in the query
  // string. The client's errorCallbackURL does not cover this, because that is
  // only consulted once the request gets far enough to read it.
  onAPIError: {
    errorURL: `${env.WEB_URL}/sign-in`,
  },

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
    // Three settings, and each one is load bearing. Read from
    // better-auth/dist/oauth2/link-account.mjs, which refuses to link when:
    //
    //   (!isTrustedProvider && !providerEmailVerified)
    //   || (requireLocalEmailVerified && !ourEmailVerified)
    //   || !enabled || disableImplicitLinking
    //
    // enabled: an invited account gains its first identity by linking, so with
    // this off and user creation refused there is no way in at all.
    //
    // trustedProviders: deliberately NOT set. Naming a provider trusted waives
    // the check on ITS emailVerified, which is the one assertion this whole
    // gate rests on. Google and Apple both always send it, so listing them
    // buys nothing and gives up the check that matters.
    //
    // requireLocalEmailVerified: false, because accounts.email_verified means
    // "we confirmed this address", and at invite time we have not: an admin
    // typed it. Left at its default of true, every invited person is refused
    // at their first sign-in. The address is verified by the provider
    // asserting it, which is the clause above.
    accountLinking: { enabled: true, requireLocalEmailVerified: false },
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

  socialProviders: {
    ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? {
          google: {
            clientId: env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET,
            // Records the name and maps nothing. See `rememberName` below.
            mapProfileToUser: rememberName,
            // Always show the account chooser. Without it "Use a different
            // account" on the no-invite screen is a lie: Google would silently
            // reauthenticate the same account it just refused, and the person
            // would land back on the same screen having done what we asked.
            prompt: "select_account",
          },
        }
      : {}),
    ...(appleConfigured()
      ? {
          apple: {
            clientId: env.APPLE_CLIENT_ID!,
            clientSecret: appleClientSecret(),
            mapProfileToUser: rememberName,
            ...(env.APPLE_BUNDLE_ID ? { appBundleIdentifier: env.APPLE_BUNDLE_ID } : {}),
          },
        }
      : {}),
  },

  advanced: {
    // Better Auth generates nanoid-style string ids by default, and every id
    // column here is a uuid, so an insert fails on the type. UUIDv7 for the
    // same reason spec 001 chose it: time-ordered, so rows cluster on insert.
    database: { generateId: () => uuidv7() },

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
      create: {
        before: async (candidate) => {
          // Never provision. An account exists only because an admin made one.
          //
          // This is also the only point in the flow that sees the address the
          // person actually signed in with, so it is where the no-invite
          // screen's copy comes from. Remembering it is not a side effect of
          // the refusal: nothing is written, the value rides a request-scoped
          // slot back out to a cookie (attempt.ts).
          recordAttempt(candidate.email);
          return false;
        },
      },
    },

    account: {
      create: {
        before: async (identity) => {
          // Better Auth reaches here having already matched this provider's
          // verified email to an existing account, so identity.userId is the
          // account being opened up. The question left is whether that account
          // may hold an identity at all, which is a state check.
          const verdict = await decideLink(identity.userId);
          // A refusal leaves no row behind: no identity, no account, nothing
          // to clean up and nothing that makes a second attempt behave
          // differently from the first (AC-5).
          if (!verdict.allow) {
            // Remember the address here too, not only in user.create.before.
            //
            // That hook only runs when no account matches the email at all, so
            // it covered the stranger and missed everyone this branch sees: the
            // person already on the waitlist who got impatient and tapped Sign
            // in, and the disabled account. For all of them the no-invite
            // screen fell back to "we found no invite for that account" with
            // the join button disabled, which is exactly the dead end AC-5 is
            // written against, and it is the likelier route onto that screen.
            recordAttempt(verdict.email);
            return false;
          }

          // Strip the provider tokens before the row is written, not after.
          //
          // schema.ts and migration 0002 both claimed a hook blanked these
          // "straight after sign-in". No such hook existed, so every account
          // carried a live Google or Apple access and refresh token at rest,
          // in plaintext, in a database whose content is deliberately not
          // encrypted (OFF-2). That is a credential, not content, and OFF-2's
          // stated ceiling does not cover it.
          //
          // Blanked here rather than in an `after` hook because an `after`
          // hook means the tokens are written first and deleted second, and
          // the window between is a backup, a replica and a WAL segment.
          //
          // Safe to discard: offload never calls a provider API on anyone's
          // behalf. Connector tokens are a separate vault by decision, and the
          // columns exist only because Better Auth's schema requires them.
          return {
            data: {
              ...identity,
              accessToken: null,
              refreshToken: null,
              idToken: null,
              accessTokenExpiresAt: null,
              refreshTokenExpiresAt: null,
              scope: null,
            },
          };
        },
      },

      // A second sign-in with the same provider updates the identity row
      // rather than creating one, and Better Auth writes fresh tokens when it
      // does. The create hook alone would blank them once and let the next
      // sign-in put them straight back.
      update: {
        before: async (identity) => ({
          data: {
            ...identity,
            accessToken: null,
            refreshToken: null,
            idToken: null,
            accessTokenExpiresAt: null,
            refreshTokenExpiresAt: null,
            scope: null,
          },
        }),
      },
    },

    session: {
      create: {
        before: async (session) => {
          const allowed = await accountMaySignIn(session.userId);
          return allowed ? { data: session } : false;
        },
        after: async (session) => {
          // first_sign_in fires once per account, ever. "Is this the only
          // session row?" is the cheap version of that and it is wrong the
          // moment someone signs in on a second device while the first is
          // still valid, so it asks the durable question instead: has this
          // account ever emitted the event before.
          await emitFirstSignInOnce(session.userId);

          // **Here rather than in the account hook, and the difference is who
          // it reaches.** `account.create.before` fires only on the link that
          // creates an identity, so it would have covered a brand new account
          // and missed every account that already exists: they linked their
          // provider months ago and only ever hit `account.update.before`,
          // which Better Auth hands the tokens and no account id at all.
          //
          // A session is created on every sign-in and carries the account, and
          // by this point the provider's profile has already been read, so the
          // slot is full. Cheap to repeat: it is one statement that matches
          // nothing once somebody has a name.
          //
          // **Guarded for the same reason the line above it is.** Better Auth
          // does not swallow a throw from an after-hook: it runs them after the
          // commit and re-throws unless `onAfterCommitHookError` is configured,
          // which it is not. So a pool timeout on this one UPDATE would take a
          // sign-in that had already committed and hand the browser a 500, with
          // the session row sitting in Postgres and no cookie ever reaching the
          // client. Losing a suggestion costs somebody one line of typing on the
          // next screen. Losing the sign-in costs them the app.
          //
          // Caught here rather than inside `backfillName`, so the function stays
          // honest for its callers and its tests: a swallowed error there is a
          // green test that proved nothing.
          try {
            await backfillName(session.userId, providerName());
          } catch {
            // Best effort. The field is empty and the screen still asks.
          }
        },
      },

      // D4: disabling an account stops a live session at its next refresh
      // rather than at token expiry. Better Auth refreshes a session every
      // updateAge, which is where a session that should have died gets its
      // extension, so that is where the state is checked again.
      update: {
        before: async (session) => {
          const accountId = session.userId;
          if (!accountId) return { data: session };
          return (await accountMaySignIn(accountId)) ? { data: session } : false;
        },
      },
    },
  },
});

export type Auth = typeof auth;
