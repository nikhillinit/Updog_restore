---
status: ACTIVE
last_updated: 2026-04-18
---

# GitHub Actions Workflows Inventory

## Overview

This README is a lightweight, repo-verified index of the workflow files
currently present in `.github/workflows`.

**Verified on**: 2026-04-18

- **Total workflow files**: `16`
- **Source of truth**: `.github/workflows/*.yml`
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

1. `bundle-size-check.yml`
2. `ci-unified.yml`
3. `code-quality.yml`
4. `codeql.yml`
5. `core-validation.yml`
6. `dependency-validation.yml`
7. `dockerfile-lint.yml`
8. `docs-routing-check.yml`
9. `docs-validate.yml`
10. `reflection-validate.yml`
11. `security-scan.yml`
12. `security-tests.yml`
13. `skip-counter.yml`
14. `testcontainers-ci.yml`
15. `verify-strategic-docs.yml`
16. `zap-baseline.yml`

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
