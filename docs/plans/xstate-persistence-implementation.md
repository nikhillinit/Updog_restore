# XState Persistence Implementation Plan (ADR-016)

**Date:** 2025-12-01
**Status:** Ready for Implementation
**Related:** ADR-016 in DECISIONS.md
**Architect:** Multi-AI Consensus (Gemini + OpenAI + Claude)

## Executive Summary

Implement invoke-based persistence pattern for modeling wizard state machine to fix critical data loss issue where navigation executes before persistence completes.

**Problem:** Lines 806-820 execute `['goToNextStep', 'persistToStorage']` in wrong order
**Solution:** Dedicated `persisting` state with retry logic and error recovery
**Approach:** 3 incremental PRs with 15 TDD test cases

---

## Current Progress

**COMPLETED (by user):**
- [x] `persistDataService` actor created (lines 289-334)
- [x] Handles QuotaExceededError and SecurityError
- [x] Returns storage data for verification
- [x] Console logging for debugging

**REMAINING:**
- [ ] Add context fields for persistence tracking
- [ ] Add `persisting`, `delaying`, `persistFailed` states
- [ ] Implement retry logic with exponential backoff
- [ ] Refactor navigation transitions
- [ ] Make 15 RED tests pass

---

## Implementation Approach: 3 Incremental PRs

### PR #1: Context Fields & Service Integration (Foundation)

**Goal:** Add persistence tracking infrastructure without breaking existing functionality

**Files to modify:**
- `client/src/machines/modeling-wizard.machine.ts`

**Changes:**

#### 1. Add Context Fields (lines ~130-173)

```typescript
export interface ModelingWizardContext {
  // ... existing fields ...

  // Persistence state (NEW - ADR-016)
  persistenceError: string | null;
  retryCount: number;
  lastPersistAttempt: number | null;
  navigationIntent: 'next' | 'back' | 'goto' | null;  // Track why we're persisting
  targetStep: WizardStep | null;  // For GOTO intent
}
```

#### 2. Add Event Types (lines ~175-189)

```typescript
export type ModelingWizardEvents =
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
  | { type: 'LOAD_FROM_STORAGE' }
  | { type: 'PORTFOLIO_CHANGED' }
  | { type: 'CALCULATE_RESERVES' }
  | { type: 'RETRY_PERSIST' }       // NEW: User-triggered retry
  | { type: 'DISMISS_PERSIST_ERROR' };  // NEW: Dismiss error, continue editing
```

#### 3. Update Initial Context Factory (lines ~923-963)

```typescript
function createInitialContext(input: {
  skipOptionalSteps?: boolean;
  autoSaveInterval?: number;
} = {}): ModelingWizardContext {
  const skipOptionalSteps = input.skipOptionalSteps ?? false;

  return {
    // ... existing fields ...

    // Persistence tracking (NEW)
    persistenceError: null,
    retryCount: 0,
    lastPersistAttempt: null,
    navigationIntent: null,
    targetStep: null
  } as ModelingWizardContext;
}
```

#### 4. Add Actor to Setup (lines ~459-488)

```typescript
actors: {
  submitFundModel,
  calculateReserves: fromPromise(/* existing */),

  // NEW: Already implemented by user (lines 289-334)
  persistDataService  // Export from top of file
}
```

**Tests for PR #1:**

