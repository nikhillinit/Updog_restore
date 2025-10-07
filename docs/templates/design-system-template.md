# Design System Document Template
**Version:** 1.0
**Type:** UI/UX Design System Documentation
**Purpose:** Comprehensive design system for VC fund modeling platform

---

## Template Metadata
```yaml
template:
  id: design-system-doc-template-v1
  name: UI/UX Design System Document
  version: 1.0
  output:
    format: markdown
    filename: "docs/{{product_name}}-design-system.md"
    title: "{{product_title}} Design System"

workflow:
  mode: interactive
  apply_advanced_elicitation: true
```

---

## Document Change Log

| Date | Version | Description | Author |
| :--- | :------ | :---------- | :----- |
| {{date}} | {{version}} | {{description}} | {{author}} |

---

## 1. Overview & Introduction

### 1.1 Purpose
**Instruction:** Define the purpose of this design system and who will use it

```
This design system provides comprehensive guidelines for designing and building {{product_name}},
ensuring consistency, accessibility, and efficiency across all user interfaces.

**Primary Audiences:**
- Product Designers: {{usage_description}}
- Frontend Developers: {{usage_description}}
- Product Managers: {{usage_description}}
```

### 1.2 Design Philosophy
**Instruction:** Establish 3-5 core design principles that guide all design decisions

1. **{{principle_name}}** - {{description_and_rationale}}
2. **{{principle_name}}** - {{description_and_rationale}}
3. **{{principle_name}}** - {{description_and_rationale}}

**Example for VC Platform:**
1. **Data Clarity** - Financial data must be immediately comprehensible with clear visual hierarchy and minimal cognitive load
2. **Trust & Precision** - Every calculation, metric, and visualization reinforces confidence through accuracy and transparency
3. **Scenario Flexibility** - Interface adapts seamlessly to support rapid "what-if" modeling without losing context

### 1.3 Quick Start Guide
**Instruction:** Provide step-by-step onboarding for new team members

**For Designers:**
1. Access Figma design files: {{figma_link}}
2. Install required fonts: {{font_list}}
3. Review component library: {{component_location}}
4. Read accessibility guidelines: {{accessibility_docs}}

**For Developers:**
1. Install dependencies: `npm install {{package_name}}`
2. Import design tokens: `import { tokens } from '@/styles/tokens'`
3. Access component library: `import { Button } from '@/components'`
4. Run Storybook: `npm run storybook`

---

## 2. Design Tokens

**Instruction:** Define all design variables that ensure consistency across platforms

### 2.1 Color System

#### Primary Colors
```css
--color-primary-50: {{hex_value}}    /* Lightest */
--color-primary-100: {{hex_value}}
--color-primary-500: {{hex_value}}   /* Base */
--color-primary-900: {{hex_value}}   /* Darkest */
```

**Usage Guidelines:**
- Primary actions: `--color-primary-500`
- Hover states: `--color-primary-600`
- Disabled states: `--color-primary-300`

#### Semantic Colors (Financial Platform Specific)
```css
--color-positive: #10b981      /* Gains, positive returns */
--color-negative: #ef4444      /* Losses, negative returns */
--color-neutral: #6b7280       /* Neutral or zero state */
--color-projected: #8b5cf6     /* Forecasted/simulated data */
--color-actual: #3b82f6        /* Actual/historical data */
```

**Accessibility:** All color combinations must meet WCAG 2.1 AA standards (4.5:1 contrast ratio)

### 2.2 Typography

#### Font Families
```css
--font-primary: {{font_stack}}     /* UI text, labels */
--font-secondary: {{font_stack}}   /* Body content */
--font-mono: {{font_stack}}        /* Data, numbers, code */
```

**VC Platform Recommendation:** Use tabular/monospace fonts for financial figures to maintain alignment

#### Type Scale
```css
--text-xs: 0.75rem      /* 12px - Helper text */
--text-sm: 0.875rem     /* 14px - Secondary text */
--text-base: 1rem       /* 16px - Body text */
--text-lg: 1.125rem     /* 18px - Emphasized text */
--text-xl: 1.25rem      /* 20px - Headings */
--text-2xl: 1.5rem      /* 24px - Page titles */
--text-3xl: 1.875rem    /* 30px - Hero headings */
```

