# Handoff Memo: Updog Development Strategy
**Date:** October 12, 2025
**Session:** Strategic Planning & BMAD Evaluation
**Status:** Plan Mode - Awaiting Decisions
**Token Usage:** 133k/200k (66% consumed)

---

## Executive Summary

Completed comprehensive analysis of BMAD-METHOD evaluation document and current project state. Identified critical misalignments and provided evidence-backed recommendations for 10-12 week production-ready development pathway.

### Key Findings

1. **Project is 85% Complete** (not 70% as BMAD doc assumed)
   - Zero TypeScript errors achieved (Oct 11, 2025)
   - 5 production-ready engines (DeterministicReserveEngine, ConstrainedReserveEngine, LiquidityEngine, PacingEngine, CohortEngine)
   - 56 GitHub workflows (recent Oct 10-11 consolidation: 73% code reduction)
   - Comprehensive test infrastructure (120 test files, golden datasets, quarantine system)

2. **Current Architecture ≠ BMAD Assumptions**
   - **BMAD Claims:** 7-step XState wizard needs completion
   - **Reality:** 8-step query-param wizard 90% functional (production route: `/fund-setup`)
   - **XState wizard:** Fully designed but NEVER deployed (exists in `client/src/components/modeling-wizard/` but not in `App.tsx`)

3. **Strategic Direction Evolved**
   - **June-Aug 2024:** Gate-based planning (G1-G5 from PRD)
   - **Aug-Sep 2024:** Gate fragmentation into infrastructure gates
   - **Oct 2024:** **Current strategy = Iteration-based** (2-week sprints)
   - **PRD (docs/prd.md) is OUTDATED** - Source of truth: `docs/iterations/STRATEGY-SUMMARY.md`

4. **BMAD Status**
   - **Installed:** v4.31.0 (July 23, 2025)
   - **Usage:** ZERO active usage in 4+ months
   - **Latest Stable:** v4.44.1 (13 versions behind)
   - **Experimental:** v6-alpha (complete rewrite, unstable, beta mid-October)

---

## Critical Decisions Required

### Decision #1: BMAD Upgrade Strategy

**Three Options:**

**Option 1: Upgrade to v4.44.1 NOW**
- Timeline: 1-2 hours
- Use case: Starting BMAD architecture docs this week
- Action: `npx bmad-method@latest install`

**Option 2: Wait for v6-beta (Mid-October) ⭐ RECOMMENDED**
- Timeline: 1-2 weeks + 2 hours install
- Use case: Can defer Week 0 architecture work until late October
- Rationale: Complete rewrite worth waiting for, avoid v4→v6 migration

**Option 3: Archive v4.31.0 and Remove**
- Timeline: 30 minutes
- Use case: Not using BMAD in next 4+ weeks
- Action: Move to `archive/bmad-v4.31.0/`, remove scripts

### Decision #2: Patch Application Strategy

Received 4 ready-to-merge patches from Oct 12 Proposal:
1. CI Gates + Branch Protection
2. Excel Parity Harness + Golden Datasets
3. Performance Gates (k6) + OpenTelemetry
4. Security (CSRF + Vite + MSW)

**Assessment:** Patches need significant adjustments for your project:

**Already Implemented:**
- ✅ OpenTelemetry (`server/otel.js` - better than patch)
- ✅ `manualChunks` removed (line 317: `manualChunks: undefined`)
- ✅ Security deps installed (`helmet`, `express-rate-limit`)
- ✅ Comprehensive vitest config

**Net-New Value to Extract:**
- ✅ Excel parity harness + golden datasets (100% new)
- ✅ k6 perf smoke test with thresholds (new)
- ✅ CSRF double-submit pattern (enhancement)
- ✅ CI workflow documentation

**Recommended Approach:** Selective cherry-pick, NOT full `git am`

---

## Proposed 10-12 Week Development Plan

### Phase 1: Foundation (Weeks 1-2)

**Week 1:**
- BMAD decision execution
- Excel parity harness creation
- k6 performance gates
- CSRF protection integration
- CI consolidation (56 → 15 workflows)

**Week 2:**
- Complete wizard steps 7-8 (Review & Create)
- API submission integration
- E2E testing
- Standards documentation (`docs/architecture/coding-standards.md`)

### Phase 2: Wizard Completion (Weeks 3-5)

**Week 3:**
- Reserve policy adapter (replace hardcoded 40%)
- Waterfall implementation (American + European)

**Week 4:**
- Fees & expenses forms
- Carry structure tiers

**Week 5:**
- Excel parity gate enforcement
- Contract-check workflow (Zod→OpenAPI)

### Phase 3: Performance & Observability (Weeks 6-7)

**Week 6:**
- k6 p95 < 500ms enforcement
- 2-user beta launch
- Bundle optimization

**Week 7:**
- MSW test stabilization
- Performance monitoring

