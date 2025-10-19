# Windows Sidecar Architecture Investigation Report

**Date:** 2025-10-18  
**Status:** Investigation Complete  

## Executive Summary

The Windows sidecar architecture was introduced in Oct 5, 2025 to solve: Node.js module resolution breaking due to incorrect Windows symlinks. Analysis shows:

1. The original problem STILL EXISTS and would resurface if sidecar removed
2. Modern npm (v8+) and Node.js (v20+) do NOT eliminate this issue
3. The sidecar adds 203MB overhead and maintenance complexity
4. Better long-term solutions exist (npm workspaces, pnpm)

## Original Problem

**Root Cause (Commit 6200227):**
- Git Bash users created POSIX symlinks instead of Windows junctions
- Previous symlink pointed to wrong path: `/c/dev/tools_local/...` (missing Updog_restore segment)
- Node ESM resolver couldn't find modules
- Result: "Cannot find package 'vite'" runtime error

**Why It Happened:**
- Windows Defender real-time protection blocking npm installations
- Running from Git Bash/WSL created POSIX symlinks
- npm v8-v9 had no built-in Windows junction solution

## Current Solution (Sidecar)

### Architecture
```
Windows development:
  node_modules/
  ├── vite → junction to tools_local/node_modules/vite
  ├── @vitejs/* → junctions
  ├── postcss → junction
  └── ... (17 packages)
  
  tools_local/node_modules/ (source of truth)

CI/Linux/macOS: Uses regular node_modules (sidecar disabled)
```

### Features
1. **CI detection** (lines 13-19): Skips sidecar on CI environments
2. **Absolute path junctions** (lines 69-72): Uses `cmd /c mklink /J` on Windows
3. **Self-healing** (postinstall hook): Auto-recreates junctions after npm install
4. **17 linked packages**: Build, test, and lint tools

### Disk Usage
- tools_local/node_modules: 203 MB
- Root node_modules: 1.1 GB
- **Sidecar overhead: ~15%**


## Does Modern npm Solve This?

### npm v10.8.0+ Assessment

| Feature | npm v10 | Solves Problem? |
|---------|---------|-----------------|
| Workspaces | YES | Partial (requires workarounds) |
| Better symlink handling | YES | NO - still POSIX on WSL |
| Windows junction support | NO | NO - Node ESM unchanged |
| --workspace-root | YES | NO - doesn't fix corruption |

**Current versions:** npm 10.9.2, Node 20.19.0

**Verdict:** Despite being up-to-date, modern npm/Node do NOT solve the Windows sidecar problem natively.

## What Breaks Without Sidecar?

### On Windows Development
```
npm install       # Still works
npm run dev       # FAILS: "Cannot find package 'vite'"
  → Resolves to node_modules/vite (no junction!)
  → ESM lookup fails
```

**Why:** Git Bash creates POSIX symlinks, not Windows junctions.

### On CI/Linux
- **No impact** (CI detection already disables sidecar)
- Would continue working normally

### Pre-hook Dependencies
Lines 261-264 in package.json:
```json
"predev": "node scripts/ensure-sidecar.mjs",
"prebuild": "node scripts/ensure-sidecar.mjs",
"pretest": "node scripts/ensure-sidecar.mjs",
```

These would need removal/modification.

## Maintenance Cost

**Code complexity:** 23 KB across 6 files
- link-sidecar-packages.mjs (4 KB)
- doctor-sidecar.js (3 KB)
- doctor-links.mjs (1 KB)
- ensure-sidecar.mjs (1 KB)
- sidecar-packages.json (1 KB)
- SIDECAR_GUIDE.md (10 KB)

**Storage overhead:** 203 MB (15% of dev environment)

**Maintenance burden:**
- Two package.json files
- Platform-specific behavior
- 17 junction links to verify
- Postinstall hook complexity

## Timeline

| Date | Commit | Event |
|------|--------|-------|
| Oct 3 | 94df987 | Windows NODE_ENV workaround |
| Oct 5 | 6200227 | "Bulletproof Windows junction solution" (core) |
| Oct 5 | 5337b0c | Merge: Sidecar architecture |
| Oct 14 | 14144da | ESLint added to sidecar |
| Oct 18 | TODAY | Investigation complete |

**Active duration:** 2 weeks with ongoing maintenance

