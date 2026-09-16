# 018 Asking back, tasks

Ordered. Each cites the acceptance criteria it serves and the principles it satisfies. Reason 2, the country question, is the last track and does not ship until the privacy line is agreed.

## A. Setup and record

- [ ] **A1** Migration `0045_asking_back.sql`: the `questions` table, its three indexes, and the partial unique index that is the one-open-question rule. *(AC-17, AC-19, AC-20; DATA-1, OFF-3)*
- [ ] **A2** `.claude/skills/offload-design/decisions.md`: one entry, dated, with **Design system impact**: `QuickReplies` grows to five options and an accessible group; the "turn that asked carries no write tools" sentence is replaced by "an answer never runs a turn with write tools". *(OFF-7)*
- [ ] **A3** `docs/tech/decisions.md`: the `edit_content` a tap performs is on the reversible allowlist already; note that a question's answer is applied through it, and that the country override enters the bound as the account's country does. *(OFF-6)*
- [ ] **A4** Regenerate the harness map (`harness-map` skill) once the tool and the routes exist, so section 6 no longer says nothing asks. *(DEV-2)*

## B. Agent

- [ ] **B1** `harness/tools.py`: `Ask`, `AskOption`, `ASK_TOOL` with the description above. Not in `FILING_TOOLS`, not in `QUICK_ADD_TOOLS`. *(AC-8, AC-24; OFF-5)*
  *Test:* the schema refuses a fifth option, a 25-character label, a missing `content_id` on a non-country field.
- [ ] **B2** `harness/plan.py`: `_run` collects `ask` like `say`, caps at two, answers the third `limit_reached`; `Outcome.questions`. `plan()` offers the tool; `plan_answer()` offers it; `plan_quick_add()` does not. *(AC-7, AC-24; DEV-1)*
  *Test:* three `ask` calls yield two recorded and one refused; `ask` does not count as landed or worked.
- [ ] **B3** `worker.py`: post `questions` on the `answered` arm only; `judge_answer()` before `classify` when the job carries `openQuestionId`, given today and the week start, with the shape and sense checks and one repair retry in code; `question-answer` and `question-close` calls; `ctx.answered` block; the country override into `plan_answer`. *(AC-12, AC-14, AC-15; OFF-5, SEC-1)*
  *Test:* a typed "14th to 17th" and "next weekend" become spans against a fixed today; "sometime in autumn" and "hello" close; a judge exception closes; `to` before `from` is refused; the value never reaches `_from_the_dump`'s haystack.
- [ ] **B4** `context.py`: `AnswerContext.turns` loaded by `_TURNS`, `build_answer_blocks` gains the tail; `DumpContext.answered`; `fit()` carries both, counted. *(AC-23; OFF-8)*
  *Test:* the answering tail is dropped oldest first under the ceiling; `answered` is never dropped; a `fit()` that omits a new field fails (the field-dropping trap has a test now).
- [ ] **B5** `prompts/plan_v2.md`: a section "Asking back" carrying the table, the never list, and the note rule; `prompts/answer.md`: the country paragraph. Run through the `test-llm` skill with `evals/cases/asking-back.json` as the tuning set and `asking-back-holdout.json` held out. *(AC-1 to AC-6)*
  *Test:* every held-out no-ask case stays no-ask; every held-out ask case asks the labelled field and no other.
- [ ] **B6** `evals/run_eval.py`: a `file` case may state `asks: field | none`, checked against `Outcome.questions`; the two case files from `research.md`, split 17 and 17 with every category in both halves. *(AC-5; QUAL-1)*

## C. API

- [ ] **C1** `routes/internal.ts`: `turn-result` accepts `questions` on the answered arm; validation (field, template render, caps, target in landed, dimension named by a note, forbid-note check, country only on a question job); insert idempotent on `(turn_id, ordinal)`, ordinal 1 open, 2 pending; refusal logged as enums. *(AC-7, AC-8, AC-9, AC-20, AC-21; OFF-1, OFF-5)*
  *Test:* a question naming a row from another turn drops the list and settles the turn; a repeated post does not double; a 81-character sentence is refused; the log line carries no text.
- [ ] **C2** `questionsFor(messageIds)` and the envelope field in all four reads: the dump response, `GET /v1/messages/:id`, the stream's `done`, `GET /v1/conversations/current`. Values stripped, `kind` decided. *(AC-19)*
  *Test:* the same message read four ways returns the same question; values are absent from every response.
