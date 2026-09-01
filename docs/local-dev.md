# Local development

> Referenced by `stack.md` and `decisions.md` as the place run instructions live.

## The one command

```
docker compose up -d          # Postgres on 4710, with pgvector
pnpm install
pnpm tokens                   # generate the design tokens, once after install
pnpm db:migrate
pnpm db:seed                  # optional, but see "The seed" below
pnpm dev                      # everything, in parallel
```

`pnpm dev` starts the web app on **4700** and the Core API on **4701**. Both
reload on change. The API runs its own pending migrations at boot, so
`pnpm db:migrate` is only needed before the seed.

Open <http://localhost:4700>. The marketing page is at `/`, the gate at
`/sign-in`, the admin panel at `/admin/waitlist`.

## Signing in locally

Sign-in is invite only, and that applies on a laptop too. There is no
development bypass, deliberately: a bypass is a second authorization path, and
the one thing this product cannot afford is two answers to "may this person in".

```
ADMIN_EMAILS=you@example.com pnpm seed:admins
```

That promotes the address through the same transaction the admin panel uses and
makes it an owner. Then sign in with Google at `/sign-in` using that Google
account. First run flips the account from `invited` to `active`, and only then
does `/admin/waitlist` open, because staff must be active.

`ADMIN_EMAILS` is read by that script and by nothing else, ever. Editing it
grants nothing until the script runs again.

**Apple does not work from localhost** and is not meant to. Apple refuses
`http://` and refuses `localhost` as a return URL, so testing it needs the
staging domain. Google covers every path through the gate that is not
Apple-specific.

## Ports: 4700 to 4719 are offload's

One block, reserved so a second service never restarts this argument. Chosen
after checking what was actually listening: 3000 and 3001 are the usual
collision, 4321 was taken, and **5432 and 5433 both had Postgres on them**, so
the local database cannot use either default.

| Port | Service |
| --- | --- |
| 4700 | Web (Next.js): marketing, app, admin |
| 4701 | Core API (Fastify), where Better Auth mounts |
| 4702 | Agent plane (FastAPI), when it exists |
| 4703 | Worker health, when it exists |
| 4710 | Postgres, mapped out of Docker |
| 4711 | Redis, if it is ever needed |
| 4704 to 4709, 4712 to 4719 | Reserved |

Anything new takes the next free port in the block rather than a framework
default.

## Environment

Copy `.env.example` to `.env` at the repository root and fill it in. That one
file serves every package: the API, the tests and the seed scripts all load it,
and `apps/web` reads the `NEXT_PUBLIC_` entries from it.

`.env` is gitignored and a hook refuses to truncate or overwrite it. Real values
never go in `.env.example`, in a commit, or in a chat message.

| Variable | Where to get it in development |
| --- | --- |
| `DATABASE_URL` | `postgres://offload:offload@localhost:4710/offload`, from docker-compose |
| `API_URL` / `WEB_URL` | `http://localhost:4701` and `http://localhost:4700` |
| `COOKIE_DOMAIN` | `localhost`. The API drops the Domain attribute for that value, because a browser refuses a Domain of `localhost` |
| `BETTER_AUTH_SECRET` | `openssl rand -base64 48`. Any 32+ character string; it only signs local sessions |
| `GOOGLE_CLIENT_ID` / `_SECRET` | Google Cloud console, OAuth client, with `http://localhost:4701/api/auth/callback/google` as an authorized redirect URI |
| `APPLE_*` | Apple Developer: a Services ID, a Sign in with Apple key giving a `.p8`, a Team ID and a Key ID. Not usable from localhost, see above |
| `RESEND_API_KEY` | **Leave it empty.** Empty selects the in-memory mailer, and development should never be one typo away from mailing a real person |
| `DATA_ROOT_KEY` | **Leave it empty.** Empty derives a key from `BETTER_AUTH_SECRET`, so no key provisioning is needed. Required in production, where the API refuses to boot without one |
| `ADMIN_EMAILS` | Your own address, for `seed:admins` |

The API validates all of this once at boot and fails with the names of what is
missing, rather than at 3am inside a request.

## The local Postgres

`docker compose up -d` runs `pgvector/pgvector:pg17` on **4710**. The image
matters: `CREATE EXTENSION vector` needs the extension binary present on the
server, and a stock `postgres` image does not have it. Railway's managed
Postgres does, verified at 0.8.6.

Data lives in a named volume, so `docker compose down` keeps it and
`docker compose down -v` does not.

## The seed

```
pnpm db:seed
```

Railway has no database branching, so **the seed is what stands in for testing a
migration against realistic data**. It has to keep resembling reality as the
model grows, which is why it produces 120 waiting accounts rather than three
rows named "test": the admin waitlist page is the one screen whose data grows
unattended, and a two-row seed never pages.

It produces:

- 120 accounts on the waitlist
- one invited account that has never signed in, the state that looks like
  success and is not
- one active owner with a Miscellaneous thread, an account key, a thread key and
  a `staff` row, assembled by **the same promotion transaction the admin panel
  calls**, so the seed exercises that path rather than a shortcut that resembles
  it

It wipes those tables first, so it resets by re-running. It does not touch
migrations.

## Tests

```
pnpm test
```

They run against the same local Postgres and they truncate tables, so
`test/setup.ts` refuses to run against a `DATABASE_URL` that is not localhost.
The Apple tests skip themselves when no Apple credentials are configured, which
is what CI does.

