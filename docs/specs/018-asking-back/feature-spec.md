# 018 Asking back

**Status:** drafted 2026-09-16, revised the same day after review. **Amended 2026-09-18 by 019**: a sixth field, **calendar**, raised by the server from inside a calendar write rather than by the model's `ask`, whose values are the person's own calendars and whose answer writes outside offload through 012's confirm-or-do path, with 012's Undo rather than this spec's restore of a previous value. The five-field rule, "no option writes outside offload" (AC-9) and the apply-by-`edit_content` shape hold for every other field. `docs/specs/019-calendars/` has the whole of it.
**Surfaces:** web, iOS, Android, and the agent plane
**Depends on:** 013, which left the seam this lands in; 012, whose control this generalises; 017, whose stream and Undo the answer rides
**Research and decisions:** `research.md` in this folder

## Why

offload files without asking, and that is the product: you dump, it sorts, Undo is the safety net. It is also why three things go wrong today and cannot be fixed by filing better.

- **Some rows are wrong by construction without one fact.** An Airbnb link is a stay, and a stay without dates cannot sit on the calendar. "Buy a birthday gift for Ana" is a task that means nothing without a by-when. "Remind me to renew my passport" is a reminder whose whole point is a date. Filing them is right; filing them silently and leaving the date blank makes the person come back and do the filing.
- **A thread can say how it wants things, and offload cannot comply without asking.** A note saying the music thread is organised by genre is a rule 015 already makes the planner follow. A YouTube link carries no genre, so the rule cannot be followed from the dump alone.
- **An answer can turn on a fact the context leaves split.** "When is the next holiday", dumped from inside a trip thread about Istanbul by somebody whose account says United States, has two honest answers, and 016 picks one silently.

The seam was left on purpose. 013 said filing by default "is expected to soften" once offload can ask, and the design system already drew the control: 012's calendar proposal, generalised. What has been missing is the rule for when to ask, and the evidence says that rule is the whole feature. Models under-ask by default: Claude-family models ask on about 5% of genuinely ambiguous questions and ask less once given context. Over-asking arrives the moment an ask tool is paired with "ask when unsure". The approaches that worked score a question by the specific field it fills, refuse to re-ask a field the context already carries, and cap questions in code. That is what this spec does.

## What

### Vocabulary

offload **asks back**. A person **answers**. The thing offload asks about is a **field**, and there are five: a **date**, a **span** (two dates), a **time** (a day and a clock time), a **tag** on a thread that groups by one, and a **country**. *Amended 2026-09-18 by 020: a sixth, a **thread**, for a photo alone, and only that.* There is no "clarification" anywhere a person reads, and no "thing": in what a person reads there is no noun for what they dumped.

### Everything certain lands first

**A question never holds a dump hostage.** Whatever offload can file, it files, exactly as today: the row lands, the Done mark and the thread pill appear, Undo is offered. The question comes after, about that row, and the answer fills one field on it. An unanswered question costs nothing: the row is there without the field, the same row 016 would have filed.

The one exception is a dump whose meaning offload cannot tell at all, which today gets the refusal line ("Sorry, I did not understand that one.", a wording that is owed a pass under the 14 September content rules). That stays a refusal, not a question: a person can see what they typed.

### When offload asks

Two reasons, and nothing else.

1. **A field the row needs, that the dump and the thread do not give.** What it is decides what it needs:

   | Filed as | Needs | Unless |
   | --- | --- | --- |
   | a stay or a booking (a link to a place, a booking they say they made) | span | the dump or the thread's notes give the dates. A sentence saying where they are staying is a note, case 8, and needs nothing |
   | a reminder | date | the dump gives one |
   | a task said with "by", "before", "deadline", or as a gift or a renewal | date | the dump gives one |
   | an appointment said as a meeting or a call with somebody | time | the dump gives a day and a time |
   | a row in a thread whose notes say rows carry a tag (a genre, a room, a city) | tag | the dump names one, or the thread has fewer than two values of it |

   A row not in this table is never asked about. Where a row goes is never a field.

2. **A fact an answer turns on, that the context leaves split.** One case: the person's **country** versus the thread's. The account says one country, the question was dumped from inside a thread whose notes or name put it in another, and the question is one whose answer differs by country. Asked once, two options. From Today, the account's country wins silently, as it does now. This is an answering turn, and its section below says how it differs.

**A thread note can require or forbid asking.** "Organised by genre" makes the genre a field the thread needs. "Never ask about dates here" makes dates a field it does not, however the dump reads. A note wins over the table in both directions, because a note is the most recent thing somebody said about how the thread is handled.

### When offload does not ask

The list is longer than the one above on purpose, and every line is a case labelled during planning.

