# 018 Research and decisions

Gathered 2026-09-16 before the spec was written. The decisions were taken by the product owner in a question form the same day; the research is what the decisions were checked against.

## What the literature says about asking

- **Models under-ask by default.** On questions annotated as genuinely ambiguous, Claude-family models asked a clarifying question about 5% of the time, and less once retrieved context was supplied, while recognising the ambiguity 60 to 80% of the time when asked to judge it directly. "Knowing but not showing." ([arXiv 2605.25284](https://arxiv.org/html/2605.25284v1))
- **Over-asking is what an "ask when unsure" rule produces.** The ablation that triggered questions from a bare uncertainty signal asked 0.2 to 0.4 more questions per task for 1 to 3 points less coverage than a policy that scored each question by the tool parameter it would settle. Scoring by field, penalising a field already asked about, and stopping once the best candidate is confident enough cut questions 1.5 to 2.7 times while coverage rose 7 to 39% on ambiguous tasks. ([SAGE-Agent, arXiv 2511.08798](https://arxiv.org/html/2511.08798v2); the information-gain formulation in [arXiv 2606.03135](https://arxiv.org/html/2606.03135v1))
- **The decision is its own judgement, with two failure modes.** Over-asking and under-asking are measured separately, and the useful taxonomy is small: referential ("the thing Ana mentioned"), scope ("next holiday", for where), semantic, structural. ([ClarifyMT-Bench, arXiv 2512.21120](https://arxiv.org/pdf/2512.21120); [CLAMBER](https://aclanthology.org/2024.acl-long.578.pdf); [ClarifyCodeBench](https://arxiv.org/html/2607.00711))
- **The shape is a tool that pauses the loop and can resume later.** Claude Code's AskUserQuestion: one to four questions, two to four options each, a short header, optional multi-select, a free-text fallback, and the answers returned to the model as a tool result keyed by question. The loop pauses on a callback and a deferred call resumes from persisted state. ([Agent SDK, user input](https://code.claude.com/docs/en/agent-sdk/user-input)) offload already has the two halves of that: a pending row that outlives the turn (012's calendar write) and a resume that hands the model what already happened (017's Finish it).

What this spec takes from it: a question names the field it fills, a field the context already carries is never asked about, the cap lives in code, and the eval set is majority no-ask so over-asking is measured rather than felt.

## Decisions taken

| Question | Decision |
| --- | --- |
| Does the row land before the question? | Yes. File first, then ask. Nothing lands only when the intent itself is unknown, which stays a refusal. |
| A question is open and the next dump arrives | Read it as a possible answer first. If it is not one, the question closes and rows stay as filed. |
| Can a thread note govern asking? | Both ways: require a field, or forbid asking about one. |
| How much history do the two paths see? | The same 20 earlier turns on both. The answering path saw none before this. |
| Typed answers | Options plus a typed fallback. |
| The country question | Only when the account's country and the thread's disagree and the dump is from inside the thread. From Today the account wins silently. Device location may arrive later and remove the question. |
| Two questions: together or in sequence? | Together, in one reply. |
| Where the question lives | In the reply, options as chips inside the bubble, like 012's control. |
| Every question's last option | A way to say the question is beside the point: "Not that". For a meeting with no time it is how "I meant set one up" is said, and the row stays a task. |
| The privacy line for the country question | "A search may carry your approximate location." Chosen by the owner 2026-09-16; the country is what that location is today. |
| Does an open question expire? | Only on the next turn. Nothing is waiting on it. *Review added: and when its conversation ends, which is the composer closing or six hours of silence, so a question cannot outlive the conversation it is in.* |
| Can the answer's turn ask again? | One more question at most, when the answer opened exactly one further field. The turn after that asks none. *Review changed the mechanism: the asking turn decides both questions up front and the second is shown once the first settles, because the control holds one question and a tap closes the open one. Two per dump, one at a time, never a third.* |

## What the review changed

Three reviewers read the first draft: the project lead, the client engineer and designer, and the security reviewer. Their reports are in the session that wrote this; what they changed in the spec:

- **A tap runs no model.** Options are values the server can apply on its own, so a tap fills the field on the row the question was about and writes the person's words into the log, with no model turn and no write tools. That closed the three biggest findings at once: the answer turn holding write tools against 013's decision, nothing bounding which row an answer writes to, and a tapped label being laundered into a person-authored turn that 016's bound then treats as the person's words.
- **The country question is its own kind.** An answering turn, read-only, no Done mark, no pill, no Undo, and its answer re-runs the answering turn with the country as a closed value. It changes one line on the privacy page and needs the owner's word first.
- **One question on screen at a time**, two per dump shown in sequence, never a third. The draft said two together; the component holds one and a tap closes the open one.
- **Options rise from three to five chips** (four values and the way out), a logged design-system change, with the labels capped so none wraps.
- **Typed messages are never consumed.** The judgement is made on the text and the question before the classifier, a value that does not parse is not an answer, and the message files whatever it carries beyond the answer.
- **Late and double answers are defined.** First answer wins, the second is refused and its chips go without a failure line; a tap on a row that is gone or already set closes the question and changes nothing.
- **The photo case leaves.** Photos cannot be dumped yet; when they can, where they go stays a guess like any other row's. "Where something goes is never a question" is absolute now.
- **"Pick a date" leaves.** Typing carries a specific date.
- **The eval is a tuning half and a held-out half**, and what production records about a question is enums and counters only.
- **Not taken:** the project lead's smaller first cut (dates only, no tag, no country) and the suggestion of a per-field escape label. The owner's cases cover tags and the country, and the owner chose "Not that"; both stay, with the country gated on the privacy line.

## Cases the review removed or added

- Case 29, the receipt photo, is deferred until photos can be dumped.
- Cases 26 and 30 lose "pick a date"; the options are the end of this week and the end of this month, and a typed date.
- Case 33, added: an Airbnb link dumped into a trip thread whose notes group rows by city and hold no dates asks for the dates, then, once answered, the city. Two questions, in sequence.
- Case 34, added: "when's the next holiday" from inside the Istanbul thread, answered "Turkey", re-runs the answer for Turkey with no Done mark and no pill.

## The labelled set

Thirty-four cases, twenty-five of them no-ask, one deferred. Labelled by the product owner where marked.

| # | Dump, and where from | Ask? | Field, and options |
| --- | --- | --- | --- |
| 1 | "photos", in App fixes | no | a task |
| 2 | "milk, eggs, basil", in Groceries | no | three tasks |
| 3 | "dentist after the 20th" | no | a task with its date |
| 4 | "add multi-line input to my app", in App fixes | no | a task |
| 5 | YouTube link, in Music, no notes | no | a link row |
| 6 | Airbnb link, inside EU with fam, notes say Istanbul 10th to 12th | no | dates from the notes |
| 7 | "call mum" | no | a task |
| 8 | "we're staying at the Alfama flat" | no | a note |
| 9 | "oak brackets 30cm matte black" | no | a task |
| 10 | "yoga every Tuesday" | no | a repeating note |
| 11 | "Ana can only travel 14th to 17th" | no | a note |
| 12 | "move the brackets to Flat admin" | no | a move |
| 13 | "book a table for mothers day" | no | a lookup, not a question |
| 14 | "asdkjhasd" | no | the refusal line |
| 15 | "delete the Music thread" | no | says it cannot |
| 16 | "dinner with Ana Friday 8pm", calendar connected | no | the write that waits, not a question |
| 17 | "book the flight", in EU with fam | no | a task; the trip's dates are not the flight's (owner) |
| 18 | "add to shopping: the thing Ana mentioned" | no | filed in their words (owner) |
| 19 | "trip to Porto", from Today, a trip thread exists | no | a note in the trip thread, else the default thread (owner) |
| 20 | "what's left to do", from Today, six threads | no | answered across all (owner) |
| 21 | "where am I staying?", two trips | no | both, the next first (owner) |
| 22 | "what's left to do", inside a thread | no | that thread |
| 23 | "did I pay the deposit" | no | a read |
| 24 | "how do you make leek soup" | no | Not sure. |
| 25 | "when's the next holiday", from Today, country set | no | the account's country |
| 26 | "buy birthday gift for Ana" | ask | date: end of this week, end of this month, Not that; a typed date also answers |
| 27 | YouTube link, in Music, note says organised by genre | ask | tag: the thread's genres, Not that |
| 28 | Airbnb link, no context, an Istanbul thread exists | ask | span: filed into the trip thread without asking where; the dates from the trip's notes where they exist, otherwise Not that alone and a typed span |
| 29 | a photo of a receipt, from Today | deferred | photos cannot be dumped yet; the owner's label was ask which thread |
| 30 | "remind me to renew passport" | ask | date: end of this week, end of this month, Not that (owner) |
| 31 | "meeting with the landlord", in Flat admin, no time | ask | time: options from the week, and Not that means it is a task to set one up (owner) |
| 32 | "when's the next holiday", inside the Istanbul thread, account says US | ask | country: United States, Turkey, Not that |
| 33 | Airbnb link, inside a trip thread grouped by city, no dates in the notes | ask, twice | span first; then tag, the thread's cities |
| 34 | case 32 answered "Turkey" | no | the answer re-runs, read-only, for Turkey |