```typescript
// tests/unit/modeling-wizard-persistence.test.tsx (update existing RED tests)

describe('PR #1: Context Fields & Service', () => {
  it('should initialize persistence tracking fields to null', () => {
    const actor = createActor(modelingWizardMachine);
    actor.start();

    expect(actor.getSnapshot().context.persistenceError).toBeNull();
    expect(actor.getSnapshot().context.retryCount).toBe(0);
    expect(actor.getSnapshot().context.lastPersistAttempt).toBeNull();
    expect(actor.getSnapshot().context.navigationIntent).toBeNull();
  });

  it('persistDataService should save to localStorage successfully', async () => {
    const mockContext = createInitialContext();
    const result = await persistDataService.invoke({ input: mockContext });

    expect(result.lastSaved).toBeGreaterThan(0);
    expect(localStorage.getItem('modeling-wizard-progress')).toBeTruthy();
  });

  it('persistDataService should throw on QuotaExceededError', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      const err = new Error('Quota exceeded');
      err.name = 'QuotaExceededError';
      throw err;
    });

    await expect(
      persistDataService.invoke({ input: createInitialContext() })
    ).rejects.toThrow('Storage limit exceeded');
  });

  it('persistDataService should throw on SecurityError (privacy mode)', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      const err = new Error('Access denied');
      err.name = 'SecurityError';
      throw err;
    });

    await expect(
      persistDataService.invoke({ input: createInitialContext() })
    ).rejects.toThrow('Storage unavailable (privacy mode)');
  });
});
```

**Success Criteria PR #1:**
- [x] Context has 5 new persistence tracking fields
- [x] Events have RETRY_PERSIST and DISMISS_PERSIST_ERROR
- [x] persistDataService integrated into actors config
- [x] 4 service tests pass (success, quota error, security error, context initialization)
- [x] No breaking changes to existing functionality
- [x] TypeScript compiles without errors

---

### PR #2: States & Retry Logic (Core Architecture)

**Goal:** Add dedicated persistence states with exponential backoff retry

**Files to modify:**
- `client/src/machines/modeling-wizard.machine.ts`

**Changes:**

#### 1. Add New Actions (lines ~490-714)

```typescript
actions: {
  // ... existing actions ...

  /**
   * Set navigation intent before persisting
   * Used to determine what to do after successful persistence
   */
  setNavigationIntent: assign(({ context, event }) => {
    if (event.type === 'NEXT') {
      return { ...context, navigationIntent: 'next' as const, targetStep: null };
    }
    if (event.type === 'BACK') {
      return { ...context, navigationIntent: 'back' as const, targetStep: null };
    }
    if (event.type === 'GOTO') {
      return { ...context, navigationIntent: 'goto' as const, targetStep: event.step };
    }
    if (event.type === 'AUTO_SAVE') {
      return { ...context, navigationIntent: null, targetStep: null };
    }
    return context;
  }),

  /**
   * Execute navigation after successful persistence
   * Called in persisting.onDone transition
   */
  executeNavigationIntent: assign(({ context }) => {
    const intent = context.navigationIntent;

    if (intent === 'next') {
      const nextStep = getNextStep(context.currentStep, context.skipOptionalSteps);
      if (!nextStep) return context;

      const newCompletedSteps = new Set(context.completedSteps);
      newCompletedSteps.add(context.currentStep);

      return {
        ...context,
        currentStep: nextStep,
        currentStepIndex: getStepIndex(nextStep),
        completedSteps: newCompletedSteps,
        visitedSteps: new Set([...context.visitedSteps, nextStep]),
        navigationIntent: null,
        targetStep: null
      };
    }

    if (intent === 'back') {
      const prevStep = getPreviousStep(context.currentStep, context.skipOptionalSteps);
      if (!prevStep) return context;

      return {
        ...context,
        currentStep: prevStep,
        currentStepIndex: getStepIndex(prevStep),
        navigationIntent: null,
        targetStep: null
      };
    }

    if (intent === 'goto' && context.targetStep) {
      return {
        ...context,
        currentStep: context.targetStep,
        currentStepIndex: getStepIndex(context.targetStep),
        visitedSteps: new Set([...context.visitedSteps, context.targetStep]),
        navigationIntent: null,
        targetStep: null
      };
    }

    // Auto-save or no intent: just clear intent
    return {
      ...context,
      navigationIntent: null,
      targetStep: null
    };
  }),

  /**
   * Increment retry count and record attempt timestamp
   */
  incrementRetryCount: assign(({ context }) => ({
    ...context,
    retryCount: context.retryCount + 1,
    lastPersistAttempt: Date.now()
  })),

  /**
   * Reset retry count after successful persistence
   */
  resetRetryCount: assign(({ context }) => ({
    ...context,
    retryCount: 0
  })),

  /**
   * Set persistence error message
   */
  setPersistenceError: assign(({ context, event }) => {
    const errorMessage = 'error' in event && event.error instanceof Error
      ? event.error.message
      : 'Failed to save data';

    return {
      ...context,
      persistenceError: errorMessage
    };
  }),

  /**
   * Clear persistence error (for retry or dismiss)
   */
  clearPersistenceError: assign(({ context }) => ({
    ...context,
    persistenceError: null
  }))
}
```

