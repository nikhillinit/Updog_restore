---
status: ACTIVE
last_updated: 2026-01-19
---

# Performance Profiling Playbook

## ✅ Implementation Status

### 1. **Source Maps & Build Configuration**

- ✅ Source maps enabled in `vite.config.ts` (`sourcemap: true`)
- ✅ React build available: `npm run build:web:react`
- ✅ Preact build available: `npm run build:web:preact`
- ✅ Preview server: `npm run preview:web`

### 2. **Performance Instrumentation**

- ✅ Added performance marks to `buildInvestmentStrategy()` function
- ✅ Marks: `strategy:start` → `strategy:end`
- ✅ Measures visible in Performance panel as "strategy"

### 3. **Isolation Toggles**

- ✅ **Safe Mode**: Add `?safe` to URL - uses minimal computation fallback
- ✅ **No Charts**: Add `?nocharts` to URL - disables chart rendering
- ✅ Visual indicators in UI showing active modes
- ✅ Debug panel with render count and mode status

### 4. **Development Loop Sentries**

- ✅ Render phase detection: Prevents `set()` during React render
- ✅ Selector phase detection: Prevents `set()` during selector execution
- ✅ Mount effect idempotency: Detects double mounts
- ✅ Render counting: Detects infinite loops (>100 renders)
- ✅ Console warnings with stack traces

## 🎯 Profiling Instructions

### Quick Start

1. Run `npm run build:web:react && npm run preview:web`
2. Open `http://localhost:4173/fund-setup`
3. Open DevTools (F12) → Performance tab
4. Click gear ⚙️ and set **CPU: 4× slowdown**
5. Click **Start recording (●)**
6. Navigate: Step 2 → Step 3 and wait for freeze
7. Click **Stop**

### What to Look For

| Performance Panel Shows                                       | Root Cause                   | Fix Priority                        |
| ------------------------------------------------------------- | ---------------------------- | ----------------------------------- |
| **Giant yellow Task** with `buildInvestmentStrategy` on top   | Heavy compute on main thread | Move to Web Worker + memoization    |
| **Dense React stacks** (`performSyncWorkOnRoot` + `setState`) | Render/update loop           | Find `set()` during render/selector |
| **"Recalculate Style/Layout"** stretches                      | Layout thrash                | Virtualize or batch DOM work        |

### Isolation Testing

| URL                         | Purpose           | Expected Result                        |
| --------------------------- | ----------------- | -------------------------------------- |
| `/fund-setup`               | Normal mode       | May hang on Step 3                     |
| `/fund-setup?safe`          | Safe mode         | Should render with minimal computation |
| `/fund-setup?nocharts`      | No charts         | Should disable chart rendering         |
| `/fund-setup?safe&nocharts` | Maximum isolation | Minimal functionality for debugging    |

## 🔧 Instrumentation Details

### Performance Marks

```javascript
// In buildInvestmentStrategy.ts
performance.mark('strategy:start');
// ... computation
performance.mark('strategy:end');
performance.measure('strategy', 'strategy:start', 'strategy:end');
```

### Loop Detection

```javascript
// In InvestmentStrategyStep.tsx
if (renderCountRef.current > 100) {
  console.error('🚨 INFINITE RENDER DETECTED:', renderCountRef.current);
}
```

### Render Guards

```javascript
// In useFundStore.ts
const withRenderGuard = (fn, actionName) => {
  return (...args) => {
    if (renderPhaseGuard) {
      console.error(`🚨 RENDER GUARD: ${actionName} during render!`);
      return;
    }
    return fn(...args);
  };
};
```

## 📊 Reading the Profile

### JS CPU Profiler View

1. More tools → **JavaScript Profiler** → Start → Step 2→3 → Stop
2. Flame chart shows function call hierarchy
3. Look for hot spots in `buildInvestmentStrategy` or React internals

### Bottom-Up Analysis

1. Select long Task region in Main track
2. Switch to **Bottom-Up** view
3. **Group by Activity**
4. Top 1-3 entries show hottest functions

### Common Patterns

- **Compute**: Single function dominates (strategy builder, chart prep)
- **Loop**: React hooks/setState appear repeatedly in dense pattern
- **Layout**: Style recalculation appears in long stretches

## 🎬 Next Steps

1. Execute profiling with provided scripts
2. Capture Performance recording of Step 2→3 hang
3. Export profile and analyze Bottom-Up + Call Tree views
4. Apply targeted fixes based on profile evidence