### 2.3 Spacing & Layout

#### Spacing Scale (8px base)
```css
--spacing-1: 0.25rem    /* 4px */
--spacing-2: 0.5rem     /* 8px */
--spacing-3: 0.75rem    /* 12px */
--spacing-4: 1rem       /* 16px */
--spacing-6: 1.5rem     /* 24px */
--spacing-8: 2rem       /* 32px */
--spacing-12: 3rem      /* 48px */
```

#### Grid System
```yaml
breakpoints:
  mobile: 320px - 639px
  tablet: 640px - 1023px
  desktop: 1024px - 1439px
  wide: 1440px+

columns:
  mobile: 4
  tablet: 8
  desktop: 12
  wide: 12

gutter:
  mobile: 16px
  tablet: 24px
  desktop: 32px
```

### 2.4 Elevation & Shadows

**Instruction:** Define shadow tokens for depth hierarchy

```css
--shadow-sm: {{box_shadow}}      /* Subtle elevation (cards) */
--shadow-md: {{box_shadow}}      /* Standard elevation (dropdowns) */
--shadow-lg: {{box_shadow}}      /* High elevation (modals) */
--shadow-xl: {{box_shadow}}      /* Maximum elevation (dialogs) */
```

### 2.5 Animation & Motion

**Duration:**
```css
--duration-fast: 150ms      /* Micro-interactions */
--duration-base: 250ms      /* Standard transitions */
--duration-slow: 400ms      /* Complex animations */
```

**Easing:**
```css
--ease-in: cubic-bezier(0.4, 0, 1, 1)
--ease-out: cubic-bezier(0, 0, 0.2, 1)
--ease-in-out: cubic-bezier(0.4, 0, 0.2, 1)
```

---

## 3. Component Library

**Instruction:** Document each component with anatomy, variants, states, and usage

### 3.1 Component Template

For each component, follow this structure:

#### {{Component_Name}}

**Description:** {{what_it_does_and_purpose}}

**Anatomy:**
```
┌─────────────────────────────┐
│  [Icon]  Label      [Badge] │  ← Component structure
└─────────────────────────────┘
```

**Props/Attributes:**
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| {{prop}} | {{type}} | {{default}} | {{description}} |

**Variants:**
- **{{variant_name}}** - {{use_case}}
- **{{variant_name}}** - {{use_case}}

**States:**
- Default
- Hover: {{visual_change}}
- Active/Pressed: {{visual_change}}
- Disabled: {{visual_change}}
- Error: {{visual_change}}
- Loading: {{visual_change}}

**Accessibility:**
- ARIA attributes: {{required_aria}}
- Keyboard navigation: {{key_bindings}}
- Screen reader: {{sr_description}}

**Usage Guidelines:**

✅ **When to use:**
- {{use_case_1}}
- {{use_case_2}}

❌ **When NOT to use:**
- {{anti_pattern_1}}
- {{anti_pattern_2}}

**Code Example:**
```tsx
<ComponentName
  variant="{{variant}}"
  size="{{size}}"
  onClick={handleClick}
>
  {{content}}
</ComponentName>
```

**Live Demo:** [Storybook Link]({{storybook_url}})

---

### 3.2 VC Platform Specific Components

#### Fund Metrics Card
**Purpose:** Display key fund performance indicators with visual trend indicators

**Anatomy:**
```
┌─────────────────────────────────┐
│  Metric Label            [Info] │
│  $123.4M                        │
│  ↑ 12.3% vs. Last Quarter       │
│  ━━━━━━━━━━━ (sparkline)        │
└─────────────────────────────────┘
```

**Variants:**
- Compact (dashboard overview)
- Expanded (detailed view with drill-down)
- Comparison (side-by-side scenario metrics)

**Financial-Specific States:**
- Positive performance (green indicators)
- Negative performance (red indicators)
- Projected data (dashed borders, purple accent)

#### Scenario Comparison Table
**Purpose:** Side-by-side comparison of multiple fund scenarios

**Features:**
- Sticky header on scroll
- Diff highlighting for changed values
- Export to CSV/Excel
- Sortable columns
- Responsive collapse to accordion on mobile

#### Reserve Allocation Widget
**Purpose:** Interactive visualization for capital reserve planning

