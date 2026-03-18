# COMPLEXITY CHECKPOINT

**Triggered at:** 2026-03-18 13:09:13 **Prompt excerpt:** critically review this
proposed plan for improvement:

The repo has 14 open PRs, the newest grou...

## [PLANNING-WITH-FILES] Risk assessment task

Create before starting:

```
docs/plans/2026-03-18-<task-name>/
  task_plan.md   - Phases and progress
  findings.md    - Research and discoveries
  progress.md    - Session log
```

## [CODEX CHECKPOINT] Security-related changes require review

Per CLAUDE.md codex_checkpoint rule, Codex is REQUIRED for:

- Architectural decisions or design review
- Implementation review or code quality
- Debugging complex/unclear issues
- External code/tooling evaluation
- Performance analysis or optimization

Usage:

```bash
codex-wrapper - $(pwd) <<'EOF'
[analysis prompt]
EOF
```
