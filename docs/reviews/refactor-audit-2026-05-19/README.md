---
status: REFERENCE
last_updated: 2026-05-20
owner: Core Team
categories: [reviews, refactor, audit]
keywords: [refactor, audit, roadmap, cleanup]
source_of_truth: false
related:
  - docs/governance/2026-05-19-refactor-roadmap.md
---

# Refactor Audit Evidence - 2026-05-19

These files are raw audit evidence for the refactor roadmap. They are not
independent execution plans.

Use `docs/governance/2026-05-19-refactor-roadmap.md` for the canonical priority
order and execution guidance. If a raw audit conflicts with that roadmap, the
roadmap wins unless code evidence proves it stale.

## Files

| File                              | Purpose                                                                |
| --------------------------------- | ---------------------------------------------------------------------- |
| `architectural-audit.md`          | Architecture and boundary risks                                        |
| `code-quality-audit.md`           | Duplicate code, naming, complexity, and utility consolidation evidence |
| `devops-dx-audit.md`              | Script, workflow, environment, and local developer experience evidence |
| `repository-structure-audit.md`   | Directory structure and documentation cleanup evidence                 |
| `testing-infrastructure-audit.md` | Test config, quarantine, helper, and naming evidence                   |
