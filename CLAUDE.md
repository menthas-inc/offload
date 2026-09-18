# CLAUDE.md

> Keep this file lean. If removing a line would not cause a mistake, remove it.
> This file is *passive context*. Enforced rules live in `docs/constitution/principles.md`.

## Project

**offload** is an AI assistant for organising thoughts and information day to day, alone or with other people. You dump things in and offload does the filing: notes, links, screenshots, photos, voice notes. Today that lives across a calendar, a message thread you send to yourself, and a notes app, so details get lost and nothing is findable later.

The philosophy drives everything, including the data model: **you dump things in, offload hides the complexity.** The interface never asks anyone to choose a folder, a type or a format before they can put something down. Structure appears afterwards and can always be corrected.

Five surfaces: iOS, Android, web app, admin panel, marketing site. Invite only, personal accounts, sharing per thread with people you are connected to.

## How to work with me in this repo

- Be concise and direct. Surface real fork-in-the-road decisions, make the trivial calls yourself.
- **Short, friendly, to the point. Not emphatic, not apologetic.** This applies to your replies to me and to every word the product says. It drifts, so it is written down: no restating what I just said, no preamble, no summarising work I can read in the diff.
- Prefer the smallest change that satisfies the spec. No speculative abstraction.
- Ground non-trivial decisions in `docs/constitution/principles.md` and `docs/tech/`.
- When code and spec disagree, the spec wins. Update the code, or flag the spec as wrong.
- When code and the design system disagree, the **code** wins, and the same change logs one entry in the design system's `decisions.md`. That asymmetry is deliberate, see OFF-7.
- **The privacy policy is a claim surface. Treat it like a spec that can be broken from a distance.** It lives at `apps/web/src/app/(marketing)/privacy/page.tsx` and it states, in public, what happens to what people dump in. Any change that makes a line of it untrue is a defect even when the code is correct: a new company that receives content, a retention window that moves, a log or an event that starts carrying content, a control the page promises. **Tell me before writing the code, not after.** The reverse counts too: when something the page describes as coming finally ships, the dated note about it has to go.

## The design system is checked in

`.claude/skills/offload-design/` is the whole design system: tokens, 21 component contracts, five click-through UI kits, 43 exploration logs, and the brand decisions. It loads as a project skill, so ask for offload design guidance and it reads the real tokens rather than working from memory.

**Before building any screen, find its mock.** `.claude/scripts/find-kit.sh <screen>` answers
"is this already designed?" in one command, computed from the kits rather than an index that
can go stale. If a kit exists, its layout and design are the design: use them. There are
detailed mocks across mobile, web and admin, and most screens worth building already have one.

**Then read the component whole**, with `.claude/scripts/kit-component.sh <Component>`. Finding
the file is not grounding; grepping it for the line you expected is worse than not looking,
because it returns something and you stop. `WThing` passes
`tools={[["maximize-2","Open full"],["ellipsis","More"]]}` to `WPaneHead` on the line after the
title, so a grep for the title finds everything except where the maximize button goes. It ended
up in the crumb bar for exactly that reason, along with a run of other divergences that were each
one unread line. These components are thirty lines. Read them.

Read `.claude/skills/offload-design/readme.md` in full before building anything with a visual result. It is long because it is the whole system, and almost every question that comes up during the build is answered in it. `handoff/CONTRIBUTING.md` is the working agreement.

Things that bite most often:
- Consume tokens, never retype a value. Use semantic aliases (`--text-accent`), not ramps (`--moss-600`). `pnpm lint` enforces this, along with the prop contract of all 21 components, by reading the design system's generated rule file. It is wired already, so a violation is caught rather than discussed.
- Vocabulary applies to identifiers, not just copy: **thread**, **note**, **connection**, **dump**, **sorted**, **Undo**. Never folder, item, space, project, capture, classified, **no longer thing**, retired 2026-09-02, and **no longer memory**, retired 2026-09-10 by 014, which merged it with the dumped sentence into one word. **The word splits by audience and the split is deliberate.** In schema and code the noun is **content**: a `content` row, in a thread, derived from a message. In anything a person reads there is no noun at all, so reword around it and let a count stand on its own with no unit. A thread holds what you dumped in. The kits still say thing throughout and are what has to catch up; their prototype fixture also still says `space` in places, which is residue, not a schema.
- No em dashes or en dashes anywhere: UI copy, marketing, comments, commit messages, these docs, and **anything offload writes at runtime**. The prompt says so and models break this rule more than any other, so it is worth checking output rather than trusting the instruction.
- **offload never explains a failure and never diagnoses itself.** It says what happened and the screen offers the way forward, next to a control that acts on it. A model cannot see whether a tool is down and will be wrong about it: it once told somebody "the task tool seems to be down" about a tool that had refused a malformed date. A sentence cannot be clicked, so the reply names what landed and links to it, and the failure line is one short clause plus a retry.
- Sentence case everywhere. The brand name is lowercase even at the start of a sentence.
- **No emoji in the product.** 👀 was the one, on a message offload had seen but not answered, and it went on 2026-09-15: the writing indicator says the same thing at the same moment, so it was two marks for one state.
- Never hand-edit `_ds_bundle.js`, `_ds_manifest.json` or `_adherence.oxlintrc.json`. They are generated.

