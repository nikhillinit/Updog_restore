# Sidecar Migration Analysis: Feasibility and Improved Plan

**Date**: 2025-12-20
**Status**: Analysis Complete
**Branch**: `claude/migration-planning-dcxPu`

---

## Executive Summary

After deep analysis of the codebase, the proposed migration plan is **fundamentally sound** but has **critical sequencing flaws** that would break the build mid-migration. The critique correctly identifies these issues. However, both documents miss a crucial fact: **the migration is already 88.5% complete** - all sidecar packages already exist in root `devDependencies` with matching versions.

**Key Finding**: This is not a "migration" but a **script cleanup** operation. The packages are already dual-sourced; we just need to update 53 script invocations to use the root node_modules instead of tools_local paths.

---

## Current State Analysis

### Sidecar Architecture Overview

```
Updog_restore/
+-- node_modules/           # Root deps + junctions to sidecar
|   +-- vite/              -> tools_local/node_modules/vite (junction)
|   +-- tsx/               -> tools_local/node_modules/tsx (junction)
|   +-- concurrently/      -> tools_local/node_modules/concurrently (junction)
+-- tools_local/           # Sidecar workspace
|   +-- package.json       # 27 packages
|   +-- node_modules/      # Actual packages (gitignored)
+-- scripts/
    +-- link-sidecar-packages.mjs  # Creates junctions
    +-- ensure-sidecar.mjs         # Pre-hook validator
    +-- sidecar-packages.json      # Package list (26 items)
```

### Package Version Alignment

| Package | tools_local | root devDeps | Status |
|---------|-------------|--------------|--------|
| vite | 5.4.20 | 5.4.21 | PATCH BEHIND (low risk) |
| @vitejs/plugin-react | ^4.3.4 | ^5.0.4 | MAJOR BEHIND (high risk) |
| tsx | 4.20.6 | 4.20.6 | EXACT MATCH |
| concurrently | 9.2.1 | 9.2.1 | EXACT MATCH |
| autoprefixer | 10.4.21 | 10.4.21 | EXACT MATCH |
| postcss | 8.5.6 | 8.5.6 | EXACT MATCH |
| tailwindcss | 3.4.18 | 3.4.18 | EXACT MATCH |
| prettier | ^3.6.2 | ^3.6.2 | EXACT MATCH |
| vitest | ^3.2.4 | 3.2.4 | EXACT MATCH |
| eslint | ^9.37.0 | 9.37.0 | EXACT MATCH |
| lightningcss | ^1.30.2 | MISSING | INTENTIONAL (vite.config.ts) |

**Result**: 23/26 packages match exactly (88.5%). Only 2 require version sync, 1 is intentionally sidecar-only.

### Script Invocation Inventory

**53 total references** in package.json to `tools_local`:

| Tool | References | Current Pattern | Target Pattern |
|------|------------|-----------------|----------------|
| tsx | 47 | `node tools_local/node_modules/tsx/dist/cli.mjs` | `tsx` |
| concurrently | 6 | `node tools_local/node_modules/concurrently/dist/bin/concurrently.js` | `concurrently` |

### Environment Detection

**CI/CD Behavior** (already implemented):
- `link-sidecar-packages.mjs` checks `CI`, `VERCEL`, `GITHUB_ACTIONS` env vars
- Sidecar linking is **skipped** on CI - builds use root node_modules
- Current environment is **Linux** - sidecar is unnecessary (designed for Windows Defender issues)

---

## Original Plan Critique Evaluation

### Critique Point 1: "Dependency Gap" (Phase 2 before Phase 3)

**Verdict: PARTIALLY VALID but MOOT**

The critique correctly identifies that updating scripts (Phase 2) before installing packages (Phase 3) would break builds. However:

- **All packages already exist in root devDependencies** with matching versions
- The sidecar junctions currently point to tools_local, but root node_modules also has these packages
- npm scripts already have `./node_modules/.bin` in PATH
- **No installation needed** - just update the script invocations

### Critique Point 2: `npm exec` Performance Overhead

**Verdict: VALID - ACCEPTED**

