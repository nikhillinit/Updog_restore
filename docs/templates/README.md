# UI/UX Documentation Templates

Comprehensive templates for creating design systems and feature specifications for UI/UX work.

## Templates Overview

### 1. Design System Document Template
**File:** [design-system-template.md](design-system-template.md)

**Purpose:** Create comprehensive design system documentation that ensures consistency, accessibility, and efficiency across all user interfaces.

**Based on:** UXPin's 9-Step Framework + Industry Best Practices (Material Design, Shopify Polaris, Atlassian)

**Key Sections:**
- Design tokens (colors, typography, spacing, shadows, motion)
- Component library (anatomy, variants, states, accessibility)
- Interaction patterns & micro-interactions
- Data visualization standards
- Responsive design framework
- Accessibility guidelines (WCAG 2.1 AA)
- Content & UX writing standards
- Performance & technical standards
- Version control & governance

**Use When:**
- Starting a new product/platform
- Establishing design standards for a team
- Documenting an existing design system
- Creating a UI component library

---

### 2. Feature Flow Document Template
**File:** [feature-flow-template.md](feature-flow-template.md)

**Purpose:** Create detailed feature specifications with screen-by-screen implementation guidance.

**Based on:** Basecamp Pitch Framework + Figma Community Best Practices

**Key Sections:**
- Problem statement & solution (Basecamp "Pitch" style)
- User personas & context
- User journey maps (entry → core flow → completion)
- Screen-by-screen specifications (all interaction states)
- Interaction patterns & micro-interactions
- Data model & API integration
- Validation & business rules
- Edge cases & error handling
- Usability testing plan
- Performance & technical constraints
- Rabbit holes (scope creep prevention)
- Success metrics & analytics
- Design handoff checklist

**Use When:**
- Designing a new feature or user flow
- Providing detailed specs for development
- Planning feature rollout and testing
- Documenting complex interaction patterns

---

## How to Use These Templates

### Getting Started

1. **Choose the Right Template:**
   - **Design System:** Use for overarching UI/UX standards and component libraries
   - **Feature Flow:** Use for specific features or user workflows

2. **Copy the Template:**
   ```bash
   # For Design System
   cp docs/templates/design-system-template.md docs/[product-name]-design-system.md

   # For Feature Flow
   cp docs/templates/feature-flow-template.md docs/features/[feature-name]-flow.md
   ```

3. **Fill in Template Variables:**
   - Replace all `{{variable}}` placeholders with actual values
   - Follow the inline instructions for each section
   - Use the examples as guidance (especially VC Platform examples)

4. **Apply Advanced Elicitation:**
   - The templates use an interactive workflow mode
   - Present sections incrementally
   - Gather feedback before proceeding
   - Iterate based on stakeholder input

---

## Template Structure

Both templates follow a consistent structure:

### Metadata Block
```yaml
template:
  id: unique-template-id
  name: Human Readable Name
  version: 1.0
  output:
    format: markdown
    filename: "docs/{{name}}.md"

workflow:
  mode: interactive
  apply_advanced_elicitation: true
```

### Document Change Log
Track all versions and changes with timestamps and authors.

### Sections with Instructions
Each section includes:
- **Instruction:** What to document and how
- **Template:** Placeholder structure with `{{variables}}`
- **Examples:** Real-world examples (often from VC platform context)
- **Best Practices:** Industry standards and recommendations

---

## VC Platform Customizations

These templates include specific customizations for venture capital fund modeling platforms:

### Design System Customizations
- **Financial Data Visualization:** Chart types, color semantics (positive/negative), accessibility
- **VC-Specific Components:** Fund metrics cards, scenario comparison tables, reserve allocation widgets, Monte Carlo controls
- **Data Formatting Standards:** Currency (whole dollars), percentages, IRR/MOIC display
- **Performance Budgets:** Optimized for large dataset rendering (200+ portfolio companies)

