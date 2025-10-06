# npm Package Management & .bin Resolution Analysis

## Executive Summary

**Root Cause:** npm does **NOT** automatically create `.bin` shims (`.cmd`, `.ps1`, shell scripts) for packages installed via Windows junctions or Unix symlinks. The junction/symlink approach only makes the package code accessible via `require()`/`import`, but npm's bin linking mechanism requires direct installation or explicit rebuild.

**Solution:** Run `npm rebuild <package-name> --ignore-scripts` after creating junctions to force npm to generate the necessary `.bin` shim files.

---

## Root Cause Determination

### The Problem
- npm scripts failed with: `'cross-env' is not recognized as an internal or external command`
- Yet `npx cross-env` worked perfectly
- Junctions were correctly created: `node_modules/cross-env` → `tools_local/node_modules/cross-env`
- Module resolution worked: `require('cross-env')` succeeded

### The Discovery
**Key Finding:** `.bin` shims were missing in root `node_modules/.bin/`

```bash
# Root .bin directory (BEFORE fix)
ls node_modules/.bin/cross-env.cmd  # ❌ MISSING
ls node_modules/.bin/vitest.cmd     # ❌ MISSING

# Sidecar .bin directory
ls tools_local/node_modules/.bin/cross-env.cmd  # ✅ EXISTS
ls tools_local/node_modules/.bin/vitest.cmd     # ✅ EXISTS
```

**npm's PATH construction** (from `npm run env`):
```
PATH=C:\dev\Updog_restore\node_modules\.bin;C:\dev\node_modules\.bin;...
```

npm **prepends** `node_modules/.bin` to PATH, expecting shims to exist there. When they don't exist, Windows shell can't find the executables.

---

## .bin Shim Creation Mechanism

### When npm Creates Shims

npm creates `.bin` shims during:
1. **`npm install`** - For packages directly installed from registry/tarball
2. **`npm link`** - For packages linked from local filesystem
3. **`npm rebuild <package>`** - Forces recreation of bin shims for specific packages

### What npm Does

For each package with a `bin` field in `package.json`:
```json
{
  "bin": {
    "cross-env": "src/bin/cross-env.js",
    "cross-env-shell": "src/bin/cross-env-shell.js"
  }
}
```

npm generates three shim files in `node_modules/.bin/`:
- **Unix shell script** (`cross-env`) - For Git Bash, WSL, macOS, Linux
- **Windows CMD** (`cross-env.cmd`) - For cmd.exe
- **PowerShell** (`cross-env.ps1`) - For PowerShell

These shims:
1. Locate the Node.js binary
2. Resolve the package's bin script path
3. Execute: `node <package-path>/<bin-script> "$@"`

### Junction/Symlink Limitation

**CRITICAL DISCOVERY:** npm's shim creation logic **skips junctioned packages**.

When you manually create a junction:
```bash
mklink /J "node_modules\cross-env" "tools_local\node_modules\cross-env"
```

npm **does not automatically scan and create shims** because:
1. The junction was created outside npm's install pipeline
2. npm's package database (`package-lock.json`) doesn't track it as "installed"
3. The postinstall hook doesn't trigger bin linking for manual junctions

**Verification:**
```bash
# After creating junctions
node -e "console.log(require.resolve('cross-env'))"  # ✅ Works (module resolution)
cross-env echo test                                   # ❌ Fails (bin shim missing)
npx cross-env echo test                               # ✅ Works (npx has different resolution)
```

---

## npx vs Direct Invocation

### Why npx Works When Direct Calls Fail

**npx's Resolution Algorithm:**
1. Check local `node_modules/.bin/<command>`
2. If not found, use `require.resolve()` to find the package
3. Read `package.json` to locate the bin entry point
4. Execute directly: `node <resolved-path>`

**Direct npm Script Invocation:**
1. Adds `node_modules/.bin` to PATH
2. Relies on Windows shell to find executable via PATH
3. **Fails if shim doesn't exist in `.bin`**

### Code Evidence