The critique correctly notes that `npm exec --` adds 200ms-1s startup penalty. Inside package.json scripts, this is unnecessary because npm automatically adds `./node_modules/.bin` to PATH.

**Accepted Fix**:
```json
// WRONG - 200ms+ overhead
"dev:api": "npm exec -- tsx server/bootstrap.ts"

// CORRECT - direct binary, zero overhead
"dev:api": "tsx server/bootstrap.ts"
```

### Critique Point 3: Implicit Configuration Dependencies

**Verdict: VALID - ADDRESSED**

**Investigation Results**:
- `tsconfig*.json`: No tools_local references
- `.eslintrc*`: No tools_local references
- `vite.config.ts`: Uses `lightningcss` for CSS minification - **requires action**

**Lightningcss Dependency**:
```typescript
// vite.config.ts line ~317
css: {
  transformer: 'lightningcss',
  lightningcss: { minify: true }
}
```

`lightningcss` is intentionally sidecar-only. Migration options:
1. Add `lightningcss` to root devDependencies (recommended)
2. Remove lightningcss and use default CSS handling

---

## Improved Migration Plan

### Phase 0: Baseline Verification (30 minutes)

**Objective**: Establish current functionality baseline before any changes.

**Tasks**:
1. Run full test suite: `npm test`
2. Run build: `npm run build`
3. Run type check: `npm run check`
4. Capture baseline: `npm run doctor:quick`

**Acceptance**: All commands pass. Document any pre-existing failures.

**Deliverable**: Baseline test results in `artifacts/sidecar-migration-baseline.json`

---

### Phase 1: Version Synchronization (15 minutes)

**Objective**: Ensure version parity before removing junctions.

**Tasks**:

1. **Fix @vitejs/plugin-react version mismatch**:
   ```bash
   # Update sidecar to match root (for Windows dev consistency)
   # OR update root to match sidecar - choose consistency
   ```

2. **Add lightningcss to root devDependencies**:
   ```bash
   npm install -D lightningcss@^1.30.2
   ```

3. **Sync vite patch version** (optional, low risk):
   ```bash
   # Update tools_local/package.json vite to 5.4.21
   ```

**Acceptance**: `npm run doctor:quick` passes with root-only resolution.

---

### Phase 2: Script Migration (Iterative, 2-3 hours)

**Objective**: Replace all 53 tools_local invocations with direct binary calls.

**Strategy**: Migrate scripts in dependency order, test after each batch.

#### Batch 1: Core Development Scripts (15 scripts)

**tsx migrations** (use direct `tsx` binary):
```json
// BEFORE
"dev:api": "node tools_local/node_modules/tsx/dist/cli.mjs server/bootstrap.ts"

// AFTER
"dev:api": "tsx server/bootstrap.ts"
```

**Scripts to migrate**:
- dev:api, dev:quick, dev:worker:reserve, dev:worker:pacing
- fix:typescript, fix:typescript:help
- codemod:logger, codemod:logger:write
- metrics:local

**Verification**: `npm run dev:api` starts successfully.

#### Batch 2: Concurrently Scripts (6 scripts)

**concurrently migrations** (use direct `concurrently` binary):
```json
// BEFORE
"dev": "node tools_local/node_modules/concurrently/dist/bin/concurrently.js -k \"npm run dev:client\" \"npm run dev:api\""

// AFTER
"dev": "concurrently -k \"npm run dev:client\" \"npm run dev:api\""
```

**Scripts to migrate**:
- dev, dev:parallel, dev:turbo, dev:fast, test:parallel, build:parallel, dev:qa

**Verification**: `npm run dev` starts both client and API.

#### Batch 3: AI/Tooling Scripts (16 scripts)

**tsx migrations** for AI tooling:
- ai:review, ai:validate, ai:orchestrate (all variants)
- security:* scripts (5 total)
- evaluate:tools
- docs:routing:* (3 total)

**Verification**: `npm run ai:review:health` completes.

#### Batch 4: Database/Schema Scripts (8 scripts)

