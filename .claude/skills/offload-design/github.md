repo: menthas-inc/offload_app
branch: main
path:

## Last sync

date: 2026-09-05T19:17:22Z
tree: 2080eb536f79

Second pass on the same day, because the repository moved while the first one was in progress. Three
entries had been appended to the shared log since the morning copy, so `decisions.md` was re-pulled and
merged rather than overwritten: 56 entries now, the codebase's and the design system's both. That file
is the only one both sides write; the rest of `.claude/skills/offload-design/` is the design system's
alone and the repository's design-guard hook skips it by name.

The design queue is answered. Fifteen open questions decided off `explorations/design-queue.html`, and
`handoff/APPLY-2026-09-05.md` is the instruction set for applying them in the repository.

### Updated in this project

- Merged the shared decision log both ways, and answered the fifteen-item design queue
- Built `MemoryRow` and `RowActionSheet`; added `--duration-mark`, the change mark's 1400ms
- Carried back the repository's three entries: `SwipeRow` now drives its reveal's opacity from its
  offset, and the plate's two states and the conversation's exit are in `readme.md`
- Share sheet copy replaced on three kits, and the 25 August permission decision amended
- Added `explorations/design-queue.html` and its four parts, with what the app does today beside each option

## Screen map

| Screen | This project | Repo files |
| --- | --- | --- |
| Web app | `ui_kits/web_app/` | `apps/web/src/` |
| iOS and Android | `ui_kits/mobile_app/`, `ui_kits/android_app/` | `apps/mobile/app/`, `apps/mobile/components/` |
| Admin panel | `ui_kits/admin_web/` | `apps/web/src/app/(admin)/` |
| Landing page, invite email | `ui_kits/marketing_site/` | `apps/web/src/app/(marketing)/` |
| Design tokens | `styles.css`, `tokens/` | `packages/tokens/`, generated from `.claude/skills/offload-design/tokens` |
| Components | `components/` | `packages/widgets/`, `apps/mobile/components/` |
| Decision log | `decisions.md` | `.claude/skills/offload-design/decisions.md` (shared, append-only both ways) |
| Adherence lint | `_adherence.oxlintrc.json` | `eslint.config.mjs`, read at run time |

## Sync history

### 2026-09-05T17:47:00Z

First sync against real code. Repository had gone from empty to a pnpm monorepo with the design system
committed at `.claude/skills/offload-design/`. Pulled the shared log's eleven days of entries, added
`Chip.disabled`, removed the retired `variant="soft"`, added `--type-scale` and `--breakpoint-*`,
specified the change mark, documented `SwipeRow` as delete-only, and corrected the retention line.

### 2026-08-27T00:22:05.147Z

Repository empty, no commits on `main`. Recorded the association and the intended screen map so the
first real sync had something to diff against.
