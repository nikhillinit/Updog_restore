# Wizard Step 4 Auto-Save Architecture Design

**Date**: 2025-11-30
**Status**: Validated
**Track**: Phoenix Phase 1 - Track 2 (Wizard Step 4)

## Decision Summary

| Aspect | Decision |
|--------|----------|
| Architecture | XState-First (machine orchestrates save lifecycle) |
| Persistence | localStorage only (no API for drafts) |
| Debounce | 750ms delay before save |
| Unmount | Immediate save via ref capture |

## Context

The FeesExpensesStep component currently fires `onSave` on every keystroke without debouncing, providing no user feedback on save status, and loses data if the user navigates away mid-edit.

## Current State Analysis

**Existing XState Infrastructure (modeling-wizard.machine.ts):**
- `SAVE_STEP` event with validation (line 179)
- `persistToStorage()` function (lines 271-287)
- 30-second auto-save timer (lines 788-792)
- `isDirty` tracking (line 164)
- `RESET` event (line 186)

**Current Gaps:**
1. No debounce - saves fire on every change
2. No unmount protection - data loss on navigation
3. No save status UI - user has no feedback
4. Missing error displays for some form fields

## Architecture Design

### Layer 1: Component (FeesExpensesStep.tsx)

```typescript
// Capture current form values for unmount save
const formValuesRef = useRef<FeesExpensesInput>(formData);
formValuesRef.current = formData;

// Debounce form changes (750ms)
const debouncedFormData = useDebounce(formData, 750);

// Save on debounced changes
useEffect(() => {
  if (debouncedFormData && formState.isDirty) {
    send({ type: 'SAVE_DRAFT', step: 'feesExpenses', data: debouncedFormData });
  }
}, [debouncedFormData, send, formState.isDirty]);

// Save on unmount (critical for data preservation)
useEffect(() => {
  return () => {
    if (formValuesRef.current) {
      send({ type: 'SAVE_DRAFT', step: 'feesExpenses', data: formValuesRef.current });
    }
  };
}, [send]);
```

### Layer 2: XState Machine (modeling-wizard.machine.ts)

**New Event Type:**
```typescript
| { type: 'SAVE_DRAFT'; step: WizardStep; data: any }
```

**New States (extend active.states):**
```typescript
states: {
  editing: {
    on: {
      SAVE_DRAFT: { target: 'savingDraft', actions: 'prepareDraftSave' },
      // ... existing events
    }
  },

  savingDraft: {
    entry: 'persistDraftToStorage',
    after: {
      0: { target: 'draftSaved' } // Immediate transition (localStorage is sync)
    }
  },

  draftSaved: {
    after: {
      1500: { target: 'editing' } // Show "Saved" for 1.5s
    }
  },

  saveDraftError: {
    on: {
      SAVE_DRAFT: { target: 'savingDraft' } // Retry capability
    }
  }
}
```

**New Actions:**
```typescript
actions: {
  prepareDraftSave: assign(({ context, event }) => {
    if (event.type !== 'SAVE_DRAFT') return context;
    return {
      ...context,
      steps: { ...context.steps, [event.step]: event.data },
      isDirty: true
    };
  }),

  persistDraftToStorage: ({ context }) => {
    persistToStorage(context); // Reuse existing function
  }
}
```

### Layer 3: UI Feedback

```typescript
// In FeesExpensesStep.tsx
const SaveStatusIndicator = () => {
  const { state } = useModelingWizard();

  if (state.matches({ active: 'savingDraft' })) {
    return <span className="text-muted-foreground"><Loader2 className="animate-spin h-4 w-4" /> Saving...</span>;
  }
  if (state.matches({ active: 'draftSaved' })) {
    return <span className="text-green-600"><Check className="h-4 w-4" /> Saved</span>;
  }
  if (state.matches({ active: 'saveDraftError' })) {
    return (
      <span className="text-red-500">
        <AlertCircle className="h-4 w-4" /> Save failed
        <Button variant="link" onClick={() => send({ type: 'SAVE_DRAFT', ... })}>Retry</Button>
      </span>
    );
  }
  return null;
};
```

## Why localStorage Only?

1. **Speed**: No network latency (saves appear instant)
2. **Reliability**: Works offline, no API dependency for drafts
3. **Simplicity**: No need to verify API endpoint exists
4. **Existing Pattern**: Machine already uses `persistToStorage()` for 30s auto-save
5. **Final Save Still Uses API**: The `SUBMIT` event still posts to `/api/funds`

## Files to Modify

| File | Changes |
|------|---------|
| `client/src/machines/modeling-wizard.machine.ts` | Add SAVE_DRAFT event, savingDraft/draftSaved/saveDraftError states |
| `client/src/components/modeling-wizard/steps/FeesExpensesStep.tsx` | Add debounce, unmount save, save status UI, missing error displays |
| `client/src/hooks/useModelingWizard.ts` | Expose save state matching helpers |

## Testing Strategy

**Unit Tests:**
- Debounce fires after 750ms
- Unmount triggers immediate save
- Error states render correctly
- All form fields show validation errors

**Integration Tests:**
- Step 3 -> Step 4 -> Step 5 navigation preserves data
- Browser refresh recovers from localStorage
- Rapid navigation doesn't lose data

## Success Criteria

- [ ] No data loss on rapid navigation between steps
- [ ] User sees "Saving..." and "Saved" feedback
- [ ] All form fields show validation errors
- [ ] 80%+ branch coverage on FeesExpensesStep.tsx
- [ ] No new TypeScript errors
- [ ] Test pass rate >= 74.2%

## References

- ADR-011: Anti-Pattern Prevention Strategy
- Phoenix Phase 1 Implementation Plan
- XState v5 Documentation: https://stately.ai/docs/xstate-v5