**tsx migrations**:
- seed:multi-tenant, seed:reset
- schema:generate, schema:check, schema:test
- orchestrator, workers:dev
- bench

**Verification**: `npm run schema:check` completes.

#### Batch 5: Testing Scripts (8 scripts)

**tsx migrations**:
- test:repair, test:optimize, test:emergency
- test:super, test:super:emergency, test:super:performance
- backtest, verify:no-redis, debug:redis

**Verification**: `npm run test:unit` passes.

#### Batch 6: Remaining Scripts

- review:watch, review:help
- generate:golden
- circuit-breaker

**Verification**: Full test suite passes.

---

### Phase 3: Hook Neutralization (30 minutes)

**Objective**: Make sidecar infrastructure optional without breaking Windows devs.

**Tasks**:

1. **Update ensure-sidecar.mjs** to warn-only mode:
   ```javascript
   // Add at top of file
   const SIDECAR_REQUIRED = process.env.SIDECAR_REQUIRED === '1';

   // Change exit(1) to:
   if (needsLink) {
     console.warn('[ensure-sidecar] Sidecar not linked (non-blocking)');
     if (SIDECAR_REQUIRED) process.exit(1);
   }
   ```

2. **Update link-sidecar-packages.mjs** to respect opt-in:
   ```javascript
   // Add at top, after CI check
   if (process.env.SIDECAR_ENABLE !== '1' && !process.env.CI) {
     console.log('[link-sidecar] Sidecar linking disabled. Set SIDECAR_ENABLE=1 to enable.');
     process.exit(0);
   }
   ```

3. **Update postinstall hook**:
   ```json
   "postinstall": "node scripts/link-sidecar-packages.mjs || echo 'Sidecar linking skipped'"
   ```

**Acceptance**:
- `npm install` completes without sidecar errors
- `npm test` passes without sidecar
- `SIDECAR_REQUIRED=1 npm run predev` fails if sidecar missing (Windows safety)

---

### Phase 4: Cleanup (30 minutes)

**Objective**: Remove sidecar infrastructure after validation period.

**Precondition**: Phase 3 has been stable for at least one release cycle.

**Tasks**:

1. **Remove sidecar scripts from hooks**:
   ```json
   "predev": "",
   "prebuild": "",
   "pretest": "",
   "prepreview": "",
   "postinstall": ""
   ```

2. **Delete sidecar infrastructure files**:
   - `scripts/ensure-sidecar.mjs`
   - `scripts/link-sidecar-packages.mjs`
   - `scripts/sidecar-packages.json`
   - `scripts/doctor-sidecar.js`

3. **Update doctor scripts**:
   - Remove sidecar checks from `npm run doctor`
   - Keep `doctor:quick` for basic module resolution

4. **Update documentation**:
   - Remove sidecar sections from CLAUDE.md
   - Archive SIDECAR_GUIDE.md to docs/archive/
   - Update onboarding docs

5. **Optional: Remove tools_local directory**:
   ```bash
   rm -rf tools_local/
   # Update .gitignore to remove tools_local/node_modules/
   ```

**Acceptance**:
- Clean `npm install && npm test` without sidecar
- `rg "tools_local" package.json` returns 0 matches
- CI and local builds follow identical dependency resolution

---

## Risk Assessment

### Low Risk
- Script migration (direct binary names are standard npm practice)
- Version sync (packages are already aligned)
- Hook neutralization (env vars provide escape hatch)

### Medium Risk
- lightningcss addition (vite.config.ts dependency)

### HIGH RISK: Windows Defender Regression

**This is the critical risk that motivated the sidecar architecture in the first place.**

---

## Windows Defender Risk Analysis

### The Original Problem (October 2025)

**Root Cause**: Windows Defender real-time protection **silently blocks** npm from
writing certain packages to `node_modules/`. This particularly affects:
- `vite` (dev server code triggers heuristic antivirus detection)
- `@vitejs/plugin-react`
- `tsx`
- `concurrently`