**Interaction Patterns:**
- Drag-to-adjust allocation percentages
- Real-time calculation feedback
- Constraint validation (must sum to 100%)
- Undo/redo support

#### Monte Carlo Simulation Controls
**Purpose:** Configure and run probabilistic scenario modeling

**Components:**
- Parameter sliders with numeric input
- Distribution type selector
- Iteration count selector
- Run/Stop/Reset controls
- Progress indicator

---

## 4. Interaction Patterns

**Instruction:** Define common UI patterns and micro-interactions

### 4.1 Navigation Patterns

#### Primary Navigation
**Pattern:** {{top_nav|side_nav|hybrid}}

**Behavior:**
- Active state indication: {{visual_treatment}}
- Hover preview: {{description}}
- Responsive behavior: {{mobile_pattern}}

#### Breadcrumbs
**Usage:** Multi-level scenario navigation

**Format:** Fund > Scenario > Allocation > Reserve Strategy

### 4.2 Data Visualization Patterns

#### Chart Interactions
**Hover/Tooltip:**
- Show precise values on hover
- Cross-hair for time-series alignment
- Sticky tooltip for complex metrics

**Zoom & Pan:**
- Scroll to zoom on time axis
- Drag to pan historical data
- Double-click to reset view

**Legend Interaction:**
- Click to toggle series visibility
- Hover to highlight series
- Right-click for series actions

#### Table Interactions
**Sorting:**
- Click header to sort ascending
- Click again for descending
- Third click to reset

**Filtering:**
- Column-level filters
- Multi-select for categories
- Range sliders for numbers
- Date range pickers for time

### 4.3 Form Patterns

#### Financial Input Fields
**Number Formatting:**
- Auto-format on blur: `1234567` → `$1,234,567`
- Preserve raw input during editing
- Support abbreviations: `1.5M` → `$1,500,000`

**Validation:**
- Real-time validation for critical fields
- On-blur validation for secondary fields
- Inline error messages below field
- Success confirmation for complex calculations

#### Multi-Step Forms (Fund Setup Wizard)
**Pattern:** Progressive disclosure with clear progress indication

**Steps:**
1. Fund Basics (name, size, vintage)
2. Investment Strategy (sectors, stages)
3. Pacing & Deployment
4. Reserve Strategy
5. Exit Assumptions
6. Review & Create

**Navigation:**
- Next/Previous buttons
- Step indicator (breadcrumb style)
- Save draft at any point
- Jump to completed steps

### 4.4 Feedback & Notifications

#### Toast Notifications
**Types:**
- Success: {{duration}} - {{visual_style}}
- Error: {{duration}} - {{visual_style}}
- Warning: {{duration}} - {{visual_style}}
- Info: {{duration}} - {{visual_style}}

**Positioning:** {{top_right|bottom_center|etc}}

#### Loading States
**Skeleton Screens:** For data-heavy dashboards
**Spinners:** For button actions (< 2 seconds)
**Progress Bars:** For simulations/calculations (> 2 seconds)

#### Empty States
**Components:**
- Illustration or icon
- Headline: "No {{entity}} yet"
- Description: Brief context
- Primary CTA: "Create {{entity}}"
- Secondary action: "Import" or "Learn more"

---

## 5. Data Visualization Standards

**Instruction:** Define chart types, color usage, and accessibility for data viz

### 5.1 Chart Type Selection

| Data Type | Recommended Chart | When to Use |
|-----------|------------------|-------------|
| Time series performance | Line chart | Fund NAV over time, IRR progression |
| Portfolio allocation | Donut/Pie chart | Sector distribution, stage allocation |
| Comparison | Bar chart | Scenario comparison, fund benchmarking |
| Distribution | Histogram | Monte Carlo outcomes, valuation ranges |
| Relationship | Scatter plot | Risk vs. return, vintage vs. performance |
| Hierarchical | Treemap | Portfolio breakdown, reserve allocation |

### 5.2 Chart Styling

**Color Palette for Data:**
```css
/* Sequential (single metric progression) */
--data-seq-1: #eff6ff
--data-seq-5: #3b82f6
--data-seq-9: #1e3a8a

/* Diverging (positive/negative) */
--data-positive: #10b981
--data-neutral: #6b7280
--data-negative: #ef4444

/* Categorical (up to 8 series) */
--data-cat-1: #3b82f6
--data-cat-2: #8b5cf6
--data-cat-3: #ec4899
--data-cat-4: #f59e0b
```

