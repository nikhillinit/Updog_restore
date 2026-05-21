---
status: ACTIVE
last_updated: 2026-05-21
---

# GitHub Actions Workflows Inventory

## Overview

This README is a lightweight, repo-verified index of the workflow files
currently present in `.github/workflows`.

**Verified on**: 2026-05-21

- **Total tracked workflow YAML files**: `17`
- **Source of truth**: `.github/workflows/*.yml`
- **Active GitHub registry**: May contain deleted historical workflows and
  GitHub-generated workflows such as Dependabot, Pages, or Copilot entries.
  Treat registry cleanup as an operations task separate from YAML refactors.
- **Historical machine-readable snapshot**:
  `docs/archive/2026-q2/generated-inventory-snapshots/inventory.generated.json`

Older roll-up metrics in this file, including YAML line totals, secret counts,
status tallies, badge-consumer counts, and consolidation targets, were removed
because they no longer matched the live repository.

## Files in This Directory

- Historical snapshot:
  `docs/archive/2026-q2/generated-inventory-snapshots/inventory.generated.json`
- No live machine-readable workflow inventory is currently checked in under
  `docs/workflows/`
- `CONSOLIDATION_PLAN_V2.md` - Historical consolidation planning
- `CONSOLIDATION_PLAN_V3_FINAL.md` - Historical consolidation planning
- `PAIRED-AGENT-VALIDATION.md` - Historical validation notes
- `PRODUCTION_SCRIPTS.md` - Production-script reference
- `README.md` - This repo-verified workflow index

## Current Workflow Files

The repository currently contains these workflow files:

1. `archive-guard.yml`
2. `bundle-size-check.yml`
3. `ci-unified.yml`
4. `code-quality.yml`
5. `codeql.yml`
6. `core-validation.yml`
7. `dependency-validation.yml`
8. `dockerfile-lint.yml`
9. `docs-routing-check.yml`
10. `docs-validate.yml`
11. `reflection-validate.yml`
12. `security-scan.yml`
13. `security-tests.yml`
14. `skip-counter.yml`
15. `testcontainers-ci.yml`
16. `verify-strategic-docs.yml`
17. `zap-baseline.yml`

## Inventory Format

When a workflow inventory is regenerated, it should follow a shape like this:

```json
{
  "workflow": "workflow-name.yml",
  "lines": 123,
  "lastModified": "2026-04-18",
  "hasOnTrigger": true,
  "secretsCount": 0,
  "badgeConsumers": 0,
  "workflowCallConsumers": 0,
  "status": "ACTIVE"
}
```

### Field Descriptions

- **workflow**: Workflow filename
- **lines**: YAML line count at inventory time
- **lastModified**: Last modified date recorded by the inventory generator
- **hasOnTrigger**: Whether the workflow defines an `on:` trigger
- **secretsCount**: Secret references counted by the inventory generator
- **badgeConsumers**: Number of badge or doc references counted
- **workflowCallConsumers**: Number of inbound workflow calls counted
- **status**: Inventory status assigned by the generator

## Maintenance Notes

- This README should only claim metrics that are easy to verify from the live
  repo.
- Use `CI Unified / CI Gate Status` as the planned required branch-protection
  check after parity. Do not require standalone path-filtered workflows unless
  they are proven to report a status for every PR shape.
- If you need exact trigger, secret, or workflow-call statistics, regenerate the
  machine-readable inventory instead of hand-editing this file.
- If the workflow file count changes, update the verified count and file list in
  this README.

## Quick Verification Commands

```powershell
# Count workflow files
(Get-ChildItem -Path '.github/workflows' -File | Measure-Object).Count

# List current workflow files
Get-ChildItem -Path '.github/workflows' -File | Sort-Object Name |
  Select-Object -ExpandProperty Name
```
