---
status: ACTIVE
last_updated: 2026-01-19
---

# Chart Library Migration Decision

## Executive Summary
**Recommendation**: Consolidate on **Recharts** with staged migration from Nivo

## Current State Analysis

### Library Usage (As of 2025-08-27)
- **Recharts**: 27 components (93% of charts)
- **Nivo**: 2 components (7% of charts)  
- **Chart.js**: 0 components

### Comparison Matrix

| Criteria | Recharts | Nivo | Chart.js |
|----------|----------|------|----------|
| **Current Usage** | 27 files ✅ | 2 files | 0 files |
| **Bundle Size** | ~100KB | ~150KB | ~200KB |
| **TypeScript Support** | Good | Excellent | Fair |
| **Tree-shaking** | Yes ✅ | Partial | Limited |
| **Performance** | Good | Excellent | Good |
| **Documentation** | Excellent ✅ | Good | Excellent |
| **React Integration** | Native ✅ | Native | Wrapper needed |
| **SSR Support** | Yes | Yes | Limited |
| **Accessibility** | Built-in ✅ | Built-in | Manual |
| **Animation** | Good | Excellent | Good |

## Decision: Recharts

### Why Recharts Wins
1. **Already Dominant**: 93% of existing charts use Recharts
2. **Smaller Bundle**: Better tree-shaking, smaller size
3. **Native React**: Built for React from ground up
4. **Active Maintenance**: Regular updates, large community
5. **Good TypeScript**: Types are good enough for our needs

### Migration Plan

#### Phase 1: Dual-Adapter (Week 1)
```typescript
// Enable feature flag control
CHART_IMPL=recharts  // Keep as default
CHART_FALLBACK=true   // Enable safety net
```

#### Phase 2: Pilot Migration (Week 2)
1. Migrate 2 Nivo components to Recharts:
   - `nivo-performance-chart.tsx`
   - `nivo-moic-scatter.tsx`
2. A/B test with 10% of users
3. Monitor performance metrics

#### Phase 3: Full Migration (Week 3-4)
- Complete migration if metrics are green
- Remove Nivo dependency
- Bundle size reduction: ~150KB

### Risk Mitigation

#### Feature Parity Validation
```bash
# Before migration
npm run test:chart-interactions
npm run test:visual-regression

# After migration  
npm run test:chart-parity
```

#### Rollback Strategy
```typescript
// Instant rollback via environment variable
CHART_IMPL=legacy npm run deploy

// Or via runtime flag
window.__FORCE_CHART_IMPL = 'legacy';
```

#### Success Metrics
- No performance regression (render time <100ms)
- No visual regression (screenshot tests pass)
- Bundle size reduced by >100KB
- Zero user complaints

## Implementation Checklist

- [x] Analysis complete: Recharts dominant (93%)
- [x] Dual-adapter configuration created
- [ ] Feature flags configured
- [ ] Visual regression tests established
- [ ] Pilot components identified
- [ ] Monitoring dashboard updated
- [ ] Rollback procedure tested

## Rejected Alternatives

### Why Not Nivo?
- Only 2 components currently use it
- Larger bundle size
- Would require migrating 27 components

### Why Not Chart.js?
- No current usage
- Not React-native
- Requires wrapper components
- Larger bundle

## Timeline
- **Week 1**: Dual-adapter + feature flags
- **Week 2**: Pilot migration (2 components)
- **Week 3**: Full migration if metrics green
- **Week 4**: Cleanup and optimization

## Expected Outcomes
- Bundle size: -150KB (removing Nivo)
- Maintenance: Single chart library
- TypeScript: Fewer type conflicts
- Performance: Consistent rendering