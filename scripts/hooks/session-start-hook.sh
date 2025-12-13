#!/bin/bash
# =============================================================================
# Session Start Hook - Smart Context Loading
# =============================================================================
# Provides contextual information when a session starts:
# - Project capabilities summary
# - Git context (branch, uncommitted changes, recent work)
# - Contextual recommendations based on current state
#
# Usage: Called automatically by Claude Code via SessionStart hook
# =============================================================================

set -e

PROJECT_ROOT=$(pwd)

# =============================================================================
# CAPABILITIES SUMMARY
# =============================================================================

AGENT_COUNT=$(find .claude/agents -name "*.md" -type f 2>/dev/null | wc -l)
SKILL_COUNT=$(find .claude/skills -name "*.md" -type f 2>/dev/null | wc -l)
CMD_COUNT=$(find .claude/commands -name "*.md" -type f 2>/dev/null | wc -l)
CHEATSHEET_COUNT=$(find cheatsheets -name "*.md" -type f 2>/dev/null | wc -l)

echo ""
echo "=============================================="
echo "SESSION CONTEXT"
echo "=============================================="

# =============================================================================
# GIT CONTEXT
# =============================================================================

if git rev-parse --git-dir >/dev/null 2>&1; then
  BRANCH=$(git branch --show-current 2>/dev/null || echo "detached")

  # Count uncommitted changes
  STAGED=$(git diff --cached --numstat 2>/dev/null | wc -l)
  UNSTAGED=$(git diff --numstat 2>/dev/null | wc -l)
  UNTRACKED=$(git ls-files --others --exclude-standard 2>/dev/null | wc -l)

  echo ""
  echo "Git Status:"
  echo "  Branch: $BRANCH"

  if [ "$STAGED" -gt 0 ] || [ "$UNSTAGED" -gt 0 ] || [ "$UNTRACKED" -gt 0 ]; then
    echo "  Changes: ${STAGED} staged, ${UNSTAGED} unstaged, ${UNTRACKED} untracked"
  else
    echo "  Changes: Clean working tree"
  fi

  # Recent commits (last 3 on this branch)
  RECENT_COMMITS=$(git log --oneline -3 2>/dev/null || true)
  if [ -n "$RECENT_COMMITS" ]; then
    echo ""
    echo "Recent commits:"
    echo "$RECENT_COMMITS" | while read -r line; do
      echo "  $line"
    done
  fi

  # Detect work context from branch name or recent changes
  WORK_CONTEXT=""

  # Check branch name for context clues
  if echo "$BRANCH" | grep -qiE "fix|bug|hotfix"; then
    WORK_CONTEXT="bugfix"
  elif echo "$BRANCH" | grep -qiE "feat|feature|add"; then
    WORK_CONTEXT="feature"
  elif echo "$BRANCH" | grep -qiE "refactor|clean|improve"; then
    WORK_CONTEXT="refactor"
  elif echo "$BRANCH" | grep -qiE "test|spec"; then
    WORK_CONTEXT="testing"
  elif echo "$BRANCH" | grep -qiE "doc|docs"; then
    WORK_CONTEXT="documentation"
  elif echo "$BRANCH" | grep -qiE "perf|performance|optimize"; then
    WORK_CONTEXT="performance"
  fi

  # Check recent file changes for context
  if [ -z "$WORK_CONTEXT" ]; then
    RECENT_FILES=$(git diff --name-only HEAD~3 2>/dev/null || git diff --name-only 2>/dev/null || true)
    if echo "$RECENT_FILES" | grep -qE "\.test\.|\.spec\.|__tests__"; then
      WORK_CONTEXT="testing"
    elif echo "$RECENT_FILES" | grep -qE "\.md$"; then
      WORK_CONTEXT="documentation"
    fi
  fi
fi

# =============================================================================
# CONTEXTUAL RECOMMENDATIONS
# =============================================================================

echo ""
echo "Available Assets:"
echo "  ${AGENT_COUNT:-0} agents | ${SKILL_COUNT:-0} skills | ${CMD_COUNT:-0} commands | ${CHEATSHEET_COUNT:-0} cheatsheets"

# Provide contextual recommendations
echo ""
echo "Suggested for this session:"

case "$WORK_CONTEXT" in
  bugfix)
    echo "  - Agent: debug-expert, silent-failure-hunter"
    echo "  - Skill: systematic-debugging, root-cause-tracing"
    echo "  - Command: /fix-auto (quick fixes)"
    ;;
  feature)
    echo "  - Agent: test-automator, code-reviewer"
    echo "  - Skill: writing-plans, executing-plans, verification-before-completion"
    echo "  - Command: /test-smart (affected tests)"
    ;;
  refactor)
    echo "  - Agent: code-simplifier, code-reviewer"
    echo "  - Skill: iterative-improvement, pattern-recognition"
    echo "  - Cheatsheet: anti-pattern-prevention.md"
    ;;
  testing)
    echo "  - Agent: test-automator, test-repair, pr-test-analyzer"
    echo "  - Skill: testing-anti-patterns, condition-based-waiting"
    echo "  - Cheatsheet: testing.md, service-testing-patterns.md"
    ;;
  documentation)
    echo "  - Agent: docs-architect, phoenix-docs-scribe"
    echo "  - Skill: memory-management"
    echo "  - Cheatsheet: claude-md-guidelines.md"
    ;;
  performance)
    echo "  - Agent: perf-guard, code-simplifier"
    echo "  - Skill: pattern-recognition"
    echo "  - Cheatsheet: react-performance-patterns.md"
    ;;
  *)
    echo "  - Start with: CAPABILITIES.md (full inventory)"
    echo "  - Quick access: /workflows (interactive guide)"
    echo "  - Discovery auto-suggests tools for each prompt"
    ;;
esac

# =============================================================================
# KEY REMINDERS
# =============================================================================

echo ""
echo "Key Workflows:"
echo "  /test-smart   - Run only affected tests"
echo "  /fix-auto     - Auto-repair lint/format/simple failures"
echo "  /deploy-check - Pre-deployment validation"

echo ""
echo "=============================================="
echo ""

exit 0
