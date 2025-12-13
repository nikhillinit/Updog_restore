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
MAX_RESULTS=5
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

# Sort by score descending, deduplicate by type+name, take top N
SORTED_MATCHES=$(sort -t'|' -k1 -nr "$MATCHES_FILE" | \
  awk -F'|' '!seen[$2":"$3]++' | \
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
        router-agent|agent)
          echo "  [AGENT] Task tool: subagent_type='$name'"
          ;;
        router-command|command)
          echo "  [COMMAND] $name"
          ;;
        skill)
          echo "  [SKILL] $name (auto-activates or use explicitly)"
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
