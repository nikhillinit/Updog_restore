# 🚀 **Ultra-Compressed Async Migration Playbook**

**Total Active Time**: 70 minutes → **45 minutes** (with optimizations)  
**Timeline**: 7 days to GA  
**Risk**: Near-zero with automated safety nets

---

## 🔧 **Pre-Setup: One-Time Automations (10 min investment, saves 25 min)**

### **1. Create Migration Helper Script**
```bash
cat > scripts/async-migrate.sh << 'EOF'
#!/bin/bash
set -euo pipefail

BRANCH_NAME=$1
shift
FILES=("$@")

# One-shot migration with all safety checks
git checkout -b "$BRANCH_NAME" || exit 1
[[ ! -f .async-migration-active ]] && touch .async-migration-active

git add "${FILES[@]}" .async-migration-active
git commit -m "refactor(async): migrate ${#FILES[@]} files [bench]"
git push -u origin HEAD

# Auto-create PR with template and label
gh pr create --fill --label async-hotpath

echo "✅ Migration PR created. Guardian will auto-run."
EOF

chmod +x scripts/async-migrate.sh
```

### **2. Add Shell Aliases**
```bash
echo 'alias preflight="./scripts/pre-migration-check.sh"' >> ~/.zshrc
echo 'alias stress="./scripts/stress-summary.sh"' >> ~/.zshrc
echo 'alias rollback-drill="./scripts/verify-rollback.sh"' >> ~/.zshrc
source ~/.zshrc
```

### **3. VS Code Task (`.vscode/tasks.json`)**
```json
{
  "version": "2.0.0",
  "tasks": [{
    "label": "Async Migration Preflight",
    "type": "shell",
    "command": "./scripts/pre-migration-check.sh && npm ci --prefer-offline",
    "problemMatcher": [],
    "presentation": { "reveal": "always", "panel": "new" }
  }]
}
```

---

## 📋 **Execution Blocks (Now Even Faster)**

### **Block 0: Prerequisites** (2 min)
```bash
preflight  # Our new alias - includes gh auth, git status, npm ci
```
✅ Single command replaces 3 checks

---

### **Block A: First Migration** (10 min, was 20)
```bash
# Single command using our helper
./scripts/async-migrate.sh async/hotpath-1 \
  client/src/pages/fund-setup.tsx \
  workers/cohort-worker.ts

# Auto-merge if you're sole approver and CI passes
gh pr merge --auto --squash
```
✅ Reduced from 6 commands to 2

---

### **Block B: Morning Analysis** (10 min, was 15)
```bash
# Enhanced one-liner with decision logic
stress | grep -q "P95.*[0-2][0-9][0-9]ms" && \
  git checkout -b perf/tune && \
  sed -i.bak 's/= 4/= 6/' client/src/utils/resilientLimit.ts && \
  git diff && \
  git commit -am "perf: tune concurrency 4→6 (P95 < 300ms)" && \
  gh pr create --fill && gh pr merge --auto --squash
```
✅ Automated decision + execution in one command

---

### **Block C: Second Migration + Drill** (15 min, was 25)
```bash
# Batch migration with pattern matching
./scripts/async-migrate.sh async/hotpath-2 \
  client/src/components/charts/*.tsx \
  services/SlackService.ts

# Parallel rollback drill while PR runs
rollback-drill &  # Runs in background

# Remove marker after last migration
[[ $(grep -r "forEach.*async" --include="*.ts*" | wc -l) -eq 0 ]] && \
  git rm .async-migration-active && \
  git commit -m "chore: async migration complete" && \
  git push
```
✅ Parallel execution saves 5-10 minutes

---

### **Block D: Progressive Lockdown** (5 min, was 10)

**Combined one-liner for all lockdowns:**
```bash
# T+1 Evening: ESLint promotion
git checkout main && git pull && \
sed -i.bak 's/"warn"/"error"/' eslint.config.js && \
git commit -am "chore: enforce async lint rule" && \
git push && \
gh pr create --base main --fill && gh pr merge --auto --squash

# T+3: Guardian protection (still manual - 1 min)
echo "⚠️  Manual: GitHub Settings → Branch Protection → Require Guardian"

# T+5: CODEOWNERS (automated)
echo "/.perf-budget.json @$(gh api user -q .login)" >> .github/CODEOWNERS && \
git add .github/CODEOWNERS && \
git commit -m "chore: protect perf budget" && \
gh pr create --fill && gh pr merge --auto --squash
```

---

### **Block E: Passive Monitoring** (0 min active)
```bash
# Optional: Set up desktop notification for failures
gh workflow list | grep Guardian | awk '{print $NF}' | \
  xargs -I {} gh workflow enable {} --repo .

# macOS notification on failure (add to crontab)
echo "*/15 * * * * gh run list -w Guardian -L 1 | grep -q failure && osascript -e 'display notification \"Guardian failed!\" with title \"Async Migration Alert\"'" | crontab -
```

---

### **Block F: GA Release** (3 min)
```bash
# One-shot GA tag and release with changelog
git tag -a v1.0-ga -m "Async hardening GA

$(git log --oneline --grep="async" --since="7 days ago")" && \
git push origin v1.0-ga && \
gh release create v1.0-ga --generate-notes --title "Async Iteration Hardening GA"
```

---

## ⏱️ **Final Time Budget**

| Block | Original | Ultra-Compressed | Saved |
|-------|----------|------------------|-------|
| Setup | 0 min | 10 min (one-time) | -10 min |
| A | 20 min | 10 min | 10 min |
| B | 15 min | 10 min | 5 min |
| C | 25 min | 15 min | 10 min |
| D | 10 min | 5 min | 5 min |
| F | 5 min | 3 min | 2 min |
| **Total** | **75 min** | **43 min** (+10 setup) | **22 min** |

**Net active time**: 43 minutes (after one-time 10 min setup investment)

---

## 🎯 **Emergency Procedures (Just In Case)**

```bash
# If any step fails, instant rollback:
git reset --hard origin/main && \
./rollback-async.sh && \
gh issue create --title "Async migration rolled back" \
  --body "Reason: $(pbpaste)" --label incident
```

---

## 💡 **Pro Tips**

1. **Use `--auto` flag** on all PRs if you're sole approver
2. **Chain commands with `&&`** to stop on first failure  
3. **Background long operations** with `&` when safe
4. **Pattern match files** to reduce typing
5. **Leverage sed for config changes** vs manual editing

---

## ✅ **Start Command**

```bash
preflight && echo "✅ Ready to migrate in 43 minutes!"
```

This playbook gets you from zero to GA with **minimal keyboard time** and **maximum safety** 🚀
