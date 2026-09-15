-- 017. A fifth thing a turn can end as.
--
-- **Not `partial`, which is the near miss.** Both mean some of the work landed
-- and some did not, and the composer offers a different way forward on each:
-- `partial` says "Didn't finish that one." and offers Finish, because offload
-- stopped by accident and finishing is what somebody wants. `cancelled` says
-- "Stopped." and offers nothing, because they are the one who stopped it and
-- offering to undo their own decision is the product arguing with them.
--
-- That difference is the whole reason this is a value rather than a flag, which
-- is the same sentence 0011 wrote about `partial`, and it is still the test: if
-- the screen would say the same thing, it does not need a new state.
alter table messages drop constraint messages_state_check;
alter table messages add constraint messages_state_check
  check (state in ('queued', 'seen', 'answered', 'failed', 'partial', 'cancelled'));
