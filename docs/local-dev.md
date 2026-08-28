# Local development

> Referenced by `stack.md` and `decisions.md` as the place run instructions live.

**There is nothing to run yet.** The repository holds the harness, the decisions and the design-adherence lint. No service exists.

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