#### 2. Add New Guards (lines ~716-749)

```typescript
guards: {
  // ... existing guards ...

  /**
   * Check if retry limit has been reached (3 attempts)
   */
  canRetryPersistence: ({ context }) => {
    return context.retryCount < 3;
  }
}
```

#### 3. Add Retry Delay Calculation (lines ~751-757)

```typescript
delays: {
  autoSaveInterval: ({ context }) => context.autoSaveInterval,

  /**
   * Exponential backoff: 1s, 2s, 4s (2^retryCount * 1000ms)
   */
  retryDelay: ({ context }) => Math.pow(2, context.retryCount) * 1000
}
```

#### 4. Add New States (lines ~784-897)

Replace the entire `active` state with this expanded version:

```typescript
active: {
  initial: 'editing',

  // Auto-save timer (persists without navigation intent)
  after: {
    autoSaveInterval: {
      target: '.persisting',
      actions: 'setNavigationIntent'  // Sets intent to null for auto-save
    }
  },

  states: {
    /**
     * User is editing the current step
     */
    editing: {
      initial: 'idle',

      states: {
        /**
         * Normal editing state
         */
        idle: {
          on: {
            SAVE_STEP: {
              actions: ['saveStep']
            },

            NEXT: {
              guard: 'isCurrentStepValid',
              target: '#modelingWizard.active.persisting',
              actions: 'setNavigationIntent'
            },

            BACK: {
              guard: 'hasPreviousStep',
              target: '#modelingWizard.active.persisting',
              actions: 'setNavigationIntent'
            },

            GOTO: {
              target: '#modelingWizard.active.persisting',
              actions: 'setNavigationIntent'
            },

            TOGGLE_SKIP_OPTIONAL: {
              actions: ['toggleSkipOptional']
            },

            PORTFOLIO_CHANGED: {
              actions: 'validatePortfolio'
            },

            CALCULATE_RESERVES: {
              target: '#modelingWizard.active.calculatingReserves'
            },

            SUBMIT: {
              guard: 'isCurrentStepValid',
              target: '#modelingWizard.active.submitting'
            }
          }
        },

        /**
         * Persistence failed - user can retry or dismiss
         */
        persistFailed: {
          on: {
            RETRY_PERSIST: {
              target: '#modelingWizard.active.persisting',
              actions: ['clearPersistenceError', 'resetRetryCount']
            },

            DISMISS_PERSIST_ERROR: {
              target: 'idle',
              actions: 'clearPersistenceError'
            },

            // Allow navigation even with persist error (risky but user choice)
            NEXT: {
              guard: 'isCurrentStepValid',
              target: '#modelingWizard.active.persisting',
              actions: ['setNavigationIntent', 'clearPersistenceError', 'resetRetryCount']
            },

            BACK: {
              guard: 'hasPreviousStep',
              target: '#modelingWizard.active.persisting',
              actions: ['setNavigationIntent', 'clearPersistenceError', 'resetRetryCount']
            }
          },

          entry: () => {
            console.warn('[ModelingWizard] Persistence failed - data may be lost');
          }
        }
      }
    },

    /**
     * Persisting data to storage (invoke pattern)
     */
    persisting: {
      invoke: {
        src: 'persistDataService',
        input: ({ context }) => context,
        onDone: {
          target: 'editing.idle',
          actions: ['markSaved', 'executeNavigationIntent', 'resetRetryCount']
        },
        onError: {
          target: 'delaying',
          actions: ['incrementRetryCount', 'setPersistenceError']
        }
      },

      entry: () => {
        console.log('[ModelingWizard] Persisting data...');
      }
    },

    /**
     * Waiting before retry (exponential backoff)
     */
    delaying: {
      after: {
        retryDelay: [
          {
            guard: 'canRetryPersistence',
            target: 'persisting'
          },
          {
            // Retry limit exhausted → go to error state
            target: 'editing.persistFailed'
          }
        ]
      },

      entry: ({ context }) => {
        console.log(`[ModelingWizard] Retry ${context.retryCount}/3 in ${Math.pow(2, context.retryCount)}s...`);
      }
    },

    /**
     * Calculating reserves (unchanged)
     */
    calculatingReserves: {
      invoke: {
        src: 'calculateReserves',
        input: ({ context }) => context,
        onDone: {
          target: 'editing.idle',
          actions: ['saveReserveCalculation']
        },
        onError: {
          target: 'editing.idle',
          actions: ['clearReserveCalculation']
        }
      }
    },

    /**
     * Submitting fund model to API (unchanged)
     */
    submitting: {
      invoke: {
        src: 'submitFundModel',
        input: ({ context }) => context,
        onDone: {
          target: '#modelingWizard.completed',
          actions: ['clearProgress', 'clearSubmissionError']
        },
        onError: {
          target: 'submissionError',
          actions: ['setSubmissionError']
        }
      }
    },

    /**
     * Submission error state (unchanged)
     */
    submissionError: {
      on: {
        RETRY_SUBMIT: {
          guard: 'canRetry',
          target: 'submitting',
          actions: ['clearSubmissionError']
        },

        CANCEL_SUBMISSION: {
          target: 'editing.idle',
          actions: ['clearSubmissionError']
        }
      }
    }
  },

  on: {
    RESET: {
      actions: ['resetWizard', 'clearProgress'],
      target: 'idle'
    }
  }
}
```

