# Archived Demo Assets

**Archived Date:** 2025-10-07
**Total Size:** ~126KB

## Overview

Demo-specific components, pages, and utilities used for showcasing features,
development tooling, and integration demonstrations. These were active during
development but are no longer needed in production.

---

## Components (~43KB)

### `components/demo/`
- `DemoBanner.tsx` - Demo mode banner component
- `ai-enhanced-components-demo.tsx` - AI components showcase

### `components/`
- `DemoToolbar.tsx` (2.7KB) - Dev toolbar with feature flags & persona switching
- `demo-banner.tsx` (971 bytes) - Demo mode indicator banner
- `MobileExecutiveDashboardDemo.tsx` (16KB) - Mobile dashboard integration demo
- `graduation-reserves-demo.tsx` (14KB) - Reserves graduation demo component

---

## Pages (~30KB)

- `mobile-executive-dashboard.tsx` - Mobile exec dashboard demo page
- `reserves-demo.tsx` - Reserves calculation demo page

Both pages were used for feature demonstrations and testing.

---

## Libraries & Data (~20KB)

### `lib/`
- `demo-data.ts` - Mock/synthetic demo data generators
- `demoFetch.ts` - Fetch wrapper with demo headers
- `demoScenarios.ts` - Demo scenario configurations

### `core/demo/`
- `http.ts` - Demo HTTP utilities
- `persona.ts` - Demo persona management (GP/LP/Admin)

---

## Features

### DemoToolbar Features
- **Persona Switching:** GP, LP, Admin roles
- **Feature Flags:**
  - `NEW_IA` - New information architecture toggle
  - `ENABLE_SELECTOR_KPIS` - KPI selector toggle
- **Reset Demo:** Clear demo state and localStorage

### Demo Banner
- Shows "🚀 Demo Mode Active - Synthetic Data" when stub mode enabled
- Detects demo mode via `isStubMode()` utility
- Loading state while checking mode

### Mobile Executive Dashboard Demo
- **Agent 2 Integration:** Mobile-first executive dashboard
- **Components Showcased:**
  - ExecutiveDashboard
  - SwipeableMetricCards
  - MobileOptimizedCharts (Line, Donut, Bar, Sparkline)
  - ResponsiveLayout system
  - AIInsightCard
  - ProgressiveDisclosure
- **Performance Modes:** standard, optimized, ultra
- **Responsive:** Mobile/tablet/desktop layouts

---

## Rationale for Archiving

1. **Development Tools:** DemoToolbar was for development only
2. **Showcase Components:** Demo pages were for feature demonstrations
3. **Mock Data:** Demo data generators not needed in production
4. **Integration Demos:** MobileExecutiveDashboardDemo showcased Agent 2 integration
5. **Feature Flags:** Demo-specific flags superseded by production feature flag system

---

## Production Impact

**⚠️ IMPORTANT:** These files should be **removed from production builds** to:
- Reduce bundle size (~126KB savings)
- Remove development-only code paths
- Eliminate demo mode logic from production

### Migration Notes

If demo functionality is needed in future:
1. **Feature Flags:** Use production feature flag system instead of DemoToolbar
2. **Synthetic Data:** Use proper test data generators
3. **Showcases:** Create dedicated `/examples` or `/storybook` directory

---

## Referenced Dependencies

These demo files imported:
- `@/core/demo/persona` - Persona management
- `@/core/demo/http` - Demo HTTP headers
- `@/lib/env-detection` - `isStubMode()` utility
- `@/contexts/FundContext` - Fund data context

**Note:** Check if `client/src/lib/env-detection.ts` and `client/src/core/demo/`
directory should also be archived after verifying no production usage.

---

## File Tree

```
archive/2025-10-07/demo-assets/
├── components/
│   ├── demo/
│   │   ├── DemoBanner.tsx
│   │   └── ai-enhanced-components-demo.tsx
│   ├── DemoToolbar.tsx
│   ├── demo-banner.tsx
│   ├── MobileExecutiveDashboardDemo.tsx
│   └── graduation-reserves-demo.tsx
├── pages/
│   ├── mobile-executive-dashboard.tsx
│   └── reserves-demo.tsx
├── lib/
│   ├── demo-data.ts
│   ├── demoFetch.ts
│   └── demoScenarios.ts
├── core/
│   └── demo/
│       ├── http.ts
│       └── persona.ts
└── README.md
```

---

**Archived By:** Claude Code
**Restoration:** `cp -r archive/2025-10-07/demo-assets/components/* client/src/components/`
