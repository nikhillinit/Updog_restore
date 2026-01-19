---
status: ACTIVE
last_updated: 2026-01-19
---

# Phoenix Execution Plan v3.0 - Phase 3 Addendum

**Date:** December 29, 2025
**Status:** ACTIVE - Ready for Implementation
**Extends:** execution-plan-v2.34.md (Phase 0-2)
**Focus:** Phase 3 - Advanced Reporting & Brand Consistency

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| v2.34 | Dec 14, 2025 | MCP & Tool Routing Integration |
| v3.0 | Dec 29, 2025 | Phase 3 Planning (this addendum) |

---

## Phase 3 Summary

**Goal:** Transform functional dashboards and exports into brand-compliant,
professional-grade LP-facing deliverables.

**Prerequisites (Validated):**
- Phase 1/2 deterministic truth cases: 129/129 passing
- Phase 2 Advanced Forecasting (PR #318): Merged and stable
- Brand infrastructure: press-on-theme.ts, POVLogo, PremiumCard components ready

**Detailed Plan:** See [2025-12-29-phoenix-phase3-planning.md](../plans/2025-12-29-phoenix-phase3-planning.md)

---

## Phase 3 Structure

```
Phase 3A: Foundation (8-12 hours)
├── PDF generation infrastructure
├── Print stylesheet for dashboards
└── Brand token system

Phase 3B: Orchestration (16-24 hours)
├── Report template system
├── Chart theme provider
└── Export header/footer components

Phase 3C: Validation (8-12 hours)
├── Brand compliance audit
├── LP user testing
└── Accessibility verification
```

---

## Phase 3 Deliverables

### Phase 3A (Foundation)

| Deliverable | Location | Status |
|-------------|----------|--------|
| Print stylesheet | `client/src/styles/print.css` | COMPLETE |
| Brand tokens (TS) | `client/src/lib/brand-tokens.ts` | COMPLETE |
| PDF utilities stub | `client/src/utils/pdf/index.ts` | COMPLETE |
| Brand bridge docs | `docs/PHOENIX-SOT/brand-bridge.md` | COMPLETE |

### Phase 3B (Orchestration) - Pending

| Deliverable | Location | Status |
|-------------|----------|--------|
| TearSheetTemplate | `client/src/components/reports/templates/` | PENDING |
| QuarterlyTemplate | `client/src/components/reports/templates/` | PENDING |
| Chart theme provider | `client/src/components/charts/BrandChartTheme.tsx` | PENDING |
| Export header/footer | `client/src/components/exports/` | PENDING |

### Phase 3C (Validation) - Pending

| Deliverable | Status |
|-------------|--------|
| Brand compliance audit | PENDING |
| Accessibility score >= 90 | PENDING |
| LP user testing | PENDING |

---

## Dependencies

### NPM Packages Required

```bash
# PDF Generation (choose one)
npm install @react-pdf/renderer   # React-native PDF
# OR
npm install jspdf html2canvas     # HTML-to-PDF conversion
```

### Font Loading

Ensure Inter and Poppins fonts are available:
- Already configured in `brand-tokens.css`
- PDF generation may require font file registration

---

## Gate Criteria

| Phase | Gate | Evidence Required |
|-------|------|-------------------|
| 3A Complete | Foundation ready | PDF renders, print works |
| 3B Complete | Templates functional | 3 report types working |
| 3C Complete | Brand approved | Stylist agent passes |

---

## Success Metrics

| Metric | Target |
|--------|--------|
| PDF generation | Working |
| Print styling | No layout breaks |
| Chart branding | 100% POV palette |
| Brand audit | 100% passing |
| Accessibility | >= 90 Lighthouse |
| Bundle impact | < 200KB increase |
| Truth case baseline | Maintained |

---

## Agent Assignments

| Task | Agent |
|------|-------|
| Brand audit | phoenix-brand-reporting-stylist |
| Documentation sync | phoenix-docs-scribe |
| Test coverage | pr-test-analyzer |

---

## Related Documentation

- [Phase 3 Detailed Plan](../plans/2025-12-29-phoenix-phase3-planning.md)
- [Brand Bridge](brand-bridge.md)
- [press-on-theme.ts](../../client/src/lib/press-on-theme.ts)
- [brand-tokens.ts](../../client/src/lib/brand-tokens.ts)
- [phoenix-brand-reporting skill](../../.claude/skills/phoenix-brand-reporting/SKILL.md)

---

## Execution Notes

### Phase 3A - Completed in This Session

1. Created `client/src/styles/print.css` - Print stylesheet with:
   - Page setup (letter size, 0.75in margins)
   - Color preservation rules
   - UI element hiding for print
   - Table and chart optimization
   - Brand-specific print classes

2. Created `client/src/lib/brand-tokens.ts` - TypeScript design tokens with:
   - Color palette (dark, beige, white, light)
   - Typography (Inter headings, Poppins body)
   - Spacing system
   - Chart theming tokens
   - PDF export dimensions
   - Utility functions (pxToPt, formatCurrency)

3. Created `client/src/utils/pdf/index.ts` - PDF utilities stub with:
   - Type definitions for PDF documents
   - Theme tokens for @react-pdf/renderer
   - Style presets ready for StyleSheet.create()
   - Formatting utilities
   - Placeholder components

4. Created `docs/PHOENIX-SOT/brand-bridge.md` - Brand documentation with:
   - Color palette specification
   - Typography scale
   - Logo usage guidelines
   - Component patterns
   - Print and PDF guidelines
   - Accessibility requirements

### Next Steps (Phase 3B)

1. Install PDF library: `npm install @react-pdf/renderer`
2. Implement PdfDocument, PdfHeader, PdfFooter components
3. Create TearSheetTemplate and QuarterlyTemplate
4. Add chart theme provider to Recharts/Nivo
5. Wire up export buttons in reports.tsx

---

**Document Status:** ACTIVE
**Last Updated:** 2025-12-29
