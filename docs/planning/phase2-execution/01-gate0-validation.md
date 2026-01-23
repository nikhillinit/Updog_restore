# Gate 0: Production Hygiene Validation

**Status:** AUDIT COMPLETE, EXECUTION IN PROGRESS
**Date:** 2026-01-22

---

## 1. Console Discipline Audit

### Counts
| Location | console.log/info/debug | console.warn/error | Total |
|----------|------------------------|-------------------|-------|
| `client/src/` | ~125 | ~122 | 247 |
| `server/` | ~350 | ~389 | 739 |
| **Total** | **~475** | **~511** | **986** |

### Top Offenders
1. `server/examples/streaming-monte-carlo-examples.ts` - 94 statements
2. `server/bootstrap.ts` - 21 statements
3. `server/providers.ts` - 16 statements
4. `client/src/lib/rollout-orchestrator.ts` - 16 statements
5. `client/src/machines/modeling-wizard.machine.ts` - 9 statements

### Logger Abstractions (Fragmented)
| File | Framework | Version | Used By |
|------|-----------|---------|---------|
| `lib/logger.ts` | Winston | 3.19.0 | Generic (root) |
| `server/lib/logger.ts` | Pino | 9.9.0 | Rarely used |
| `server/db/logger.ts` | Winston | 3.19.0 | DB operations |
| `client/src/lib/logger.ts` | Browser wrapper | - | Rarely imported |

### ESLint Configuration
- **File:** `eslint.config.js`
- **Line:** 214
- **Current:** `'no-console': 'off'`
- **Target:** `'no-console': ['error', { allow: ['warn', 'error'] }]`

### Existing Tooling
- `npm run security:console-logs` - Find console statements
- `npm run security:fix-logs` - Replace with logger
- `npm run codemod:logger` - Fix import order

---

## 2. Admin Route Enforcement Audit

### Route Inventory
| Route | Protection | Risk |
|-------|------------|------|
| `/admin/ui-catalog` | Feature flag only | HIGH |
| `/admin/telemetry` | Not routed (orphaned) | MEDIUM |
| `/dev-dashboard` | NODE_ENV check | HIGH |
| `/api/admin/engine/*` | JWT + role check | LOW |
| `/api/admin/flags/*` | JWT + role check | LOW |

### Vulnerability: localStorage Override
```javascript
// Anyone can execute in DevTools:
localStorage.setItem('FF_UI_CATALOG', 'true');
// Then navigate to /admin/ui-catalog -> Access granted
```

### Remediation Plan
1. Create `AdminRoute` component with role validation
2. Wrap `/admin/*` routes with AdminRoute
3. Remove localStorage override for admin flags

---

## 3. Documentation & Flags Audit

### Flag System Mismatch
| Source | Location | Count |
|--------|----------|-------|
| Client | `client/src/lib/feature-flags.ts` | 14 flags |
| Server | `flags/*.yaml` | 2 flags |

### Missing Flags on Server
- ts_reserves, wasm_reserves, shadow_compare, reserves_v11
- remain_pass, stage_based_caps, export_async, metrics_collection
- new_ia, live_kpi_selectors, modeling_hub, operate_hub, analytics_events

### Missing Flags on Client
- wizard.v1, reserves.v1_1

### Security Gap: Public API Exposure
- **Endpoint:** `GET /api/flags`
- **Issue:** Exposes ALL flags without `exposeToClient` filtering
- **Fix:** Filter in `server/routes/public/flags.ts`

---

## 4. Script Hygiene Audit

### Archive Bloat
- **Location:** `/_archive/.migration-backup/`
- **Size:** ~2.5MB
- **Content:** Duplicate of entire `/scripts` directory
- **Action:** Remove (already archived externally)

### Script Categories Needed
- Active Build Tools (npm scripts)
- CI/CD Scripts (GitHub Actions)
- Development Helpers (optional)
- Deprecated (with migration notes)

---

## 5. PDF Service Audit (DEFERRED to Epic J)

### Current State
- Fonts fetched from `fonts.gstatic.com` at runtime
- Placeholder metrics: `totalIncome * 0.3`
- Not in production use

### Deferred Tasks
- Bundle fonts locally
- Integrate real metrics calculator
- Test with worst-case content

---

## Verification Checklist

- [ ] `npm run lint` passes with no-console errors
- [ ] `/admin/ui-catalog` returns 403 without admin role
- [ ] localStorage override no longer grants admin access
- [ ] `/api/flags` returns only client-safe flags
- [ ] `/_archive/.migration-backup/` removed
- [ ] All Gate 0 tasks complete
