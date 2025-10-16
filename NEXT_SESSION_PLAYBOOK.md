# Week 2 Next-Session Playbook

## Current State
- **Errors:** 392 (down from 617, -36%)
- **Branch:** `remediation/week2-server-strictness`
- **Commits:** 9 atomic commits pushed
- **Status:** Ready for continuation

## 🎯 Goals (2-3 hours)
- **Primary:** 392 → ≤260 errors
- **Stretch:** ≤240 errors
- **Gate Rule:** If >280 after 90 min, carve out 1-2 heavy files and continue

## 📋 Order of Attack

### 1. Finish TS4111 (15-20 min) - Expected: -20 to -30 errors
```bash
# Run safe text script for remaining patterns
git grep -l -E 'process\.env\.|req\.(headers|query|params)\.' -- server shared \
| xargs node scripts/codemods/ts4111-safe-text.mjs

git add -A
git commit -m "fix(server): TS4111 safe bracketization for env/headers/query/params"

# Checkpoint
npm run check:server 2>&1 | tee artifacts/week2/checkpoint-$(date -u +%H%M).txt
./scripts/week2-progress.sh
```

**Then:** Fix remaining flagged lines manually from TSC output

### 2. Sweep 2: Undefined Safety (60-75 min) - Expected: -35 to -50 errors

**Target files (in order):**
1. `server/services/database-pool-manager.ts` (~6 errors)
2. `server/services/ai-orchestrator.ts` (~5 errors)
3. `server/services/power-law-distribution.ts` (~2 errors)
4. `server/lib/redis-rate-limiter.ts` (~2 errors)
5. **If time permits:** `streaming-monte-carlo-engine.ts` (~18 errors) OR `monte-carlo-simulation.ts` (~17 errors)

**Patterns:**
```typescript
// Routes: Early return (safe, no behavior change)
if (!fund) return res.status(404).json({ error: 'Not found' });
const name = fund.name;

// Arrays: Guard first (safest)
const v = arr[i];
if (v === undefined) continue;

// OR: Default only if domain-safe (verify with golden tests!)
const v = arr[i] ?? 0;

// Nested: Optional chaining
const label = obj?.prop?.nested ?? 'N/A';
```

**Commit template:**
```
fix(services): TS2532/TS18048 — guards/optional chaining (types-only)
```

### 3. Sweep 3: Mismatch/Overload (45-60 min) - Expected: -35 to -50 errors

**Focus areas:**
- Options objects → conditional spreads
- Route call-sites → narrowing
- Overload friction → explicit handler types

**Patterns:**
```typescript
// Conditional spreads (avoid undefined)
import { spreadIfDefined } from '@shared/lib/ts/spreadIfDefined';
const opts = {
  required,
  ...spreadIfDefined("timeout", maybeTimeout),
};

// Call-site narrowing
if (!isDefined(amount)) return;
useAmount(amount);
// OR
useAmount(amount ?? 0);  // only if 0 is neutral

// Overload clarity
const handler: RequestHandler = (req, res, next) => { ... };
```

**Commit template:**
```
fix(api): TS2345/TS2322 — conditional spreads + narrowing (types-only)
```

### 4. Exact Optional Mop-up (10-15 min) - Expected: -10 to -15 errors

**Pattern:**
```typescript
import { spreadIfDefined } from '@shared/lib/ts/spreadIfDefined';
const payload = {
  id,
  ...spreadIfDefined("notes", maybeNotes),
};
```

**Commit template:**
```
fix(db): TS2375 — exact optional via spreadIfDefined (types-only)
```

## 🚨 Gates & Guardrails

### Carve-out Rule (90-min checkpoint)
If count is **>280** after ~90 minutes:
1. Add worst offender to `tsconfig.server.json` exclude
2. Document in `artifacts/week2/carved-out.txt`
3. Continue with momentum

**Likely carve-out candidates:**
- `server/services/streaming-monte-carlo-engine.ts` (18 errors, 1000+ lines)
- `server/services/monte-carlo-simulation.ts` (17 errors, 1000+ lines)

### Golden Dataset Safety
After any batch with `??` defaults:
```bash
npm run test:golden || git revert -n HEAD && echo "⚠️ reverted; use guards not defaults"
```

