# CI/CD

> High-level flow that grounds release and review work. Keep current.

- **Platform:** GitHub Actions. Per-component workflows, path-filtered, so each service has its own checks.
- **On a pull request:** lint, typecheck, test and build the affected components. Migrations run against an ephemeral Postgres container seeded by the `seed` script to realistic shape and volume, so a migration is reviewed by having already run against something that resembles real data. *Railway has no database branching, so the seed script is what stands in for it and it has to be kept honest as the model grows.*
- **Before a risky migration on production:** restore a PITR copy into a scratch Railway service and run it there first. Manual, and good enough while volumes are small.
- **On merge to `main`:** deploy the affected services to production.
- **Staging** is `staging.offload.club`, permanent hostname, service sleeps when idle and wakes on request. Deployed on demand rather than on every merge, because its job is giving mobile builds a stable URL to point at, not mirroring production continuously.
- **Pipeline stages:** lint → typecheck → test → build → prompt eval gate → deploy. Prompts are versioned in git and a prompt change that regresses the eval set fails the gate.
- **Mobile:** EAS build and submit, run manually per release. A mobile build points at production or at staging, never at a per-PR environment.
- **Rollback:** Railway keeps prior deployments, so rolling back is redeploying the last good one. Prompt versions roll back by pinning the prior version. Migrations are forward-only and reversible where feasible.
- **Release process:** not formalised yet. Document branch, tag and version conventions here once there is something to release.
