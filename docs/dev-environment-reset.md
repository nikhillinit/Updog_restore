---
status: ACTIVE
last_updated: 2026-01-19
---

# Development Environment Reset Guide

## Overview

This guide provides a tiered approach to resolving persistent cache, styling, or dependency issues in the Updog development environment on Windows.

## Quick Reference

```bash
# Level 1: Quick refresh (30 seconds)
npm run dev:force

# Level 2: Standard reset (2-5 minutes)
npm run reset

# Level 3: Deep reset with lock file regeneration
npm run reset:hard

# Level 4: Complete environment reset
npm run reset:full
```

## Tiered Reset Procedures

### Level 1: Quick Refresh (Try First - 30 seconds)

When you encounter minor styling or cache issues:

1. **Stop the dev server** (Ctrl+C in terminal)

2. **Restart with force flag:**
   ```bash
   npm run dev:force
   ```
   This uses Vite's built-in `--force` flag to clear the dependency cache without deleting `node_modules`.

3. **Clear browser cache:**
   - Open DevTools (F12)
   - Perform hard refresh: **Ctrl+F5** or **Cmd+Shift+R**
   - OR: Network tab → Check "Disable cache" → Refresh

4. If issue persists, proceed to Level 2.

### Level 2: Standard Reset (2-5 minutes)

For persistent caching or dependency issues:

1. **Stop all development servers** (close terminal windows)

2. **Free occupied ports** (if needed):
   ```bash
   npm run kill:ports
   ```
   This safely terminates processes on ports 3000, 5173, and 5000.

3. **Run the reset script:**
   ```bash
   npm run reset
   ```
   This removes:
   - `node_modules/`
   - `.vite/` (Vite dependency cache)
   - `dist/` (build artifacts)
   - Then clears npm cache and reinstalls dependencies

4. **Restart servers:**
   ```bash
   npm run dev
   ```

5. **Clear browser cache:**
   - Open DevTools (F12)
   - Network tab → Check "Disable cache"
   - Refresh the page
   - You can uncheck after confirming the fix

### Level 3: Deep Dependency Reset

When transitive dependencies might be corrupted:

1. **Run the hard reset:**
   ```bash
   npm run reset:hard
   ```
   This additionally removes `package-lock.json` to force npm to re-resolve all dependencies from scratch.

2. **Restart servers and clear browser cache** (see Level 2 steps 4-5)

### Level 4: Complete Environment Reset

The "nuclear option" for stubborn issues:

```bash
npm run reset:full
```

This script:
1. Kills processes on dev ports (3000, 5173, 5000)
2. Removes node_modules, package-lock.json, .vite, dist
3. Clears npm cache
4. Reinstalls dependencies
5. Starts dev server with `--force` flag

## Port Management

### Configured Ports

- **Frontend (Vite dev):** 5173 (strict - will fail if occupied)
- **Preview server:** 4173
- **Backend API:** 5000

### Manual Port Operations

**Check what's using a port:**
```powershell
# PowerShell
Get-NetTCPConnection -LocalPort 5173
```

```cmd
# CMD
netstat -ano | findstr :5173
```

**Kill specific process by PID:**
```powershell
# PowerShell
Stop-Process -Id <PID> -Force
```

```cmd
# CMD
taskkill /F /PID <PID>
```

