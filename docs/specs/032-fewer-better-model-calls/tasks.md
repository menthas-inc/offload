# 032 tasks

## A. Prompts (AC-17, AC-18)
- [x] A1 Prompt loader with includes; judge and look move to `prompts/`. Test: `test_prompt_files.py`.
- [x] A2 Shared parts (what offload is, refused subjects, not offload's, query shape) joined into filing and answering.
- [x] A3 answer.md stops telling a read-only turn to file; plan_v2 Asking back fixed; reader reworded; small calls stop saying offload.

## B. Typed rows (AC-1 to AC-6)
- [x] B1 `quickAdd` writes as typed: no job, no `filing_at`, no budget, one address becomes `url`. Tests: threads, budget, ledger.
- [x] B2 Quick add's worker path, context, prompt, result route, tool restriction and kind removed; migration 0070 closes retired kinds.
- [x] B3 Clients: optimistic row unflagged and carrying the address, spinner code removed, placeholder *Add to this*, phones' + open at the limit. Tests: web and mobile `typed-row`, mobile composer.
- [ ] B4 Design `decisions.md` entry for the placeholder and the spinner (on `main`).

## C. The nightly pass (AC-7 to AC-16)
- [x] C1 API: `applyLearned` with every check in AC-9 to AC-11, tested against the database.
- [x] C2 API: compaction held to the pass's own member (AC-8).
- [x] C3 API: `/internal/v1/nightly-result`, once per job, one transaction (AC-13, AC-14).
- [x] C4 API: `account.daily.run` books `thread.nightly` per thread and member and nothing retired (AC-7).
- [x] C5 Worker: `nightly.py` and `prompts/nightly.md`, structured input, repair as `tool_result`, counts-only logs (AC-11, AC-13, AC-16).
- [x] C6 Label sort, `compact.py` and `loose_propose.py` deleted with their routes and tests (AC-15).

## D. Evals (AC-19)
- [x] D1 A nightly principle: nothing to learn, a fact, a correction, a pattern on two days, a one-off, a stated rule, a worked-out rule, an injected instruction, a sensitive guess, offload's reply as evidence, notes kept true, proposals on the default thread. Compaction's cases move under it.
- [ ] D2 Not run: the owner approves a run.

## E. Docs (AC-20)
- [ ] E1 On `main`: `context-and-memory.md`, `docs/tech/decisions.md` (allowlist, quick add, label sort), 014, 025 and 028 amendment notes.
