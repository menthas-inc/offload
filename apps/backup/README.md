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
environment, in a file, in the shell history or in a shell trace. The R2
credentials come from `.env` through dotenv, as the API loads them, and
nothing prints them.

A restore creates its own database and never writes into one that exists. The
default is a fresh `offload_restore_<time>` beside the local Postgres in `.env`.
Any other target takes a typed yes, even on localhost, since a tunnel to
production is on localhost too. `--target` takes a URL without its password,
which comes from `PGPASSWORD`, `--password-fd` or a hidden question.

The dump carries no owners and no grants, and `schema_migrations` comes back
whole, so migrate re-applies nothing. A restored database is the restorer's
alone until `regrant.sql` runs: the worker's role, `offload_agent`, gets CONNECT
and exactly the grants every migration adds up to, and when the cluster has the
API's role, `offload_api`, it owns the application's objects as `api-role.ts`
makes it. Without that the worker's first claim is refused on `jobs`.

`restore.sh` asks whether offload will run on the restored database, or takes
`--grants yes` or `--grants no`, and the answer is no unless you say yes. A
drill copy wants no: given the grants, it would be a second full copy, deleted
rows included, that the live API and worker could read. Told no, the script
prints the `psql` command that gives them later. `regrant.sql` refuses a
database where the worker already has grants, which the live one does, and
changes nothing there unless it is run with `-v again=yes`; it says which
database it is changing. Restore as a superuser, which it needs.

It writes to the cluster as well as the database: when the cluster has no
`offload_agent`, it creates the role without LOGIN, which `pnpm agent:role`
grants. `restore-check.sh` drops the role again when its drill created it.

The grants are generated, not replayed from the migrations, since a grant
replayed by name lands on whatever has that name now. `test/regrant.test.sh`
runs every migration into a scratch database and compares a restore's grants
with that, so a migration that changes a grant fails it until
`test/regrant.test.sh --write` regenerates the file, from a freshly migrated
scratch database and never from a database someone has been working in.

A saved dump and a restored database do not expire with the backups, which the
privacy page promises roll over within 30 days. The script names the day to
delete them by, 30 days after the backup was made. The saved dump is plaintext,
so the script keeps it out of every git work tree.

It needs `age`, `rclone` and libpq's `pg_restore` and `psql`
(`brew install age rclone libpq`), and node, from nvm or Homebrew.
`restore-check.sh` proves it against the local Docker Postgres with a throwaway
key and a directory standing in for R2, inside the backup image, and borrows the
repository's dotenv, so it needs `pnpm install` first. It cannot prove R2, or
the Mac's own tools. `test/regrant.test.sh` runs on the Mac with
`DATABASE_URL` and `AGENT_DATABASE_URL`, both on localhost, the second the
worker's login: it migrates, dumps and restores scratch databases named
`offload_sweep_restore_*` there, connects as the worker, and drops them all.
