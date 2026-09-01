# Workflows

`ci.yml` runs on every push to `main` and every pull request: lint, typecheck,
migrations against a real Postgres, the seed, the tests, then the build.

There is no deploy workflow. Railway builds from the repository itself, so a
second pipeline pushing images would be a second answer to "what is deployed".
