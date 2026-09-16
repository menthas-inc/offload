-- 018. The worker reads the open question a typed message may be answering:
-- its field, sentence and options, and the message it was about, for the
-- country re-run. Read only, scoped by account in the query as every read
-- the agent makes is. Every other table the agent reads was granted when it
-- appeared, and this one shipped without it: the first typed answer on
-- production failed with a privilege error the local suite cannot see,
-- because local tests run as the owner.
grant select on questions to offload_agent;