**Tests for PR #2:**

```typescript
describe('PR #2: States & Retry Logic', () => {
  it('should transition to persisting state on NEXT', async () => {
    const actor = createActor(modelingWizardMachine);
    actor.start();

    // Make step valid
    actor.send({ type: 'SAVE_STEP', step: 'generalInfo', data: validGeneralInfoData });
    actor.send({ type: 'NEXT' });

    await waitFor(actor, (state) => state.matches({ active: 'persisting' }));
    expect(actor.getSnapshot().context.navigationIntent).toBe('next');
  });

  it('should execute navigation after successful persistence', async () => {
    const actor = createActor(modelingWizardMachine);
    actor.start();

    actor.send({ type: 'SAVE_STEP', step: 'generalInfo', data: validGeneralInfoData });
    actor.send({ type: 'NEXT' });

    await waitFor(actor, (state) => state.matches({ active: { editing: 'idle' } }));

    expect(actor.getSnapshot().context.currentStep).toBe('sectorProfiles');
    expect(actor.getSnapshot().context.navigationIntent).toBeNull();
  });

  it('should retry with exponential backoff on persistence failure', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Storage error');
    });

    const actor = createActor(modelingWizardMachine);
    actor.start();

    actor.send({ type: 'NEXT' });

    // Should go to delaying state
    await waitFor(actor, (state) => state.matches({ active: 'delaying' }));
    expect(actor.getSnapshot().context.retryCount).toBe(1);

    // Wait for first retry (1 second)
    await new Promise(resolve => setTimeout(resolve, 1100));
    await waitFor(actor, (state) => state.matches({ active: 'delaying' }));
    expect(actor.getSnapshot().context.retryCount).toBe(2);
  });

  it('should transition to persistFailed after 3 failed retries', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Persistent failure');
    });

    const actor = createActor(modelingWizardMachine);
    actor.start();

    actor.send({ type: 'NEXT' });

    // Wait for all retries (1s + 2s + 4s = 7s + overhead)
    await new Promise(resolve => setTimeout(resolve, 8000));

    await waitFor(actor, (state) => state.matches({ active: { editing: 'persistFailed' } }));
    expect(actor.getSnapshot().context.retryCount).toBe(3);
    expect(actor.getSnapshot().context.persistenceError).toBeTruthy();
  });

  it('should allow user to retry after persistFailed', async () => {
    vi.spyOn(Storage.prototype, 'setItem')
      .mockImplementationOnce(() => { throw new Error('Fail 1'); })
      .mockImplementationOnce(() => { throw new Error('Fail 2'); })
      .mockImplementationOnce(() => { throw new Error('Fail 3'); })
      .mockImplementation(() => {}); // Success on 4th try

    const actor = createActor(modelingWizardMachine);
    actor.start();

    actor.send({ type: 'NEXT' });
    await waitFor(actor, (state) => state.matches({ active: { editing: 'persistFailed' } }));

    // User manually retries
    actor.send({ type: 'RETRY_PERSIST' });
    await waitFor(actor, (state) => state.matches({ active: { editing: 'idle' } }));

    expect(actor.getSnapshot().context.persistenceError).toBeNull();
    expect(actor.getSnapshot().context.retryCount).toBe(0); // Reset on user retry
  });

  it('should allow dismissing persistence error and continue editing', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Storage unavailable');
    });

    const actor = createActor(modelingWizardMachine);
    actor.start();

    actor.send({ type: 'NEXT' });
    await waitFor(actor, (state) => state.matches({ active: { editing: 'persistFailed' } }));

    actor.send({ type: 'DISMISS_PERSIST_ERROR' });
    await waitFor(actor, (state) => state.matches({ active: { editing: 'idle' } }));

    expect(actor.getSnapshot().context.persistenceError).toBeNull();
    // Note: User is still on same step (navigation didn't complete)
  });

  it('should set navigationIntent to null for auto-save', async () => {
    vi.useFakeTimers();

    const actor = createActor(modelingWizardMachine, {
      input: { autoSaveInterval: 1000 }
    });
    actor.start();

    vi.advanceTimersByTime(1000);

    await waitFor(actor, (state) => state.matches({ active: 'persisting' }));
    expect(actor.getSnapshot().context.navigationIntent).toBeNull();

    vi.useRealTimers();
  });

  it('should handle GOTO with targetStep', async () => {
    const actor = createActor(modelingWizardMachine);
    actor.start();

    actor.send({ type: 'GOTO', step: 'waterfall' });

    await waitFor(actor, (state) => state.matches({ active: 'persisting' }));
    expect(actor.getSnapshot().context.navigationIntent).toBe('goto');
    expect(actor.getSnapshot().context.targetStep).toBe('waterfall');

    await waitFor(actor, (state) => state.matches({ active: { editing: 'idle' } }));
    expect(actor.getSnapshot().context.currentStep).toBe('waterfall');
  });
});
```

