# 037 Thread icons, tasks

Every task starts with its failing test, run and seen red for the reason the task exists, then the code (QUAL-1). A layout with no behaviour a test can see is checked in the browser or on a device.

## 0. Setup

- [x] **T0.1** The design sync on the branch: decisions entry, handoff, explorations, 59 glyphs. *(OFF-7)*
- [x] **T0.2** Spec, three reviews, gate, impl spec, tasks.

## 1. Shared and API

- [x] **T1.1** `packages/widgets/src/thread-icons.ts` with its tests: the list, the pick, the hue, the seed, the colours. *(AC-3, AC-4, AC-12)*
- [x] **T1.2** Migration 0082 and its test: columns, backfill, parity with the module. *(AC-10)*
- [x] **T1.3** `markFor` in the three inserts. *(AC-1, AC-2, AC-4)*
- [x] **T1.4** `editThread` and the PATCH. *(AC-5, AC-6, AC-7, AC-8)*
- [x] **T1.5** Icon and hue on every read in the impl spec's list. *(AC-9)*

## 2. Agent

- [x] **T2.1** `CreateThread.icon`, the lenient validator, the parity test, the description. *(AC-2)*
- [x] **T2.2** Eval cases and the `thread_icon` expectation. The owner said yes to the new cases alone. *(AC-15)*

## 3. Web

- [x] **T3.1** Glyphs and the texture in `public/`; `dead-icons` clean. *(AC-14)*
- [x] **T3.2** `ThreadIcon` and its test; the CSS mixes held to the module's. *(AC-11, AC-12)*
- [x] **T3.3** Swap every thread-specific `lasso`; the pill at 26px. Source test: no `lasso` beside a thread. *(AC-11)*
- [x] **T3.4** `EditThread` popover, the head's icon, the inline input gone. Browser check. *(AC-13)*

## 4. Phones

- [x] **T4.1** `pnpm icons`; the texture asset. *(AC-14)*
- [x] **T4.2** `ThreadIcon`, `lib/threadWash.ts`. *(AC-11, AC-12)*
- [x] **T4.3** Swap every thread-specific `lasso`. Source test as the web's. *(AC-11)*
- [x] **T4.4** `EditThreadSheet`, the bar's icon. Simulator check, both platforms' shapes. *(AC-13)*

## 5. Close

- [x] **T5.1** Decision entries: design (the three deviations, **Design system impact**) and tech (the columns, the shared list).
- [x] **T5.2** All gates: lint, typecheck, core, web, mobile, agent, the three dead-* scripts.
- [x] **T5.3** Code, client and security review of the diff; findings fixed.

## Amended 2026-10-07

T-2026-10-07 New thread from My threads. Done. See the feature spec's amendment of the same date.