**Symptoms** (from `INCIDENT_LOG_REDIS_DB_HARDENING.md`):
```bash
npm install        # Reports success (918 packages)
npm ls vite        # Returns (empty)
node_modules/vite  # Does not exist on disk
npx vite --version # Works (uses npx cache, not local)
npm run dev        # ERR_MODULE_NOT_FOUND
```

**What Happens**:
- npm creates directory structure (`@vitejs/` folder exists but empty)
- Antivirus intercepts and **blocks file writes** during package extraction
- npm doesn't report the failure (silent block)
- 558 other packages install successfully, only vite-related packages affected
- **Complete development environment failure** - cannot start dev server

### Why Sidecar Was Implemented

The sidecar architecture provides "Windows Defender Immunity":

1. **Isolated workspace**: `tools_local/` is a separate npm workspace
2. **Pre-installed**: `npm ci --prefix tools_local` runs before main install
3. **Junction links**: Windows junctions bypass the problematic npm install path
4. **Source of truth**: `tools_local/node_modules/` has the actual packages

**Theory**: The smaller, separate sidecar install is less likely to trigger
Windows Defender heuristics than the large main `node_modules/` install.

### Migration Risks for Windows

| Risk | Likelihood | Impact | Description |
|------|------------|--------|-------------|
| Silent package blocking | **MEDIUM** | **HIGH** | Windows Defender may block vite/tsx during npm install |
| Dev environment failure | **MEDIUM** | **HIGH** | Cannot start dev server if vite missing |
| CI/local divergence | LOW | MEDIUM | Linux CI passes, Windows local fails silently |
| Developer productivity loss | **MEDIUM** | **HIGH** | Hours debugging "phantom" missing packages |

### Why The Risk May Be Lower Than Expected

Per `docs/WINDOWS_NODE_CORRUPTION_PREVENTION.md`, the "real fix" was simpler:

1. **`npx` usage**: Already in place for some scripts
2. **dotenv override**: `loadDotenv({ override: true })` in server config
3. **Explicit dependencies**: All tools declared in package.json

The sidecar may have been a "belt and suspenders" approach on top of these fixes.

**However**: The incident log shows npm install **silently succeeds** while packages
are blocked - this is insidious and hard to debug without the sidecar safety net.

### Required Mitigations Before Migration

#### 1. Document Windows Defender Exclusion (MANDATORY)

Add to README and onboarding docs:
```powershell
# PowerShell (Admin required)
Add-MpPreference -ExclusionPath "C:\dev\Updog_restore"
Add-MpPreference -ExclusionPath "$env:USERPROFILE\AppData\Local\npm-cache"
```

#### 2. Create `setup-windows.ps1` Script

```powershell
# One-click Windows setup with Defender exclusion
param([switch]$AddDefenderExclusion)

if ($AddDefenderExclusion) {
    Write-Host "Adding Windows Defender exclusions (requires Admin)..."
    Add-MpPreference -ExclusionPath $PWD
    Add-MpPreference -ExclusionPath "$env:USERPROFILE\AppData\Local\npm-cache"
}

npm config set longpaths true
npm config set engine-strict false
npm install
npm run doctor:quick
```

#### 3. Enhance `doctor:quick` Validation

Add explicit disk presence checks (not just `require.resolve`):
```javascript
// Check packages exist ON DISK, not just resolvable
const vitePath = 'node_modules/vite/package.json';
if (!fs.existsSync(vitePath)) {
  console.error('CRITICAL: vite not on disk (Windows Defender may have blocked install)');
  console.error('FIX: Add project folder to Windows Defender exclusions');
  process.exit(1);
}
```

#### 4. Test on Windows CI Before Merging

The existing `.github/workflows/sidecar-windows.yml` should be expanded to test
post-migration behavior on `windows-latest`.

### Recommended Approach: Conditional Migration

**Do NOT remove sidecar completely without Windows validation period.**

**Option A: Staged Rollout (Recommended)**
1. Phase 2: Migrate scripts (works with or without sidecar)
2. Phase 3: Make sidecar optional via `SIDECAR_ENABLE=1`
3. Phase 3.5: **2-week Windows validation period** with real users
4. Phase 4: Remove sidecar only after zero Windows Defender incidents

