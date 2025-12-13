#!/bin/bash
# =============================================================================
# Session Start Hook - Capabilities Reminder
# =============================================================================
# Provides a one-time reminder of available capabilities when a session starts.
# Keeps it concise (<10 lines) to avoid noise.
#
# Usage: Called automatically by Claude Code via SessionStart hook
# =============================================================================

set -e

# Count available assets
AGENT_COUNT=$(find .claude/agents -name "*.md" -type f 2>/dev/null | wc -l)
SKILL_COUNT=$(find .claude/skills -name "*.md" -type f 2>/dev/null | wc -l)
CMD_COUNT=$(find .claude/commands -name "*.md" -type f 2>/dev/null | wc -l)
CHEATSHEET_COUNT=$(find cheatsheets -name "*.md" -type f 2>/dev/null | wc -l)

echo ""
echo "=============================================="
echo "PROJECT CAPABILITIES (auto-summary)"
echo "=============================================="
echo ""
echo "  Agents:      ${AGENT_COUNT:-0} specialized agents (Task tool)"
echo "  Skills:      ${SKILL_COUNT:-0} thinking frameworks (auto-activate)"
echo "  Commands:    ${CMD_COUNT:-0} slash commands (/command-name)"
echo "  Cheatsheets: ${CHEATSHEET_COUNT:-0} reference guides"
echo ""
echo "  Quick Access:"
echo "    - CAPABILITIES.md - Full inventory"
echo "    - /workflows - Interactive command guide"
echo "    - Discovery auto-suggests tools for each prompt"
echo ""
echo "=============================================="
echo ""

exit 0
