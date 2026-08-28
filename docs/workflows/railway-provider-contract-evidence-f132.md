# Railway Provider-Contract Evidence (F_1.3.2)

Recorded 2026-08-28 during the F_1.3.2 provider-contract validation phase
(`docs/1-plans/F_1.3.2_governed-production-release-path.plan.md`). Sources:
official Railway documentation pages and live schema introspection of the public
GraphQL endpoint `https://backboard.railway.com/graphql/v2` (the same endpoint
the repository's read-only observation scripts already call). Introspection was
performed unauthenticated; the endpoint serves the public schema without a
token. Authenticated behavior of each field is re-proven at every dispatch by
the workflow's preflight readback, so schema existence is what this document
certifies — runtime semantics remain covered by the plan's "External
prerequisites" list until first authorized dispatch.

## Gate decision

**Readback branch selected.** The public API exposes an autodeploy-state
readback, so the per-dispatch operator attestation input
(`railway_autodeploy_attestation`) is NOT wired. (The dispatch surface later
moved from 11 to 12 inputs for the two-phase `mode` input — an owner decision
recorded in ADR-089 — not for attestation.)

```graphql
query serviceInstanceAutoDeployStatus(
  $projectId: String!
  $environmentId: String!
  $serviceId: String!
) {
  serviceInstanceAutoDeployStatus(
    projectId: $projectId
    environmentId: $environmentId
    serviceId: $serviceId
  ) {
    enabled # Boolean!
    canEnable # Boolean!
    reason # String
  }
}
```

Preflight fails closed unless `enabled === false` for both worker services. A
companion mutation
`serviceInstanceAutoDeployUpdate(input: {projectId, environmentId, serviceId, enabled})`
exists; the workflow never calls it — disabling autodeploy remains an owner
action (UI or owner-run mutation).

## Schema evidence (introspection, 2026-08-28)

| Operation                         | Signature (introspected)                                                                               | Notes                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --------------------------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `serviceInstanceDeployV2`         | `(serviceId: String!, environmentId: String!, commitSha: String) -> String!`                           | Returns the created deployment ID. Docs: `commitSha` is validated against the connected GitHub repo; an unknown SHA returns a "Commit not found" error and **no deployment is created**.                                                                                                                                                                                                                                          |
| `deployment`                      | `(id: String!) -> Deployment!`                                                                         | `Deployment` fields include `id: ID!`, `status: DeploymentStatus!`, `meta: DeploymentMeta` (JSON scalar), `canRedeploy: Boolean!`, `canRollback: Boolean!`, `statusUpdatedAt`, `environmentId!`, `serviceId`.                                                                                                                                                                                                                     |
| `deploymentRollback`              | `(id: String!) -> Boolean!`                                                                            | **Docs drift**: the docs example selects `{ id status }`, but the live schema returns `Boolean!`. Consequence: after a rollback the new active deployment ID must be re-resolved via the `deployments` query (filter `status: { successfulOnly: true }`, first: 1) and its `meta.commitHash` verified — the mutation result cannot carry the ID. Docs banner: rollback is only valid when the target reports `canRollback: true`. |
| `deploymentRedeploy`              | `(id: String!, usePreviousImageTag: Boolean) -> Deployment!`                                           | Returns the new `Deployment` object directly (`{ id status }` selectable).                                                                                                                                                                                                                                                                                                                                                        |
| `deployments`                     | `(input: DeploymentListInput!, first: Int) -> connection`                                              | Documented reuse/preflight query: filter by `projectId`, `serviceId`, `environmentId`, `status: { successfulOnly: true }`.                                                                                                                                                                                                                                                                                                        |
| `serviceInstanceAutoDeployStatus` | `(projectId: String!, environmentId: String!, serviceId: String!) -> ServiceInstanceAutoDeployStatus!` | Readback used by the preflight gate (above). Not yet on the docs pages; present in the live public schema.                                                                                                                                                                                                                                                                                                                        |

`serviceInstanceRedeploy(serviceId!, environmentId!) -> Boolean!` and
`environmentTriggersDeploy` also exist; the helper does not use them (exact-SHA
control requires `serviceInstanceDeployV2`).

## DeploymentStatus enum (13 values, introspected)

`BUILDING, CRASHED, DEPLOYING, FAILED, INITIALIZING, NEEDS_APPROVAL, QUEUED, REMOVED, REMOVING, SKIPPED, SLEEPING, SUCCESS, WAITING`

The docs status table omits `INITIALIZING`, `NEEDS_APPROVAL`, `REMOVING`. Helper
mapping: terminal success = `SUCCESS`; terminal failure = `FAILED`, `CRASHED`,
`REMOVED`, `SKIPPED`; all others are in-progress and remain inside the wait
budget. `SLEEPING` only occurs after a successful deployment idles
(sleep-enabled services) — the wait loop targets the transition of a _new_
deployment to `SUCCESS` and treats `SLEEPING` before `SUCCESS` as unexpected
(fail closed).

## `meta.commitHash`

`DeploymentMeta` is an untyped JSON scalar, so `commitHash` presence is not
schema-provable. Corroboration: the repository's existing read-only observation
tooling already parses it in production
(`scripts/release/wait-railway-workers.mjs:143`,
`scripts/release/capture-release-recovery-context.mjs:477`,
`scripts/release/provider-evidence-contract.mjs:335`), and the 2026-08-14
observation recorded in `docs/workflows/PRODUCTION_SCRIPTS.md` read it live.
Stability remains an accepted external prerequisite (plan, "External
prerequisites" item 1) verified at each dispatch by exact-SHA matching.

## Documentation sources

- https://docs.railway.com/integrations/api/manage-services (deploy a service,
  `serviceInstanceDeployV2` with `commitSha`, redeploy)
- https://docs.railway.com/integrations/api/manage-deployments (deployment
  query, rollback/redeploy mutations, status table, successful-only filter)
- https://docs.railway.com/deployments/github-autodeploys (UI autodeploy
  enable/disable; wait-for-CI semantics)
