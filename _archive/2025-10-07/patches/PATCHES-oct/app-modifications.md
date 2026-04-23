# App.tsx Modifications

**File**: `client/src/App.tsx`

## Changes Required

### 1. Add imports at the top:

```typescript
import { useFlag } from '@/shared/useFlags';
import { FlagGate } from '@/components/common/FlagGate';
import { HeaderKpis } from '@/components/overview/HeaderKpis';
import { LegacyRouteRedirector } from '@/components/LegacyRouteRedirector';
```

### 2. Add flag accessor in MainContent component:

**Find the `MainContent` component** (around line 100+) and add at the top:

```typescript
function MainContent() {
  const kpisEnabled = useFlag('enable_kpi_selectors');
  // ... existing code
```

### 3. Replace DynamicFundHeader with gated version:

**BEFORE** (around line 150):
```typescript
<DynamicFundHeader />
```

**AFTER**:
```typescript
<FlagGate
  enabled={kpisEnabled}
  fallback={<DynamicFundHeader data-testid="dynamic-fund-header" />}
>
  <HeaderKpis data-testid="header-kpis" />
</FlagGate>
```

### 4. Add LegacyRouteRedirector inside Router:

**Find where routes are defined** (inside the `<Switch>` component, around line 200+):

**Add this BEFORE the first `<Route>`**:

```typescript
<Switch>
  <LegacyRouteRedirector />  {/* ADD THIS LINE */}

  <Route path="/fund-setup">
    {/* existing routes */}
  </Route>
  {/* ... rest of routes */}
</Switch>
```

**Note**: The repo uses `wouter` not `react-router-dom`. LegacyRouteRedirector needs to be adapted:

## Alternative: LegacyRouteRedirector for Wouter

Since the app uses `wouter`, update the redirector:

**File**: `client/src/components/LegacyRouteRedirector.tsx`

```typescript
import { useEffect } from 'react';
import { useLocation, useRoute } from 'wouter';
import { useFlag } from '@/shared/useFlags';
import { LEGACY_ROUTE_MAP } from '@/config/routes';

export function LegacyRouteRedirector() {
  const isNewIA = useFlag('enable_new_ia');
  const [location, setLocation] = useLocation();

  useEffect(() => {
    if (!isNewIA) return;

    const newPath = LEGACY_ROUTE_MAP.get(location);
    if (newPath) {
      console.info(`[Redirect] ${location} → ${newPath}`);
      setLocation(newPath, { replace: true });
    }
  }, [isNewIA, location, setLocation]);

  return null;
}
```

## Summary

- **4 new imports**
- **1 flag accessor** in MainContent
- **1 component swap** (DynamicFundHeader → FlagGate)
- **1 redirector mount** in Switch

## Verification

```javascript
// Test header swap
localStorage.setItem('ff_enable_kpi_selectors', '0'); // Shows DynamicFundHeader
localStorage.setItem('ff_enable_kpi_selectors', '1'); // Shows HeaderKpis

// Test redirects
localStorage.setItem('ff_enable_new_ia', '1');
// Navigate to /funds → should redirect to /portfolio
```
