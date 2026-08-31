# Local development

> Referenced by `stack.md` and `decisions.md` as the place run instructions live.

**There is nothing to run yet.** The repository holds the harness, the decisions and the design-adherence lint. No service exists.

## Railway CLI: `--json` shows resolved values, not raw ones

`railway variables --json` and `--kv` both claim in the CLI's own help to print raw values. They do not: a variable stored as a `${{Service.VAR}}` reference reads back as the resolved string. Verified by probe, and then corrected after checking the dashboard, which showed the reference intact.

**So the CLI cannot tell you whether a variable is a reference or a literal.** Check the dashboard when it matters. This cost one wrong conclusion already.

## Ports: 4700 to 4719 are offload's

One block, reserved so a second service never restarts this argument. Chosen after checking what was actually listening: 3000 and 3001 are the usual collision, 4321 was taken, and **5432 and 5433 both had Postgres on them**, so the local database cannot use either default.

| Port | Service |
| --- | --- |
| 4700 | Web (Next.js): marketing, app, admin |
| 4701 | Core API (Fastify), where Better Auth mounts |
| 4702 | Agent plane (FastAPI), when it exists |
| 4703 | Worker health, when it exists |
| 4710 | Postgres, mapped out of Docker |
| 4711 | Redis, if it is ever needed |
| 4704 to 4709, 4712 to 4719 | Reserved |

Anything new takes the next free port in the block rather than a framework default.

What works today:

```
pnpm install
pnpm lint      # design-system adherence, reading the design system's generated rule file
```

## What goes here once there is an app

Fill this in as each piece lands, rather than in one pass at the end:

- The one command that starts the stack, and what it starts.
- Ports per service.
- Required environment variables, and where to get each in development. Never a real value: the secret scan hook blocks those, and `.env.example` is the place for shapes.
- The local Postgres, including which pgvector template or image, since the extension binary has to be present.
- The `seed` script, what shape of data it produces and how to reset it. This one matters more than usual: with no database branching, the seed is what stands in for testing a migration against realistic data.
- How to point a mobile build at a local API rather than staging.