### Phase 4: Production Deployment (Weeks 8-9)

**Week 8:**
- Security hardening
- GCP Cloud Run deployment
- Database migrations

**Week 9:**
- CSV import/export
- Scenario management

### Phase 5: Production Launch (Weeks 10-12)

**Week 10:**
- Test coverage (80%+ target)
- Documentation
- Production deployment

**Week 11:**
- User training (5 users)
- Observability setup (SigNoz)

**Week 12:**
- Post-production monitoring
- Next iteration planning

---

## Technical Specifications

### Required Branch Protection Checks (6)

1. `ci-core` - Typecheck + unit/integration
2. `unit-integration` - Core test suite
3. `contract-check` - Zod→OpenAPI drift
4. `calc-parity` - Excel XIRR/TVPI/DPI equivalence
5. `perf-smoke` - k6 p95 < 500ms
6. `e2e-preview` - Playwright on preview

### Coding Standards (Non-Negotiable)

**Financial Precision:**
- All monetary values MUST use `decimal.js`
- JavaScript `number` FORBIDDEN in engine math
- Tolerance: 1e-6 for XIRR/TVPI/DPI

**Excel Parity:**
- Microsoft Excel as oracle
- Golden datasets with Excel-calculated values
- Reference: https://support.microsoft.com/en-us/office/xirr-function-de1242ec-6477-445b-b11b-a303ad9adc9d

**Performance SLOs:**
- API p95 < 500ms (k6 enforced)
- Error rate < 1%
- Bundle size < 400KB

**Security:**
- CSRF: Double-submit cookie (NOT archived `csurf`)
- Headers: Helmet.js with CSP
- Rate limiting: 100 req/15min per user
- Cookies: `httpOnly`, `secure`, `sameSite: strict`

### Evidence-Backed Upgrades (Oct 12 Proposal)

1. **CI/CD:** `actions/setup-node@v5` with auto-cache
2. **Excel Parity:** Required gate, 1e-6 tolerance
3. **k6 Thresholds:** Fail job on p95 ≥ 500ms
4. **CSRF:** Double-submit cookie (csurf archived May 2025)
5. **Vite:** No `manualChunks`, route-level `import()`
6. **OpenTelemetry:** Minimal Node SDK + auto-instrumentations
7. **Branch Protection:** 6 required checks + Environments

---

## Current Project State

### Server Architecture
- **Entry point:** `server/index.ts` (uses `makeApp()` from `server/app.js`)
- **OpenTelemetry:** Already configured in `server/otel.js` (starts in `index.ts` line 4)
- **Port:** 3001 (not 3000 as patches assume)

### Existing Infrastructure
- ✅ OpenTelemetry SDK configured
- ✅ Helmet (v8.1.0) + express-rate-limit (v8.0.1) installed
- ✅ Vite config optimized (no manual chunks)
- ✅ Vitest config comprehensive (coverage, CI, quarantine)
- ✅ 56 workflows (recently refactored Oct 10-11)

### Missing/Needed
- ❌ `tests/parity/` directory (needs creation)
- ❌ Golden datasets with Excel-calculated values
- ❌ k6 smoke test
- ❌ CSRF middleware
- ❌ Branch protection configured in GitHub UI
- ❌ Workflow consolidation (56 → 15)

### Package.json Script Names
- `check` (not `typecheck`)
- `check:client`, `check:server`, `check:shared`
- `test` (runs unit + integration)
- `build:web` (not just `build`)

---

## Research Completed (4 Parallel Agents)

### Agent 1: Wizard Implementation Status
**Finding:** TWO separate wizards exist:
1. **Production:** `/fund-setup` (query-param routing, 8 steps, 90% complete)
2. **XState:** `client/src/components/modeling-wizard/` (7 steps, never deployed)

**Evidence:**
- `App.tsx` line 214 routes `/fund-setup` (production)
- No route for XState wizard
- No tests reference `ModelingWizard` component
- Last wizard commits Oct 2024, marked "WIP"

### Agent 2: Gate Workflow History
**Finding:** Gate-based planning abandoned August 2024

**Timeline:**
- June-Aug 2024: PRD gates G1-G5 active
- Aug 2024: Fragmentation into infrastructure gates (0, A, B, C, D, E, F)
- Sep 2024: Strategy simplification
- Oct 2024: **Iteration-based development (current)**

**Current Source of Truth:** `docs/iterations/STRATEGY-SUMMARY.md`

### Agent 3: Production-Ready Features
**Finding:** 85% infrastructure complete

**Production-Ready (95%+ confidence):**
- DeterministicReserveEngine (851 LOC, 769 LOC tests)
- ConstrainedReserveEngine (74 LOC, active API)
- Zod schema system (559+ LOC)
- TypeScript zero-error infrastructure
- Testing framework (120 test files)