**Safe port-specific termination:**
```powershell
# PowerShell - kills only processes on specific ports
Get-NetTCPConnection -LocalPort 5173 -ErrorAction SilentlyContinue |
  Where-Object State -Eq Listen |
  ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

## Browser Cache Management

### Hard Refresh Methods

1. **Keyboard shortcuts:**
   - Chrome/Edge: **Ctrl+F5** or **Ctrl+Shift+R**
   - Firefox: **Ctrl+F5** or **Ctrl+Shift+R**
   - Safari: **Cmd+Option+R**

2. **DevTools method (recommended):**
   - Open DevTools (F12)
   - Right-click the reload button
   - Select "Empty Cache and Hard Reload"

3. **Development mode:**
   - Open DevTools (F12)
   - Network tab → Check "Disable cache"
   - Keep DevTools open while developing

### Clear localStorage/sessionStorage

If client-side state is cached:

```javascript
// In browser console
localStorage.clear();
sessionStorage.clear();
location.reload();
```

## Common Issues & Solutions

### "Port 5173 is already in use"

```bash
npm run kill:ports
npm run dev
```

### "Styling changes not appearing"

1. Check browser DevTools Network tab - is CSS being served from cache?
2. Run `npm run dev:force`
3. Hard refresh browser (Ctrl+F5)
4. If still broken, run `npm run reset`

### "Module not found" after dependency update

```bash
npm run reset:hard
```

### "Cannot access X before initialization" (TDZ errors)

This is usually a build-time module ordering issue:

```bash
npm run reset
npm run dev
```

### IDE/Editor showing stale errors

1. Restart TypeScript server in VS Code:
   - Cmd/Ctrl+Shift+P → "TypeScript: Restart TS Server"
2. Restart the IDE
3. Run `npm run check` to verify types

## Environment Variables

Before resetting, ensure you have these set (if required):

```bash
# .env.local (example)
REDIS_URL=memory://
CORS_ORIGIN=http://localhost:5173
NODE_ENV=development
```

**Backup .env files before Level 3+ resets:**
```bash
copy .env .env.backup
copy .env.local .env.local.backup
```

## Prevention Strategies

### For Daily Development

1. **Use the quick force restart:**
   ```bash
   npm run dev:force
   ```

2. **Keep DevTools cache disabled:**
   - F12 → Network → Check "Disable cache"

3. **Restart dev server after:**
   - Installing new dependencies
   - Updating design system packages
   - Changing Vite or Tailwind config

### For Team Consistency

1. **Commit lock file changes:**
   Always commit `package-lock.json` changes to ensure team has identical dependency versions.

2. **Document custom configurations:**
   If you modify Vite config, Tailwind config, or tsconfig, update this documentation.

3. **Use consistent Node/npm versions:**
   - Node: 20.x (see `engines` in package.json)
   - npm: >=10.9.0

## Docker Alternative (Future)

For the most reliable environment consistency, consider containerizing development:

```dockerfile
# Dockerfile.dev (example)
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
CMD ["npm", "run", "dev"]
```

This eliminates host-specific caching and environment issues entirely.

## Script Reference

| Script | Purpose | Speed | When to Use |
|--------|---------|-------|-------------|
| `dev:force` | Vite force restart | 30s | Minor cache issues |
| `kill:ports` | Free dev ports | 5s | Port conflicts |
| `reset` | Full cache clear + reinstall | 2-5m | Styling/dep issues |
| `reset:hard` | + Lock file regeneration | 3-7m | Transitive dep issues |
| `reset:full` | Complete automated reset | 3-7m | Stubborn issues |

## Troubleshooting the Reset Scripts

### PowerShell Execution Policy Error

If `kill:ports` fails with "execution policy" error:

```powershell
# Run as Administrator
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### npm cache clean fails

```bash
# Force unlock
npm cache verify
npm cache clean --force
```

### rimraf command not found

```bash
npm install --save-dev rimraf
```

## Getting Help

If reset procedures don't resolve your issue:

1. **Check recent commits:**
   ```bash
   git log --oneline -10
   ```
   See if a recent change introduced the issue.

2. **Check Git status:**
   ```bash
   git status
   ```
   Uncommitted config changes can cause issues.

3. **Verify Node/npm versions:**
   ```bash
   node --version  # Should be 20.x
   npm --version   # Should be >=10.9.0
   ```

4. **Create an issue:**
   Document exact steps, error messages, and environment details.

---

**Last Updated:** 2025-10-04
**Maintainer:** Development Team
