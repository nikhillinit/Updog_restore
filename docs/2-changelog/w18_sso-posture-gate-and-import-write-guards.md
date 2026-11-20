---
status: HISTORICAL
audience: both
last_updated: 2026-11-20
owner: '@nikhillinit'
---

# Changelog - Week 18, 20-11-2026, SSO Posture Gate and Import Write Guards

**Release status**: source changes committed on branch
`feat/f139-sso-posture-gate-import-write-guards`; push, pull request, and merge
are owner-gated, with merge behind `CI Gate Status`. **Package version**: 1.6.0,
unchanged; no new application version or release tag. **Object**: fix(release):
gate SSO posture and guard LP import writes (F_1.3.9). **Code review**:
[Code review](../3-code-review/CR_w18_sso-posture-gate-and-import-write-guards.md)
(Codex loop, 3 rounds -> APPROVED). **Plan**:
`docs/1-plans/F_1.3.9_sso-posture-gate-and-import-write-guards.plan.md`.

## Changes

- `release-production.yml`: the post-promotion smoke sends
  `VERCEL_AUTOMATION_BYPASS_SECRET` and fails early when it is missing. Both
  `staged-provider-identity` and the `promote` fresh-evidence step pass
  `--access-posture` to the collector and `--access-posture-file` to the
  verifier.
- `collect-provider-evidence.mjs`: the opt-in `--access-posture` flag reads the
  project protection fields, the project domains and the canonical deployment
  aliases. It then probes each hostname's `/api/health` without credentials. It
  records bypass entries as a count and scopes only, never the keys. Without the
  flag, output is unchanged.
- `verify-provider-identity.mjs`: the optional `--access-posture-file` input
  fails closed unless the mode is `all` and the probe set maps one-to-one onto a
  non-empty inventory that contains the canonical hostname. Every probe must be
  a 401 or a 3xx to `vercel.com/sso-api`.
- `server/routes/lp-reporting/imports.ts`: ten import and reconciliation write
  routes carry `requireWriteRole(TEAM_WRITE_ROLES)`,
  `enforceProvidedFundScope(..., { forWrite: true })` and `enforceTeamWriteRole`
  inline. Read routes and the actuals pilot routes are unchanged.
- Governance: ADR-117 deviation record, standing rule and access-expansion hold;
  ADR-079 status note; a policy section; PRODUCTION_SCRIPTS hold, census and
  provisioning note; ARCHI section 3; CHANGELOG.
- Matrix: maintenance reseed, scoped review
  `f139-import-write-guards-20261120-scoped-review.json`, README write-row
  evidence rule. `approve-matrix --dry-run` passes. The owner runs the real
  approval.
- `.gitleaks.toml`: an exact-path, literal-digest allowlist for the new scoped
  review, mirroring the PR 1708 block. Synthetic controls (an altered digest and
  a random `api_key`) are still detected.
- Tests: the collector and verifier suites, `ci-fail-closed` pins, a unit role
  matrix over all ten routes, a new Testcontainers suite
  (`valuation-mark-commit-http.pg.test.ts`, 64 cases) and an ADR-117 routing
  pin.

## Verification

- `npm run check`: clean. ESLint on all touched files and `guardrails:check`:
  clean. actionlint: only the pre-existing `concurrency.queue` finding.
  `npm run policy:verify`: pass.
- `npm test`: 17811 passed, 94 skipped, 3 failed. The matrix gate waits on owner
  approval. `verify-vendored-skills` trips on untracked local `.agents/skills`
  directories. The knowledge-graph residue test trips on the local graph built
  for `approve-matrix`. CI clones have neither directory.
- Testcontainers: `valuation-mark-commit-http.pg.test.ts` 64 passed.
- Live check: Node `fetch` with `redirect: 'manual'` against the production
  project domain returned `302` to `vercel.com/sso-api`.
- `gitleaks git` over `8430bfcf9..HEAD`: no leaks.

## Owner steps

- Run the real `approve-matrix` with the scoped review, then `validate-matrix`
  and `render-matrix`, and commit the result.
- Run the write-guard rollout census before the release that carries this
  change.
- Merge before the F_1.3.8 S8 capture, and outside the S6 hold and the ADR-107
  freeze.