## Node version

`.nvmrc` pins **22**, which is what CI uses. Run `nvm use` before anything else.

**pnpm comes from corepack, not from a global install.** The root
`package.json` sets `packageManager: pnpm@10.5.0`, so `corepack enable pnpm`
once per Node version is all it takes. nvm installs globals per Node version,
so a pnpm added under Node 20 simply does not exist under 22, and the failure
surfaces somewhere unhelpful: Expo shells out to `pnpm` to add a native module
and dies mid-build with `spawn pnpm ENOENT`.

**Use `nvm use` for real, not just for `node`.** nvm installs pnpm per Node version and
the shim carries a hard shebang, so a `pnpm` from a Node 20 install runs
everything under Node 20 no matter what `PATH` says about `node`. Expo then
starts Metro under a version it does not support and hangs at "Starting Metro
Bundler" with no error, 0% CPU, forever. `nvm use` fixes it; putting a newer
`node` on `PATH` by hand does not.

This is not optional for the mobile app: Expo SDK 57 requires Node >= 20.19.4
and refuses to start below it. The API and the web app run on 20 as well, so the
pin exists to keep one version across the repository rather than to work around
each package's floor separately.

## The mobile app

```
nvm use
cd apps/mobile
pnpm dev            # Metro, expecting a custom dev build
```

`pnpm dev` starts with `--dev-client`, so it wants a development build rather
than Expo Go. Expo Go cannot load this app: Sign in with Apple and secure store
are native modules that a generic client container does not carry.

Until the EAS project exists (task E2), build locally:

```
pnpm ios            # or: pnpm android
```

Both generate the native project and compile it, which needs Xcode or Android
Studio installed. `ios/` and `android/` are gitignored: they are outputs of the
Expo config, and a committed copy is a second source of truth for the same
settings.

**Known problem, unresolved.** `expo export` hangs immediately after "Starting
Metro Bundler": no error, 0% CPU, indefinitely. Sampling the process shows the
main thread parked in `kevent` inside libuv's poll, with Metro's worker threads
idle, so it is waiting on an event that never arrives rather than doing work.

Ruled out: this repository's Metro config (it reproduces with the stock one), a
hoisted versus isolated `node_modules`, the network (`EXPO_OFFLINE=1` behaves
identically), worker count, and file-watching permissions (a recursive
`fs.watch` on the project succeeds). watchman is not installed, so Metro uses
its own crawler.

Everything short of the bundle passes: `expo config --type introspect` is clean,
`expo-doctor` finds only pnpm duplicate-module false positives, and the app
typechecks. **If you hit this, try it from your own terminal first**, since the
one thing not ruled out is the non-interactive shell the agent runs in.

The theme comes from `pnpm tokens`, which emits `nativewind.css` and
`tailwind-preset.js` alongside the web outputs. Colours ship as RGB channels in
CSS variables so a dark theme is a variable swap rather than a second palette.
Run it after a design sync; nothing in `apps/mobile` holds a value.

## Pointing a mobile build at a local API

The phone is not on `localhost`. Point the app at the machine's LAN address and
tell the API to expect that origin:

```
# apps/mobile
EXPO_PUBLIC_API_URL=http://192.168.1.71:4701

# root .env, so CORS and the OAuth redirect agree with it
API_URL=http://192.168.1.71:4701
WEB_URL=http://192.168.1.71:4700
```

Google's OAuth client needs the matching redirect URI added too. Sign in with
Apple needs the real domain and cannot be done this way.

## Two services, one repository

Railway runs `pnpm start` from the repository root for every service, so the
root start script dispatches on `OFFLOAD_SERVICE`:

| Service | `OFFLOAD_SERVICE` | Runs |
| --- | --- | --- |
| `core-api` | `core-api` (also the default) | `apps/core-api/dist/server.js`, imported so it is PID 1 and gets SIGTERM directly |
| `web` | `web` | `next start`, spawned, with signals forwarded by hand |

A dispatcher rather than per-service configuration because Railpack ignores the
per-service config file at prepare time, and the CLI has no flag for a start
command. The remaining option is the dashboard, which puts a deployment setting
nowhere in the repository. An unrecognised value throws rather than falling
back, because silently starting the wrong service is the failure it exists to
prevent.

`EXTRA_WEB_ORIGINS` on `core-api` is a comma-separated allowlist of additional
origins the web app may be served from, on top of `WEB_URL`. Every entry is
trusted for credentialed CORS and for OAuth returns, so it is never a wildcard.
The sign-in callback itself comes from `window.location.origin` rather than a
build-time constant, so the app returns you to wherever you started and the
server checks that against this list.

## Railway CLI: `--json` shows resolved values, not raw ones

`railway variables --json` and `--kv` both claim in the CLI's own help to print
raw values. They do not: a variable stored as a `${{Service.VAR}}` reference
reads back as the resolved string. Verified by probe, and then corrected after
checking the dashboard, which showed the reference intact.

**So the CLI cannot tell you whether a variable is a reference or a literal.**
Check the dashboard when it matters. This cost one wrong conclusion already.

`--kv` is also line-oriented, so a multi-line value like an Apple `.p8` reads
back looking truncated. Use `--json` and a real parser before concluding a
secret is broken. That cost a second wrong conclusion.

`railway domain` returns `Unauthorized` on this account while every other
command works, including listing domains on the same service. Custom domains are
added in the dashboard for now.
