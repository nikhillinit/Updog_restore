---
status: ACTIVE
last_updated: 2026-04-03
---

# Capital Allocation - Follow-On Projection Table Design

**Status**: Post-Demo Implementation **Priority**: High Value UX Improvement
**Based On**: PDF Analysis + Gemini AI Strategic Design

---

## Objective

Replace the simple "Follow-On Capital: $X.XM" output with a detailed,
interactive table showing stage-by-stage capital flow projections. This
transforms the Capital Allocation step from a basic calculator into a **Dynamic
Capital Pacing Model**.

---

## Table Design

### Visual Layout

For each allocation (e.g., "Pre-Seed Investments"), show a table like:

```
Follow-On Strategy - Capital Flow Projection
┌─────────────┬────────────┬──────────────┬────────────┬────────────┬─────────────┬──────────────┐
│ Follow-On   │ Graduation │ # Graduating │ Particip.  │ # Follow-  │ Check Size  │   Capital    │
│   Stage     │   Rate     │  Companies   │     %      │    Ons     │   per Co.   │  Allocated   │
├─────────────┼────────────┼──────────────┼────────────┼────────────┼─────────────┼──────────────┤
│ Seed        │   40% [I] │    7.6 [C] │   50% [I] │   4   [C] │  $250k [I] │  $946k [C]  │
│ Series A    │   45% [I] │    3.4 [C] │  100% [I] │  3.4 [C] │  $800k [I] │  $2.8M [C]  │
│ Series B    │   50% [I] │    1.7 [C] │  100% [I] │  1.7 [C] │  $2.5M [I] │  $4.3M [C]  │
│ Series C+   │   65% [I] │    1.1 [C] │  100% [I] │  1.1 [C] │  $8.0M [I] │  $8.8M [C]  │
├─────────────┴────────────┴──────────────┴────────────┴────────────┴─────────────┼──────────────┤
│                                                                      TOTAL ->     │ $16.8M [C]  │
└─────────────────────────────────────────────────────────────────────────────────┴──────────────┘

Legend: [I] = User Input (white/yellow background) | [C] = Calculated Output (gray background)
```

### Column Definitions

| Column                     | Type   | Calculation                              | Notes                                                                                 |
| -------------------------- | ------ | ---------------------------------------- | ------------------------------------------------------------------------------------- |
| **Follow-On Stage**        | Label  | Static                                   | Seed, Series A, B, C+ (subsequent stages after entry)                                 |
| **Graduation Rate**        | INPUT  | User editable                            | % of companies graduating from previous stage. Defaults from Investment Strategy step |
| **# Graduating Companies** | OUTPUT | `previousFollowOns * graduationRate`     | For first follow-on: `initialInvestments * graduationRate`                            |
| **Participation %**        | INPUT  | User editable                            | % of graduates we'll follow-on into (selective participation)                         |
| **# Follow-Ons**           | OUTPUT | `graduatingCompanies * participationPct` | Number of deals we actually follow-on                                                 |
| **Check Size per Co.**     | INPUT  | User editable OR calculated              | If "Fixed Amount": user input. If "Maintain Ownership": calculated pro-rata           |
| **Capital Allocated**      | OUTPUT | `#followOns * checkSize`                 | Total capital for this stage                                                          |

---

## Implementation Components

### 1. Data Structure

```typescript
interface FollowOnProjection {
  stage: string;
  graduationRate: number; // %
  graduatingCompanies: number; // calculated
  participationPct: number; // %
  followOnCount: number; // calculated
  checkSize: number; // $ or calculated if pro-rata
  capitalAllocated: number; // calculated
}

interface CapitalAllocation {
  // ... existing fields ...
  followOnProjections: FollowOnProjection[];
}
```

### 2. Calculation Logic