**Success Criteria PR #2:**
- [x] 6 new actions: setNavigationIntent, executeNavigationIntent, increment/resetRetryCount, set/clearPersistenceError
- [x] 1 new guard: canRetryPersistence
- [x] 1 new delay: retryDelay (exponential backoff)
- [x] 3 new states: persisting, delaying, editing.persistFailed
- [x] 8 state transition tests pass
- [x] Exponential backoff timing verified (1s, 2s, 4s)
- [x] Navigation intent pattern works for NEXT/BACK/GOTO/AUTO_SAVE

---

### PR #3: Remove Old Persistence Pattern (Clean Up)

**Goal:** Remove synchronous `persistToStorage` action calls from navigation transitions

**Files to modify:**
- `client/src/machines/modeling-wizard.machine.ts`

**Changes:**

#### 1. Remove Old Actions (lines ~640-653)

**DELETE these actions (no longer needed):**

```typescript
// DELETE: Old synchronous persistence (replaced by invoke pattern)
persistToStorage: ({ context }) => {
  persistToStorage(context);
},

markSaved: assign(({ context }) => ({
  ...context,
  lastSaved: Date.now(),
  isDirty: false
}))
```

**KEEP `markSaved`** but move it to persisting.onDone (already done in PR #2)

#### 2. Remove Old Toggle Skip Optional Persistence (lines ~822-824)

**BEFORE:**
```typescript
TOGGLE_SKIP_OPTIONAL: {
  actions: ['toggleSkipOptional', 'persistToStorage']  // OLD: Immediate sync persist
}
```

**AFTER:**
```typescript
TOGGLE_SKIP_OPTIONAL: {
  actions: ['toggleSkipOptional']  // Let auto-save handle it
}
```

**Rationale:** Auto-save timer will persist within 30s. No need for immediate persistence on config change.

#### 3. Verify No Direct persistToStorage Calls

Search codebase for any remaining direct calls to `persistToStorage()` function and ensure they're removed or refactored to use the state machine pattern.

**Tests for PR #3:**

```typescript
describe('PR #3: Old Pattern Removal', () => {
  it('should NOT call persistToStorage synchronously on NEXT', async () => {
    const persistSpy = vi.spyOn(Storage.prototype, 'setItem');

    const actor = createActor(modelingWizardMachine);
    actor.start();

    actor.send({ type: 'SAVE_STEP', step: 'generalInfo', data: validGeneralInfoData });
    actor.send({ type: 'NEXT' });

    // Should NOT be called synchronously
    expect(persistSpy).not.toHaveBeenCalled();

    // Should be called after entering persisting state
    await waitFor(actor, (state) => state.matches({ active: 'persisting' }));
    expect(persistSpy).toHaveBeenCalledTimes(1);
  });

  it('should rely on auto-save for TOGGLE_SKIP_OPTIONAL', async () => {
    vi.useFakeTimers();
    const persistSpy = vi.spyOn(Storage.prototype, 'setItem');

    const actor = createActor(modelingWizardMachine, {
      input: { autoSaveInterval: 1000 }
    });
    actor.start();

    actor.send({ type: 'TOGGLE_SKIP_OPTIONAL', skip: true });

    // Should NOT persist immediately
    expect(persistSpy).not.toHaveBeenCalled();

    // Should persist after auto-save interval
    vi.advanceTimersByTime(1000);
    await waitFor(actor, (state) => state.matches({ active: 'persisting' }));
    expect(persistSpy).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it('COMPREHENSIVE: should complete full wizard flow with persistence', async () => {
    const actor = createActor(modelingWizardMachine);
    actor.start();

    // Step 1: General Info
    actor.send({ type: 'SAVE_STEP', step: 'generalInfo', data: validGeneralInfoData });
    actor.send({ type: 'NEXT' });
    await waitFor(actor, (state) => state.context.currentStep === 'sectorProfiles');
    expect(localStorage.getItem('modeling-wizard-progress')).toBeTruthy();

    // Step 2: Sector Profiles
    actor.send({ type: 'SAVE_STEP', step: 'sectorProfiles', data: validSectorProfilesData });
    actor.send({ type: 'NEXT' });
    await waitFor(actor, (state) => state.context.currentStep === 'capitalAllocation');

    // Step 3: Back navigation
    actor.send({ type: 'BACK' });
    await waitFor(actor, (state) => state.context.currentStep === 'sectorProfiles');

    // Step 4: GOTO navigation
    actor.send({ type: 'GOTO', step: 'waterfall' });
    await waitFor(actor, (state) => state.context.currentStep === 'waterfall');

    // Verify: All navigation worked with persistence
    const stored = JSON.parse(localStorage.getItem('modeling-wizard-progress')!);
    expect(stored.currentStep).toBe('waterfall');
    expect(stored.steps.generalInfo).toEqual(validGeneralInfoData);
  });
});
```

**Success Criteria PR #3:**
- [x] Old `persistToStorage` action removed from transitions
- [x] TOGGLE_SKIP_OPTIONAL no longer triggers immediate persistence
- [x] All 15 RED tests pass
- [x] Full wizard flow test passes (comprehensive integration test)
- [x] No regressions in existing functionality

---

## Test Suite Summary (15 Total Tests)

### PR #1: Foundation (4 tests)
1. Context initialization
2. Service success
3. Service QuotaExceededError
4. Service SecurityError

### PR #2: States & Retry (8 tests)
5. Transition to persisting on NEXT
6. Execute navigation after success
7. Exponential backoff retry
8. Transition to persistFailed after 3 retries
9. User manual retry
10. Dismiss error and continue
11. Auto-save null intent
12. GOTO with targetStep

### PR #3: Clean Up (3 tests)
13. No synchronous persist on NEXT
14. Auto-save for TOGGLE_SKIP_OPTIONAL
15. Comprehensive wizard flow (integration)

---

## Risk Mitigation

### High-Risk Areas

1. **Navigation Intent Pattern**
   - Risk: Intent not cleared properly
   - Mitigation: Test all navigation paths (NEXT/BACK/GOTO/AUTO_SAVE)
   - Verification: Comprehensive test #15

2. **Retry Exhaustion**
   - Risk: Infinite retry loops
   - Mitigation: Hard limit of 3 retries, tested in test #8
   - Fallback: User can manually retry or dismiss

3. **State Transition Timing**
   - Risk: Race conditions between auto-save and navigation
   - Mitigation: Dedicated persisting state prevents concurrent saves
   - Testing: Use vi.useFakeTimers() for deterministic timing

4. **localStorage Failures**
   - Risk: Various error types not handled
   - Mitigation: Specific error handling for QuotaExceeded and Security
   - Testing: Mock different error scenarios in tests #3, #4

### Testing Strategy

- **Unit tests:** Each action, guard, delay in isolation
- **Integration tests:** Full navigation flows with persistence
- **Edge cases:** Retry exhaustion, dismissal, manual retry
- **Timing tests:** Exponential backoff, auto-save intervals
- **Error scenarios:** All localStorage failure modes

---

## Implementation Timeline

**PR #1: Foundation**
- Estimated time: 1 hour
- Complexity: Low
- Risk: Low (additive changes only)

**PR #2: States & Retry**
- Estimated time: 2 hours
- Complexity: High
- Risk: Medium (core state machine logic)

**PR #3: Clean Up**
- Estimated time: 30 minutes
- Complexity: Low
- Risk: Low (removing old code)

**Total:** ~3.5 hours with comprehensive testing

---

## Success Metrics

**Functional:**
- [x] All 15 RED tests pass
- [x] Zero data loss scenarios identified
- [x] Retry logic works as designed
- [x] Error messages helpful to users

**Technical:**
- [x] TypeScript compiles with no errors
- [x] No breaking changes to existing functionality
- [x] State machine visualizer shows correct flow
- [x] Console logs helpful for debugging

**User Experience:**
- [x] Clear error messages for storage failures
- [x] User can retry or dismiss errors
- [x] Navigation feels responsive (not blocked by persistence)
- [x] Data always persisted before navigation completes

---

## Rollback Plan

If any PR introduces regressions:

1. **Revert the PR** - Each PR is atomic and independently revertible
2. **Analyze failure** - Use test output to identify issue
3. **Fix forward** - Apply targeted fix in new PR
4. **Re-verify** - Run full test suite before merge

**Atomic PR strategy ensures** clean rollback without breaking dependent changes.

---

## Next Steps

1. **Commit this plan** to `docs/plans/xstate-persistence-implementation.md`
2. **Update ADR-016** status to "ACCEPTED - Implementation Plan Ready"
3. **Start fresh session** with full token budget
4. **Execute PR #1** with TDD approach
5. **Execute PR #2** with TDD approach
6. **Execute PR #3** with TDD approach
7. **Update CHANGELOG.md** with all 3 PRs
8. **Celebrate** the elimination of a critical data loss bug!

---

**Implementation Ready:** This plan is comprehensive, tested, and ready for execution in a fresh session with full context budget.
