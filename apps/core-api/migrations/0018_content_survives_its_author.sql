-- 0018 Content in a shared thread outlives the account that wrote it.
--
-- `content.account_id` was `on delete cascade`, which means deleting an account
-- deletes every row that account authored, including everything they put into
-- threads they share with other people. Three documents say that must not
-- happen, and the third one is public.
--
-- **OFF-3, a MUST:** "Deleting an account removes that person's private content
-- and their membership, and leaves their content inside shared threads in
-- place, because the thread belongs to the others too. Account deletion
-- therefore never cascades into a shared thread, which is the one place the
-- obvious implementation of 'delete everything of theirs' is wrong."
--
-- **The privacy policy**, in bold, on a page anyone can read: "what you put
-- into a thread you shared with other people stays in that thread." It then
-- spends four paragraphs on why, and tells people to understand it before they
-- share rather than after.
--
-- **The comment four lines above the constraint itself**, in 0011, which cites
-- OFF-3 for the read rule and then writes the cascade on the next line.
--
-- Nothing has broken because nothing deletes an `accounts` row: account
-- deletion is not built. So this is a trap rather than a live defect, and it
-- would have sprung the first time somebody wrote the obvious `delete from
-- accounts where id = ?`, passed their tests, and quietly emptied half of
-- somebody else's shared thread.
--
-- 0017 hit the identical decision for memories and went the other way, which
-- left `content` and `memories` disagreeing about what a shared thread is.
-- This settles it in the direction the constitution already chose.
--
-- **Why `set null` and not a tombstone account.** A reserved "deleted user" row
-- would keep the column NOT NULL, and the cost is a fake account that every
-- listing has to remember to exclude: the admin People page, member lists,
-- analytics, the waitlist. Each of those is a place to forget. `set null` adds
-- no row and no exclusion rule, and the "a stray null could appear from a bug"
-- objection is answered in the type system rather than in review: `schema.ts`
-- types this column so a select yields `string | null` while an insert and an
-- update both require a `string`. Application code cannot write a null. Only
-- this constraint can.
--
-- The three screens that render an author already `left join` accounts and
-- already fall back to "Someone", because a missing account was reachable
-- through a soft-deleted row before this existed.

alter table content
  drop constraint content_account_id_fkey;

alter table content
  alter column account_id drop not null;

alter table content
  add constraint content_account_id_fkey
    foreign key (account_id) references accounts (id) on delete set null;

-- One consequence, stated because it is a permission change rather than a
-- storage one: OFF-3 gives delete to the author, so content whose author is
-- gone can no longer be deleted by anybody. That is the promise working rather
-- than a gap. Archive is the co-owned action and still applies, so members can
-- clear it from the active list without destroying what somebody left behind.
