-- The agent plane may ask whether a calendar is connected, and nothing else.
--
-- The prompt sends the calendar tools only to an account that has one, because
-- offering `create_event` to somebody with no calendar is offering a tool that
-- can only fail, and it costs every one of them the definitions on every call.
-- Answering that question needs two tables and two columns of them.
--
-- **Column-level, in the shape 0010 established.** `grant select on
-- connector_calendars` would be every column, and this role has no business
-- reading a calendar's name, its sync token or when it was last read. It needs
-- to know that a row exists.
--
-- `connector_secrets` is granted to nobody. The worker holds no credentials by
-- design: it asks the Core API to act.

grant select (connection_id, selected) on connector_calendars   to offload_agent;
grant select (id, account_id, state, deleted_at) on connector_connections to offload_agent;