## Things that have already gone wrong here

Short list, kept short. Each one cost real time in this repo.

- **Verify through the real loader, not a bespoke one.** A hand-written line-by-line read of `.env` reported a complete Apple key as a 28-character fragment, because the format supports multi-line quoted values and my parser did not. The check is always "load it the way the app loads it and see what comes out".
- **Never overwrite a file you did not create.** `cat > .env` destroyed credentials that existed nowhere else. Now blocked by `.claude/hooks/protect-secrets.sh`, which is the control that replaced the good intention.
- **A test that passes only in your shell is not passing.** The suite depended on a manually sourced `.env` and would have failed for CI and for everyone else. Tests load their own environment.
- **Distrust vendor marketing, including in docs.** Railway's blog claimed sub-millisecond private networking that their own support forum contradicts. Deepgram's headline accuracy came from Deepgram. Prefer an independent benchmark or the vendor's own bug tracker.
- **A CLI can lie about its own output.** `railway variables --json` documents itself as printing raw values and prints resolved ones, which produced a confident wrong conclusion about a stored reference.
- **The defect class that matters most is two documents written days apart.** Almost every real finding from the review passes was a contradiction between things that each read fine alone: a cascade specified in one file and refcounting in another, an event carrying an account id in one place and a pseudonym in another.
- **A screen almost certainly already has a mock, and reading the readme is not reading it.** The web gate, the refusal and the no-invite screen were built from `readme.md` and the acceptance criteria while `ui_kits/web_app/WFirstRunGate.jsx` sat unopened. Wrong card, wrong title, wrong button treatment, wrong refusal colour, no first-run art. Each difference was individually defensible and together they were a different product. `find-kit.sh` exists so there is no excuse.
- **Deploying finds things local runs cannot.** The builder, the injected `PORT`, and a pool error that killed the process all appeared only on the platform.
- **Never `@import` CSS across a workspace package.** `apps/mobile/global.css` was one line, `@import "@offload/tokens/nativewind.css"`, and it hung NativeWind's Metro transformer outright: no error, no CPU, forever. Every mobile bundle stalled and it looked like a broken bundler. `pnpm tokens` writes the stylesheet into the app now. If a stylesheet has to come from another package, generate it in, never import it across the boundary.
- **A generated artifact must be generated by `install`, not by a step someone remembers.** Every EAS build failed because `apps/mobile/tailwind.config.js` requires `@offload/tokens/dist/tailwind-preset.cjs`, `dist/` is gitignored, and only our CI workflow ran `pnpm tokens`. `packages/tokens` has a `prepare` script now. The test is: delete the generated directory, run `pnpm install`, and see whether it comes back.
- **A hang is a symptom, not a diagnosis, and this repo has burned hours on that.** The Metro stall produced five confident wrong answers before the right one: watchman (missing, installed, no change), `watchFolders` (stock config hung identically), the transformer worker pool (`--max-workers 1` only changed the failure mode), Node 22 (inside metro's declared engines), and a network call the process was holding (`EXPO_OFFLINE=1` removed it and the hang stayed). What actually worked was bisection: remove one thing, bundle, repeat. Three runs found it. Reach for that before the fourth theory, and before the internet's top answer, which was watchman.
- **`EXPO_OFFLINE=1` turns an Expo hang into an error message**, and an error is worth more than a stack trace of a sleeping process. Reach for it first on anything that stalls.
- **A generated artifact that fails by doing nothing is the worst kind.** Three separate token-generator faults shipped screens in system greys: colours filtered from the raw scope so every `var()` alias was dropped, an insert anchored to indentation that `@layer base` used to provide, and a pass that wrote to the package copy of a stylesheet but not the app's. None raised. Tailwind emitted `rgb(var(--c-text-inverse) / 1)`, the variable did not exist, and the platform substituted its own default. The rule: a generator asserts what it produced, and something checks the two generated files against each other.
- **A class name that does not exist is invisible in every gate we have.** `styles.foo` on a CSS module is `any` because `declare module "*.css"` has no shape, and an unknown Tailwind class emits no rule. Both typecheck, lint, build and ship, and the element renders unstyled. The web's day-one Today went out with eight of nine classes defined nowhere. `.claude/scripts/dead-classes.mjs` and `dead-css.mjs` are the checks; run them with the rest. **An icon name is the same trap**: 016's Privacy row shipped `icon="globe"`, which is not in the set, drew an empty circle on a device and passed lint, typecheck, both suites and both dead-class scripts, because the settings `Row` takes `icon?: string` and widens the phones' `IconName` back out. `dead-icons.mjs` is the third one. **And a generated icon can be half there**: `apps/mobile/scripts/icons.mjs` read rect attributes in a fixed order, the design's `calendar.svg` has them in another, and the phones drew a calendar as two pegs and a line from 012 until a device screenshot in 019. The generator reads attributes by name and refuses a file whose drawable elements it did not all read.
- **A test can be green for the wrong reason.** One asserted against whichever job happened to be first in the table rather than the one it enqueued, so a previous aborted run could satisfy it, and scoping it to its own row is what revealed that. When a test starts failing after an unrelated change, check what it was actually asserting before assuming the change broke it.
- **`SELECT ... FOR UPDATE` outside a transaction you own locks nothing useful.** The staff-linking guard took one and carried a comment saying it closed the check-then-act window. Better Auth calls the hook and the insert as separate statements, so the lock was released before the insert ran. If the library owns the transaction boundary, the invariant belongs in the database.
- **The kits cannot show you a keyboard.** A web prototype has no soft keyboard, no safe area and no platform chrome, so every screen with a text field has a failure mode the mock cannot express. The waitlist form sat entirely underneath the keyboard on a device, and the fix ran against the usual advice because this app is edge to edge, where Android ignores `adjustResize` outright.
- **A field you took from documentation and never sent is a guess.** 016's fetch tool carried `use_cache`, invented from a docs reading; the API answered `Extra inputs are not permitted` and **every pasted link failed silently**, looking exactly like a model choosing not to look something up. The SDK ships a TypedDict per server tool, so the check costs nothing: assert the keys you send are keys the vendor declares. Same family as distrusting vendor marketing, one level down.
- **A stub that always succeeds tests the caller and nothing else.** 016's eval answered every `look_up` with `ok` without running the provenance bound, and the reader was stubbed the same way. Three defects went to a phone green: the bound refused the feature's own flagship example, the reader asked the model for a field the next line overwrote, and a `want` sent as a bare string was refused four times after which the turn filed the date from memory under a green Done. The eval now runs the real bound in its stub, and that alone turned three passing cases red. If a stub cannot fail, ask what it is standing in for and whether that thing has a refusal path.
- **A local dev server drains the same jobs table the suite writes to, and it once had a live mailer.** Two `pnpm dev` API servers, each with `RESEND_API_KEY` from `.env`, claimed every `email.*` job the test suite enqueued and sent hundreds of waitlist confirmations through Resend, past the account's budget. The runner now uses the memory mailer outside production unless `MAIL_LIVE=1` is set in that shell, and the boot line says which. The wider rule: anything that reaches a paid third party from a local process has to be an explicit opt-in, and a shared database means a dev server is a consumer of whatever the tests produce.
- **EAS's "Unknown error, see the logs" is retrievable.** `eas build:view <id> --json` returns a signed `logFiles` URL; the content is Brotli-encoded NDJSON, so `curl --compressed` plus a per-line JSON parse gives the real stack trace. Do that instead of guessing at a cloud failure.

## Where things live

- Product and technical specs: `docs/specs/NNN-feature-slug/` (feature-spec, impl-spec, tasks)
- Enforced principles, the gate: `docs/constitution/principles.md`
- Stack, architecture, decisions, CI/CD: `docs/tech/`
- Design system, and the design decision log: `.claude/skills/offload-design/`
- Workflows: `.claude/commands/` and `/plan-feature`, `/implement`, `/tweak`, `/review`
- Reviewer personas: `.claude/agents/`
- Mechanical gates: `.claude/hooks/` (secrets, pre-commit tests and lint, design guard)
- LLM evals: `apps/agent/evals/`, principles with cases under each, run by `/run-llm-tests`. Never automatic, and **never run without my explicit permission in the session: a full run is about $7 on Sonnet, more on Opus.** A feature that changes what the model does adds cases to it before it is done; running them is a separate ask.
- Scripts: `.claude/scripts/new-worktree.sh`

## Two decision logs, on purpose

- `docs/tech/decisions.md` is technical: stack, data, infrastructure, auth.
- `.claude/skills/offload-design/decisions.md` is anything with a visual result, in the block format that folder's `handoff/CONTRIBUTING.md` describes. Always fill in **Design system impact**: it is the instruction to whoever updates the kits and it is the field the design system reads on its next sync. `none` is a valid value, a missing field is not.

If a change is both, it gets an entry in both.

## Model defaults

- Session model is chosen at launch and switched freely with `/model`. Opus for cross-cutting and architectural work, Sonnet for routine implementation.
- Subagents are pinned in their own definitions. Do not override casually.
- These are the *harness* models. The models offload itself calls are a separate decision, in `docs/tech/stack.md` under LLM.

## Parallel work

- Unrelated features run in separate git worktrees and separate sessions: `.claude/scripts/new-worktree.sh <slug>`.
- `docs/constitution/`, `docs/tech/` and `.claude/skills/offload-design/` are SHARED state. Edit them on `main` only, never inside a feature worktree.

## Status

In alpha, invite only, deployed. Specs 001 to 015 are built: the data model, getting in, the dump, the planner, the thread page, extraction, widgets, notes, the phones, settings, names, the calendar, answering, the merge that made notes one concept, and the timeline. Core API, the web app and the Python worker all run on Railway from `main`; the phones build through EAS. The open decisions are at the bottom of `docs/tech/decisions.md`; `docs/specs/README.md` still lists the *first* specs to write and is a record of where this started, not of what is left.