```javascript
// npx equivalent (works with junctions)
const pkgPath = require.resolve('cross-env');
const pkg = require('cross-env/package.json');
const binPath = path.join(path.dirname(pkgPath), pkg.bin['cross-env']);
require('child_process').spawn('node', [binPath, ...args]);

// npm script equivalent (requires .bin shim)
// 1. npm adds C:\...\node_modules\.bin to PATH
// 2. Windows searches PATH for "cross-env.cmd"
// 3. If missing → 'cross-env' is not recognized
```

### Why This Matters

- **npx** bypasses the need for `.bin` shims by using Node's module resolution
- **npm scripts** rely on shell PATH and **require** shim files to exist
- Junction-based installs get module resolution but not bin linking

---

## Junction Support in npm

### Official Support Status

**npm's documented behavior:**
- Fully supports symlinks on Unix (macOS, Linux)
- Supports junctions/symlinks on Windows with caveats
- **Does NOT auto-create bin shims for manual junctions**

### Known Limitations

1. **Bin linking is coupled to installation**
   - npm creates shims during `npm install` / `npm link`
   - Manual junctions bypass this mechanism

2. **Package database tracking**
   - `package-lock.json` doesn't know about manual junctions
   - `npm ls` may not show junctioned packages

3. **Rebuild is required**
   - Must explicitly run `npm rebuild <package>` to create shims
   - This forces npm to recognize the junction and link bins

### Related npm Issues

Similar issues reported in npm GitHub:
- npm doesn't create bins for manually symlinked packages
- `npm link` works but manual symlinks don't trigger bin creation
- Workaround: `npm rebuild` after creating symlinks/junctions

---

## Recommended Solution

### Primary Fix: Auto-rebuild After Junction Creation

**Implementation:**
```javascript
// scripts/link-sidecar-packages.mjs

// 1. Create junctions
for (const pkg of PACKAGES) {
  execSync(`cmd /c mklink /J "${rootPkg}" "${sidecarPkg}"`);
}

// 2. Find packages with bin scripts
const packagesWithBin = PACKAGES.filter(pkg => {
  const pkgJson = require(`./tools_local/node_modules/${pkg}/package.json`);
  return pkgJson.bin;
});

// 3. Rebuild to create .bin shims
if (packagesWithBin.length > 0) {
  execSync(`npm rebuild ${packagesWithBin.join(' ')} --ignore-scripts`);
}
```

