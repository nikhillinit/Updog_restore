---
status: ACTIVE
last_updated: 2026-01-19
---

# Brand Bridge - Press On Ventures Visual Identity

**Status:** ACTIVE
**Last Updated:** 2025-12-29
**Owner:** Phoenix Phase 3 Team
**Audience:** Developers implementing LP-facing UI

---

## Purpose

This document bridges the gap between Press On Ventures brand guidelines and
implementation details. It serves as the authoritative reference for all brand-related
development decisions in Phoenix Phase 3.

---

## Brand Assets Location

| Asset | Location | Status |
|-------|----------|--------|
| Theme System | `client/src/lib/press-on-theme.ts` | COMPLETE |
| Logo Components | `client/src/components/ui/POVLogo.tsx` | COMPLETE |
| Premium Cards | `client/src/components/ui/PremiumCard.tsx` | COMPLETE |
| Brand Showcase | `client/src/components/ui/BrandShowcase.tsx` | COMPLETE |
| Branding Config | `client/src/config/branding.ts` | COMPLETE |
| Brand Tokens | `client/src/lib/brand-tokens.ts` | PENDING (Phase 3A) |

---

## Color Palette

### Primary Colors

| Name | Hex | RGB | Usage |
|------|-----|-----|-------|
| Dark | `#292929` | R41 G41 B41 | Primary text, headers, logo |
| Beige | `#E0D8D1` | R224 G216 B209 | Accent backgrounds, highlights |
| White | `#FFFFFF` | R255 G255 B255 | Clean backgrounds |
| Light | `#F2F2F2` | R242 G242 B242 | Subtle backgrounds, borders |

### Chart Colors (Sequential)

```typescript
const chartColors = [
  '#292929', // Primary - most important data
  '#E0D8D1', // Accent - secondary data
  '#666666', // Tertiary
  '#999999', // Quaternary
  '#CCCCCC', // Quinary
];
```

### Usage Guidelines

1. **Text on Light Backgrounds:** Use `#292929` (Dark)
2. **Text on Dark Backgrounds:** Use `#FFFFFF` (White)
3. **Accent/Highlight:** Use `#E0D8D1` (Beige) sparingly
4. **Disabled State:** Use `#999999` with 60% opacity
5. **Borders:** Use `#F2F2F2` (Light) for subtle separation

---

## Typography

### Font Stack

```css
/* Headings */
font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;

/* Body */
font-family: 'Poppins', 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
```

### Type Scale

| Element | Font | Weight | Size | Line Height |
|---------|------|--------|------|-------------|
| H1 | Inter | Bold (700) | 32px / 2rem | 1.2 |
| H2 | Inter | Bold (700) | 24px / 1.5rem | 1.25 |
| H3 | Inter | Semibold (600) | 20px / 1.25rem | 1.3 |
| H4 | Inter | Semibold (600) | 16px / 1rem | 1.4 |
| Subheading | Poppins | Medium (500) | 14px / 0.875rem | 1.5 |
| Body | Poppins | Regular (400) | 14px / 0.875rem | 1.6 |
| Body Small | Poppins | Regular (400) | 12px / 0.75rem | 1.5 |
| Caption | Poppins | Regular (400) | 11px / 0.6875rem | 1.4 |

### Tailwind Classes (from press-on-theme.ts)

```typescript
const pressOnTypography = {
  h1: 'font-heading text-3xl font-bold text-pov-dark',
  h2: 'font-heading text-2xl font-bold text-pov-dark',
  h3: 'font-heading text-xl font-semibold text-pov-dark',
  h4: 'font-heading text-base font-semibold text-pov-dark',
  subheading: 'font-body text-sm font-medium text-pov-dark',
  body: 'font-body text-sm text-pov-dark',
  bodyMuted: 'font-body text-sm text-pov-dark/70',
  bodySubtle: 'font-body text-sm text-pov-dark/60',
  caption: 'font-body text-xs text-pov-dark/70',
};
```

---

## Logo Usage

### Components Available

```tsx
import { POVLogo, POVIcon, POVBrandHeader } from '@/components/ui/POVLogo';

// Full logo with text
<POVLogo variant="dark" size="lg" />

// Icon only (compact spaces)
<POVIcon variant="dark" size="md" />

// Branded header wrapper
<POVBrandHeader>
  <h1>Report Title</h1>
</POVBrandHeader>
```

### Size Variants

| Size | Logo Dimensions | Icon Dimensions | Use Case |
|------|-----------------|-----------------|----------|
| sm | 120px width | 24px | Inline, footer |
| md | 160px width | 32px | Header, cards |
| lg | 200px width | 40px | Cover pages, exports |
| xl | 240px width | 48px | Print materials |

### Color Variants

| Variant | Logo | Background | Use Case |
|---------|------|------------|----------|
| dark | `#292929` | Light backgrounds | Default |
| light | `#E0D8D1` | Medium backgrounds | Subtle |
| white | `#FFFFFF` | Dark backgrounds | Inverted |

### Safe Zone Requirements

```
+-------------------+
|                   |
|   [SAFE ZONE]     |  <- Minimum 1 logo-height padding
|   +----------+    |
|   |  LOGO    |    |
|   +----------+    |
|   [SAFE ZONE]     |
|                   |
+-------------------+

For icon-only: Minimum 1/2 icon size padding
```

### Logo Don'ts

- Never stretch or distort proportions
- Never rotate the logo
- Never use colors outside the defined palette
- Never place on busy backgrounds without sufficient contrast
- Never add effects (shadows, gradients, outlines)

