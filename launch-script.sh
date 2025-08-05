#!/bin/bash
set -euo pipefail

# Pre-flight checks
echo "🔍  Running pre-flight checks..."
npm ls --depth=0 | grep -qi slack && { echo "❌  Slack dep found"; exit 1; } || echo "✅  Slack‑free"
npm run test:quick || { echo "❌  Quick tests failed"; exit 1; }

# Main launch sequence
echo "🚀  Launching automation..."
git checkout main && git pull
git merge --no-ff automation-hardening -m "merge: automation hardening patches"
git push origin main

# Tag release
tag="v1.3.4-auto-hardening-$(date +%y%m%d)"
git tag -a "$tag" -m "Automation guard-rails merged"
git push origin "$tag"

# Trigger orchestrator
gh workflow run migration-orchestrator.yml -F force=true

# Tail latest orchestrator run
echo "⌛  Waiting for orchestrator..."
sleep 5
gh run watch --exit-status --latest

# Check final status
echo "🔍  Checking orchestrator status..."
gh run list --workflow "Migration Orchestrator" --limit 1 --json status,conclusion | jq -r '.[0] | "Status: \(.status), Conclusion: \(.conclusion)"'