**Option B: Keep Sidecar for Windows Only**
- CI/Linux: Uses root node_modules (already works)
- Windows: Continues using sidecar (no change)
- Simpler, lower risk, but maintains dual-path complexity

**Option C: Full Migration with Defender Exclusion Requirement**
- Require Defender exclusion as part of Windows setup
- Document clearly in README, onboarding, error messages
- Accept that some Windows devs may hit issues initially

### Recommendation

**Proceed with caution.** The migration is technically sound, but the Windows
Defender issue is **insidious** (silent failures, npm reports success).

**Minimum requirements before Phase 4 (sidecar removal)**:
1. `setup-windows.ps1` script created and documented
2. `doctor:quick` enhanced to detect silent install failures
3. Windows CI job validates full workflow
4. 2-week validation period with Windows developers
5. Clear rollback path documented and tested

---

## Rollback Strategy

### Immediate Rollback (any phase)
```bash
git checkout HEAD~1 -- package.json scripts/
npm run postinstall  # Re-enable sidecar junctions
```

### Windows Safety Net
Keep these env vars documented for one release:
- `SIDECAR_ENABLE=1`: Force sidecar junction creation
- `SIDECAR_REQUIRED=1`: Fail if sidecar not available

### Windows Defender Alternative
If Windows performance was the original motivation, document this alternative:
```powershell
# Add project to Windows Defender exclusions
Add-MpPreference -ExclusionPath "C:\dev\Updog_restore\node_modules"
```

---

## Success Criteria

1. [x] `doctor:quick` succeeds using root node_modules (already works on Linux/CI)
2. [ ] All 53 scripts run without tools_local references
3. [ ] No CI/local divergence: same dependency resolution everywhere
4. [ ] `rg "tools_local" package.json scripts` returns 0 matches
5. [ ] Full test suite passes: `npm test`
6. [ ] Build completes: `npm run build`

---

## Appendix: Script Migration Reference

### tsx Pattern
```json
// FROM
"script": "node tools_local/node_modules/tsx/dist/cli.mjs path/to/file.ts"

// TO
"script": "tsx path/to/file.ts"
```

### concurrently Pattern
```json
// FROM
"script": "node tools_local/node_modules/concurrently/dist/bin/concurrently.js -k ..."

// TO
"script": "concurrently -k ..."
```

### Full Script Inventory

See `package.json` lines 22, 27-32, 36, 42-45, 50-52, 102-106, 108-113, 131-132, 136-141, 160-161, 163, 173, 175-179, 186, 226-227, 229, 244, 259, 281, 295-297.

---

## Recommendation

**Proceed with script migration (Phases 0-2), but defer sidecar removal (Phase 4)
until Windows Defender mitigations are in place.**

### What's Safe to Do Now:
1. Phase 0: Baseline verification
2. Phase 1: Version synchronization + add lightningcss
3. Phase 2: Migrate 53 scripts to direct binary calls
4. Phase 3: Make sidecar optional (env var controlled)

### What Requires Windows Validation First:
- Phase 4: Full sidecar removal

### Why This Is The Right Approach:

**Low-risk benefits** (Phases 0-3):
- Scripts work identically with or without sidecar
- CI already uses root node_modules - proven to work
- Direct binary names are standard npm practice
- Env var escape hatches protect Windows developers
- Rollback is a single git checkout

**High-risk deferred** (Phase 4):
- Windows Defender silent blocking is insidious
- Requires `setup-windows.ps1` and enhanced `doctor:quick`
- Needs 2-week validation with Windows developers
- Should only proceed after zero Defender incidents

### Estimated Effort:

| Phase | Effort | Risk | Status |
|-------|--------|------|--------|
| 0-2 | 3-4 hours | Low | Ready to proceed |
| 3 | 30 min | Low | Ready to proceed |
| 4 | 30 min | **HIGH** | Defer until Windows validation |

**Total (Phases 0-3)**: 4-5 hours
**Phase 4**: Defer 2+ weeks pending Windows testing
