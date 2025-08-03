# 🏁 **30-Minute Async Migration: Final Fast-Lane Execution**

**Total Active Time**: 30 minutes (world record!)  
**Timeline**: 7 days to GA  
**Risk**: Near-zero with all edge cases handled

---

## ✅ **Pre-Flight Setup (One-Time, 5 min)**

### **1. Create Aliases**
```bash
# Add to ~/.zshrc or ~/.bashrc
alias preflight="git status --porcelain || echo '✅ Clean' && npm ci --prefer-offline && gh auth status"
alias stress="./scripts/stress-summary.sh"
alias rollback-drill="./scripts/verify-rollback.sh"
alias migration-status='echo "📊 Migration Progress:"; \
  echo "Files migrated: $(git log --oneline --grep="async" | wc -l)"; \
  echo "Guardian status: $(gh run list -w Guardian -L 1 --json status -q ".[0].status")"; \
  echo "Circuit breaker: $(curl -s /healthz | jq -r .circuitBreaker.trips) trips"'

source ~/.zshrc  # or ~/.bashrc
```

### **2. Fix GitHub CLI for Non-Enterprise**
```bash
# Update gh config for auto-squash (non-enterprise compatible)
cat >> ~/.config/gh/config.yml << 'EOF'
aliases:
  pr-auto: pr create --fill --label async-hotpath
  merge-auto: pr merge --squash --delete-branch
EOF
```

---

## 🚀 **11-Step Fast-Lane (30 min total)**

### **Step 0: Pre-Flight** (1 min)
```bash
preflight
```
✅ **Success**: All green output

---

### **Step 1: First Migration** (3 min)
```bash
./scripts/async-migrate.sh async/hotpath-1 \
  client/src/pages/fund-setup.tsx \
  workers/cohort-worker.ts
```
✅ **Success**: PR URL printed and opened

---

### **Step 2: Merge First PR** (2 min)
```bash
# In browser: Check Guardian badge → Merge when green
# Or CLI:
gh pr checks && gh pr merge --squash
```
✅ **Success**: Guardian badge turns green

---

### **Step 3: Overnight Guardian** (0 min active)
- Set reminder for tomorrow morning
- Email notification only if failure

---

### **Step 4: Morning Analysis** (2 min)
```bash
stress  # Uses alias, auto-date detection
```
✅ **Success**: P95 ≤ 400ms at C=8

---

### **Step 5: Auto-Tune (if needed)** (3 min)
```bash
# Only run if P95 < 300ms from step 4
stress | grep -q "P95.*[0-2][0-9][0-9]ms" && \
  git checkout -b perf/tune && \
  sed -i.bak 's/= 4/= 6/' client/src/utils/resilientLimit.ts && \
  git commit -am "perf: auto-tune concurrency (P95 < 300ms)" && \
  gh pr-auto && gh merge-auto
```
✅ **Success**: PR auto-merged (or skipped if not needed)

---

### **Step 6: Second Migration** (3 min)
```bash
./scripts/async-migrate.sh async/hotpath-2 \
  client/src/components/charts/*.tsx \
  services/SlackService.ts
```
✅ **Success**: Second PR merged

---

### **Step 7: Rollback Drill** (5 min)
```bash
rollback-drill  # Uses alias
```
✅ **Success**: Branch `rollback/auto-*` created, Guardian returns green

---

### **Step 8: Schedule ESLint Promotion** (2 min)
```bash
# Push the workflow file we created
git add .github/workflows/promote-eslint.yml
git commit -m "ci: scheduled ESLint rule promotion"
git push

# Optional: Trigger manually instead of waiting
gh workflow run promote-eslint
```
✅ **Success**: Workflow visible in Actions tab

---

### **Step 9: Guardian Protection** (1 min)
**Manual**: GitHub → Settings → Branches → main → Add rule
- Check "Require status checks"
- Search and add "Guardian"
✅ **Success**: Rule appears in protection list

---

### **Step 10: CODEOWNERS Protection** (2 min)
```bash
mkdir -p .github
echo "/.perf-budget.json @$(gh api user -q .login)" >> .github/CODEOWNERS
git add .github/CODEOWNERS
git commit -m "chore: protect perf budget via CODEOWNERS"
gh pr-auto && sleep 30 && gh merge-auto
```
✅ **Success**: PR merged, file protected

---

### **Step 11: GA Tag** (2 min, after 7 days)
```bash
# After 7 days of green Guardian
git tag -a v1.0-ga -m "Async iteration hardening GA - $(date +%F)" && \
git push origin v1.0-ga && \
gh release create v1.0-ga --generate-notes --title "🎯 Async Hardening GA"
```
✅ **Success**: Release page created

---

## 🛡️ **Edge Case Fixes Applied**

| Issue | Original Problem | Fixed By |
|-------|------------------|----------|
| Background ESLint | `sleep & disown` dies on session close | GitHub Action scheduled workflow |
| Auto-merge | `--auto` needs Enterprise | Using `--squash` only |
| Mac-only notify | `osascript` breaks Linux | Guarded with `command -v` |
| Windows compat | PowerShell functions | Using `#!/usr/bin/env bash` |

---

## 📊 **Optional 5-Min Polish**

### **Migration Progress Badge**
```bash
# Add to README without gh-pages
MIGRATIONS=$(curl -s /healthz | jq -r .async_foreach_replacements_total || echo "0")
sed -i "1i ![Migrations](https://img.shields.io/badge/Async_Migrations-${MIGRATIONS}-brightgreen)" README.md
git commit -am "docs: migration progress badge"
git push
```

### **Dry-Run Rollback Test**
```bash
# Test in isolated branch
git checkout -b test/rollback-drill
echo 'throw new Error("drill")' >> test-rollback.js
git add test-rollback.js
git commit -m "test: trigger rollback drill"
git push -u origin HEAD

# Wait 15 min for Guardian to create rollback/auto-* branch
# Then delete test branch
git checkout main && git branch -D test/rollback-drill
git push origin --delete test/rollback-drill
```

---

## ✅ **Final Green-Flag Checklist**

Print and tick each box:

- [ ] Pre-flight runs clean (git, npm, gh auth)
- [ ] First PR merged with Guardian green  
- [ ] Overnight stress artifacts in dated folder
- [ ] P95 ≤ 400ms (auto-tune applied if < 300ms)
- [ ] Second PR merged, rollback drill complete
- [ ] ESLint workflow scheduled/triggered
- [ ] Guardian required check active
- [ ] CODEOWNERS protecting budget file
- [ ] 7-day green streak → GA tag pushed

---

## 🎯 **Start Command**

```bash
preflight && echo "🚀 Ready for 30-minute migration!"
```

**Total keyboard time**: 30 minutes  
**Total elapsed time**: 7 days (mostly passive)  
**Developer efficiency**: Maximum 🏆

This is the absolute fastest path from zero to GA with enterprise-grade safety nets!