**Production-Ready (80%+ confidence):**
- LiquidityEngine (944 LOC, UI integration)
- PacingEngine (153 LOC, workers)
- CohortEngine (251 LOC, API routes)

**Active Development (70%):**
- MonteCarloEngine (streaming architecture)

### Agent 4: CI/CD Maturity
**Finding:** Sophisticated but over-engineered (56 workflows)

**Recent Refactor (Oct 10-11, 2025):**
- Created `reusable-ci-core.yml`
- 73% code reduction
- Fixed 7 correctness issues
- Removed 500MB artifact uploads
- Path-aware gates

**Maturity:** 7/10 (Pragmatic Intermediate)
- Trending toward consolidation (good)
- Still excessive workflow count (needs work)

---

## Recommended Next Steps

### Immediate (This Week)

1. **BMAD Decision:** Choose Option 1, 2, or 3
2. **Review Tailored Patches:** Provided in plan mode (4 adjusted patches)
3. **Confirm Timeline:** Starting Week 1 immediately or planning phase?

### Week 1 Execution (If Approved)

**Day 1:**
- Execute BMAD decision
- Create `tests/parity/` directory structure

**Day 2-3:**
- Create golden datasets (Excel values)
- Implement parity test harness
- Add `calc-parity.yml` workflow

**Day 4:**
- Create k6 smoke test
- Add `perf-smoke.yml` workflow

**Day 5:**
- Implement CSRF middleware
- Create `.github/workflows/README.md`
- Add `ci-minimal.yml` emergency fallback

**Day 6-7:**
- Configure branch protection (6 required checks)
- Begin workflow consolidation
- Document standards

---

## Open Questions

1. **BMAD:** Which option (1, 2, or 3)?
2. **Golden Datasets:** Do you have Excel-calculated XIRR/TVPI/DPI values?
3. **Timeline:** Week 1 starts when?
4. **Patch Strategy:**
   - A) Create custom patches for your project?
   - B) Manual code extraction?
   - C) Direct file changes after plan approval?

---

## References & Links

**BMAD:**
- Latest Stable: v4.44.1 (Sep 29, 2025)
- Experimental: v6-alpha (mid-October beta expected)
- GitHub: https://github.com/bmad-code-org/BMAD-METHOD

**Documentation:**
- Microsoft Excel XIRR: https://support.microsoft.com/en-us/office/xirr-function-de1242ec-6477-445b-b11b-a303ad9adc9d
- k6 Thresholds: https://grafana.com/docs/k6/latest/using-k6/thresholds/
- OWASP CSRF: https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html
- GitHub Branch Protection: https://docs.github.com/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches

---

## Files Modified/Referenced This Session

**Read:**
- BMAD evaluation doc (downloaded)
- Oct 12 Brainstorm/Proposal.txt
- CHANGELOG.md
- package.json
- vite.config.ts
- vitest.config.ts
- server/index.ts

**Analyzed:**
- `.github/workflows/` (56 workflows)
- `repo/.bmad-core/` (BMAD v4.31.0 installation)
- `client/src/components/wizard/`
- `client/src/components/modeling-wizard/`
- `shared/core/reserves/`

**Recommended to Create:**
- `HANDOFF_MEMO_2025-10-12.md` (this file)
- `tests/parity/` directory + golden datasets
- `.github/workflows/calc-parity.yml`
- `.github/workflows/perf-smoke.yml`
- `.github/workflows/ci-minimal.yml`
- `.github/workflows/README.md`
- `server/middleware/csrf.ts`
- `docs/architecture/coding-standards.md`

---

## Session Completion Status

✅ **Completed:**
- BMAD version analysis (v4.31.0 vs v4.44.1 vs v6-alpha)
- 4 parallel research agents (wizard, gates, features, CI/CD)
- Comprehensive patch evaluation
- Evidence-backed upgrade synthesis
- 10-12 week development plan

⏸️ **Pending User Input:**
- BMAD decision (Option 1, 2, or 3)
- Timeline confirmation
- Patch application strategy
- Golden dataset availability

🚫 **Not Executed (Plan Mode):**
- No file modifications
- No git operations
- No package installations
- No workflow creation

---

## Handoff to Next Session

**Context Summary:**
User approved comprehensive 10-12 week plan with evidence-backed upgrades from Oct 12 Proposal. Plan incorporates BMAD research findings, current project state (85% complete), and surgical improvements to patches. Ready to execute Week 1 foundation work pending 3 critical decisions.

**Priority 1:** BMAD upgrade decision
**Priority 2:** Excel parity harness (high LP-trust value)
**Priority 3:** CI consolidation (56 → 15 workflows)

**Token Usage Warning:** This session consumed 133k/200k tokens (66%). Next session should focus on execution, not further planning.

---

**Session End:** October 12, 2025
**Status:** Awaiting user decisions to proceed with Week 1 execution