- **A task is a task.** "Photos" in a thread about app fixes, "book the flight" in a trip, "call mum", "add multi-line input to my app": a todo without a date is honest and easy to fix, and most of them stay without one.
- **What it can read, it does not ask.** An Airbnb link dumped inside a trip whose notes hold the dates takes them from the notes. A country the thread names is not asked about when the account agrees.
- **A reference it cannot resolve is filed in their words.** "The thing Ana mentioned" becomes a row saying exactly that. The person knows what it is, and a wrong guess is worse than their own words.
- **Where something goes is a guess offload makes, never a question.** "Trip to Porto" goes in the trip thread if there is one and in the default thread if not, and a wrong home is one move away. A photo with nothing said about it will be the same rule when photos can be dumped; today they cannot. *Amended 2026-09-18: 020 made this the one exception. A photo dumped with no words, from Today, whose picture does not name a thread, lands in the default thread and asks which thread it belongs in, with up to four of the person's threads as options; the answer is a move, and Undo is the move back. Words, a thread the dump was sent from, or a picture that plainly belongs somewhere are never asked about.*
- **What kind of row something is, is never asked.** The escape option is how a wrong kind gets corrected, below.
- **A question that can be answered across everything is answered across everything.** "What is left to do" from Today reads every thread with open tasks; "where am I staying" with two trips answers both, the next one first.
- **What Undo already covers is not asked about.** A reversible write sits behind eight seconds; asking first charges somebody a decision the toast already insures.
- **A refusal is still a refusal**, and a question that is not offload's is still "Not sure.". Neither becomes a question.

### The shape of a question

- **One question on screen at a time.** A dump may need two fields, the dates of a stay and the city tag its thread groups by. The asking turn decides both, and the second is shown only once the first is answered or closed. Two is the most a dump can ever cost, and the second is rare. There is no third: an answer never creates a new question.
- **Each question is about one field and says what offload assumed.** "Filed it as a stay. Which dates?" The sentence is one of five templates, one per field, with slots for the row's own title and nothing else; the thread is not named, because the pill under the turn already says where. A question that cannot name its field is not asked.
- **Options are values, not words.** Each option is a value the server can hand back on its own: a date, a span, a time, a tag the thread already holds, a country code. The label a person taps is offload's wording of that value. So the options for a by-when are the end of this week and the end of this month; for a tag they are the thread's existing values of it; for a span they are the dates a trip's notes hold, when they hold any; for a country they are the two in question. Never a sentence anybody wrote, never a page's words, never an address.
- **Up to four values, then one more.** The last option is always the way to say the question is beside the point: **Not that**. It is an answer, not a dismissal. For "meeting with the landlord, which time?" it is how "I meant set one up" gets said: the row stays a task with no date. Nothing on the list destroys anything, sends anything, or reaches outside offload. A tag with fewer than two values to offer is not asked about.
- **A date is typed when nothing can offer it.** A date, a span or a time is asked whenever the row needs it. When the context has values they are chips: the trip's own dates, the end of this week and of this month. When it has none, the chips are "Not that" alone, and the composer placeholder carries the invitation: "Which dates? e.g. Sept 12th at 5pm". Example first and no preamble, since 16 September: all three invitations overran a 266px field at 390pt and what each lost was its example. The Airbnb link with nothing around it is exactly this case, and it costs one typed line.
- **A proposal draws one primary and one plain way out, and the way out is its last option; a choice among values draws no primary.** Dark ink means offload is recommending, and on a choice it does not know.
- **Typing answers it too.** While a question is open the composer holds it as its placeholder, and a message typed in the same conversation is read as a possible answer before it is read as a new dump. A message is never consumed by that reading: it is always stored, and whatever it carries beyond the answer files as a dump would. If it does not answer, the question closes and the message files as usual.
- **A tap is a turn.** Picking an option writes the person's answer into the log as words, exactly as typing them would. The chips go, the sentence stays, and the log still reads as a conversation four turns later.
- **A question closes with its conversation.** The next turn closes it whatever it says, and so does the conversation ending, which today is the composer closing or six hours of silence. Nothing waits on a question, so nothing times out inside a conversation.

### What the answer does

**A tap on a value runs no model.** The server fills the one field on the one row the question was about, writes the person's words into the log, and settles the turn. Nothing else about the row changes. The change carries the change mark where the row is on screen, and an eight-second Undo that puts the previous value back. The asking turn's own Undo still removes what it filed, and closes the question with it.