```typescript
function calculateFollowOnProjections(
  allocation: CapitalAllocation,
  stages: InvestmentStage[]
): FollowOnProjection[] {
  const entryStageIndex = stages.findIndex(
    (s) => s.name === allocation.entryRound
  );
  const subsequentStages = stages.slice(entryStageIndex + 1);

  let currentCompanies = allocation.estimatedDeals; // Start with initial investments
  const projections: FollowOnProjection[] = [];

  for (const stage of subsequentStages) {
    const graduationRate = stage.graduate / 100; // Default from Investment Strategy
    const graduatingCompanies = currentCompanies * graduationRate;

    const participationPct = allocation.followOnParticipationPct / 100;
    const followOnCount = graduatingCompanies * participationPct;

    // Calculate check size based on strategy
    let checkSize: number;
    if (allocation.followOnStrategy === 'amount') {
      checkSize = allocation.followOnAmount! * 1000000;
    } else {
      // Pro-rata calculation
      checkSize = calculateProRata(
        allocation.initialOwnershipPct!,
        getTypicalRoundSize(stage.name)
      );
    }

    const capitalAllocated = followOnCount * checkSize;

    projections.push({
      stage: stage.name,
      graduationRate: stage.graduate,
      graduatingCompanies,
      participationPct: allocation.followOnParticipationPct,
      followOnCount,
      checkSize,
      capitalAllocated,
    });

    // Next stage starts with companies we followed-on
    currentCompanies = followOnCount;
  }

  return projections;
}

function calculateProRata(
  priorOwnershipPct: number,
  newRoundSize: number
): number {
  // Pro-rata amount = your ownership % x new round size
  return (priorOwnershipPct / 100) * newRoundSize;
}
```

### 3. UI Component

```tsx
<FollowOnProjectionTable
  allocation={allocation}
  stages={stages}
  onUpdateProjection={(stageIndex, updates) => {
    // Update specific projection values
    // Trigger recalculation cascade
  }}
/>
```

---

## Visual Design Principles

### Color Coding

- **White/Pale Yellow Cells**: User-editable inputs
- **Gray Cells**: Calculated outputs (read-only)
- **Hover State**: Show calculation formula in tooltip

### Real-time Updates

- Any input change triggers cascading recalculation
- Animated number transitions for smooth UX
- Debounced updates (300ms) to prevent jank

### Responsive Layout

- Desktop: Full table with all columns
- Tablet: Scroll horizontally
- Mobile: Card-based layout (one stage per card)

---

## Advanced Features (Future)

### 1. Scenario Comparison

Toggle between "Optimistic" / "Base" / "Conservative" graduation rates

### 2. Visual Funnel Chart

Sankey diagram showing capital flow through stages

### 3. What-If Simulator

"What if Series A graduation drops to 30%?" -> instant projection update

### 4. Export Capability

Export table as CSV for LP reporting

---

## Implementation Checklist

### Phase 1: Core Table (Week 1 Post-Demo)

- [ ] Create `FollowOnProjectionTable` component
- [ ] Implement calculation engine with cascading logic
- [ ] Add white/gray visual distinction
- [ ] Connect to Investment Strategy graduation rates
- [ ] Real-time updates on input change

### Phase 2: Pro-Rata Logic (Week 2)

- [ ] Implement "Maintain Ownership" calculation
- [ ] Add typical round size assumptions per stage
- [ ] Toggle between Fixed Amount <-> Pro-Rata
- [ ] Show ownership % tracking across stages

### Phase 3: Polish & Testing (Week 3)

- [ ] Responsive mobile layout
- [ ] Animation/transitions
- [ ] Comprehensive validation
- [ ] User testing with actual GPs
- [ ] Documentation updates

---

## Success Metrics

**UX Goals:**

- Users can answer: "How much capital do I need for follow-ons?"
- Users can model: "What if graduation rates change?"
- Visual clarity: Input vs Output distinction obvious at a glance

**Technical Goals:**

- Calculations accurate to fund modeling standards
- < 100ms update latency on input change
- Zero calculation errors under all input combinations

---

## Reference Materials

- **PDF Example**:
  `docs/archive/2025-q4/default-parameters/Capital Allocation Example.pdf`
- **AI Analysis**: Gemini deep-think output (see conversation)
- **Current Implementation**: `client/src/pages/CapitalStructureStep.tsx`

---

**Next Steps**: Schedule implementation sprint after successful demo. Get GP
feedback on table design before coding.