### Feature Flow Customizations
- **Scenario Modeling Flows:** Multi-step wizards for fund setup, allocation, exits
- **Financial Calculation Patterns:** Validation for monetary inputs, cross-field rules (sum to 100%)
- **Data-Heavy Edge Cases:** Division by zero, API timeouts for calculations, large export files
- **GP/LP User Personas:** Context for time-sensitive decisions, desktop-focused workflows

---

## Examples & Use Cases

### Example 1: Creating a Design System for New Platform

```markdown
# Updog Fund Platform Design System

## 1. Overview & Introduction

### 1.1 Purpose
This design system provides comprehensive guidelines for designing and building
Updog Fund Platform, ensuring consistency, accessibility, and efficiency across
all user interfaces.

**Primary Audiences:**
- Product Designers: Use components and patterns for screen designs
- Frontend Developers: Implement using documented specs and code examples
- Product Managers: Understand UI capabilities and constraints

### 1.2 Design Philosophy

1. **Data Clarity** - Financial data must be immediately comprehensible with
   clear visual hierarchy and minimal cognitive load
2. **Trust & Precision** - Every calculation, metric, and visualization
   reinforces confidence through accuracy and transparency
3. **Scenario Flexibility** - Interface adapts seamlessly to support rapid
   "what-if" modeling without losing context

[... continue filling template sections ...]
```

### Example 2: Documenting a Scenario Comparison Feature

```markdown
# Scenario Comparison - Feature Flow Document

## 1. Feature Overview

### 1.1 Problem Statement

**User Pain Point:**
GPs manually compare fund scenarios using multiple Excel files, leading to errors
and making it impossible to visualize differences during time-sensitive LP meetings.

**Business Impact:**
- 3-4 hours wasted per comparison session
- 15% error rate in manual calculations
- Missed insights due to inability to compare >3 scenarios

**Why Now:**
Q1 fundraising requires rapid scenario analysis. Current Excel workflow is bottleneck.

### 1.2 Appetite
- **Time Budget:** 2 weeks (1 sprint)
- **Team:** 1 designer + 2 frontend developers
- **Must-Have:** Compare up to 6 scenarios, export to Excel, diff highlighting
- **Nice-to-Have:** Real-time collaboration, version history

[... continue filling template sections ...]
```

---

## Best Practices

### For Design Systems

1. **Start with Tokens:**
   - Define design tokens first (colors, spacing, typography)
   - Build components using tokens for consistency
   - Version tokens separately for easier updates

2. **Component Documentation:**
   - Document ALL states (default, hover, active, disabled, error, loading, empty)
   - Include accessibility requirements for each component
   - Provide code examples in primary framework (React/Vue/Angular)

3. **Keep It Living:**
   - Update design system with every new component
   - Deprecate old patterns with migration guides
   - Hold regular design system reviews (monthly/quarterly)

4. **Governance:**
   - Define clear contribution process
   - Assign design system owner/team
   - Create feedback channels (Slack, GitHub issues)

### For Feature Flows

1. **User-Centered:**
   - Start with user pain points, not solutions
   - Map complete user journey (entry to exit)
   - Include all decision points and edge cases

2. **Comprehensive States:**
   - Document default, loading, error, empty, and success states
   - Define error recovery flows
   - Consider offline/degraded states

3. **Measurable Success:**
   - Define clear success metrics upfront
   - Plan analytics instrumentation
   - Set target benchmarks (completion rate, time on task)

4. **Scope Control:**
   - Use "Rabbit Holes" section to prevent scope creep
   - Define clear "No-Gos" (out of scope features)
   - Set appetite constraints (time/resources)

---

## Integration with Development

### Design to Development Handoff

**Design System:**
1. Export design tokens as JSON/CSS variables
2. Link Figma components to code components (Storybook)
3. Provide developer documentation (props, usage examples)
4. Set up automated visual regression testing

**Feature Flow:**
1. Create high-fidelity mockups with annotations
2. Build interactive prototypes (Figma, InVision)
3. Document API contracts and data models
4. Provide feature flags for gradual rollout

### Code Examples

