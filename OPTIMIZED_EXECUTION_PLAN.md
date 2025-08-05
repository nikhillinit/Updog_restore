# 🚀 **Optimized Async Migration Execution Plan**

**Status**: Ready for immediate execution  
**Duration**: 2 days active, 7 days validation  
**Risk Level**: Minimal (progressive lockdown + auto-rollback)

---

## 🎯 **Immediate Optimizations Applied**

### ✅ **Stress Analysis Enhancement**
- **Auto-detection**: `./scripts/stress-summary.sh` (no date needed)
- **Backward compatibility**: Still accepts explicit dates
- **Rich output**: P95, RPS, errors in formatted table

### ✅ **Progressive ESLint Rollout**  
- **Current state**: `custom/no-async-array-methods: 'warn'`
- **T+1 evening**: Promote to `'error'` level
- **Safe migration**: Warns now, blocks later

---

## 📋 **Optimized Execution Sequence**

| When              | Action                              | Concrete Command                                                                                                                           | Success Signal                   | ETA    |
| ----------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------- | ------ |
| **Now (T+0)**     | 0️⃣ **Pre-flight check**            | `./scripts/pre-migration-check.sh`                                                                                                        | ✔ All checks green + GitHub auth | 2 min  |
|                   | 1️⃣ **First PR with marker**        | `git checkout -b async/fund-setup-cohort`<br>`touch .async-migration-active`<br>`git add fund-setup.tsx cohort-worker.ts .async-migration-active`<br>`git commit -m "refactor(async): resilient batch migration [bench]"` | ✔ PR created with template + marker | 5 min  |
|                   | 2️⃣ **Push and label**              | `git push -u origin HEAD`<br>`gh pr create --label async-hotpath`                                                                          | ✔ Guardian badge: ⏳ running      | 2 min  |
| **Tonight**       | 3️⃣ **Guardian overnight**          | *Automated - no action required*                                                                                                          | ✔ No red ❌ notifications        | —      |
| **T+1 AM**        | 4️⃣ **Zero-touch analysis**         | `./scripts/stress-summary.sh`                                                                                                            | ✔ P95 ≤ 400ms, formatted table   | 2 min  |
|                   | 5️⃣ **Optional concurrency tune**   | *If P95 ≤ 300ms*: Edit `resilientLimit.ts` default from 4→6                                                                               | ✔ Guardian bench passes           | 5 min  |
| **T+1 PM**        | 6️⃣ **Second PR batch**             | Same pattern: charts + slack stub                                                                                                        | ✔ `async_foreach_replacements++`  | 45 min |
|                   | 7️⃣ **Immediate rollback drill**    | `./scripts/verify-rollback.sh`                                                                                                           | ✔ `rollback/auto-*` branch created | 15 min |
| **T+1 Evening**   | 8️⃣ **ESLint promotion**            | `eslint.config.js`: `'warn'` → `'error'`<br>`git commit -m "chore(lint): promote async rule to error"`                                     | ✔ Blocking linter rule active    | 5 min  |
| **T+3**           | 9️⃣ **Guardian badge required**     | GitHub → Settings → Branches → Protection rules                                                                                          | ✔ Badge shows in branch protection | 2 min  |
| **T+5**           | 🔟 **CODEOWNERS perf budget**      | `.github/CODEOWNERS`: `/.perf-budget.json @your-handle`                                                                                   | ✔ Budget changes need approval    | 2 min  |
| **T+9**           | 1️⃣1️⃣ **GA tag**                   | `git tag -a v1.0-ga -m "Async hardening GA"`<br>`git push origin v1.0-ga`                                                                | ✔ Release auto-generated          | 5 min  |

---

## 🔧 **Key Optimizations vs Original Plan**

### **Time Efficiency**
- **Marker file**: Combined with first commit (saves 1 commit)
- **Auto-analysis**: Zero-touch stress summary (saves 2 min daily)
- **Earlier drill**: T+1 PM vs T+2 AM (24h faster feedback)

### **Risk Reduction**  
- **Progressive lockdown**: 3 stages vs 1 big-bang change
- **Auto-detection**: No hardcoded dates (eliminates human error)
- **Enhanced templates**: Reviewer guidance built-in

### **Observability**
- **Circuit breaker trips**: Exposed in `/healthz` 
- **Rich stress output**: P95, RPS, errors in one view
- **Migration counter**: `async_foreach_replacements_total`

---

## 📊 **Quality-of-Life Additions**

### **Guardian PR Comments** (Add to `.github/workflows/guardian.yml`)
```yaml
- name: PR comment summary
  if: ${{ github.event_name == 'pull_request' && success() }}
  uses: marocchino/sticky-pull-request-comment@v2
  with:
    header: guardian-summary
    message: |
      **Guardian ✨**  
      • error_rate: ${{ steps.canary.outputs.error_rate }}%  
      • P95: ${{ steps.bench.outputs.p95_ms }}ms  
      • async replacements: ${{ steps.metrics.outputs.replacements }}
```

### **Circuit Breaker Alert** (Add after canary check)
```bash
BREAKER_TRIPS=$(curl -s /healthz | jq '.circuitBreaker.trips')
if [[ $BREAKER_TRIPS -gt 0 ]]; then
  echo "::warning:: Circuit breaker tripped ($BREAKER_TRIPS times)"
fi
```

---

## ✅ **Final GA Checklist**

Print and tick each box:

* [ ] Pre-flight script green (incl. GitHub auth)
* [ ] `.async-migration-active` committed in first PR  
* [ ] Guardian overnight run green, artifacts in dated folder
* [ ] Rollback drill executed after second PR; issue & branch created
* [ ] ESLint rule promoted to `error`
* [ ] Guardian badge set as required check
* [ ] CODEOWNERS protection on perf budget  
* [ ] Seven days of uninterrupted Guardian green

---

## 🚨 **Emergency Procedures**

### **If Guardian Fails Overnight**
```bash
# Check error details
curl -s /healthz | jq '.circuitBreaker.trips'
./scripts/stress-summary.sh  # Auto-finds latest results

# If P95 > budget: rollback trigger fires automatically
# If not: investigate specific failure in Guardian logs
```

### **If Rollback Needed**
```bash
# Manual trigger (if auto-rollback doesn't fire)
./scripts/verify-rollback.sh

# Rollback branch created automatically
# Merge the rollback PR to restore previous state
```

---

## 🎯 **Success Metrics**

**Immediate (T+0 to T+1)**:
- ✅ Pre-flight: 100% green
- ✅ First PR: Guardian badge ⏳→✅  
- ✅ Stress test: P95 ≤ 400ms

**Short-term (T+1 to T+5)**:
- ✅ Rollback drill: Auto-branch + issue created
- ✅ ESLint: No `error` level failures in CI
- ✅ Budget updates: Human-gated only

**GA Ready (T+9)**:
- ✅ 7-day green streak in Guardian
- ✅ All lockdown stages complete
- ✅ Migration counter matches expected hot paths

---

## 🚀 **Ready to Execute**

**Total active time**: ~90 minutes over 9 days  
**Passive monitoring**: GitHub notifications handle overnight  
**Risk level**: Minimal with progressive rollout + auto-rollback

**Next command**: `./scripts/pre-migration-check.sh`

If green ✅ → Begin T+0 sequence immediately! 🎯
