# offload

An AI assistant for organising thoughts and information day to day, alone or with other people. You dump things in, offload does the filing.

Invite only. Personal accounts, with sharing per thread to people you are connected to.

## Repository

In alpha, invite only, deployed. The Core API, the web app and the Python worker run on Railway from `main`; the phones build through EAS. `docs/local-dev.md` is how to run it, and `.env.example` names every variable.

Run `pnpm install`, then `pnpm lint`, `pnpm typecheck` and `pnpm test`.

| Path | What |
| --- | --- |
| `docs/constitution/` | The enforced principles. The gate. |
| `docs/tech/` | Stack, architecture, decisions, CI/CD, and how context and memory stay bounded. |
| `docs/specs/` | One folder per feature: feature-spec, impl-spec, tasks. |
| `.claude/` | The agentic coding harness: agents, commands, hooks, scripts. |
| `.claude/skills/offload-design/` | The design system. Tokens, components, five UI kits, brand decisions. |
| `eslint.config.mjs` | Design-system adherence, reading the design system's generated rule file at run time. |

## Shape

Four services and a backup job in one monorepo. Full detail in `docs/tech/architecture.md`.

| Path | What | Stack |
| --- | --- | --- |
| `apps/mobile` | iOS and Android | Expo (React Native) |
| `apps/web` | marketing site, web app, admin panel | Next.js, three route groups |
| `apps/core-api` | data, authorization, schema, blobs, crypto boundary | Fastify (TypeScript) |
| `apps/agent` | the only thing that talks to Claude: a worker that drains the jobs table | Python |
| `apps/backup` | the nightly sealed dump to R2 | a container on a schedule |
| `packages/` | shared TypeScript types and generated design tokens | TypeScript |
| `schemas/events` | the analytics event contract | JSON Schema |

## How we work

Plan, gate, implement, review, driven by slash commands and grounded in `docs/`.

| Command | Purpose |
| --- | --- |
| `/plan-feature <desc>` | spec, multi-perspective review, constitution gate, impl-spec and tasks |
| `/implement <NNN-slug>` | build a feature from its artifacts |
| `/tweak <desc>` | small change, specs kept in sync |
| `/review [scope]` | on-demand deep review |

Mechanical hooks hard-block secrets and red tests. The design guard warns on the design system's non-negotiables. The constitution gate runs inside `/plan-feature` and `/review`.

## Branches

`main` is production. `staging.offload.club` is a permanent hostname on a service that sleeps when idle and wakes on request. Pull requests run against an ephemeral seeded Postgres in CI.

## Start here

1. `CLAUDE.md`, how to work in this repo.
2. `.claude/skills/offload-design/readme.md`, what the product is and how it looks. Read it in full.
3. `docs/tech/decisions.md`, what was decided and what is still open.
