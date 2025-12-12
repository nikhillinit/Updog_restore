# Documentation Frontmatter Schema (YAML)

Every Markdown doc should begin with YAML frontmatter for discoverability and
maintenance.

## Required Fields

```yaml
---
status: ACTIVE | REFERENCE | HISTORICAL | DEPRECATED
audience: humans | agents | both
last_updated: YYYY-MM-DD
---
```

## Optional Fields

```yaml
---
# Phase association (for Phoenix docs)
phase: "Phase 0" | "Phase 1A" | "Phase 1B" | "Phase 2" | "Phase 3+" | null

# Related source files
related_code:
  - "path/to/file.ts"
  - "path/to/another.ts"

# For DEPRECATED docs only
superseded_by: "path/to/new-doc.md"

# Categorization
categories:
  - development
  - testing
  - deployment
  - architecture
  - phoenix
  - troubleshooting

# Search keywords
keywords:
  - freeform
  - terms
  - for
  - search

# Agent routing hints
agent_routing:
  priority: 1  # 1 = check first, 5 = check last
  use_cases:
    - capability_discovery
    - task_execution
    - error_resolution

# Maintenance triggers
requires_update_trigger:
  - event: "phoenix_phase_transition"
    action: "Review phase references"
  - event: "new_agent_added"
    action: "Update agent routing tables"
---
```

## Field Definitions

### status

| Value | Meaning |
|---|---|
| ACTIVE | Current, regularly updated |
| REFERENCE | Timeless reference material |
| HISTORICAL | Past context, may be superseded |
| DEPRECATED | Obsolete, see `superseded_by` |

### audience

| Value | Meaning |
|---|---|
| humans | Human developers, PMs, analysts |
| agents | AI agents, IDE integrations |
| both | Both humans and agents |

### agent_routing.priority

- `1` = Check this doc first during discovery
- `2-3` = Standard priority
- `4-5` = Check last, fallback docs

### agent_routing.use_cases

- `capability_discovery` - Finding existing solutions
- `task_execution` - Performing work
- `error_resolution` - Debugging issues

## Guidelines

1. **status + audience + last_updated** are required for all docs
2. **superseded_by** is required when status = DEPRECATED
3. **phase** should be set for Phoenix-related docs
4. **agent_routing.priority: 1** means high discovery priority
5. **last_updated** is used for staleness checks

## Example: Phoenix Doc

```yaml
---
status: ACTIVE
audience: both
last_updated: 2025-12-12
phase: "Phase 1B"
categories: [phoenix, testing]
keywords: [truth-cases, validation, waterfall]
agent_routing:
  priority: 1
  use_cases: [task_execution, error_resolution]
requires_update_trigger:
  - event: "phoenix_phase_transition"
    action: "Review phase gates and thresholds"
---
```

## Example: Reference Doc

```yaml
---
status: REFERENCE
audience: humans
last_updated: 2025-12-12
categories: [architecture]
keywords: [patterns, conventions]
---
```

## Example: Deprecated Doc

```yaml
---
status: DEPRECATED
audience: both
last_updated: 2025-11-01
superseded_by: "docs/PHOENIX-SOT/execution-plan-v2.35.md"
---
```
