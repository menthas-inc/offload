# CLAUDE.md

> Keep this file lean. If removing a line would not cause a mistake, remove it.
> This file is *passive context*. Enforced rules live in `docs/constitution/principles.md`.

## Project

**offload** is an AI assistant for organising thoughts and information day to day, alone or with other people. You dump things in and offload does the filing: notes, links, screenshots, photos, voice notes. Today that lives across a calendar, a message thread you send to yourself, and a notes app, so details get lost and nothing is findable later.

The philosophy drives everything, including the data model: **you dump things in, offload hides the complexity.** The interface never asks anyone to choose a folder, a type or a format before they can put something down. Structure appears afterwards and can always be corrected.

Five surfaces: iOS, Android, web app, admin panel, marketing site. Invite only, personal accounts, sharing per thread with people you are connected to.

## How to work with me in this repo

- Be concise and direct. Surface real fork-in-the-road decisions, make the trivial calls yourself.
- Prefer the smallest change that satisfies the spec. No speculative abstraction.
- Ground non-trivial decisions in `docs/constitution/principles.md` and `docs/tech/`.
- When code and spec disagree, the spec wins. Update the code, or flag the spec as wrong.
- When code and the design system disagree, the **code** wins, and the same change logs one entry in the design system's `decisions.md`. That asymmetry is deliberate, see OFF-7.

## The design system is checked in

`.claude/skills/offload-design/` is the whole design system: tokens, 21 component contracts, five click-through UI kits, 43 exploration logs, and the brand decisions. It loads as a project skill, so ask for offload design guidance and it reads the real tokens rather than working from memory.

Read `.claude/skills/offload-design/readme.md` in full before building anything with a visual result. It is long because it is the whole system, and almost every question that comes up during the build is answered in it. `handoff/CONTRIBUTING.md` is the working agreement.

Things that bite most often:
- Consume tokens, never retype a value. Use semantic aliases (`--text-accent`), not ramps (`--moss-600`).
- Vocabulary applies to identifiers, not just copy: **thread** holds **things**, plus **memory**, **connection**, **dump**, **sorted**, **Undo**. Never folder, item, space, project, capture, classified. The kits' prototype fixture still says `space` in places; that is residue, not a schema.
- No em dashes anywhere: UI copy, marketing, comments, commit messages, these docs.
- Sentence case everywhere. The brand name is lowercase even at the start of a sentence.
- One emoji in the product, 👀, on a message offload has seen but not answered, and it needs a text alternative.
- Never hand-edit `_ds_bundle.js`, `_ds_manifest.json` or `_adherence.oxlintrc.json`. They are generated.

## Where things live

- Product and technical specs: `docs/specs/NNN-feature-slug/` (feature-spec, impl-spec, tasks)
- Enforced principles, the gate: `docs/constitution/principles.md`
- Stack, architecture, decisions, CI/CD: `docs/tech/`
- Design system, and the design decision log: `.claude/skills/offload-design/`
- Workflows: `.claude/commands/` and `/plan-feature`, `/implement`, `/tweak`, `/review`
- Reviewer personas: `.claude/agents/`
- Mechanical gates: `.claude/hooks/` (secrets, pre-commit tests and lint, design guard)
- Scripts: `.claude/scripts/new-worktree.sh`

## Two decision logs, on purpose

- `docs/tech/decisions.md` is technical: stack, data, infrastructure, auth.
- `.claude/skills/offload-design/decisions.md` is anything with a visual result, in the format that file's CONTRIBUTING describes. The design system reads it back on a sync.

If a change is both, it gets an entry in both.

## Model defaults

- Session model is chosen at launch and switched freely with `/model`. Opus for cross-cutting and architectural work, Sonnet for routine implementation.
- Subagents are pinned in their own definitions. Do not override casually.
- These are the *harness* models. The models offload itself calls are a separate decision, in `docs/tech/stack.md` under LLM.

## Parallel work

- Unrelated features run in separate git worktrees and separate sessions: `.claude/scripts/new-worktree.sh <slug>`.
- `docs/constitution/`, `docs/tech/` and `.claude/skills/offload-design/` are SHARED state. Edit them on `main` only, never inside a feature worktree.

## Status

Greenfield. There is no application code yet. The first specs to write are listed at the bottom of `docs/specs/README.md`, and the open decisions that block them are at the bottom of `docs/tech/decisions.md`.
