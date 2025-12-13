#!/bin/bash
# =============================================================================
# Discovery Hook - UserPromptSubmit
# =============================================================================
# Automatically discovers and recommends existing tools/assets before processing
# user prompts. Scans: agents, skills, commands, plugins, MCP servers.
#
# Usage: Called automatically by Claude Code via UserPromptSubmit hook
# Input: JSON on stdin with prompt field
# Output: Discovery results injected as context (max 5 recommendations)
# =============================================================================

set -e

# Configuration
MAX_RESULTS=7
MIN_KEYWORD_LENGTH=4

# Read JSON input from stdin
INPUT=$(cat)

# Extract prompt (handle both 'prompt' and 'user_prompt' fields)
PROMPT=$(echo "$INPUT" | jq -r '.prompt // .user_prompt // ""' 2>/dev/null)

# Skip conditions
if [ -z "$PROMPT" ] || [ ${#PROMPT} -lt 15 ]; then
  exit 0  # Too short, pass through
fi

# Skip slash commands (already routed)
if [[ "$PROMPT" == /* ]]; then
  exit 0
fi

# Skip simple responses
if echo "$PROMPT" | grep -qiE "^(yes|no|ok|thanks|thank you|y|n|sure|done|good)$"; then
  exit 0
fi

# =============================================================================
# TASK BUNDLES - Groups of related skills/agents for common tasks
# =============================================================================
# Format: "trigger_phrase|type1:name1,type2:name2,..."

declare -A TASK_BUNDLES=(
  # Critical evaluation - thorough review with multiple perspectives
  ["critical|critique|evaluate|assess|validate|verify|thorough"]="skill:inversion-thinking,skill:pattern-recognition,agent:code-reviewer,agent:silent-failure-hunter"

  # Planning and design - structured approach to new work
  ["plan|design|architect|strategy|approach"]="skill:brainstorming,skill:writing-plans,skill:task-decomposition,skill:architecture-patterns,agent:docs-architect"

  # Deep debugging - systematic investigation
  ["debug|investigate|root cause|trace|diagnose"]="skill:systematic-debugging,skill:root-cause-tracing,skill:inversion-thinking,agent:debug-expert"

  # Code review workflow - giving or receiving reviews
  ["review|code review|pr review|pull request"]="skill:requesting-code-review,skill:receiving-code-review,agent:code-reviewer,agent:silent-failure-hunter,agent:type-design-analyzer"

  # Feature implementation - TDD workflow
  ["implement|feature|new feature|build|create"]="skill:writing-plans,skill:executing-plans,skill:continuous-improvement,agent:test-automator"

  # Testing strategy - thorough test coverage
  ["test strategy|test plan|coverage|comprehensive test"]="skill:testing-anti-patterns,skill:condition-based-waiting,agent:test-automator,agent:test-repair,agent:pr-test-analyzer"

  # Refactoring - safe code improvement
  ["refactor|simplify|clean|improve code|technical debt"]="agent:code-simplifier,skill:iterative-improvement,skill:continuous-improvement,agent:code-reviewer"

  # Performance - optimization and analysis
  ["performance|optimize|slow|bottleneck|latency"]="agent:perf-guard,skill:pattern-recognition,agent:code-simplifier"

  # Complex problem solving - multi-perspective thinking frameworks
  ["complex|difficult|tricky|challenging|hard problem"]="skill:inversion-thinking,skill:analogical-thinking,skill:extended-thinking-framework,skill:task-decomposition"

  # Anti-pattern prevention - quality and security
  ["anti-pattern|security|safe|prevent|vulnerability|race condition"]="skill:pattern-recognition,skill:inversion-thinking,agent:silent-failure-hunter,agent:code-reviewer"

  # Git workflow - branching and finishing work
  ["branch|worktree|merge|finish|complete branch"]="skill:finishing-a-development-branch,skill:using-git-worktrees,skill:verification-before-completion"

  # Parallel work - multi-agent coordination
  ["parallel|concurrent|multiple|simultaneously"]="skill:dispatching-parallel-agents,skill:subagent-driven-development,skill:task-decomposition"

  # Phoenix/VC domain - fund modeling specific
  ["waterfall|carry|clawback|xirr|irr|fees|reserves|capital|allocation"]="agent:waterfall-specialist,agent:xirr-fees-validator,agent:phoenix-capital-allocation-analyst,agent:phoenix-reserves-optimizer"

  # Documentation - writing and maintaining docs
  ["document|documentation|docs|jsdoc|readme"]="agent:docs-architect,agent:phoenix-docs-scribe,skill:memory-management"
)

# =============================================================================
# DISCOVERY FUNCTIONS
# =============================================================================

PROJECT_ROOT=$(pwd)

# Temporary file for collecting matches with scores
MATCHES_FILE=$(mktemp)
trap "rm -f $MATCHES_FILE" EXIT

# Add match with score
add_match() {
  local type="$1"
  local name="$2"
  local score="$3"
  echo "$score|$type|$name" >> "$MATCHES_FILE"
}

# Extract meaningful keywords (4+ chars, no common words)
extract_keywords() {
  local text="$1"
  echo "$text" | tr '[:upper:]' '[:lower:]' | \
    tr -cs '[:alnum:]' '\n' | \
    grep -E "^.{${MIN_KEYWORD_LENGTH},}$" | \
    grep -vE "^(help|with|this|that|have|from|what|when|where|which|would|could|should|about|after|before|between|into|through|during|before|after|above|below|under|over|again|further|then|once|here|there|where|when|some|more|most|other|such|only|same|than|also|just|like|will|make|made|know|take|come|want|look|give|find|think|tell|become|seem|leave|feel|being|because|every|still|might|while|each|both|these|those|being|doing|having|getting|going|using|trying|need|please|thanks|thank|okay|hello)$" | \
    sort -u
}

# =============================================================================
# PHASE 0: Bundle matching (highest priority - curated task bundles)
# =============================================================================

PROMPT_LOWER=$(echo "$PROMPT" | tr '[:upper:]' '[:lower:]')

for bundle_triggers in "${!TASK_BUNDLES[@]}"; do
  # Split triggers by |
  IFS='|' read -ra TRIGGERS <<< "$bundle_triggers"
  for trigger in "${TRIGGERS[@]}"; do
    if echo "$PROMPT_LOWER" | grep -qi "$trigger"; then
      # Found a bundle match - add all bundled assets with high score
      BUNDLE_ASSETS="${TASK_BUNDLES[$bundle_triggers]}"
      IFS=',' read -ra ASSETS <<< "$BUNDLE_ASSETS"
      for asset in "${ASSETS[@]}"; do
        ASSET_TYPE=$(echo "$asset" | cut -d':' -f1)
        ASSET_NAME=$(echo "$asset" | cut -d':' -f2)
        # Bundle matches get score 60 (higher than router's 50 base)
        add_match "bundle-$ASSET_TYPE" "$ASSET_NAME" "60"
      done
      break 2  # Only match one bundle per prompt
    fi
  done
done

# =============================================================================
# PHASE 1: Router-based matching (highest priority)
# =============================================================================

ROUTER_FILE="$PROJECT_ROOT/docs/_generated/router-fast.json"
if [ -f "$ROUTER_FILE" ]; then
  ROUTER_RESULT=$(cd "$PROJECT_ROOT" && npx tsx scripts/routeQueryFast.ts "$PROMPT" 2>/dev/null || true)
  if echo "$ROUTER_RESULT" | grep -q "MATCH:"; then
    ROUTE_AGENT=$(echo "$ROUTER_RESULT" | grep "^Agent:" | cut -d' ' -f2-)
    ROUTE_CMD=$(echo "$ROUTER_RESULT" | grep "^Command:" | cut -d' ' -f2-)
    ROUTE_TO=$(echo "$ROUTER_RESULT" | grep "^Route:" | cut -d' ' -f2-)
    ROUTE_SCORE=$(echo "$ROUTER_RESULT" | grep "^Score:" | awk '{print $2}')

    # Router matches get high base score
    BASE_SCORE=${ROUTE_SCORE:-2}
    PRIORITY_SCORE=$((${BASE_SCORE%.*} * 10 + 50))  # Convert to integer, add priority bonus

    if [ -n "$ROUTE_AGENT" ]; then
      add_match "router-agent" "$ROUTE_AGENT" "$PRIORITY_SCORE"
    fi
    if [ -n "$ROUTE_CMD" ]; then
      add_match "router-command" "$ROUTE_CMD" "$PRIORITY_SCORE"
    fi
    if [ -n "$ROUTE_TO" ] && [ -z "$ROUTE_AGENT" ] && [ -z "$ROUTE_CMD" ]; then
      add_match "router-doc" "$ROUTE_TO" "$((PRIORITY_SCORE - 10))"
    fi
  fi
fi

# =============================================================================
# PHASE 2: Keyword-based discovery (lower priority, targeted)
# =============================================================================

KEYWORDS=$(extract_keywords "$PROMPT")
KEYWORD_COUNT=$(echo "$KEYWORDS" | wc -w)

# Only do keyword search if we have meaningful keywords
if [ "$KEYWORD_COUNT" -gt 0 ]; then

  # --- Agents (targeted search) ---
  AGENT_DIR="$PROJECT_ROOT/.claude/agents"
  if [ -d "$AGENT_DIR" ]; then
    for keyword in $KEYWORDS; do
      # Search agent filenames first (most relevant)
      FILENAME_MATCHES=$(find "$AGENT_DIR" -name "*${keyword}*.md" -type f 2>/dev/null || true)
      for match in $FILENAME_MATCHES; do
        AGENT_NAME=$(basename "$match" .md)
        # Skip index files
        if [[ "$AGENT_NAME" != "PHOENIX-AGENTS" ]] && [[ "$AGENT_NAME" != "README" ]]; then
          add_match "agent" "$AGENT_NAME" "30"
        fi
      done

      # Search agent content (lower score)
      CONTENT_MATCHES=$(find "$AGENT_DIR" -name "*.md" -type f 2>/dev/null | \
        xargs grep -li "\b${keyword}\b" 2>/dev/null | head -3 || true)
      for match in $CONTENT_MATCHES; do
        AGENT_NAME=$(basename "$match" .md)
        if [[ "$AGENT_NAME" != "PHOENIX-AGENTS" ]] && [[ "$AGENT_NAME" != "README" ]]; then
          add_match "agent" "$AGENT_NAME" "10"
        fi
      done
    done
  fi

  # --- Commands (targeted search) ---
  CMD_DIR="$PROJECT_ROOT/.claude/commands"
  if [ -d "$CMD_DIR" ]; then
    for keyword in $KEYWORDS; do
      # Filename matches
      CMD_MATCHES=$(find "$CMD_DIR" -name "*${keyword}*.md" -type f 2>/dev/null || true)
      for match in $CMD_MATCHES; do
        CMD_NAME=$(basename "$match" .md)
        add_match "command" "/$CMD_NAME" "25"
      done
    done
  fi

  # --- Skills (targeted search) ---
  SKILL_DIR="$PROJECT_ROOT/.claude/skills"
  if [ -d "$SKILL_DIR" ]; then
    for keyword in $KEYWORDS; do
      # Filename matches only (skills are more specific)
      SKILL_MATCHES=$(find "$SKILL_DIR" -name "*${keyword}*.md" -type f 2>/dev/null || true)
      for match in $SKILL_MATCHES; do
        SKILL_NAME=$(basename "$match" .md)
        if [[ "$SKILL_NAME" != "README" ]]; then
          add_match "skill" "$SKILL_NAME" "20"
        fi
      done
    done
  fi

  # --- MCP Servers ---
  MCP_FILE="$PROJECT_ROOT/.mcp.json"
  if [ -f "$MCP_FILE" ]; then
    MCP_SERVERS=$(jq -r '.mcpServers | keys[]' "$MCP_FILE" 2>/dev/null || true)
    for keyword in $KEYWORDS; do
      for server in $MCP_SERVERS; do
        if echo "$server" | grep -qi "$keyword"; then
          add_match "mcp" "$server" "35"
        fi
      done
    done
  fi

fi

# =============================================================================
# OUTPUT: Sort by score, deduplicate, limit results
# =============================================================================

# Sort by score descending, deduplicate by name only (ignore type prefix), take top N
SORTED_MATCHES=$(sort -t'|' -k1 -nr "$MATCHES_FILE" | \
  awk -F'|' '!seen[$3]++' | \
  head -n $MAX_RESULTS)

MATCH_COUNT=$(echo "$SORTED_MATCHES" | grep -c '|' || echo 0)

# Only output if we have meaningful matches
if [ "$MATCH_COUNT" -ge 1 ]; then
  # Calculate confidence
  TOP_SCORE=$(echo "$SORTED_MATCHES" | head -1 | cut -d'|' -f1)
  if [ "${TOP_SCORE:-0}" -ge 50 ]; then
    CONFIDENCE="HIGH"
  elif [ "${TOP_SCORE:-0}" -ge 25 ]; then
    CONFIDENCE="MEDIUM"
  else
    CONFIDENCE="LOW"
  fi

  echo ""
  echo "=============================================="
  echo "DISCOVERY (auto-generated)"
  echo "=============================================="
  echo "Confidence: $CONFIDENCE"
  echo ""
  echo "Recommended for this task:"
  echo ""

  echo "$SORTED_MATCHES" | while IFS='|' read -r score type name; do
    if [ -n "$type" ] && [ -n "$name" ]; then
      case "$type" in
        router-agent|agent|bundle-agent)
          echo "  [AGENT] Task tool: subagent_type='$name'"
          ;;
        router-command|command)
          echo "  [COMMAND] $name"
          ;;
        skill|bundle-skill)
          echo "  [SKILL] $name"
          ;;
        mcp)
          echo "  [MCP] mcp__${name}__* tools available"
          ;;
        router-doc)
          echo "  [DOC] $name"
          ;;
      esac
    fi
  done

  echo ""
  echo "Use these before implementing from scratch."
  echo "=============================================="
  echo ""
fi

exit 0