### Risk Guardrails
- ✅ Use `authed()` for auth paths (don't use global `req.user?`)
- ✅ Keep Bundler resolution (NodeNext adds 1150 errors)
- ✅ Avoid `!` assertions (use guards with `// INVARIANT:` comments only)

## 📊 Timeline (2-3 hours)

```
00:00-00:20  TS4111 finish          (-20 to -30 errors) → ~365
00:20-01:20  TS2532 medium files    (-35 to -50 errors) → ~320
01:20-02:15  TS2345 sweep           (-35 to -50 errors) → ~275
02:15-02:30  Exact-optional mop-up  (-10 to -15 errors) → ~260
```

**Expected final state:** 240-270 errors

## 🔧 Quick Start Commands

```bash
# Start session
git checkout remediation/week2-server-strictness
git pull origin remediation/week2-server-strictness
npm run check:server 2>&1 | tee artifacts/week2/baseline-live.txt

# Generate fresh worklists
grep -E 'error TS(2532|18048)' artifacts/week2/baseline-live.txt \
 | cut -d'(' -f1 | sort | uniq -c | sort -rn | head -15 \
 | tee artifacts/week2/worklists/ts2532-top.txt

grep -E 'error TS(2345|2322|2769)' artifacts/week2/baseline-live.txt \
 | cut -d'(' -f1 | sort | uniq -c | sort -rn | head -15 \
 | tee artifacts/week2/worklists/ts2345-top.txt

# Start with TS4111 mechanical finish (copy command from section 1 above)
```

## 📁 Key Files & Artifacts

**Tools:**
- `scripts/codemods/ts4111-safe-text.mjs` - Safe text replacement
- `scripts/codemods/bracketize-ts4111-from-tsc.mjs` - Fallback codemod
- `shared/lib/ts/spreadIfDefined.ts` - Exact optional helper
- `shared/lib/ts/isDefined.ts` - Type guard helper

**Tracking:**
- `artifacts/week2/progress.log` - Session log
- `artifacts/week2/carved-out.txt` - Deferred files
- `artifacts/week2/baseline-live.txt` - Current state (create fresh each session)
- `artifacts/week2/worklists/` - Error-specific file lists

**Config:**
- `tsconfig.server.json` - Type checking config (modify exclude for carve-outs)

## 🎯 Success Metrics

**Quantitative targets:**
- ✅ ≤260 errors (primary goal)
- ✅ ≤240 errors (stretch goal)
- ✅ 4-6 atomic commits this session
- ✅ 0 runtime behavior changes

**Qualitative indicators:**
- ✅ All tests passing (especially golden datasets)
- ✅ Clean, reviewable commit history
- ✅ Progress logged in artifacts
- ✅ Clear path forward documented

## 💡 Proven Patterns That Work

1. **TS4111:** Mechanical text replacement (process.env, req.headers/query/params)
2. **TS2532:** Guards > defaults (unless domain-safe and golden-tested)
3. **TS2345:** `spreadIfDefined` for options, narrowing at call-sites
4. **Performance:** Target high-density files (performance-prediction.ts: -23 errors!)

## ⚠️ Patterns to Avoid

1. ❌ ts-morph/sidecar complexity (tool-free is faster)
2. ❌ Large files (1000+ lines) without chunking strategy
3. ❌ `??` defaults without golden dataset verification
4. ❌ Global type augmentation (use `authed()` wrapper instead)

## 🚀 After This Session

**If you hit ≤260:**
- Next session targets: ≤160 errors
- Focus: Complete Sweep 3, tackle carved-out files
- Timeline: 2-3 more hours to ≤100

**If you're at 260-280:**
- Still on track! One more focused session to ≤160
- Consider parallel work on carved-out files

**If you're >280:**
- Carve out 1-2 heavy files
- Document thoroughly
- Proceed with lighter files
- Return to carved-out in dedicated session

---

## Quick Reference: Error Code Cheat Sheet

| Code | Meaning | Fix |
|------|---------|-----|
| TS4111 | Index signature access | Bracket notation `obj["prop"]` |
| TS2532/TS18048 | Possibly undefined | Guard or `?.` or `??` (if safe) |
| TS2375/TS2379 | Exact optional | `spreadIfDefined` helper |
| TS2345/TS2322 | Type mismatch | Narrow, default, or conditional spread |
| TS2769 | Overload mismatch | Explicit handler type |

---

**Ready to execute!** 🚀

Current: 392 errors → Target: ≤260 errors → Ultimate: ≤100 errors
