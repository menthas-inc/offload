-- 0054 A leaver keeps a row.
--
-- Leaving a thread deleted the leaver's `thread_members` row, and the Undo for
-- it, `restoreThread`, inserted a fresh accepted row for whoever called it, on
-- conflict do nothing. Nothing checked that the caller had ever been in the
-- thread: any account holding a thread id could join it, and any past leaver
-- could come back at any later date, blocked or not, because the delete had
-- left nothing for the unique index to refuse. Found by the security review of
-- 2026-09-22, C1.
--
-- So leaving becomes a state, like being taken out is. The row stays, marked
-- `left` with the moment it happened, and restore is an update of exactly that
-- row inside the Undo window. A stranger has no row to update and a leaver past
-- the window has one the window refuses, and both get the one refusal.
--
-- `left_at` rather than reusing `responded_at`: that column already means "when
-- they answered the invitation", and a window read off a column with two
-- meanings is the kind of thing that is right until somebody re-invites them.

alter table thread_members
  drop constraint thread_members_state_check,
  add constraint thread_members_state_check
    check (state in ('pending', 'accepted', 'declined', 'expired', 'removed', 'left')),
  add column left_at timestamptz;
