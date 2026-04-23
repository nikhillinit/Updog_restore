# Sidebar.tsx Modifications

**File**: `client/src/components/layout/sidebar.tsx`

## Changes Required

### 1. Add imports at the top (after existing imports):

```typescript
import { useFlag } from '@/shared/useFlags';
import { LEGACY_NAV_ITEMS, NEW_IA_NAV_ITEMS } from '@/config/navigation';
```

### 2. Replace the hardcoded `navigationItems` array:

**BEFORE** (lines 36-63):
```typescript
const navigationItems = [
  { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
  { id: 'portfolio', label: 'Portfolio', icon: Building2 },
  // ... 25+ items
];
```

**AFTER**:
```typescript
// REMOVED - now using config/navigation.ts
```

### 3. Inside the `Sidebar` component function, add flag check at the top:

**Add after line 77** (after the useFundContext line):

```typescript
const isNewIA = useFlag('enable_new_ia');
const navigationItems = isNewIA ? NEW_IA_NAV_ITEMS : LEGACY_NAV_ITEMS;
```

### 4. Update the navigation rendering section:

The existing code around line 120+ already maps over `navigationItems`, so it should automatically pick up the new list. **No changes needed to the rendering logic** - it already uses `.map()`.

## Summary

- **Lines to add**: 2 imports, 2 lines in component
- **Lines to remove**: The hardcoded `navigationItems` const (lines 36-63)
- **Total changes**: ~30 lines removed, ~4 lines added
- **Net effect**: Cleaner code, flag-driven navigation

## Verification

After changes:
```bash
# With flags OFF (default)
localStorage.setItem('ff_enable_new_ia', '0');
# Should see 26 items in sidebar

# With flag ON
localStorage.setItem('ff_enable_new_ia', '1');
# Should see 5 items: Overview/Portfolio/Model/Operate/Report
```
