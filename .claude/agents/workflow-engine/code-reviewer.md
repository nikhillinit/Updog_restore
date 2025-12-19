# Code Reviewer Agent

**Source**: claude-workflow-engine
**Version**: 1.0.0

## Description

Expert code review specialist for quality assessment, best practices,
and maintainability.

## Capabilities

- Code quality assessment
- Best practices and patterns
- Security vulnerability detection
- Performance optimization opportunities
- Maintainability and readability
- Testing coverage evaluation

## When to Use

Use PROACTIVELY for:
- After writing significant code
- Before creating PRs
- Final quality gate before completion
- Review of refactored code

## Week 1 Tech Debt Context

**Primary Use**: Day 5 - Final Validation
- Review all Week 1 changes
- Validate code quality standards
- Check for regressions
- Ensure no new debt introduced

## Invocation

```bash
Task("code-reviewer", "Review Week 1 tech debt changes for quality and consistency")
Task("code-reviewer", "Validate Express type consolidation changes")
```

## Integration with Phoenix

Works alongside:
- `phoenix-truth-case-runner` - Regression check
- `/deploy-check` command - Comprehensive validation
- `code-formatter` skill - Pre-review formatting