---

## Component Patterns

### Cards

```tsx
import { PremiumCard } from '@/components/ui/PremiumCard';

// Default card
<PremiumCard title="Metrics" subtitle="Q4 2024">
  {content}
</PremiumCard>

// Highlighted card (accent background)
<PremiumCard variant="highlight" title="Key Finding">
  {content}
</PremiumCard>

// Outlined card (border only)
<PremiumCard variant="outlined" title="Supporting Data">
  {content}
</PremiumCard>
```

### Tables

```css
/* Brand-compliant table styling */
.pov-table {
  border-collapse: collapse;
  width: 100%;
}

.pov-table th {
  background-color: #F2F2F2;
  color: #292929;
  font-family: 'Inter', sans-serif;
  font-weight: 600;
  text-align: left;
  padding: 12px 16px;
}

.pov-table td {
  border-bottom: 1px solid #F2F2F2;
  color: #292929;
  font-family: 'Poppins', sans-serif;
  padding: 12px 16px;
}

.pov-table tr:hover {
  background-color: rgba(224, 216, 209, 0.2);
}
```

### Buttons

```tsx
// Primary action
<Button className="bg-pov-dark text-white hover:bg-pov-dark/90">
  Export Report
</Button>

// Secondary action
<Button variant="outline" className="border-pov-dark text-pov-dark">
  Cancel
</Button>

// Accent action
<Button className="bg-pov-beige text-pov-dark hover:bg-pov-beige/90">
  View Details
</Button>
```

---

## Print Guidelines

### Page Setup

```css
@media print {
  @page {
    size: letter;
    margin: 1in;
  }

  @page :first {
    margin-top: 0.5in;
  }
}
```

### Color Handling

Browsers strip colors by default when printing. Force brand colors:

```css
@media print {
  * {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
}
```

### Page Break Control

```css
.page-break-before { break-before: page; }
.page-break-after { break-after: page; }
.no-break { break-inside: avoid; }
```

---

## PDF Export Guidelines

### Header Structure

```
+-----------------------------------------------+
|  [LOGO]                     [DATE: Dec 2024]  |
|  Press On Ventures                            |
+-----------------------------------------------+
|                                               |
|  REPORT TITLE                                 |
|  Subtitle / Fund Name                         |
|                                               |
+-----------------------------------------------+
```

### Footer Structure

```
+-----------------------------------------------+
|  Confidential | Page X of Y | 2024 POV        |
+-----------------------------------------------+
```

### Margins and Spacing

| Element | Value |
|---------|-------|
| Page margin | 0.75in (54pt) |
| Header height | 60pt |
| Footer height | 30pt |
| Content spacing | 12pt between sections |
| Table cell padding | 6pt vertical, 8pt horizontal |

---

## Accessibility Requirements

### Color Contrast

All text must meet WCAG 2.1 AA requirements:

| Combination | Contrast Ratio | Status |
|-------------|----------------|--------|
| Dark (#292929) on White (#FFFFFF) | 14.7:1 | PASS |
| Dark (#292929) on Light (#F2F2F2) | 12.1:1 | PASS |
| Dark (#292929) on Beige (#E0D8D1) | 7.2:1 | PASS |
| White (#FFFFFF) on Dark (#292929) | 14.7:1 | PASS |

### Focus Indicators

```css
:focus-visible {
  outline: 2px solid #292929;
  outline-offset: 2px;
}
```

### Screen Reader Considerations

- All logos must have `alt="Press On Ventures"` or `aria-label`
- Charts must have `aria-describedby` pointing to data table
- Interactive elements must have descriptive labels

---

## Brand Voice (LP Communications)

### Tone

- **Professional:** Avoid casual language
- **Evidence-based:** Support claims with data
- **Clear:** Avoid jargon without explanation
- **Confident:** Use active voice

### Examples

```
[GOOD] "The fund returned 2.3x MOIC over the 5-year investment period."
[BAD] "We crushed it with a 2.3x return!"

[GOOD] "Distribution proceeds totaled $4.2M in Q4."
[BAD] "We sent out a bunch of money last quarter."

[GOOD] "Portfolio company XYZ achieved Series B at $50M valuation."
[BAD] "XYZ is killing it and just raised again!"
```

---

## Implementation Checklist

### Phase 3A Tasks

- [ ] Create `client/src/lib/brand-tokens.ts`
- [ ] Create `client/src/styles/print.css`
- [ ] Install PDF generation library
- [ ] Create PDF base components

### Phase 3B Tasks

- [ ] Create report templates using brand components
- [ ] Create chart theme provider
- [ ] Update all charts to use brand colors
- [ ] Create export header/footer components

### Phase 3C Tasks

- [ ] Run brand compliance audit
- [ ] Verify accessibility scores
- [ ] Test print output in multiple browsers
- [ ] LP user acceptance testing

---

## Related Documentation

- [press-on-theme.ts](../../client/src/lib/press-on-theme.ts) - Theme implementation
- [POVLogo.tsx](../../client/src/components/ui/POVLogo.tsx) - Logo components
- [BrandShowcase.tsx](../../client/src/components/ui/BrandShowcase.tsx) - Visual reference
- [Phase 3 Planning](../plans/2025-12-29-phoenix-phase3-planning.md) - Execution plan
- [phoenix-brand-reporting skill](../../.claude/skills/phoenix-brand-reporting/SKILL.md)

---

**Document Status:** ACTIVE
**Review Cadence:** P30D
**Owner:** Phoenix Phase 3 Team
