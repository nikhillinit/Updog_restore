#!/bin/bash
# Use absolute path to jq on Windows (avoids PATH timing issues with first prompt)
JQ="${HOME}/bin/jq.exe"
[ -x "$JQ" ] || JQ="jq"  # Fallback to PATH if not found
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

# Don't exit on errors - hook should be non-fatal
set +e

# Configuration
MAX_RESULTS=7
MIN_KEYWORD_LENGTH=4

# Read JSON input from stdin or HOOK_INPUT env var (for Windows PowerShell wrapper)
if [ -n "$HOOK_INPUT" ]; then
  INPUT="$HOOK_INPUT"
else
  INPUT=$(cat)
fi

# Extract prompt (handle both 'prompt' and 'user_prompt' fields)
PROMPT=$(echo "$INPUT" | $JQ -r '.prompt // .user_prompt // ""' 2>/dev/null)

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
# ROUTING SOURCE: docs/_generated/router-fast.json (single source of truth)
# =============================================================================
# All routing patterns are defined in docs/DISCOVERY-MAP.source.yaml
# and generated to router-fast.json via: npm run docs:routing:generate
#
# To add new routing patterns:
# 1. Edit docs/DISCOVERY-MAP.source.yaml
# 2. Run: npm run docs:routing:generate
# 3. Verify: npm run docs:routing:check
#
# Router priority: lower number = higher priority (checked first)
# Current patterns: 82 (agents, skills, commands, cheatsheets, docs)
# =============================================================================

# =============================================================================
# DISCOVERY FUNCTIONS
# =============================================================================

# Use CLAUDE_PROJECT_DIR if set (avoids cwd drift from rc files)
PROJECT_ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"

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

# Normalize prompt to lowercase for matching
PROMPT_LOWER=$(echo "$PROMPT" | tr '[:upper:]' '[:lower:]')

# =============================================================================
# PHASE 1: Router-based matching (PRIMARY) - Pure jq for speed
# =============================================================================
# Router patterns are the authoritative source for all routing decisions.
# 82 patterns cover: Phoenix domain, testing, development, commands, etc.

ROUTER_FILE="$PROJECT_ROOT/docs/_generated/router-fast.json"
if [ -f "$ROUTER_FILE" ]; then
  # Pure jq pattern matching - ~50ms vs ~1.5s with npx tsx
  ROUTER_RESULT=$($JQ -r --arg query "$PROMPT_LOWER" '
    .patterns[] |
    select(
      (.match_any_normalized // .match_any | map(ascii_downcase)) as $keywords |
      any($keywords[]; $query | contains(.))
    ) |
    {
      id: .id,
      route_to: .route_to,
      agent: (.agent // ""),
      command: (.command // ""),
      priority: .priority,
      score: (
        (.match_any_normalized // .match_any | map(ascii_downcase)) as $keywords |
        [$keywords[] | select($query | contains(.))] | length
      )
    }
  ' "$ROUTER_FILE" 2>/dev/null | $JQ -s 'sort_by(-.score, .priority) | .[0] // empty' 2>/dev/null || true)

  if [ -n "$ROUTER_RESULT" ]; then
    ROUTE_AGENT=$(echo "$ROUTER_RESULT" | $JQ -r '.agent // ""')
    ROUTE_CMD=$(echo "$ROUTER_RESULT" | $JQ -r '.command // ""')
    ROUTE_TO=$(echo "$ROUTER_RESULT" | $JQ -r '.route_to // ""')
    ROUTE_SCORE=$(echo "$ROUTER_RESULT" | $JQ -r '.score // 0')

    # Router matches get high base score
    BASE_SCORE=${ROUTE_SCORE:-2}
    PRIORITY_SCORE=$((BASE_SCORE * 10 + 50))

    if [ -n "$ROUTE_AGENT" ] && [ "$ROUTE_AGENT" != "" ]; then
      add_match "router-agent" "$ROUTE_AGENT" "$PRIORITY_SCORE"
    fi
    if [ -n "$ROUTE_CMD" ] && [ "$ROUTE_CMD" != "" ]; then
      add_match "router-command" "$ROUTE_CMD" "$PRIORITY_SCORE"
    fi
    if [ -n "$ROUTE_TO" ] && [ "$ROUTE_TO" != "" ] && [ -z "$ROUTE_AGENT" ] && [ -z "$ROUTE_CMD" ]; then
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

  # --- Cheatsheets (targeted search) ---
  CHEATSHEET_DIR="$PROJECT_ROOT/cheatsheets"
  if [ -d "$CHEATSHEET_DIR" ]; then
    for keyword in $KEYWORDS; do
      # Filename matches
      CHEAT_MATCHES=$(find "$CHEATSHEET_DIR" -name "*${keyword}*.md" -type f 2>/dev/null || true)
      for match in $CHEAT_MATCHES; do
        CHEAT_NAME=$(basename "$match" .md)
        add_match "cheatsheet" "$CHEAT_NAME" "22"
      done
    done
  fi

  # --- MCP Servers ---
  MCP_FILE="$PROJECT_ROOT/.mcp.json"
  if [ -f "$MCP_FILE" ]; then
    MCP_SERVERS=$($JQ -r '.mcpServers | keys[]' "$MCP_FILE" 2>/dev/null || true)
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

  # Write to file instead of stdout (workaround for bug #13912)
  DISCOVERY_FILE="${CLAUDE_PROJECT_DIR:-.}/.claude/discovery.md"
  mkdir -p "$(dirname "$DISCOVERY_FILE")"

  {
    echo "# DISCOVERY (auto-generated)"
    echo ""
    echo "**Confidence:** $CONFIDENCE"
    echo "**Triggered at:** $(date '+%Y-%m-%d %H:%M:%S')"
    echo ""
    echo "## Recommended for this task:"
    echo ""

    echo "$SORTED_MATCHES" | while IFS='|' read -r score type name; do
      if [ -n "$type" ] && [ -n "$name" ]; then
        case "$type" in
          router-agent|agent)
            echo "- [AGENT] Task tool: subagent_type='$name'"
            ;;
          router-command|command)
            echo "- [COMMAND] $name"
            ;;
          skill)
            echo "- [SKILL] $name"
            ;;
          cheatsheet)
            echo "- [CHEATSHEET] cheatsheets/${name}.md"
            ;;
          mcp)
            echo "- [MCP] mcp__${name}__* tools available"
            ;;
          router-doc)
            echo "- [DOC] $name"
            ;;
        esac
      fi
    done

    echo ""
    echo "Use these before implementing from scratch."
  } > "$DISCOVERY_FILE"
fi

# No stdout - workaround for UserPromptSubmit bug #13912
exit 0