**Chart Elements:**
- Grid lines: `#e5e7eb`, 1px, 50% opacity
- Axes: `#374151`, 1.5px
- Data points: 6px radius, 2px stroke
- Tooltips: `--shadow-lg`, `--color-background`

### 5.3 Accessibility for Charts

**Requirements:**
- Provide data table alternative (expandable below chart)
- Use patterns + colors for series differentiation
- Ensure 3:1 contrast for data elements
- Keyboard navigation for interactive charts
- Screen reader descriptions via `aria-label`

**Example:**
```html
<figure role="img" aria-label="Fund NAV progression from 2020 to 2025, showing growth from $100M to $345M">
  <LineChart {...props} />
  <details>
    <summary>View data table</summary>
    <table><!-- Accessible data --></table>
  </details>
</figure>
```

---

## 6. Responsive Design Framework

**Instruction:** Define breakpoints and component behavior across devices

### 6.1 Breakpoint Strategy

```yaml
mobile-portrait: 320px - 479px
mobile-landscape: 480px - 639px
tablet-portrait: 640px - 767px
tablet-landscape: 768px - 1023px
desktop: 1024px - 1439px
desktop-wide: 1440px+
```

### 6.2 Responsive Patterns

#### Dashboard Layouts
- **Mobile:** Single column, stacked cards
- **Tablet:** 2-column grid with key metrics pinned
- **Desktop:** 3-column with sidebar navigation

#### Data Tables
- **Mobile:** Accordion/card view
- **Tablet:** Horizontal scroll with frozen first column
- **Desktop:** Full table with all columns visible

#### Charts
- **Mobile:** Simplified chart, limited data points, tap to expand
- **Tablet:** Standard chart with touch interactions
- **Desktop:** Full interactivity, hover states, tooltips

### 6.3 Touch vs. Mouse Interactions

**Touch Targets (Mobile/Tablet):**
- Minimum size: 44x44px
- Spacing between targets: 8px
- Swipe gestures for navigation
- Long-press for contextual actions

**Mouse Interactions (Desktop):**
- Hover states for all interactive elements
- Right-click context menus
- Drag-and-drop for reordering
- Keyboard shortcuts with visual hints

---

## 7. Accessibility Guidelines

**Instruction:** Ensure WCAG 2.1 AA compliance (minimum)

### 7.1 Color & Contrast

**Requirements:**
- Text contrast: 4.5:1 (normal), 3:1 (large text)
- Interactive elements: 3:1 against background
- Non-text content: 3:1 (icons, charts)

**Tools for Validation:**
- Chrome DevTools Lighthouse
- Figma plugin: Stark
- axe DevTools browser extension

### 7.2 Keyboard Navigation

**Standard Controls:**
- `Tab`: Navigate forward
- `Shift+Tab`: Navigate backward
- `Enter`/`Space`: Activate buttons/links
- `Esc`: Close modals/dropdowns
- `Arrow keys`: Navigate within components

**Custom Controls (Financial Platform):**
- `Ctrl+S`: Save scenario
- `Ctrl+C`: Copy scenario
- `Ctrl+E`: Export data
- `Ctrl+/`: Show keyboard shortcuts

### 7.3 Screen Reader Support

**Required ARIA Patterns:**
- Landmarks: `<nav>`, `<main>`, `<aside>`
- Live regions: `aria-live="polite"` for dynamic updates
- Form labels: Explicit `<label for="id">` associations
- Error messages: `aria-describedby` for field errors

**Financial Context Examples:**
```html
<div role="region" aria-label="Fund Performance Metrics">
  <div aria-live="polite" aria-atomic="true">
    <p>NAV increased to $345M, up 12% from last quarter</p>
  </div>
</div>
```

### 7.4 Focus Management

**Visible Focus Indicators:**
```css
:focus-visible {
  outline: 2px solid var(--color-primary-500);
  outline-offset: 2px;
  border-radius: 4px;
}
```

**Focus Trapping:**
- Modal dialogs trap focus within
- First focusable element receives focus on open
- Focus returns to trigger element on close

---

## 8. Content & UX Writing Guidelines

**Instruction:** Establish voice, tone, and microcopy standards

