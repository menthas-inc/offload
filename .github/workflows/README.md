# Workflows

`ci.yml` runs on a pull request once it is out of draft: lint, typecheck,
migrations against a real Postgres, the seed, the tests, the build, then the
web's content security policy checked against the built app. The merge to
`main`, and a change that touches only what no check reads, skip to green;
`docs/tech/ci-cd.md` says why.

There is no deploy workflow. Railway builds from the repository itself, so a
second pipeline pushing images would be a second answer to "what is deployed".
