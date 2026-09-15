# 017 Saying what it is doing, and stopping it, tasks

## Setup

- [x] **T-1 Migration**: `messages.step`, `messages.step_at` with the 80
  character check constraint, `jobs.cancelled_at`. Recreate `readable_messages`
  in the same migration, because it is `select messages.*` and does not follow
  its table. This has now caught us twice. *AC-4, DATA-1.*

## Core API

- [x] **T-2 `POST /internal/v1/turn-step`**, writing the column and notifying,
  with the cap enforced here and not only in the constraint. *AC-1, AC-4.*
- [x] **T-3 The `step` event** on the SSE loop, and `step` on
  `GET /v1/messages/:id`, cleared when the turn settles. *AC-5, AC-6.*
- [x] **T-4 `POST /v1/turns/:turnId/cancel`**: scoped, idempotent, marks the job
  and notifies. Returns the settled state when the turn already finished. *AC-9,
  AC-13, SEC-2.*

## Agent plane

- [x] **T-5 The worker listens for cancels** on its own channel, one connection
  for the process, and cancels the task running that job. A test asserts the
  worker stops rather than finishing quietly. *AC-9.*
- [x] **T-6 Steps are posted between loop steps**, written by the planner, never
  from the reader's output. *AC-1, AC-2.*
- [x] **T-7 A cancelled turn reports `cancelled`** with what landed, does not
  retry and is not counted as a failure. *AC-10, AC-11, AC-12.*
- [x] **T-8 The eval**: the step line never carries a vendor, a tool name, a
  mechanism, an explanation of a failure, or anything from a page. The set
  includes a page whose title is written to look like a system message. *AC-14,
  AC-15.*

## Clients, all three

- [x] **T-9 The line**, after the threshold, replacing itself, falling back to
  the writing indicator when there is no step. *AC-1, AC-2, AC-3.*
- [x] **T-10 The way out at ten seconds**, returning the screen immediately and
  without waiting for the server. *AC-7, AC-8.*
- [x] **T-11 The stopped turn**: "Stopped.", the pills for what landed, and no
  offer to finish. *AC-10, AC-11.*
- [x] **T-12 Reconnect** draws the current step. *AC-6.*

## Design

- [x] **T-13 The line and the control** have no mock. Both sit in the
  conversation area the pinned composer already uses, and the divergence owes a
  `decisions.md` entry with the Design system impact field. *OFF-7.*
