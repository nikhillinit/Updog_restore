# Claude Workflow Engine Integration Plan

**Created**: 2025-12-19
**Status**: INSTALLED - Verification Pending
**Target Branch**: `claude/review-tech-debt-b2hJS`

## Executive Summary

This plan integrates components from two external repositories into the Updog platform to enhance Week 1 tech debt remediation:

1. **[claude-workflow-engine](https://github.com/benreceveur/claude-workflow-engine)** - 19 skills + 10 agents with 93.8% routing accuracy
2. **[wshobson/agents](https://github.com/wshobson/agents)** - 67 plugins with comprehensive commands and agents

## Component Selection

### Skills to Integrate (6 of 19)

| Skill | Purpose | Week 1 Day | Priority |
|-------|---------|------------|----------|
| `tech-debt-tracker` | Automated debt analysis, tracking, prioritization | All | HIGH |
| `security-scanner` | SAST, secrets, OWASP, dependency vulnerabilities | Day 1 | HIGH |
| `dependency-guardian` | npm audit, vulnerability scanning, license compliance | Day 1 | HIGH |
| `test-first-change` | Test discovery before code changes | Day 3 | MEDIUM |
| `code-formatter` | ESLint/Prettier automation | Day 5 | MEDIUM |
| `documentation-sync` | Code/docs drift detection | Day 4 | LOW |

### Agents to Integrate (4 of 10) - from claude-workflow-engine

| Agent | Purpose | Week 1 Day | Priority |
|-------|---------|------------|----------|
| `typescript-pro` | Express type consolidation expertise | Day 2 | HIGH |
| `security-engineer` | Security-focused vite.config review | Day 1 | HIGH |
| `test-automator` | Engine test re-enablement strategy | Day 3 | MEDIUM |
| `code-reviewer` | Quality gate before completion | Day 5 | MEDIUM |

### Commands & Agents from wshobson/agents (4 selected)

| Component | Type | Purpose | Week 1 Day |
|-----------|------|---------|------------|
| `tech-debt` | Command | Comprehensive debt inventory, metrics, prioritization | All |
| `deps-audit` | Command | Dependency security analysis, CVE scanning, license compliance | Day 1 |
| `legacy-modernizer` | Agent | Strangler fig pattern, framework migrations, backward compat | Day 2-4 |
| `typescript-pro` | Agent | Advanced TypeScript types, strict config, namespace organization | Day 2 |

## Integration Architecture

```
.claude/
├── agents/
│   ├── PHOENIX-AGENTS.md           # Existing Phoenix agents (9 agents)
│   ├── workflow-engine/            # NEW: Workflow engine agents (4)
│   │   ├── typescript-pro.md
│   │   ├── security-engineer.md
│   │   ├── test-automator.md
│   │   └── code-reviewer.md
│   └── wshobson/                   # NEW: wshobson/agents plugins (4)
│       ├── typescript-pro.md       # Advanced TS, model: opus
│       ├── legacy-modernizer.md    # Strangler fig pattern
│       ├── code-reviewer.md        # Quality assessment
│       └── test-automator.md       # Test strategy
│
├── commands/
│   └── wshobson/                   # NEW: wshobson commands (2)
│       ├── tech-debt.md            # Comprehensive debt analysis
│       └── deps-audit.md           # Dependency security audit
│
├── skills/
│   ├── (existing Phoenix skills)
│   └── workflow-engine/            # NEW: Workflow engine skills (6)
│       ├── tech-debt-tracker/
│       │   ├── SKILL.md
│       │   └── scripts/main.py
│       ├── security-scanner/
│       │   ├── SKILL.md
│       │   └── scripts/main.py
│       ├── dependency-guardian/
│       │   ├── SKILL.md
│       │   └── scripts/main.py
│       ├── test-first-change/
│       │   ├── SKILL.md
│       │   └── scripts/run_tests.sh
│       ├── code-formatter/
│       │   ├── SKILL.md
│       │   └── scripts/main.py
│       └── documentation-sync/
│           ├── SKILL.md
│           └── scripts/main.py
│
└── PHOENIX-TOOL-ROUTING.md         # Updated with all integrated tools
```

## Installed Components Summary

| Source | Type | Count | Status |
|--------|------|-------|--------|
| Phoenix (existing) | Agents | 9 | Baseline |
| Phoenix (existing) | Skills | ~15 | Baseline |
| claude-workflow-engine | Skills | 6 | INSTALLED |
| claude-workflow-engine | Agents | 4 | INSTALLED |
| wshobson/agents | Commands | 2 | INSTALLED |
| wshobson/agents | Agents | 4 | INSTALLED |
| **Total New** | | **16** | |

## Phoenix + Workflow Engine Synergy Map

### Day 1: Security Patches

```
WORKFLOW ENGINE                      PHOENIX
---------------                      -------
security-scanner --operation scan-all
        |
        v
dependency-guardian --operation scan
        |
        v
                                    /deploy-check (validation)
```

### Day 2: Express Type Consolidation

```
WORKFLOW ENGINE                      PHOENIX
---------------                      -------
typescript-pro agent
        |
        v
                                    schema-drift-checker agent
        |
        v
code-reviewer agent                  code-reviewer agent
```

### Day 3: Engine Test Re-enablement

```
WORKFLOW ENGINE                      PHOENIX
---------------                      -------
test-first-change (baseline)
        |
        v
                                    phoenix-truth-case-runner (pass rates)
        |
        v
test-automator agent                 waterfall-specialist
                                    xirr-fees-validator
        |
        v
                                    /test-smart (affected tests)
```

### Day 4: Validation Pipeline

```
WORKFLOW ENGINE                      PHOENIX
---------------                      -------
                                    phoenix-precision-guardian (coercion)
        |
        v
typescript-pro agent
        |
        v
documentation-sync (drift)           phoenix-docs-scribe (JSDoc)
```

### Day 5: Final Validation

```
WORKFLOW ENGINE                      PHOENIX
---------------                      -------
code-formatter (ESLint)              /fix-auto
        |
        v
code-reviewer agent
        |
        v
                                    phoenix-truth-case-runner (regression)
        |
        v
                                    /deploy-check (comprehensive)
```

## Installation Steps

### Phase 1: Create Directory Structure

```bash
# Create workflow engine directories
mkdir -p .claude/skills/workflow-engine
mkdir -p .claude/agents/workflow-engine
```

### Phase 2: Install Skills (Priority Order)

1. **tech-debt-tracker** (HIGH - All days)
   - Copy SKILL.md and scripts/
   - Configure for TypeScript/JavaScript
   - Set up .techdebtrc.json

2. **security-scanner** (HIGH - Day 1)
   - Copy SKILL.md and scripts/
   - Configure OWASP checks
   - Set severity thresholds

3. **dependency-guardian** (HIGH - Day 1)
   - Copy SKILL.md and scripts/
   - Configure for npm
   - Set vulnerability thresholds

4. **test-first-change** (MEDIUM - Day 3)
   - Copy SKILL.md and scripts/
   - Configure for Vitest

5. **code-formatter** (MEDIUM - Day 5)
   - Copy SKILL.md and scripts/
   - Configure for ESLint + Prettier

6. **documentation-sync** (LOW - Day 4)
   - Copy SKILL.md and scripts/
   - Configure drift detection

### Phase 3: Install Agents

1. Copy agent definitions from agents.json
2. Create individual .md files in .claude/agents/workflow-engine/
3. Update PHOENIX-TOOL-ROUTING.md with new agents

### Phase 4: Configuration

Create `.workflow-engine-config.json`:
```json
{
  "skills": {
    "tech-debt-tracker": {
      "thresholds": {
        "complexity": { "cyclomatic": 15, "cognitive": 20 },
        "coverage": { "line": 80, "branch": 75 }
      },
      "exclude": ["node_modules/**", "dist/**", "*.test.ts"]
    },
    "security-scanner": {
      "severity_threshold": "high",
      "owasp_version": "2021",
      "dependency_check": true
    },
    "dependency-guardian": {
      "autoMerge": { "patch": true, "minor": false, "major": false },
      "severityThreshold": "high"
    }
  },
  "agents": {
    "routing_threshold": 0.65,
    "prefer_skills": true
  }
}
```

### Phase 5: Update Tool Routing

Add to `.claude/PHOENIX-TOOL-ROUTING.md`:

```markdown
## Workflow Engine Integration

### Skill Selection (from workflow-engine)
| Task Pattern | Skill | Confidence |
|--------------|-------|------------|
| "technical debt", "code quality" | tech-debt-tracker | 0.66+ |
| "security scan", "vulnerabilities" | security-scanner | 0.70+ |
| "npm audit", "dependencies" | dependency-guardian | 0.65+ |
| "run tests first" | test-first-change | 0.60+ |
| "format code", "eslint" | code-formatter | 0.65+ |
| "documentation sync" | documentation-sync | 0.55+ |

### Agent Selection (from workflow-engine)
| Task Pattern | Agent | When to Use |
|--------------|-------|-------------|
| TypeScript types, generics | typescript-pro | Day 2 Express types |
| Security review, OWASP | security-engineer | Day 1 vite.config |
| Test strategy, coverage | test-automator | Day 3 engine tests |
| Code review, quality | code-reviewer | Day 5 final check |
```

### Phase 6: Verify Integration

```bash
# Test skill availability
node .claude/skills/workflow-engine/tech-debt-tracker/scripts/main.py --help

# Test agent routing
Task("typescript-pro", "Review Express type definitions for conflicts")

# Run combined workflow
/deploy-check
```

## Compatibility Notes

### No Conflicts Identified

- Phoenix agents use unique memory tenant IDs (`agent:phoenix-*`)
- Workflow engine skills use separate namespace (`workflow-engine/`)
- File patterns don't overlap

### Complementary Capabilities

| Phoenix | Workflow Engine | Synergy |
|---------|-----------------|---------|
| phoenix-precision-guardian | typescript-pro | Type safety validation |
| phoenix-truth-case-runner | test-first-change | Test baseline + validation |
| phoenix-docs-scribe | documentation-sync | JSDoc + drift detection |
| /fix-auto | code-formatter | Lint repair automation |
| /deploy-check | security-scanner | Build + security validation |

## Rollback Plan

If integration causes issues:

1. Remove `.claude/skills/workflow-engine/` directory
2. Remove `.claude/agents/workflow-engine/` directory
3. Revert changes to `.claude/PHOENIX-TOOL-ROUTING.md`
4. Delete `.workflow-engine-config.json`

## Success Criteria

- [ ] All 6 skills installed and functional
- [ ] All 4 agents available via Task tool
- [ ] No conflicts with existing Phoenix agents
- [ ] Combined routing works correctly
- [ ] Week 1 Day 1 tasks complete successfully using integrated tools

## Timeline

| Step | Duration | Status |
|------|----------|--------|
| Phase 1: Directory Structure | 1 min | PENDING |
| Phase 2: Install Skills | 5 min | PENDING |
| Phase 3: Install Agents | 2 min | PENDING |
| Phase 4: Configuration | 2 min | PENDING |
| Phase 5: Update Routing | 3 min | PENDING |
| Phase 6: Verification | 5 min | PENDING |
| **Total** | **~18 min** | |

---

**Approval Required**: Proceed with installation?
