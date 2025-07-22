# Streamlined TypeScript Fix Workflow

## Setup Complete ✅
- `tsconfig.json` - Strict production config
- `tsconfig.fast.json` - Fast iteration config (skipLibCheck, no unused checks)
- Incremental compilation enabled
- ES2020 target (fixes Set iteration issues)

## Single-Agent Workflow

### Terminal Layout (4 panes)
```bash
# Pane 1: TypeScript Watch (Live Error Queue)
npx tsc -p tsconfig.fast.json --noEmit --watch

# Pane 2: Test Watch (Affected tests only)
npm test -- --watch

# Pane 3: Vite Dev Server
npm run dev -- --clearScreen false --mode development --force

# Pane 4: Editor/Git
# Work here
```

## Error-Driven Development Process

1. **Start TypeScript Watch**
   ```bash
   npx tsc -p tsconfig.fast.json --noEmit --watch
   ```

2. **Work Through Errors Sequentially**
   - Copy first error block (15-20 lines)
   - Fix that specific error
   - Save → Watch shows next error
   - Repeat

3. **Commit Frequently**
   ```bash
   git add -p  # Stage specific fixes
   git commit -m "fix(ts): [specific error fixed]"
   ```

## Current Status
- Total Errors: 120
- Build Status: PASSING (despite errors)
- Iterator Errors: FIXED (ES2020 target)

## Priority Error Types

### 1. Fund Schema Mismatches (40+ errors)
**File**: `client/src/pages/fund-setup.tsx`
**Fix**: Update Fund interface to match wizard expectations

### 2. Custom Field Type Issues
**File**: `client/src/components/custom-fields/custom-fields-editor.tsx`
**Fix**: Implement discriminated union for FieldValue

### 3. API Response Types
**File**: Various pages with fetch calls
**Fix**: Add proper type guards for Response objects

## Quick Commands

```bash
# Clear cache and rebuild
rm -rf .tscache && npx tsc -p tsconfig.fast.json --noEmit

# Time subsequent compiles (should be <1s)
time npx tsc -p tsconfig.fast.json --noEmit

# Full strict check (before commit)
npx tsc -p tsconfig.json --noEmit

# Check current error count
npx tsc -p tsconfig.fast.json --noEmit 2>&1 | grep -c "error TS"
```

## Git Workflow

1. Work on `ts-fix/component-types` branch
2. Small, focused commits
3. Push when error count drops by 10+
4. PR when a full category is complete

## Next Steps

1. Start watch mode
2. Fix first error shown
3. Let compiler guide the work
4. No pre-planning needed - just follow the errors