### 8.1 Voice & Tone

**Brand Voice:** {{professional|friendly|authoritative|etc}}

**Tone by Context:**
- **Success messages:** Encouraging, clear ("Scenario saved successfully")
- **Error messages:** Helpful, solution-oriented ("Invalid allocation: Must sum to 100%")
- **Empty states:** Supportive, action-oriented ("Create your first scenario to begin modeling")
- **Loading states:** Reassuring, specific ("Calculating 10,000 Monte Carlo iterations...")

### 8.2 Microcopy Standards

#### Button Labels
✅ Use: "Create Scenario", "Run Simulation", "Export to Excel"
❌ Avoid: "Submit", "OK", "Click Here"

**Pattern:** `[Verb] + [Object]`

#### Error Messages
**Format:** `[What went wrong] + [How to fix it]`

✅ "Fund size must be at least $1M. Please enter a larger amount."
❌ "Invalid input"

#### Helper Text
**Purpose:** Provide context without overwhelming

✅ "Reserve ratio is typically 30-50% of fund size"
❌ Long paragraphs of explanation

### 8.3 Number & Currency Formatting

**Standards:**
- Currency: `$1,234,567.89` (USD default)
- Percentages: `12.34%` (2 decimal places)
- Large numbers: `$1.23M`, `$456.7K`, `$2.34B`
- IRR/Multiples: `2.5x MOIC`, `23.4% IRR`

**Localization:** Support for `{{currency_code}}` and `{{locale}}`

---

## 9. Performance & Technical Standards

**Instruction:** Define performance budgets and technical requirements

### 9.1 Performance Budgets

**Load Time Targets:**
- Initial page load: < 2 seconds
- Component render: < 100ms
- Chart updates: < 200ms
- Simulation results: < 5 seconds (with progress indicator)

**Bundle Size:**
- Initial JS bundle: < 200KB (gzipped)
- CSS bundle: < 50KB (gzipped)
- Images: WebP format, < 100KB each
- Fonts: WOFF2 format, subset to used glyphs

### 9.2 Browser Support

**Tier 1 (Full support):**
- Chrome/Edge: Last 2 versions
- Firefox: Last 2 versions
- Safari: Last 2 versions

**Tier 2 (Graceful degradation):**
- Chrome/Edge: Last 5 versions
- Firefox: Last 5 versions
- Safari: Last 3 versions

**Mobile:**
- iOS Safari: 13+
- Chrome Android: Last 2 versions

### 9.3 Code Standards

**Component Structure:**
```tsx
// Import order: external → internal → types → styles
import React from 'react';
import { formatCurrency } from '@/lib/formatting';
import type { FundMetrics } from '@/types';
import styles from './MetricsCard.module.css';

export interface MetricsCardProps {
  metrics: FundMetrics;
  variant?: 'compact' | 'expanded';
}

export const MetricsCard: React.FC<MetricsCardProps> = ({
  metrics,
  variant = 'compact'
}) => {
  // Component implementation
};
```

**CSS Architecture:**
- Use CSS Modules or Tailwind CSS
- BEM naming for global styles
- Design tokens via CSS custom properties
- No `!important` (except overriding third-party)

---

## 10. Asset & Resource Management

**Instruction:** Define asset specifications and organization

### 10.1 Icon System

**Format:** SVG (optimized with SVGO)
**Size:** 16px, 20px, 24px, 32px
**Stroke:** 2px (standard), 1.5px (light)
**Style:** {{outlined|filled|duotone}}

**Naming Convention:** `icon-[name]-[size].svg`
Example: `icon-chart-line-24.svg`

### 10.2 Image Guidelines

**Formats:**
- Photos: WebP (with JPG fallback)
- Illustrations: SVG or WebP
- Icons: SVG only

**Sizing:**
- Hero images: 1920x1080px (16:9)
- Card thumbnails: 400x300px (4:3)
- Avatar: 128x128px (1:1)

**Optimization:**
- Compress with ImageOptim/TinyPNG
- Lazy load below-the-fold images
- Use `srcset` for responsive images

### 10.3 Font Loading

**Strategy:** FOUT (Flash of Unstyled Text) prevention

```css
@font-face {
  font-family: 'Primary';
  src: url('/fonts/primary.woff2') format('woff2');
  font-display: swap; /* Show fallback, swap when loaded */
}
```

