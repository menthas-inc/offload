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
repository, and losing it loses every backup. Restoring is `restore.sh`, below.

To try it locally against the Docker Postgres, with a directory standing in
for the bucket, see `check.sh`. It proves the pipe and the round trip and not
R2: the first production run failed because rclone, refused a look at the
bucket by a token scoped to objects, tried to create it. `no_check_bucket` is
the setting, and it is in `backup.sh` now.

## Restoring

`restore.sh` is the restore drill and the tool for a real restore. It lists the
backups in R2 newest first, fetches the one you pick into a private temporary
directory, asks for the private key without showing it, and reads the backup
end to end, since a listing alone passes a dump cut short inside a whole age
file. It says when the backup was made, by which Postgres, and how many tables
it holds, then saves the decrypted dump, restores it into a new database, both,
or nothing. `--help` lists the options that answer each question up front.

The drill:

    apps/backup/restore.sh

Pick the newest, paste the key, choose 4, verify only.

The private key lives in the owner's password manager and nowhere else. The
script hands it to `age` through a pipe, never on a command line, in the
environment, in a file or in the shell history. The R2 credentials come from
`.env` through dotenv, as the API loads them, and nothing prints them.

A restore creates its own database and never writes into one that exists. The
default is a fresh `offload_restore_<time>` beside the local Postgres in `.env`,
and a server that is not this machine takes a typed yes. The saved dump is
plaintext, so the script keeps it out of the repository.

It needs `brew install age rclone libpq`. `restore-check.sh` proves it against
the local Docker Postgres with a throwaway key and a directory standing in for
R2, inside the backup image. It cannot prove R2, or the Mac's own tools.