**A typed answer runs the smallest call there is.** Before the classifier, on the message text and the open question alone, a structured call says whether the message answers it and, if so, gives the value in the field's own form: a date as a day, a span as two days, a time as a day and a clock time, a tag as one the thread holds, a country as one of the two. It reads "next weekend" and "the 14th to the 17th" against today and the week start, as the planner does. Code checks the shape and the sense of it, and a value that does not hold up is not an answer. If it answers, the server fills the field exactly as a tap would, and the rest of the message, if there is any, files as a dump with the answer already taken out of it. "Sometime in autumn" is not a date: the question closes and the words file, so nothing is lost either way.

**"Not that" runs no model either.** The row stays as it was filed, the question closes, and offload says nothing: the person's words appear in the log, the chips go, and there is no reply, no footer and no toast, because nothing happened.

**The country question is the one that re-runs a turn.** Its answer re-runs the answering turn, read-only as every answering turn is, with the chosen country as a closed value in place of the account's. The answering turn files nothing, so there is no Done mark, no pill and no Undo, exactly as for any answer.

**A second question, when the asking turn left one,** is shown after the first is settled, with the same rules.

### What the person sees

**Web, in the reply.** The reply sentence, then the question and its chips inside the bubble where 012's calendar control sits, then the turn footer below the bubble as today: Done mark, thread pills, sources. A turn that filed silently has no reply bubble, so the question gets one of its own, with nothing else in it, **after the footer** that reports the filing: what happened, then what is still open (decided 16 September; the first build drew it above). The question and the chips are plain text, never markup. The composer placeholder holds the open question and the field's accessible name stays "Dump anything".

**iOS, in the live conversation.** The same, drawn by the kit's `LiveConversation`: the bubble, the chips inside it, the placeholder in the composer. Folded, the placeholder is the only sign of an open question, and that is accepted. With the keyboard up the plate clears to the composer alone, so the chips are behind the keyboard and the placeholder does the asking; this is checked on a device, since the kits cannot show a keyboard.

**Android, the same on Material 3.** The M3 bubble and its result card keep their own surfaces, and the primary option takes the platform's primary as the existing calendar control does, a logged divergence this inherits rather than reopens.

**After the tap.** The person's words appear as their own turn, the chips leave the bubble that asked, and the row's change is on screen wherever the row is: a thread pane, Today, the rail. A question does not mark a day on the rail; it closes on the next turn and nothing waits on it.

**On a second device**, the open question appears on the next load. If two devices answer, the first answer wins; the second is refused, and that client removes the chips without a failure line, because there is nothing to retry.

**After a reload**, the open question is exactly where it was, until answered or closed. It is part of the turn, not of the screen.

**When a turn carries both a question and a calendar proposal**, the proposal draws first and keeps its own life: 012's confirmation is required per action and expires on its own clock, and the closing rule for questions never touches it. Answering a question is never a confirmation.

### What offload never does here

- Never asks in a turn whose dump it could not read at all.
- Never asks for anything outside the five fields: no names, no credentials, no "what did you mean", no "is that a todo", no which thread. *Except the 020 case above: a photo alone, from Today, with nothing in it that names a thread.*
- Never asks the same field twice about the same row.
- Never asks on a quick-add row, in compaction, on a turn somebody stopped, or on behalf of another member of a shared thread.
- Never puts a page's words, another member's words, a calendar event's words, or a tool's error into a question or an option. Options are values; the sentence is a template.
- Never explains why it is asking, and never apologises for it.

### What this changes that is not a question

**Both paths now see the same tail of the conversation.** The filing turn already saw up to twenty earlier turns; the answering turn saw none. It sees the same twenty now, under the same prompt ceiling, because a question and its answer are conversation and an answer that cannot see them cannot use them. This changes every answering turn, whether or not a question is open, and is stated here as its own criterion.

**The design system moves in three places, and each is logged.** `QuickReplies` grows from three options to five, wrapping to further rows, and gains an accessible group named by the sentence that asked. The rule that "the turn that asked carries no write tools" is replaced by a narrower one: the turn that asked writes only what the dump asked for, as any filing turn does, and an answer never runs a turn with write tools at all. The component's own contract is checked in with the change, so its props are enforced rather than remembered.

## Acceptance criteria

**When it asks**

- **AC-1** A dump that files a stay, a booking, a reminder, an appointment said as a meeting, or a task said with "by" or "before", where neither the dump nor the thread's notes give the field, lands the row and asks for that one field in the same turn.
- **AC-2** A dump into a thread whose notes require a tag the dump does not carry lands the row and asks for the tag, with the thread's existing values of it as options, when it has at least two.
- **AC-3** A question dumped from inside a thread whose notes or name put it in a country different from the account's, and whose answer differs by country, asks which country, with the two as options. The same question from Today answers for the account's country without asking.
- **AC-4** A thread note that forbids asking about a field stops every question about that field in that thread. A note that requires one makes it a field the thread needs.

