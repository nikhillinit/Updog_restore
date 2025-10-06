# Windows NPX Workaround (Temporary)

## Root Cause
On some Windows machines, Windows Defender (or similar) blocks materialization of certain dev tools (`vite`, `tsx`, `concurrently`) in `node_modules`, even when `npm install` reports success. This yields empty dirs and `npm list` showing `(empty)`.

## Solution Evolution

### Phase 1: NPX Pinning (Failed)
- Attempted to use `npx vite@5.4.11`, `npx tsx@4.19.2`, `npx concurrently@9.2.1`
- Result: NPX commands "not recognized" on Windows, PATH/shim issues

### Phase 2: Portable Local + NPX (Partial)
- Used `npm pack` to extract tarballs directly to `node_modules`
- Result: Config imports worked, but NPX still unreliable

### Phase 3: Direct Node + npm pack (Incomplete)
- Direct node invocation: `node node_modules/vite/bin/vite.js`
- Result: Missing transitive dependencies (rollup, yargs, etc.)

### Phase 4: Complete Local Install + Direct Node (Current)
- Full installation with dependencies using `npm install --force --no-save`
- Direct node invocation bypasses all PATH/shim issues
- Idempotent installation only when needed
- Runtime module verification ensures all dependencies present

## Current Workaround (Phase 4)

### Complete Local Installation with Direct Node Invocation

1. **Idempotent local installation** with all dependencies:
   - `ensure-complete-local.mjs` installs tools ONLY when missing/wrong version
   - Uses `npm install --force --no-save` to get full dependency trees
   - Verifies runtime modules (rollup, postcss, yargs, chokidar)
   - Retries once with cache clean if modules missing

2. **Direct node invocation** in all scripts:
   - `vite` → `node node_modules/vite/bin/vite.js`
   - `tsx` → `node node_modules/tsx/dist/cli.mjs`
   - `concurrently` → `node node_modules/concurrently/dist/bin/concurrently.js`
   - Bypasses NPX, PATH, and Windows CMD shim issues completely

3. **Pre-hooks** ensure packages before execution:
   - `predev`, `prebuild:web`, `pretest`, etc. run `ensure-complete-local.mjs`
   - Guarantees tools and dependencies exist before any command runs

This is fully deterministic, leaves package.json/lockfile untouched, and is easily reversible.

## How to Apply the Workaround

```bash
# Step 1: Convert all scripts to direct node invocation
node scripts/apply-direct-node.mjs

# Step 2: Ensure complete local installation with dependencies
node scripts/ensure-complete-local.mjs

# Step 3: Validate setup
npm run doctor

# Step 4: Test workflows
npm run dev        # Starts API + client
npm run build:web  # Production build via Vite
npm run test:unit  # If test scripts use tsx
```

### Key Scripts

- **`ensure-complete-local.mjs`**: Idempotent installer that only installs when needed
- **`apply-direct-node.mjs`**: Converts all package.json scripts to use direct node invocation
- **`revert-to-normal.mjs`**: Rollback script for when Windows is fixed
- **`doctor.js`**: Validates binaries, runtime modules, and versions

## Reversion Steps (when Windows is fixed)

Once local installs work properly (e.g., WSL2, Dev Container, or Defender exclusions):

```bash
# Step 1: Revert scripts to normal commands
node scripts/revert-to-normal.mjs

# Step 2: Clean everything
rm -rf node_modules package-lock.json
npm cache clean --force

# Step 3: Reinstall normally
npm install

# Step 4: Verify
npm run doctor
npm run dev

# Step 5: Clean up workaround scripts (optional)
rm scripts/ensure-complete-local.mjs scripts/apply-direct-node.mjs scripts/revert-to-normal.mjs
```

## Affected Scripts

All scripts that previously invoked `vite`, `tsx`, or `concurrently` directly are now using NPX pins (≈68 scripts across dev/build/test/tooling).

### Conversion Applied By
`scripts/apply-npx-workaround.mjs` - Idempotent script that converts all package.json scripts to use NPX with pinned versions.

### Key Modified Scripts Include:
- **Development**: `dev`, `dev:client`, `dev:api`, `dev:parallel`, `dev:turbo`, `dev:worker:*`
- **Building**: `build:web`, `build:web:react`, `build:web:preact`, `build:stats`, `vercel-build`
- **Preview**: `preview`, `preview:web`
- **Testing**: `test:parallel`, `test:repair`, `test:optimize`, `test:emergency`, `test:super:*`
- **Security**: `security:headers`, `security:inputs`, `security:console-logs`, `security:monte-carlo`
- **AI Tools**: `ai:validate`, `ai:orchestrate:*`, `review:watch`, `generate:golden`
- **Schema**: `schema:generate`, `schema:check`, `schema:test`
- **Utilities**: `circuit-breaker`, `backtest`, `orchestrator`, `bench`, `verify:no-redis`

## Long-term Solutions

### Option 1: WSL2 or Dev Container
Run installs inside Linux where this issue does not occur:
- WSL2 Ubuntu: open repo under `\\wsl$\Ubuntu\...`, then `npm ci && npm run dev`
- VS Code Dev Container with Node 20 image

### Option 2: Windows Defender Exclusions (Admin PowerShell)
```powershell
# Temporarily exclude dev dirs (requires admin)
Add-MpPreference -ExclusionPath "C:\dev\Updog_restore"
Add-MpPreference -ExclusionPath "$env:USERPROFILE\AppData\Local\npm-cache"

# Clean + reinstall
npm run reset:deps

# Verify local installation
npm list vite concurrently tsx

# Remove exclusions (good hygiene)
Remove-MpPreference -ExclusionPath "C:\dev\Updog_restore"
Remove-MpPreference -ExclusionPath "$env:USERPROFILE\AppData\Local\npm-cache"
```

Once local installs work, revert scripts to use local binaries instead of NPX.