**Using Design Tokens:**
```tsx
import { tokens } from '@/styles/tokens';

const MetricsCard = () => (
  <div style={{
    padding: tokens.spacing[4],
    borderRadius: tokens.borderRadius.md,
    boxShadow: tokens.shadow.sm
  }}>
    {/* Content */}
  </div>
);
```

**Implementing Component States:**
```tsx
interface ButtonProps {
  variant: 'primary' | 'secondary';
  state: 'default' | 'hover' | 'active' | 'disabled' | 'loading';
}

const Button: React.FC<ButtonProps> = ({ variant, state, children }) => {
  const styles = getButtonStyles(variant, state);
  return <button className={styles}>{children}</button>;
};
```

---

## Tools & Resources

### Recommended Design Tools
- **Figma:** Design files, prototypes, design tokens plugin
- **Storybook:** Component library documentation
- **Zeroheight:** Design system documentation platform
- **Abstract/Figma Branches:** Design version control

### Development Tools
- **CSS Modules / Tailwind:** Styling with design tokens
- **TypeScript:** Type-safe component props
- **Vitest + React Testing Library:** Component testing
- **Chromatic:** Visual regression testing

### Collaboration Tools
- **Notion/Confluence:** Documentation and planning
- **Miro:** Journey mapping and workshops
- **Slack:** Design system support channel
- **GitHub:** Issue tracking and feedback

### Validation Tools
- **Lighthouse:** Performance and accessibility audits
- **axe DevTools:** WCAG compliance testing
- **Stark (Figma):** Color contrast checking
- **BrowserStack:** Cross-browser testing

---

## Common Pitfalls to Avoid

### Design System
- ❌ **Don't:** Build components without use cases
- ✅ **Do:** Create components based on real product needs

- ❌ **Don't:** Document once and forget
- ✅ **Do:** Maintain living documentation with regular updates

- ❌ **Don't:** Enforce strict rules without flexibility
- ✅ **Do:** Provide guidelines with escape hatches for edge cases

### Feature Flow
- ❌ **Don't:** Design in isolation without user research
- ✅ **Do:** Base designs on validated user needs and pain points

- ❌ **Don't:** Leave validation rules undocumented
- ✅ **Do:** Specify all validation rules with error messages

- ❌ **Don't:** Ignore edge cases and error states
- ✅ **Do:** Document comprehensive error handling and recovery

---

## Version History

| Date | Version | Changes | Author |
|------|---------|---------|--------|
| 2025-10-07 | 1.0 | Initial template creation with Design System and Feature Flow templates | Template Team |

---

## Related Resources

### Industry Design Systems
- [Material Design](https://material.io/design) - Google's design system
- [Shopify Polaris](https://polaris.shopify.com) - E-commerce design patterns
- [Atlassian Design System](https://atlassian.design) - Enterprise product design
- [Carbon Design System](https://carbondesignsystem.com) - IBM's design system

### UX Documentation Guides
- [Nielsen Norman Group Templates](https://www.nngroup.com/articles/free-ux-templates/) - Research-backed UX resources
- [LogRocket UX Documentation Guide](https://blog.logrocket.com/ux-design/ux-documentation-guide-best-practices-template/) - Best practices
- [UXPin Design System Guide](https://www.uxpin.com/studio/blog/design-system-documentation-guide/) - 9-step framework

### Basecamp Resources
- [Shape Up](https://basecamp.com/shapeup) - Basecamp's product development methodology
- [Pitch Template](https://basecamp.com/shapeup/1.5-chapter-06) - Problem-solution framing

---

## Contributing

To improve these templates:

1. **Propose Changes:** Open an issue with suggested improvements
2. **Add Examples:** Contribute real-world examples from projects
3. **Update Best Practices:** Share learnings from template usage
4. **Create Variants:** Develop specialized templates for specific contexts

---

## Support

For questions or assistance with these templates:

- **Design System Questions:** #design-system-help
- **Feature Flow Questions:** #product-design
- **Template Issues:** File a GitHub issue
- **General UX/UI:** #ux-team

---

**Last Updated:** 2025-10-07
**Maintained By:** UX/UI Team
**Next Review:** 2025-11-07