**When it does not**

- **AC-5** Every case in the labelled set marked no-ask files or answers without a question. The set is split into a tuning half and a held-out half never tuned against, and on the held-out half every no-ask case stays no-ask.
- **AC-6** A field the dump or the thread's notes already give is never asked about, and a field is never asked twice about the same row.
- **AC-7** A dump's turn leaves at most two questions, shown one at a time. An answer never creates a question. Both bounds are enforced in code.

**The shape**

- **AC-8** Every question names one of the five fields, is one of five template sentences with only the row's title as a slot, and is refused whole by the server when the field is not in the set, the sentence is over 80 characters, or an option label is over 24. A refused question is dropped and the turn settles as if it had asked nothing.
- **AC-9** Every option is a value the server can apply on its own, with a label; the last option is always "Not that". Up to four values, and for a date, span or time possibly none, in which case the placeholder invites a typed answer. No option destroys, sends, or writes outside offload.
- **AC-10** A proposal draws one primary and one plain way out; a choice among values draws no primary. Options wrap to further rows and a label never wraps or truncates.
- **AC-11** Everything offload could file lands before the question, with the Done mark, pills and Undo as on any turn.

**Answering**

- **AC-12** Tapping a value fills that field on the row the question was about, and nothing else on it, with no model turn. The person's answer is written into the log as their own turn, in words, and the chips leave the bubble that asked.
- **AC-13** Tapping "Not that" closes the question, leaves the row as filed, writes the person's words into the log, and draws no reply, no footer and no toast.
- **AC-14** A message typed while a question is open, in the same conversation, is judged as a possible answer on its text and the question alone, before the classifier, with today and the week start. A value in the field's form that passes the shape and sense checks fills the field as a tap would; the message is stored either way, and anything beyond the answer files as a dump. Anything else closes the question and files as usual.
- **AC-15** An answer to the country question re-runs the answering turn, read-only, with the chosen country in place of the account's.
- **AC-16** The answer's change carries the change mark wherever the row is on screen, and an eight-second Undo that restores the previous value. Undoing the asking turn also closes its question.
- **AC-17** At most one question is open per conversation. The next turn closes it, and so does the conversation ending. The sentence that asked stays in the log without its chips.
- **AC-18** An open question survives a reload and appears on every device signed into the account on its next load. The first answer wins; a later one is refused and that client removes the chips without a failure line. A tap on a row that has since been deleted, or whose field has since been set, closes the question and changes nothing.

**Contract and bounds**

- **AC-19** The open question is a field of its own on the message, never carried on the calendar's `waiting`, and it is returned by the dump envelope, the message read, the stream's settled event, and the current conversation. Answering is one request that returns the same envelope a dump does.
- **AC-20** The question is stored with the turn like the reply is, and lives and dies with it: conversation delete, account delete, the export and Undo all cover it. No question text or option label is written to a log, an event, a trace or an error report; what is recorded is the field, the option count, the outcome and how it was answered, as enums and counters.
- **AC-21** A question or an option never contains text read from a page, a calendar event, a tool error, or a note written by another member of a shared thread. Values may derive from such a note; words may not.
- **AC-22** For provenance, a tapped or typed answer is a closed value and not the person's words: it never enters a search query, and a country answer enters the query only as the account's own country does today.
- **AC-23** Both paths see the same bounded tail of the conversation, up to twenty turns under the existing prompt ceiling, with an open question and its answer carried as a pair and never split.
- **AC-24** The ask tool is absent from the quick-add turn and refused by the server for that job kind, whatever the prompt says.

## Privacy

Reason 1 changes nothing the privacy page says: an answer is a value applied to a row the person just filed, and no new company receives anything.

**Reason 2 changes one line, and the owner has chosen it.** The page says a search carries the person's country "if you set one". It will say **"A search may carry your approximate location."** Today that location is the country they set, or the one they picked when offload asked; device location, when it comes, fits the same sentence. The line changes in the same commit as the code.

## Out of scope

- Approximate location from the device, which would settle the country question without asking. Noted as coming.
- A photo or file's thread, except the one case 020 carved out on 2026-09-18: a photo alone, from Today, with nothing in it that names a thread. Every other row's home is a guess like before.
- A third question, a question created by an answer, and any question a person is led through step by step.
- A date picker. Typing carries a specific date; the options carry the two ends.
- Asking on quick-add rows, in compaction, or on behalf of another member of a shared thread.
- Remembering an answer as a rule, "always file trips there". The handoff names it as the next thing after this; it is not this.
- Voice answers. Typing covers the phones until voice does.
- Changing what the classifier decides. The fork stays a boolean; a question is something a turn does, not a fourth path.