**Why `--ignore-scripts`?**
- Prevents postinstall/preinstall scripts from running
- Avoids side effects (like lightningcss's patch-package requirement)
- Only creates bin shims, doesn't re-run package setup

**How It Works:**
1. `npm rebuild` detects the junctioned package exists
2. Reads `package.json` to find `bin` entries
3. Generates `.cmd`, `.ps1`, and shell script shims in `node_modules/.bin/`
4. npm scripts can now find executables via PATH

**Confidence Level:** **High**
- Tested and confirmed working
- Aligns with npm's documented behavior
- Minimal risk, only affects bin linking

---

## Alternative Approaches

### 1. **Use npx in All Scripts**
**How it works:**
```json
{
  "scripts": {
    "test": "npx cross-env TZ=UTC npx vitest run"
  }
}
```

**Pros:**
- Works immediately without rebuilds
- npx bypasses bin shim requirement

**Cons:**
- Slower (npx resolution overhead on every run)
- Verbose (must prefix every command with npx)
- Non-standard (most projects don't do this)

**When to use:** Emergency workaround only

---

### 2. **Direct Node Invocation**
**How it works:**
```json
{
  "scripts": {
    "dev": "node tools_local/node_modules/vite/bin/vite.js",
    "test": "node tools_local/node_modules/cross-env/src/bin/cross-env.js TZ=UTC ..."
  }
}
```

**Pros:**
- No bin shims needed
- Explicit and transparent

**Cons:**
- Current approach (already in use for some scripts)
- Must know exact bin entry point path
- Verbose and hard to maintain

**When to use:** Already implemented for critical scripts (dev, build)

---

### 3. **Install to Root (Abandon Sidecar)**
**How it works:**
```bash
npm install vite @vitejs/plugin-react cross-env vitest --save-dev
```

**Pros:**
- Standard npm workflow
- Automatic bin shim creation
- Zero custom scripting

**Cons:**
- Defeats purpose of sidecar isolation
- Windows Defender may block installations
- Higher risk of dependency conflicts

**When to use:** If sidecar architecture is no longer needed

---

## Implementation Complexity

**Complexity:** **Low**

**Key Steps:**
1. Update `scripts/link-sidecar-packages.mjs` (already done ✅)
2. Add bin detection logic (10 lines)
3. Run `npm rebuild` with filtered package list (1 line)
4. Test with `npm run test:unit` and `npm run dev`

**Estimated Time:** 30 minutes (complete)

**Dependencies:**
- No new packages needed
- Uses built-in npm commands
- Cross-platform compatible

---

## Risks & Edge Cases

### Potential Issues

1. **Package with failing install scripts**
   - **Risk:** `npm rebuild` may fail if package has broken postinstall
   - **Mitigation:** Use `--ignore-scripts` flag
   - **Status:** Already handled ✅

2. **Case sensitivity (Unix/Windows)**
   - **Risk:** Unix is case-sensitive, Windows is not
   - **Mitigation:** Consistent package naming in config file
   - **Status:** Not an issue (all packages are lowercase)

3. **CI/CD compatibility**
   - **Risk:** Different behavior in GitHub Actions vs local
   - **Mitigation:** `postinstall` hook runs automatically
   - **Status:** Already tested in CI ✅

4. **npm version differences**
   - **Risk:** Older npm may not support `--ignore-scripts`
   - **Mitigation:** `package.json` specifies `"npm": ">=10.9.0"`
   - **Status:** Version requirement enforced ✅

### Edge Cases Covered

✅ Scoped packages (`@vitejs/plugin-react`)
✅ Packages without bin scripts (preact, lightningcss)
✅ Multiple bin entries (cross-env has 2: `cross-env` and `cross-env-shell`)
✅ Git Bash vs PowerShell vs CMD (npm creates all 3 shim types)
✅ Repeated runs (safe to re-run, shims are overwritten)

---

## Verification Tests

### How to Confirm the Fix Works

**1. Clean test:**
```bash
# Remove all bin shims
rm -rf node_modules/.bin/*

# Run the fix
node scripts/link-sidecar-packages.mjs

# Verify shims exist
ls node_modules/.bin/cross-env.cmd  # Should exist
ls node_modules/.bin/vitest.cmd     # Should exist
```

**2. Run npm scripts:**
```bash
npm run test:quick   # Should work
npm run dev          # Should work
npm run lint         # Should work
```

**3. Check PATH resolution:**
```bash
npm run env | grep PATH  # Should show node_modules/.bin first
```

**Expected Results:**
- ✅ All `.bin` shims created
- ✅ npm scripts execute without "not recognized" errors
- ✅ PATH includes root `node_modules/.bin`

---

## Final Recommendations

### Immediate Actions
1. ✅ **DONE:** Updated `scripts/link-sidecar-packages.mjs` with auto-rebuild
2. ✅ **DONE:** Added bin detection to only rebuild necessary packages
3. ✅ **DONE:** Tested with `npm run test:unit` and `npm run test:quick`

### Documentation Updates
1. Update `SIDECAR_GUIDE.md` with bin shim explanation
2. Add troubleshooting section: "Command not recognized → run npm rebuild"
3. Document the `--ignore-scripts` flag usage

### Long-term Considerations
- **Option 1:** Keep sidecar + auto-rebuild (current solution)
  - Pros: Isolated dependencies, automated setup
  - Cons: Slightly more complex build process

- **Option 2:** Migrate critical tools to root dependencies
  - Pros: Standard npm workflow, simpler
  - Cons: Loses sidecar isolation benefits

**Recommendation:** Stick with **Option 1** (sidecar + auto-rebuild)
- Complexity is hidden in `postinstall` hook
- Developers don't need to think about it
- Maintains isolation benefits for Windows Defender issues

---

## Summary

**Problem:** npm scripts failed because junctioned packages lacked `.bin` shims

**Root Cause:** npm doesn't auto-create bin shims for manually junctioned packages

**Solution:** Run `npm rebuild <packages> --ignore-scripts` after creating junctions

**Status:** ✅ **RESOLVED** - Auto-rebuild implemented in `link-sidecar-packages.mjs`

**Confidence:** **High** - Tested and verified working on Windows with Git Bash

**Impact:** Zero developer friction - works automatically via `postinstall` hook
