# backup

The nightly logical dump the privacy page describes: `pg_dump`, sealed with
`age` to a public key, written to the R2 bucket under `backups/`, kept 30 days.

A Railway service, `backup`, deployed by uploading this directory rather than
from the repository, since linking a repository to a new service from the CLI
answered Unauthorized whatever the login:

    railway up apps/backup --path-as-root --service backup --detach

`cronSchedule` `0 3 * * *`, with these variables: `DATABASE_URL` (a reference
to the Postgres service), `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
`R2_SECRET_ACCESS_KEY`, `R2_BUCKET` (references to core-api's), and
`BACKUP_RECIPIENT`, the `age1...` public key. A change to `backup.sh` or the
Dockerfile is deployed by running that upload again.
The private half is the owner's alone: it is not on Railway, not in the
repository, and losing it loses every backup. Restoring is
`age --decrypt -i backup.key < file.dump.age | pg_restore --dbname=...`.

To try it locally against the Docker Postgres, with a directory standing in
for the bucket, see `check.sh`. It proves the pipe and the round trip and not
R2: the first production run failed because rclone, refused a look at the
bucket by a token scoped to objects, tried to create it. `no_check_bucket` is
the setting, and it is in `backup.sh` now.