**Fallback Stack:**
```css
font-family: 'Primary', -apple-system, BlinkMacSystemFont, 'Segoe UI',
  Roboto, 'Helvetica Neue', Arial, sans-serif;
```

---

## 11. Version Control & Changelog

**Instruction:** Track design system updates and communicate changes

### 11.1 Semantic Versioning

**Format:** `MAJOR.MINOR.PATCH`

- **MAJOR:** Breaking changes (component API changes)
- **MINOR:** New features (new components, variants)
- **PATCH:** Bug fixes, small improvements

### 11.2 Changelog Template

```markdown
## [1.2.0] - 2025-10-15

### Added
- New component: Monte Carlo Simulation Controls
- Chart tooltip: Comparison mode for scenarios

### Changed
- Button: Updated hover states for better accessibility
- Typography: Increased line-height for readability

### Deprecated
- Old scenario comparison table (use new version)

### Fixed
- Chart: Legend overflow on mobile
- Form: Validation timing for currency inputs
```

### 11.3 Communication Strategy

**Notifications:**
- Major releases: Email + Slack announcement
- Minor releases: Slack #design-system channel
- Patches: Automated Slack bot update

**Migration Guides:**
- Provide for all breaking changes
- Include code examples (before/after)
- Offer automatic codemod tools when possible

---

## 12. Contribution & Governance

**Instruction:** Define how the design system evolves

### 12.1 Proposal Process

**For New Components:**
1. **Identify Need:** Document use case and frequency
2. **Research:** Check existing patterns and external systems
3. **Propose:** Submit RFC (Request for Comments) to design system team
4. **Review:** Team reviews within {{timeframe}}
5. **Build:** Create in Figma + code implementation
6. **Document:** Add to design system docs
7. **Announce:** Communicate to all teams

### 12.2 Design System Team

**Roles:**
- **Design Lead:** {{name}} - Final design decisions
- **Engineering Lead:** {{name}} - Technical architecture
- **Accessibility Lead:** {{name}} - WCAG compliance
- **Contributors:** {{names}} - Component development

**Meeting Cadence:**
- Weekly sync: Review proposals and issues
- Monthly review: Audit and deprecation planning
- Quarterly: Roadmap and strategy

### 12.3 Support & Resources

**Getting Help:**
- Slack: `#design-system-help`
- Office hours: {{day}} {{time}}
- Documentation: {{docs_url}}
- Storybook: {{storybook_url}}

**Feedback Channels:**
- Bug reports: GitHub Issues
- Feature requests: Design system backlog
- General feedback: Anonymous form

---

## 13. Success Metrics

**Instruction:** Define how to measure design system adoption and impact

### 13.1 Adoption Metrics
- **Component usage:** {{percentage}}% of UI built with design system
- **Design consistency:** {{score}}/10 across products
- **Design to dev handoff:** {{time}} average turnaround

### 13.2 Efficiency Metrics
- **Time to design:** {{hours}} saved per feature
- **Time to develop:** {{hours}} saved per feature
- **Bug reduction:** {{percentage}}% decrease in UI bugs

### 13.3 Quality Metrics
- **Accessibility:** 100% WCAG AA compliance
- **Performance:** {{percentage}}% of components meet budget
- **User satisfaction:** {{score}}/10 from team surveys

---

## 14. Appendices

### 14.1 Design Tools Setup
- Figma workspace: {{link}}
- Design tokens plugin: {{plugin_name}}
- Version control: Abstract / Figma branches

### 14.2 Code Resources
- Component library: `npm install {{package}}`
- Storybook: {{url}}
- GitHub repo: {{repo_url}}

### 14.3 External References
- Material Design: {{link}}
- Shopify Polaris: {{link}}
- Atlassian Design System: {{link}}
- Carbon Design System: {{link}}

### 14.4 Glossary
| Term | Definition |
|------|------------|
| Design Token | Atomic design decisions stored as data (colors, spacing) |
| Component | Reusable UI element with defined behavior |
| Pattern | Common solution to recurring design problem |
| Variant | Different version of a component (size, style) |

---

**Document maintained by:** {{team_name}}
**Last updated:** {{date}}
**Next review:** {{next_review_date}}