- [ ] **C3** `POST /v1/questions/:id/answer`: authz, the escape path, the apply path with `previous_value`, the re-resolve rules, the person message with its own turn, the pending-to-open promotion, the country enqueue. *(AC-12, AC-13, AC-15, AC-16, AC-18; SEC-2, OFF-3, OFF-6)*
  *Test:* a second tap returns 404 and changes nothing; a tap after the row's field was set closes and changes nothing; a deleted target closes; the applied value is exactly the option's; the escape writes a message and no job.
- [ ] **C4** `POST /internal/v1/question-answer` and `question-close`, tied to the job's message. *(AC-14)*
- [ ] **C5** Closing: `takeDump` passes `openQuestionId` to the job and closes the previous conversation's open question on rollover; conversation delete cascades. *(AC-14, AC-17)*
- [ ] **C6** `undoTurn`: the asking turn closes its questions; an answer turn restores `previous_value`. *(AC-16; OFF-6)*
  *Test:* undo after a date answer leaves the row with its previous date, and the question answered.
- [ ] **C7** `derived_from_untrusted` inherited from the asking job's `sawApps`. *(OFF-4)*

## D. Web

- [ ] **D1** `QuickReplies` ported from the design system into `components/shell/` per the checked-in contract: `options`, `note`, `onPick`, five chips wrapping, `role="group"` labelled by the sentence, chip labels never wrapping. *(AC-10; OFF-7)*
- [ ] **D2** `Composer.tsx`: the question inside the bubble under the sentence and above the footer, beside `Waiting` when both exist with the proposal first; plain text, no markup; tap posts the option and writes the person's turn locally; chips leave; "Not that" draws nothing further; a 404 removes the chips without the failure line; the country path waits like a dump. *(AC-12, AC-13, AC-15, AC-18)*
- [ ] **D3** The composer placeholder holds the open question, with precedence: a pinned `+` field is never taken over, then the question, then in-thread, then the cycling set; for a date, span or time with no values the placeholder is the invitation, "Which dates? Type them, like 10 to 12 October"; the field's accessible name stays "Dump anything" and the question is announced through the existing live region. *(AC-9, AC-12)*
- [ ] **D4** After an answer, the open thread pane, Today and the rail reload and the changed row takes the change mark. *(AC-16)*
- [ ] **D5** The disabled state of the calendar control loses its opacity fade for the disabled tokens, picked up on the way past. *(OFF-7)*
- [ ] **D6** `dead-classes`, `dead-css`, `dead-icons`, lint, typecheck, and a `test/markup.test.ts` case that a question is never parsed as markup.

## E. Mobile

- [ ] **E1** `QuickReplies` in `components/shell/`, iOS and Android variants per the kits: M3 bubble surfaces, the platform primary on Android as the calendar control already does. *(AC-10; OFF-7)*
- [ ] **E2** `Conversation.tsx`: the question under the sentence, beside `Waiting`, tap and escape paths as web, chips gone on a refused answer, the country wait. *(AC-12, AC-13, AC-15, AC-18)*
- [ ] **E3** `conversation-context.tsx` and `Composer.tsx`: placeholder precedence and the rotation stopping while a question is open; the `TextInput` gains an accessible label of "Dump anything". *(AC-12)*
- [ ] **E4** The thread screen, Today and the rail reload after an answer; the change mark. *(AC-16)*
- [ ] **E5** On-device checks: chips with the keyboard up, five chips of thread tags at 200% text on the 360dp Android frame, folded conversation with an open question. *(AC-10)*

## F. Country, gated

- [ ] **F1** The privacy page line becomes "A search may carry your approximate location.", chosen by the owner on 2026-09-16, in the same commit as F2. *(CLAUDE.md privacy rule)*
- [ ] **F2** `answer.md` country paragraph, `plan_answer` override, `_from_the_dump` admits the override the way it admits the setting, `turn-result` accepts `field: country` only from a question job. *(AC-3, AC-15, AC-22)*
  *Test:* case 32 asks with the two codes; case 34 re-runs read-only with Turkey and files nothing; the override never enters the haystack as a word.

## G. Close

- [ ] **G1** All three suites, the eval's held-out number in the PR description, and one real turn on web and one on the phone: a stay with no dates, a tap, Undo, a typed answer with a tail. *(QUAL-1)*
- [ ] **G2** The harness map regenerated (A4) and published.
