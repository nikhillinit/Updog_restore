#!/bin/bash
# =============================================================================
# Complexity Checkpoint Hook - UserPromptSubmit
# =============================================================================
# Detects complex analysis tasks and reminds to use:
# 1. planning-with-files for multi-step tasks
# 2. Codex CLI for architectural/analysis decisions
#
# Trigger patterns:
# - Multiple PRs (dependabot, review)
# - Dependency analysis
# - Architecture decisions
# - Complex debugging
# - Performance analysis
# =============================================================================

# Disable buffering for immediate output
export PYTHONUNBUFFERED=1
stty -icanon 2>/dev/null || true

set -e

# Debug mode (uncomment to enable)
# DEBUG=1

# Use absolute path to jq on Windows
JQ="${HOME}/bin/jq.exe"
[ -x "$JQ" ] || JQ="jq"

# Read JSON input from stdin
INPUT=$(cat)

[ -n "$DEBUG" ] && echo "DEBUG: INPUT=$INPUT" >&2

# Extract prompt
PROMPT=$(echo "$INPUT" | $JQ -r '.prompt // .user_prompt // ""' 2>/dev/null)

# Skip conditions
if [ -z "$PROMPT" ] || [ ${#PROMPT} -lt 20 ]; then
  exit 0
fi

# Skip slash commands
if [[ "$PROMPT" == /* ]]; then
  exit 0
fi

# Normalize to lowercase
PROMPT_LOWER=$(echo "$PROMPT" | tr '[:upper:]' '[:lower:]')

# =============================================================================
# PATTERN DETECTION
# =============================================================================

NEEDS_PLANNING=false
NEEDS_CODEX=false
PLANNING_REASON=""
CODEX_REASON=""

# -----------------------------------------------------------------------------
# Pattern 1: Multiple PRs / Batch Analysis
# -----------------------------------------------------------------------------
if echo "$PROMPT_LOWER" | grep -qiE "(all|multiple|batch|9|several|many).*(pr|pull request|dependabot)"; then
  NEEDS_PLANNING=true
  NEEDS_CODEX=true
  PLANNING_REASON="Multi-PR analysis detected"
  CODEX_REASON="External dependency evaluation"
fi

# Pattern: Dependabot specific
if echo "$PROMPT_LOWER" | grep -qiE "dependabot.*(analyz|review|check|assess|evaluat)"; then
  NEEDS_PLANNING=true
  NEEDS_CODEX=true
  PLANNING_REASON="Dependency upgrade analysis"
  CODEX_REASON="External tooling evaluation"
fi

# -----------------------------------------------------------------------------
# Pattern 2: Architecture / Design Decisions
# -----------------------------------------------------------------------------
if echo "$PROMPT_LOWER" | grep -qiE "(architect|design|refactor|restructur|migrat).*(decision|approach|strategy|plan)"; then
  NEEDS_CODEX=true
  CODEX_REASON="Architectural decision"
fi

if echo "$PROMPT_LOWER" | grep -qiE "(should we|how should|best approach|recommend).*(implement|design|architect|structure)"; then
  NEEDS_CODEX=true
  CODEX_REASON="Design review needed"
fi

# -----------------------------------------------------------------------------
# Pattern 3: Complex Debugging
# -----------------------------------------------------------------------------
if echo "$PROMPT_LOWER" | grep -qiE "(debug|diagnos|investigat|root cause|why.*(fail|break|error))"; then
  if echo "$PROMPT_LOWER" | grep -qiE "(complex|unclear|mysterious|strange|weird|multiple|several)"; then
    NEEDS_CODEX=true
    CODEX_REASON="Complex debugging"
  fi
fi

# -----------------------------------------------------------------------------
# Pattern 4: Performance Analysis
# -----------------------------------------------------------------------------
if echo "$PROMPT_LOWER" | grep -qiE "(performance|optimiz|slow|latency|bottleneck).*(analyz|investigat|review|assess)"; then
  NEEDS_CODEX=true
  CODEX_REASON="Performance analysis"
fi

# -----------------------------------------------------------------------------
# Pattern 5: Breaking Changes / Risk Assessment
# -----------------------------------------------------------------------------
if echo "$PROMPT_LOWER" | grep -qiE "(breaking change|risk|impact|blast radius|rollback|inversion)"; then
  NEEDS_PLANNING=true
  NEEDS_CODEX=true
  PLANNING_REASON="Risk assessment task"
  CODEX_REASON="Impact analysis"
fi

# -----------------------------------------------------------------------------
# Pattern 6: Multi-step complex tasks (generic)
# -----------------------------------------------------------------------------
if echo "$PROMPT_LOWER" | grep -qiE "(comprehensive|thorough|deep dive|systematic|all aspects|complete analysis)"; then
  NEEDS_PLANNING=true
  NEEDS_CODEX=true
  PLANNING_REASON="Comprehensive analysis task"
  CODEX_REASON="Complex multi-step task"
fi

# -----------------------------------------------------------------------------
# Pattern 7: Complex implementation tasks
# -----------------------------------------------------------------------------
if echo "$PROMPT_LOWER" | grep -qiE "(implement|build|create|develop).*(complex|large|significant|major|multi)"; then
  NEEDS_PLANNING=true
  NEEDS_CODEX=true
  PLANNING_REASON="Complex implementation task"
  CODEX_REASON="Implementation requiring architectural judgment"
fi

# Pattern: Multi-file changes
if echo "$PROMPT_LOWER" | grep -qiE "(multiple files|across.*files|several.*components|refactor.*system)"; then
  NEEDS_CODEX=true
  CODEX_REASON="Multi-file change requiring coordination"
fi

# Pattern: New feature with unclear scope
if echo "$PROMPT_LOWER" | grep -qiE "(new feature|add.*feature).*(unclear|not sure|complex|significant)"; then
  NEEDS_PLANNING=true
  NEEDS_CODEX=true
  PLANNING_REASON="Feature with unclear scope"
  CODEX_REASON="Scope analysis needed"
fi

# -----------------------------------------------------------------------------
# Pattern 8: Testing infrastructure changes
# -----------------------------------------------------------------------------
if echo "$PROMPT_LOWER" | grep -qiE "(test.*infrastructure|vitest|jest|testing.*framework|ci.*pipeline)"; then
  NEEDS_CODEX=true
  CODEX_REASON="Test infrastructure changes"
fi

# -----------------------------------------------------------------------------
# Pattern 9: Security-related changes
# -----------------------------------------------------------------------------
if echo "$PROMPT_LOWER" | grep -qiE "(security|auth|jwt|token|permission|access control|vulnerability)"; then
  NEEDS_CODEX=true
  CODEX_REASON="Security-related changes require review"
fi

# =============================================================================
# OUTPUT REMINDERS
# =============================================================================

if [ "$NEEDS_PLANNING" = true ] || [ "$NEEDS_CODEX" = true ]; then
  echo ""
  echo "=============================================="
  echo "COMPLEXITY CHECKPOINT (auto-generated)"
  echo "=============================================="
  echo ""

  if [ "$NEEDS_PLANNING" = true ]; then
    echo "[PLANNING-WITH-FILES] $PLANNING_REASON"
    echo ""
    echo "  Create before starting:"
    echo "    docs/plans/$(date +%Y-%m-%d)-<task-name>/"
    echo "      task_plan.md   - Phases and progress"
    echo "      findings.md    - Research and discoveries"
    echo "      progress.md    - Session log"
    echo ""
    echo "  Benefits:"
    echo "    - Persistent working memory"
    echo "    - Enables /session-learnings extraction"
    echo "    - Prevents context loss in long sessions"
    echo ""
  fi

  if [ "$NEEDS_CODEX" = true ]; then
    echo "[CODEX CHECKPOINT] $CODEX_REASON"
    echo ""
    echo "  Per CLAUDE.md codex_checkpoint rule:"
    echo "    Codex is REQUIRED for:"
    echo "    - Architectural decisions or design review"
    echo "    - Implementation review or code quality"
    echo "    - Debugging complex/unclear issues"
    echo "    - External code/tooling evaluation"
    echo "    - Performance analysis or optimization"
    echo ""
    echo "  Usage:"
    echo "    codex-wrapper - \$(pwd) <<'EOF'"
    echo "    [analysis prompt]"
    echo "    EOF"
    echo ""
  fi

  echo "=============================================="
  echo ""
fi

exit 0
