---
status: HISTORICAL
last_updated: 2026-01-19
---

# Phoenix Phase 3 Execution Plan - Advanced Reporting & Brand Consistency

**Date:** December 29, 2025
**Status:** DRAFT - Ready for Implementation
**Author:** Solo Developer
**Approach:** Component-First, Brand-Compliant, LP-Focused

**Prerequisites Validated:**
- Phase 1/2 deterministic truth cases: 129/129 passing (with 8 pre-existing fixture issues)
- Phase 2 Advanced Forecasting (PR #318): Merged and stable
- Brand infrastructure: press-on-theme.ts, POVLogo, PremiumCard components ready

---

## Executive Summary

Phase 3 focuses on **Advanced Reporting & Brand Consistency** for LP-facing outputs.
This phase transforms the existing functional dashboards and exports into
brand-compliant, professional-grade deliverables.

**Primary Goals:**
1. PDF generation for LP reports (tear sheets, quarterly reports)
2. Print-optimized styling for dashboards
3. Brand-consistent chart theming (Press On Ventures palette)
4. Professional export headers/footers
5. Report template system

**Core Principle:** Existing components are functional. Phase 3 adds a brand polish
layer without breaking core calculation logic. All changes are UI/presentation only.

**Estimated Duration:**
- **Phase 3A (Foundation):** 8-12 hours - PDF infrastructure, print CSS
- **Phase 3B (Orchestration):** 16-24 hours - Report templates, chart theming
- **Phase 3C (Validation):** 8-12 hours - Brand compliance audit, LP testing

**Total:** 32-48 hours (4-6 days)

---

## Phase 3 Architecture

### Phased Approach

```
Phase 3A: Foundation (8-12 hours)
    |
    +-- PDF Generation Infrastructure
    +-- Print Stylesheet for Dashboards
    +-- Brand Token System
    |
    v
Phase 3B: Orchestration (16-24 hours)
    |
    +-- Report Template System
    +-- Chart Theme Provider
    +-- Export Header/Footer Components
    |
    v
Phase 3C: Validation (8-12 hours)
    |
    +-- Brand Compliance Audit
    +-- LP User Testing
    +-- Accessibility Verification
    |
    v
PHASE 3 COMPLETE
```

### Gate Criteria

| Phase | Gate Requirement | Evidence |
|-------|------------------|----------|
| 3A | PDF renders correctly | Sample tear sheet PDF exported |
| 3A | Print CSS works | Dashboard prints without layout breaks |
| 3B | Templates functional | 3 report types using template system |
| 3B | Charts themed | All charts use POV color palette |
| 3C | Brand audit passes | phoenix-brand-reporting-stylist approval |
| 3C | Accessibility | WCAG 2.1 AA compliance verified |

---

## Current State Assessment

### Existing Brand Assets (Ready to Use)

| Component | Location | Status |
|-----------|----------|--------|
| Theme System | `client/src/lib/press-on-theme.ts` | COMPLETE |
| Logo Components | `client/src/components/ui/POVLogo.tsx` | COMPLETE |
| Premium Cards | `client/src/components/ui/PremiumCard.tsx` | COMPLETE |
| Brand Showcase | `client/src/components/ui/BrandShowcase.tsx` | COMPLETE |
| Branding Config | `client/src/config/branding.ts` | COMPLETE |

### Press On Ventures Brand Specification

**Color Palette:**
- Dark: `#292929` (R41 G41 B41) - Primary text, headers
- Beige: `#E0D8D1` (R224 G216 B209) - Accent, backgrounds
- White: `#FFFFFF` - Clean backgrounds
- Light: `#F2F2F2` (R242 G242 B242) - Subtle backgrounds

**Typography:**
- Headings (h1-h4): Inter Bold/Semibold
- Subheadings: Poppins Medium
- Body: Poppins Regular
- Muted: Poppins with 70%/60% opacity

**Logo Usage:**
- Safe zone: minimum 1 logo-height padding around full logo
- Icon-only: minimum 1/2 icon size padding
- Never stretch, rotate, or recolor outside defined palette

### Gaps to Address

| Gap | Category | Priority | Phase |
|-----|----------|----------|-------|
| No PDF generation | Export | P0 | 3A |
| No print styling | CSS | P0 | 3A |
| LP reports not brand-compliant | UI | P1 | 3B |
| Charts use default colors | UI | P1 | 3B |
| No export headers/footers | Export | P1 | 3B |
| Typography inconsistencies | UI | P2 | 3C |
| Missing brand-bridge.md | Docs | P2 | 3A |

---

## Phase 3A: Foundation (8-12 hours)

### 3A.1: PDF Generation Infrastructure (4-6 hours)

**Objective:** Enable PDF export for LP-facing reports.

**Recommended Library:** `@react-pdf/renderer`
- React-native PDF generation (no DOM manipulation)
- Built-in theming support
- TypeScript-friendly
- ~400KB gzipped (acceptable for admin tools)

**Alternative:** `jspdf` + `html2canvas`
- Simpler for HTML→PDF conversion
- Better for complex existing layouts
- Larger bundle impact (~600KB)

**Implementation Plan:**

```
client/src/utils/pdf/
├── PdfDocument.tsx        # Base PDF document wrapper
├── PdfHeader.tsx          # POV branded header
├── PdfFooter.tsx          # Copyright, page numbers
├── PdfTheme.ts            # PDF-compatible theme tokens
└── index.ts               # Public exports
```

**Components to Create:**

1. **PdfDocument** - Base wrapper with POV branding
   - Header with logo
   - Footer with copyright and page numbers
   - Consistent margins and typography

2. **PdfTearSheet** - Single investment one-pager
   - Company header
   - Key metrics table
   - Investment timeline
   - Commentary section

3. **PdfQuarterlyReport** - Portfolio summary
   - Executive summary
   - Portfolio performance table
   - Cash flow visualization
   - Manager commentary

**Success Criteria:**
- [ ] PDF exports render POV logo correctly
- [ ] Typography matches brand spec (Inter/Poppins)
- [ ] Colors use brand palette
- [ ] Page breaks occur at logical boundaries

### 3A.2: Print Stylesheet (2-3 hours)

**Objective:** Dashboards print cleanly for physical/PDF distribution.

**File:** `client/src/styles/print.css`

**Key Rules:**
```css
@media print {
  /* Hide non-essential UI */
  .no-print, nav, aside, .sidebar { display: none !important; }

  /* Force brand colors (browsers often strip colors) */
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }

  /* Prevent awkward page breaks */
  .card, .chart-container { break-inside: avoid; }

  /* Optimize font sizes for print */
  body { font-size: 12pt; line-height: 1.4; }
  h1 { font-size: 24pt; }
  h2 { font-size: 18pt; }

  /* Add page margins */
  @page { margin: 1in; }
  @page :first { margin-top: 0.5in; }
}
```

**Success Criteria:**
- [ ] Dashboard prints on letter/A4 without overflow
- [ ] Charts visible with colors intact
- [ ] Navigation/UI chrome hidden
- [ ] Tables span pages cleanly

### 3A.3: Brand Token System (2-3 hours)

**Objective:** Centralized design tokens for consistent theming.

**File:** `client/src/lib/brand-tokens.ts`

```typescript
export const brandTokens = {
  colors: {
    primary: '#292929',
    accent: '#E0D8D1',
    background: '#FFFFFF',
    backgroundSubtle: '#F2F2F2',
  },
  typography: {
    fontHeading: '"Inter", sans-serif',
    fontBody: '"Poppins", sans-serif',
    weights: { regular: 400, medium: 500, semibold: 600, bold: 700 },
  },
  spacing: {
    logoSafeZone: '1em',      // 1 logo-height
    iconSafeZone: '0.5em',    // 1/2 icon size
  },
  chart: {
    colors: ['#292929', '#E0D8D1', '#666666', '#999999', '#CCCCCC'],
    gridColor: '#F2F2F2',
    axisColor: '#292929',
  },
} as const;

export type BrandTokens = typeof brandTokens;
```

**Success Criteria:**
- [ ] All brand values in single source of truth
- [ ] TypeScript autocomplete for all tokens
- [ ] Used by PDF, print, and chart components

---

## Phase 3B: Orchestration (16-24 hours)

### 3B.1: Report Template System (8-10 hours)

**Objective:** Reusable templates for LP reports.

**Templates to Create:**

| Template | Use Case | Sections |
|----------|----------|----------|
| TearSheet | Single investment | Header, metrics, timeline, notes |
| QuarterlyReport | Portfolio summary | Summary, performance, cash flow, outlook |
| K1Summary | Tax document | Header, allocation, distributions |
| CustomReport | User-defined | Configurable sections |

**Component Architecture:**

```
client/src/components/reports/templates/
├── BaseTemplate.tsx        # Shared layout wrapper
├── TearSheetTemplate.tsx   # Investment one-pager
├── QuarterlyTemplate.tsx   # Portfolio summary
├── K1Template.tsx          # Tax summary
├── SectionRegistry.tsx     # Available section types
└── TemplateConfig.ts       # Template definitions
```

**Section Types:**
- `header` - Company/fund name with logo
- `metrics-table` - Key performance metrics
- `timeline` - Investment milestones
- `cash-flow-chart` - Distributions over time
- `commentary` - Manager notes
- `footer` - Disclaimers, page numbers

### 3B.2: Chart Theme Provider (4-6 hours)

**Objective:** All charts use POV brand colors.

**Current State:** Charts use Recharts/Nivo defaults.

**Solution:** Create brand-aware chart wrapper.

```typescript
// client/src/components/charts/BrandChartTheme.tsx
import { brandTokens } from '@/lib/brand-tokens';

export const povChartTheme = {
  // Recharts
  recharts: {
    colors: brandTokens.chart.colors,
    grid: { stroke: brandTokens.chart.gridColor },
    axis: { stroke: brandTokens.chart.axisColor },
  },
  // Nivo
  nivo: {
    colors: brandTokens.chart.colors,
    grid: { line: { stroke: brandTokens.chart.gridColor } },
    axis: { ticks: { text: { fill: brandTokens.colors.primary } } },
  },
};
```

**Charts to Update:**
- `CashflowDashboard.tsx` - Cash flow waterfall
- `MonteCarloDashboard.tsx` - Distribution fan charts
- `PortfolioChart.tsx` - Portfolio allocation pie
- `PerformanceChart.tsx` - IRR/MOIC over time

### 3B.3: Export Header/Footer Components (4-6 hours)

**Objective:** Branded headers/footers on all exports.

**Components:**

1. **ExportHeader**
   - POV logo (appropriate size variant)
   - Report title
   - Generation date
   - Fund/company context

2. **ExportFooter**
   - Copyright notice: "2025 Press On Ventures. Confidential."
   - Page numbers: "Page X of Y"
   - Disclaimer text (configurable)

3. **ExportWrapper**
   - Combines header + content + footer
   - Handles pagination
   - Manages print-specific styling

---

## Phase 3C: Validation (8-12 hours)

### 3C.1: Brand Compliance Audit (4-6 hours)

**Agent:** `phoenix-brand-reporting-stylist`

**Audit Checklist:**

| Item | Requirement | Verification |
|------|-------------|--------------|
| Logo placement | Safe zone respected | Visual inspection |
| Typography | Inter headings, Poppins body | Font-family audit |
| Colors | Only brand palette used | Color extraction tool |
| Tone | Professional, evidence-based | Content review |
| Accessibility | WCAG 2.1 AA | Lighthouse/axe audit |

**Process:**
1. Generate sample of each report type
2. Run phoenix-brand-reporting-stylist audit
3. Fix identified issues
4. Re-audit until passing

### 3C.2: LP User Testing (2-3 hours)

**Scenarios:**
1. Export tear sheet for single investment
2. Export quarterly portfolio report
3. Print dashboard to PDF via browser
4. View reports on mobile device

**Acceptance Criteria:**
- [ ] Reports render correctly in PDF viewers
- [ ] Print output matches screen preview
- [ ] Mobile layout is readable
- [ ] All data accurate (no calculation changes)

### 3C.3: Accessibility Verification (2-3 hours)

**Requirements (WCAG 2.1 AA):**
- Color contrast ratio >= 4.5:1 for text
- Interactive elements have focus indicators
- Screen reader compatible structure
- Alt text for logos and charts

**Tools:**
- Lighthouse accessibility audit
- axe DevTools browser extension
- Manual screen reader testing (VoiceOver/NVDA)

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| PDF library conflicts | Medium | High | Test with existing dependencies first |
| Print CSS browser variance | Medium | Medium | Test Chrome, Firefox, Safari, Edge |
| Large bundle size increase | Low | Medium | Lazy-load PDF dependencies |
| Brand assets not production-ready | Low | Low | BrandShowcase already validates them |
| Chart library theming limitations | Medium | Low | Use wrapper components for flexibility |

---

## Agent/Skill Assignments

| Task | Primary Agent/Skill | Backup |
|------|---------------------|--------|
| PDF implementation | - | react-performance-optimization skill |
| Print CSS | - | - |
| Chart theming | phoenix-brand-reporting-stylist | - |
| Brand audit | phoenix-brand-reporting-stylist | - |
| Accessibility | - | - |
| Documentation | phoenix-docs-scribe | - |

---

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| PDF generation working | Yes | Sample exports render correctly |
| Print styling functional | Yes | Dashboard prints cleanly |
| Chart colors branded | 100% | All charts use POV palette |
| Brand audit passing | 100% | phoenix-brand-reporting-stylist approval |
| Accessibility score | >= 90 | Lighthouse accessibility audit |
| Bundle size increase | < 200KB | npm run build comparison |
| Truth case baseline | Maintained | No regressions from Phase 2 |

---

## Implementation Order

**Day 1-2: Phase 3A Foundation**
1. Install PDF library, create base PDF components
2. Add print stylesheet
3. Create brand tokens file

**Day 3-4: Phase 3B.1 Templates**
4. Build TearSheetTemplate
5. Build QuarterlyTemplate
6. Wire up export buttons

**Day 5: Phase 3B.2-3B.3 Charts & Exports**
7. Create chart theme provider
8. Update existing charts
9. Add export headers/footers

**Day 6: Phase 3C Validation**
10. Run brand audit
11. Fix issues
12. Accessibility verification
13. Final testing

---

## Command Reference

| Command | When to Use |
|---------|-------------|
| `/phoenix-truth` | Verify no calculation regressions |
| `/test-smart` | Run affected tests after changes |
| `/fix-auto` | Auto-fix lint/format issues |
| `/pre-commit-check` | Before each commit |
| `/pr-ready` | Before creating PR |

---

## Related Documentation

- [press-on-theme.ts](../../client/src/lib/press-on-theme.ts) - Theme implementation
- [POVLogo.tsx](../../client/src/components/ui/POVLogo.tsx) - Logo components
- [BrandShowcase.tsx](../../client/src/components/ui/BrandShowcase.tsx) - Visual reference
- [phoenix-brand-reporting skill](../../.claude/skills/phoenix-brand-reporting/SKILL.md)
- [PHASE2-COMPLETE.md](../notebooklm-sources/PHASE2-COMPLETE.md) - Phase 2 summary

---

## Appendix: File Locations

### New Files (Phase 3)

```
client/src/
├── styles/
│   └── print.css                    # [3A.2] Print stylesheet
├── lib/
│   └── brand-tokens.ts              # [3A.3] Design tokens
├── utils/
│   └── pdf/
│       ├── PdfDocument.tsx          # [3A.1] Base PDF wrapper
│       ├── PdfHeader.tsx            # [3A.1] Branded header
│       ├── PdfFooter.tsx            # [3A.1] Page footer
│       ├── PdfTheme.ts              # [3A.1] PDF theme tokens
│       └── index.ts                 # [3A.1] Public exports
├── components/
│   ├── reports/
│   │   └── templates/
│   │       ├── BaseTemplate.tsx     # [3B.1] Shared layout
│   │       ├── TearSheetTemplate.tsx
│   │       ├── QuarterlyTemplate.tsx
│   │       └── K1Template.tsx
│   └── charts/
│       └── BrandChartTheme.tsx      # [3B.2] Chart theming
└── components/
    └── exports/
        ├── ExportHeader.tsx         # [3B.3] Branded header
        ├── ExportFooter.tsx         # [3B.3] Page footer
        └── ExportWrapper.tsx        # [3B.3] Combined wrapper
```

### Existing Files to Modify

```
client/src/
├── index.css                        # Import print.css
├── components/
│   ├── dashboard/
│   │   └── *.tsx                    # Add no-print classes
│   └── reports/
│       ├── reports.tsx              # Add PDF export option
│       └── tear-sheet-dashboard.tsx # Use new templates
```

---

**Document Status:** DRAFT
**Next Action:** Implement Phase 3A (Foundation)
**Author:** Claude Code
**Last Updated:** 2025-12-29
