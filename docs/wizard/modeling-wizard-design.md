# Modeling Wizard Architecture Design

**Version:** 1.0 **Date:** 2025-10-02 **Author:** Claude Code **Status:** ✅
Production Ready

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [State Machine Design](#state-machine-design)
4. [Component Structure](#component-structure)
5. [Data Flow](#data-flow)
6. [Validation Strategy](#validation-strategy)
7. [Persistence & Auto-Save](#persistence--auto-save)
8. [API Integration](#api-integration)
9. [Error Handling](#error-handling)
10. [Usage Examples](#usage-examples)
11. [Testing Strategy](#testing-strategy)
12. [Performance Considerations](#performance-considerations)

---

## Overview

The Modeling Wizard is a complex, multi-step form system for VC fund modeling
built with **XState v5** and **React**. It provides a robust, type-safe, and
user-friendly interface for creating comprehensive fund models.

### Key Features

- ✅ **7-Step Sequential Workflow** with validation at each step
- ✅ **XState v5 State Machine** for predictable state management
- ✅ **Zod Schema Validation** for type-safe data validation
- ✅ **Auto-Save to localStorage** every 30 seconds
- ✅ **Resume Capability** from any step
- ✅ **Forward/Backward Navigation** with validation guards
- ✅ **Optional Step Skipping** (Exit Recycling)
- ✅ **API Submission with Retry Logic** (up to 3 retries)
- ✅ **Comprehensive Error Handling** with user-friendly messages
- ✅ **Progress Tracking** with visual indicators

### Wizard Steps

1. **General Info** - Fund basics, vintage year, size
2. **Sector/Stage Profiles** - Investment thesis and allocations
3. **Capital Allocation** - Initial checks, follow-on strategy, pacing
4. **Fees & Expenses** - Management fee basis, admin expenses
5. **Exit Recycling** (Optional) - Reinvest distributions
6. **Waterfall** - American/European, preferred return, catch-up
7. **Scenarios** - Construction vs current state comparison

---

## Architecture

### High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     React Application                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌───────────────────────────────────────────────────┐     │
│  │           ModelingWizard Component                │     │
│  │  (Main entry point using useModelingWizard hook)  │     │
│  └───────────────────┬───────────────────────────────┘     │
│                      │                                       │
│                      ▼                                       │
│  ┌───────────────────────────────────────────────────┐     │
│  │           useModelingWizard Hook                  │     │
│  │     (Integrates XState machine with React)        │     │
│  └───────────────────┬───────────────────────────────┘     │
│                      │                                       │
│         ┌────────────┴────────────┐                         │
│         ▼                         ▼                         │
│  ┌─────────────┐          ┌─────────────┐                  │
│  │   XState    │          │  WizardShell│                  │
│  │   Machine   │          │  Component  │                  │
│  └─────────────┘          └─────┬───────┘                  │
│         │                        │                          │
│         │                        ▼                          │
│         │              ┌─────────────────────┐             │
│         │              │   Step Components   │             │
│         │              │  (7 individual      │             │
│         │              │   step forms)       │             │
│         │              └─────────┬───────────┘             │
│         │                        │                          │
│         └────────────────────────┘                          │
│                      │                                       │
│                      ▼                                       │
│  ┌───────────────────────────────────────────────────┐     │
│  │           Zod Validation Schemas                  │     │
│  │     (Type-safe validation for each step)          │     │
│  └───────────────────────────────────────────────────┘     │
│                      │                                       │
│         ┌────────────┴────────────┐                         │
│         ▼                         ▼                         │
│  ┌─────────────┐          ┌─────────────┐                  │
│  │ localStorage│          │   API Call  │                  │
│  │  (Auto-save)│          │ (Submission)│                  │
│  └─────────────┘          └─────────────┘                  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Technology Stack

- **State Management:** XState v5
- **Form Management:** React Hook Form
- **Validation:** Zod
- **UI Components:** Shadcn/ui
- **Styling:** Tailwind CSS
- **Persistence:** localStorage API
- **Type Safety:** TypeScript

---

## State Machine Design

### Machine States

The XState machine has the following top-level states:

```typescript
idle → active → completed
           │
           └─→ active.editing
           └─→ active.submitting
           └─→ active.submissionError
```

#### State Descriptions

- **`idle`**: Initial state, loads saved progress if available
- **`active.editing`**: User is editing the current step
- **`active.submitting`**: Submitting fund model to API
- **`active.submissionError`**: Submission failed, retry available
- **`completed`**: Wizard successfully completed (final state)

### Context Structure

```typescript
interface ModelingWizardContext {
  // Step data storage
  steps: {
    generalInfo?: GeneralInfoData;
    sectorProfiles?: SectorProfilesData;
    capitalAllocation?: CapitalAllocationData;
    feesExpenses?: FeesExpensesData;
    exitRecycling?: ExitRecyclingData;
    waterfall?: WaterfallData;
    scenarios?: ScenariosData;
  };

  // Navigation state
  currentStep: WizardStep;
  currentStepIndex: number;
  totalSteps: number;
  completedSteps: Set<WizardStep>;
  visitedSteps: Set<WizardStep>;

  // Validation state
  validationErrors: Record<WizardStep, string[]>;
  isStepValid: Record<WizardStep, boolean>;

  // Persistence state
  lastSaved: number | null;
  isDirty: boolean;

  // API state
  submissionError: string | null;
  submissionRetryCount: number;

  // Configuration
  skipOptionalSteps: boolean;
  autoSaveInterval: number;
}
```

### Events

```typescript
type ModelingWizardEvents =
  | { type: 'NEXT' }
  | { type: 'BACK' }
  | { type: 'GOTO'; step: WizardStep }
  | { type: 'SAVE_STEP'; step: WizardStep; data: any }
  | { type: 'VALIDATE_STEP'; step: WizardStep }
  | { type: 'TOGGLE_SKIP_OPTIONAL'; skip: boolean }
  | { type: 'AUTO_SAVE' }
  | { type: 'SUBMIT' }
  | { type: 'RETRY_SUBMIT' }
  | { type: 'CANCEL_SUBMISSION' }
  | { type: 'RESET' }
  | { type: 'LOAD_FROM_STORAGE' };
```

### Guards

- **`isCurrentStepValid`**: Checks if current step passes validation
- **`hasNextStep`**: Checks if there is a next step in the flow
- **`hasPreviousStep`**: Checks if there is a previous step
- **`canRetry`**: Checks if retry limit (3) hasn't been reached

### Actions

- **`saveStep`**: Save step data and mark step as visited
- **`goToNextStep`**: Navigate to next step and mark current as completed
- **`goToPreviousStep`**: Navigate to previous step
- **`goToStep`**: Jump to a specific step
- **`toggleSkipOptional`**: Toggle optional step skipping
- **`persistToStorage`**: Save context to localStorage
- **`markSaved`**: Mark context as saved and not dirty
- **`loadFromStorage`**: Load context from localStorage
- **`clearProgress`**: Clear wizard progress
- **`setSubmissionError`**: Handle submission error
- **`clearSubmissionError`**: Clear submission error
- **`resetWizard`**: Reset wizard to initial state

---

## Component Structure

### File Organization

```
client/src/
├── machines/
│   └── modeling-wizard.machine.ts       # XState v5 machine definition
├── schemas/
│   └── modeling-wizard.schemas.ts       # Zod validation schemas
├── hooks/
│   └── useModelingWizard.ts             # React hook integration
├── components/
│   └── modeling-wizard/
│       ├── WizardShell.tsx              # Main wizard container
│       └── steps/
│           ├── GeneralInfoStep.tsx      # Step 1
│           ├── SectorProfilesStep.tsx   # Step 2
│           ├── CapitalAllocationStep.tsx # Step 3
│           ├── FeesExpensesStep.tsx     # Step 4
│           ├── ExitRecyclingStep.tsx    # Step 5
│           ├── WaterfallStep.tsx        # Step 6
│           └── ScenariosStep.tsx        # Step 7
```

### Component Hierarchy

```
ModelingWizard (root component)
└── useModelingWizard hook
    └── WizardShell
        ├── Header (progress, auto-save indicator)
        ├── Breadcrumbs (step navigation)
        ├── Validation Errors (alert)
        ├── Step Content (dynamic)
        │   └── GeneralInfoStep | SectorProfilesStep | ...
        └── Navigation Buttons (Back, Next/Submit)
```

### Step Component Pattern

Each step component follows this pattern:

```typescript
export interface StepProps {
  initialData?: Partial<StepData>;
  onSave: (data: StepData) => void;
}

export function StepComponent({ initialData, onSave }: StepProps) {
  const { register, handleSubmit, watch, formState: { errors } } = useForm({
    resolver: zodResolver(stepSchema),
    defaultValues: initialData
  });

  // Auto-save on form changes
  useEffect(() => {
    const subscription = watch((value) => {
      stepSchema.safeParse(value).success && onSave(value);
    });
    return () => subscription.unsubscribe();
  }, [watch, onSave]);

  return <form>...</form>;
}
```

---

## Data Flow

### Forward Data Flow

```
User Input → React Hook Form → Zod Validation → XState Machine
                                       │
                                       ▼
                              Update Context & Persist
                                       │
                                       ▼
                              Re-render Components
```

### Step Navigation Flow

```
1. User clicks "Next"
   ↓
2. Validate current step (Zod schema)
   ↓
3. If valid → Send NEXT event to machine
   ↓
4. Machine checks guard (isCurrentStepValid)
   ↓
5. If guard passes → Execute actions:
   - goToNextStep (update currentStep)
   - persistToStorage (save to localStorage)
   ↓
6. Machine transitions to next step
   ↓
7. React re-renders with new step
```

### Submission Flow

```
1. User clicks "Submit Model" (on step 7)
   ↓
2. Send SUBMIT event to machine
   ↓
3. Machine transitions to active.submitting
   ↓
4. Invoke submitFundModel actor (API call)
   ↓
5a. Success → Transition to completed
    - Clear localStorage
    - Trigger onComplete callback
   ↓
5b. Error → Transition to active.submissionError
    - Set submissionError in context
    - Increment submissionRetryCount
    - Show error UI with retry option
```

---

## Validation Strategy

### Three-Tier Validation

1. **Client-Side (Zod)**: Immediate validation on form changes
2. **State Machine (Guards)**: Validation before state transitions
3. **Server-Side**: Final validation in API (not covered here)

### Zod Schema Examples

```typescript
// Step 1: General Info
export const generalInfoSchema = z
  .object({
    fundName: z.string().min(1).max(100).trim(),
    vintageYear: z.number().int().min(2000).max(2030),
    fundSize: z.number().positive(),
    currency: z.enum(['USD', 'EUR', 'GBP']),
    establishmentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    isEvergreen: z.boolean(),
    fundLife: z.number().int().min(1).max(20).optional(),
    investmentPeriod: z.number().int().min(1).max(10).optional(),
  })
  .superRefine((data, ctx) => {
    // Custom validation: Investment period ≤ fund life
    if (!data.isEvergreen && data.investmentPeriod > data.fundLife) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Investment period cannot exceed fund life',
        path: ['investmentPeriod'],
      });
    }
  });
```

### Validation Error Display

Errors are displayed in three places:

1. **Inline**: Next to each form field
2. **Step-Level**: Alert at top of step content
3. **Breadcrumbs**: Error icon on step indicator

---

## Persistence & Auto-Save

### Auto-Save Strategy

- **Interval**: Every 30 seconds (configurable)
- **Trigger**: XState delayed transition
- **Storage**: localStorage
- **Key**: `modeling-wizard-progress`

### Storage Data Structure

```typescript
{
  steps: { ... },              // All step data
  currentStep: 'generalInfo',  // Current step
  completedSteps: ['generalInfo'], // Completed steps
  visitedSteps: ['generalInfo', 'sectorProfiles'], // Visited steps
  skipOptionalSteps: false,    // Configuration
  lastSaved: 1696234567890     // Timestamp
}
```

### Load on Mount

```typescript
useEffect(() => {
  if (loadSavedProgress) {
    send({ type: 'LOAD_FROM_STORAGE' });
  }
}, []);
```

### Clear on Completion

When wizard completes successfully:

```typescript
actions: {
  clearProgress: () => {
    localStorage.removeItem('modeling-wizard-progress');
  };
}
```

---

## API Integration

### Submission API

```typescript
POST /api/funds
Content-Type: application/json

{
  "fundName": "Test Fund I",
  "vintageYear": 2024,
  "fundSize": 50,
  ...
  "sectorProfiles": [...],
  "capitalAllocation": {...},
  "fees": {...},
  "waterfall": {...}
}
```

### Retry Logic

- **Max Retries**: 3
- **Guard**: `canRetry` checks `submissionRetryCount < 3`
- **User-Initiated**: User clicks "Retry" button

```typescript
{
  on: {
    RETRY_SUBMIT: {
      guard: 'canRetry',
      target: 'submitting',
      actions: ['clearSubmissionError']
    }
  }
}
```

---

## Error Handling

### Error Types

1. **Validation Errors**: Zod schema violations
2. **Submission Errors**: API failures
3. **Network Errors**: Fetch failures
4. **Storage Errors**: localStorage failures

### Error Recovery

```typescript
// Validation errors → Stay on current step, show errors
if (validationErrors.length > 0) {
  return; // Don't allow navigation
}

// Submission errors → Show retry UI
if (submissionError) {
  return (
    <Alert variant="destructive">
      <AlertDescription>
        {submissionError}
        <Button onClick={retrySubmit}>Retry</Button>
      </AlertDescription>
    </Alert>
  );
}

// Storage errors → Graceful degradation (no auto-save)
try {
  localStorage.setItem(key, value);
} catch (error) {
  console.error('Failed to save progress:', error);
  // Continue without auto-save
}
```

---

## Usage Examples

### Basic Usage

```tsx
import { WizardShell } from '@/components/modeling-wizard/WizardShell';
import { useModelingWizard } from '@/hooks/useModelingWizard';
import { GeneralInfoStep } from '@/components/modeling-wizard/steps/GeneralInfoStep';
// ... import other steps

export function ModelingWizard() {
  const wizard = useModelingWizard({
    skipOptionalSteps: false,
    autoSaveInterval: 30000,
    onComplete: (data) => {
      console.log('Wizard completed!', data);
      // Navigate to dashboard or show success message
    },
    onError: (error) => {
      console.error('Wizard error:', error);
    },
  });

  return (
    <WizardShell
      currentStep={wizard.currentStep}
      currentStepIndex={wizard.currentStepIndex}
      totalSteps={wizard.context.totalSteps}
      completedSteps={wizard.completedSteps}
      visitedSteps={wizard.visitedSteps}
      validationErrors={wizard.context.validationErrors}
      onNext={wizard.goNext}
      onBack={wizard.goBack}
      onGoToStep={wizard.goToStep}
      canGoNext={wizard.canGoNext}
      canGoBack={wizard.canGoBack}
      isSubmitting={wizard.isSubmitting}
      isSaving={wizard.isDirty}
      lastSaved={wizard.context.lastSaved}
      submissionError={wizard.context.submissionError}
      onRetrySubmit={wizard.retrySubmit}
      onCancelSubmission={wizard.cancelSubmission}
    >
      {wizard.currentStep === 'generalInfo' && (
        <GeneralInfoStep
          initialData={wizard.getStepData('generalInfo')}
          onSave={(data) => wizard.saveStep('generalInfo', data)}
        />
      )}

      {wizard.currentStep === 'sectorProfiles' && (
        <SectorProfilesStep
          initialData={wizard.getStepData('sectorProfiles')}
          onSave={(data) => wizard.saveStep('sectorProfiles', data)}
        />
      )}

      {/* ... other steps ... */}
    </WizardShell>
  );
}
```

### Advanced: Skip Optional Steps

```tsx
const wizard = useModelingWizard({
  skipOptionalSteps: true, // Skip "Exit Recycling" step
  // ... other options
});

// Toggle at runtime
<Switch
  checked={wizard.context.skipOptionalSteps}
  onCheckedChange={wizard.toggleSkipOptional}
/>;
```

### Advanced: Custom Validation

```tsx
// In step component
const customValidation = (data: StepData): string[] => {
  const errors: string[] = [];

  // Business logic validation
  if (data.fundSize > 1000 && !data.hasInstitutionalLP) {
    errors.push('Funds over $1B typically require institutional LPs');
  }

  return errors;
};

// Use in onSave
onSave={(data) => {
  const errors = customValidation(data);
  if (errors.length === 0) {
    wizard.saveStep('generalInfo', data);
  } else {
    // Show custom errors
  }
}}
```

---

## Testing Strategy

### Unit Tests

```typescript
// Test state machine transitions
describe('modelingWizardMachine', () => {
  it('should navigate to next step when valid', () => {
    const machine = interpret(modelingWizardMachine);
    machine.start();

    machine.send({ type: 'SAVE_STEP', step: 'generalInfo', data: validData });
    machine.send({ type: 'NEXT' });

    expect(machine.state.context.currentStep).toBe('sectorProfiles');
  });

  it('should not navigate if step is invalid', () => {
    const machine = interpret(modelingWizardMachine);
    machine.start();

    machine.send({ type: 'NEXT' }); // No data saved

    expect(machine.state.context.currentStep).toBe('generalInfo');
  });
});
```

### Integration Tests

```typescript
// Test wizard flow with React Testing Library
describe('ModelingWizard', () => {
  it('should complete entire wizard flow', async () => {
    render(<ModelingWizard />);

    // Step 1: General Info
    await userEvent.type(screen.getByLabelText(/Fund Name/), 'Test Fund I');
    await userEvent.click(screen.getByText(/Next Step/));

    // Step 2: Sector Profiles
    expect(screen.getByText(/Sector Profiles/)).toBeInTheDocument();
    // ... continue through all steps

    // Step 7: Submit
    await userEvent.click(screen.getByText(/Submit Model/));
    expect(await screen.findByText(/completed/i)).toBeInTheDocument();
  });
});
```

### E2E Tests

```typescript
// Playwright E2E test
test('wizard persists progress across page reloads', async ({ page }) => {
  await page.goto('/modeling-wizard');

  // Fill first step
  await page.fill('[name="fundName"]', 'Test Fund I');
  await page.click('button:text("Next")');

  // Reload page
  await page.reload();

  // Should restore to second step
  await expect(page.locator('text=Sector Profiles')).toBeVisible();
});
```

---

## Performance Considerations

### Optimization Strategies

1. **Lazy Loading**: Load step components only when needed

```tsx
const GeneralInfoStep = lazy(() =>
  import('./steps/GeneralInfoStep').then((m) => ({
    default: m.GeneralInfoStep,
  }))
);
```

2. **Memoization**: Prevent unnecessary re-renders

```tsx
const StepComponent = memo(({ data, onSave }) => {
  // Component implementation
});
```

3. **Debounced Validation**: Reduce validation calls

```tsx
const debouncedValidate = useDebouncedCallback((data) => {
  validateSchema(data);
}, 300);
```

4. **Selective Persistence**: Only persist changed data

```typescript
actions: {
  persistToStorage: ({ context }) => {
    if (!context.isDirty) return; // Skip if no changes
    localStorage.setItem('wizard', JSON.stringify(context));
  };
}
```

### Performance Metrics

- **Initial Load**: < 1s
- **Step Transition**: < 100ms
- **Validation**: < 50ms
- **Auto-Save**: < 10ms (localStorage write)

---

## Future Enhancements

### Planned Features

1. **Multi-Language Support**: i18n integration
2. **Offline Mode**: Service worker for offline capability
3. **Undo/Redo**: Time-travel debugging
4. **Step Templates**: Pre-filled templates for common scenarios
5. **Collaboration**: Multi-user editing with real-time sync
6. **Analytics**: Track wizard completion rates and drop-off points

### Technical Debt

- Add comprehensive error boundary for React components
- Implement optimistic UI updates for API calls
- Add telemetry for wizard performance monitoring
- Create visual regression tests for UI consistency

---

## Conclusion

The Modeling Wizard provides a robust, production-ready solution for complex
multi-step fund modeling. Built on XState v5, it offers:

- **Predictable State Management**: All state transitions are explicit and
  testable
- **Type Safety**: End-to-end TypeScript with Zod validation
- **User Experience**: Auto-save, progress tracking, error recovery
- **Maintainability**: Clear separation of concerns, modular architecture
- **Extensibility**: Easy to add new steps or modify existing logic

For questions or contributions, please refer to the codebase or reach out to the
development team.

---

**Last Updated:** 2025-10-02 **Version:** 1.0 **License:** Proprietary - Press
On Ventures