## Risk Analysis

### Risks of KEEPING Sidecar

| Risk | Severity | Mitigation |
|------|----------|-----------|
| Complexity overhead | MEDIUM | Document well |
| 203MB storage waste | LOW | Only dev machines |
| Platform-specific bugs | MEDIUM | Comprehensive testing |
| Onboarding friction | HIGH | Clear setup docs |
| Dependency drift | LOW | Version management |

### Risks of REMOVING Sidecar

| Risk | Severity | Impact |
|------|----------|--------|
| Windows dev breaks | **HIGH** | "Cannot find vite" errors |
| Git Bash symlink issues | **HIGH** | POSIX vs Windows junctions |
| Backward compatibility | MEDIUM | Stale .npmrc issues |
| Workflow updates needed | MEDIUM | CI/pre-hooks need changes |

## Recommended Solutions

### Option A: Keep Sidecar (SAFEST)
- **Cost:** 203MB, maintenance overhead
- **Benefit:** Windows devs protected from symlink corruption
- **Timeline:** Immediate (current state)
- **Risk:** Low

### Option B: Hybrid Approach (RECOMMENDED)
- Keep sidecar for Windows (proven, stable)
- Add npm workspaces support (parallel)
- Document both paths
- Plan gradual migration
- **Timeline:** 2-3 weeks
- **Benefit:** Foundation for future cleanup

### Option C: Switch to npm Workspaces (FUTURE)
- Requires monorepo restructuring
- Eliminates Windows-specific code
- Single lockfile for all packages
- **Timeline:** 1-2 weeks (2026)
- **Risk:** Medium (new patterns)

### Option D: Migrate to pnpm (LONG-TERM)
- Better monorepo support
- Smaller disk footprint
- No junction issues
- **Timeline:** 1+ week (2026 Q1)
- **Risk:** High (team adoption)

## Critical Questions Answered

### Can we eliminate tools_local and use root node_modules only?

**NO** - Git Bash users on Windows would immediately get POSIX symlink errors again. The root cause (platform-specific symlink handling) is not fixed in npm/Node.

### Are the junctions contributing to corruption risk?

**YES and NO:**
- YES: They require management, can break if deleted
- NO: They don't cause corruption; they prevent it
- The real risk is REMOVING them (enables corruption)

### Is there a simpler Windows-compatible solution?

**YES - npm workspaces, BUT:**
- Requires restructuring
- Need to enforce PowerShell-only (no Git Bash)
- Add developer guides
- **Better than sidecar, but not simpler**

### What would break if we removed the sidecar?

**On Windows:**
- `npm run dev` fails with "Cannot find package 'vite'"
- `npm run build` fails for dev builds
- Test running fails
- `npm run check` (TypeScript) still works
- CI continues working normally

**On CI:** Nothing breaks (already disabled)

## Conclusion

**VERDICT: Do NOT remove sidecar immediately.**

**Reasons:**
1. Solves REAL problem (Windows ESM resolution)
2. Modern npm doesn't fix it
3. Removal would break Windows development
4. Better solutions exist but take time

**Action Items:**
1. Document current state (this report) ✓
2. Create hybrid approach with npm workspaces (2-3 weeks)
3. Plan pnpm migration for Q1 2026 (1-2 weeks)
4. Keep sidecar as fallback during transition

**Timeline to Simplification:**
- **Now:** Keep sidecar, add documentation
- **4-6 weeks:** Parallel npm workspaces support
- **Q1 2026:** Evaluate pnpm migration
- **Q2 2026:** Full pnpm transition (if team agrees)

---

## Appendix: Key Files

| File | Purpose | Size |
|------|---------|------|
| SIDECAR_GUIDE.md | User documentation | 10 KB |
| scripts/link-sidecar-packages.mjs | Junction creator | 4 KB |
| scripts/sidecar-packages.json | Config file | 1 KB |
| scripts/doctor-sidecar.js | Sidecar validator | 3 KB |
| scripts/doctor-links.mjs | Junction checker | 1 KB |
| scripts/ensure-sidecar.mjs | Pre-hook validator | 1 KB |
| tools_local/package.json | Build tool deps | 1 KB |
| .github/workflows/sidecar-windows.yml | CI testing | 2 KB |

---

End of Report
