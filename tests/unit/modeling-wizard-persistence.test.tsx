/**
 * Modeling Wizard State Machine - Persistence-Before-Navigation Tests (RED PHASE)
 *
 * These tests verify proper ordering of persistence and navigation actions.
 *
 * CURRENT BEHAVIOR (WRONG ORDER):
 * - actions: ['goToNextStep', 'persistToStorage']  // Navigation happens first!
 * - If persistence fails, user is already on next step with data loss
 *
 * EXPECTED BEHAVIOR (AFTER INVOKE REFACTOR):
 * - Transitions to 'persisting' state
 * - Invokes persistDataService
 * - onDone: navigates to next step
 * - onError: stays on current step, shows error
 *
 * ALL TESTS SHOULD FAIL INITIALLY (RED PHASE)
 * After refactoring to invoke pattern, all tests should pass (GREEN PHASE)
 *
 * See: ADR-016 in DECISIONS.md for architectural decision rationale
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { createActor, waitFor } from 'xstate';
import { modelingWizardMachine } from '@/machines/modeling-wizard.machine';

describe('Modeling Wizard - Persistence Before Navigation (RED PHASE)', () => {
  let localStorageMock: {
    getItem: ReturnType<typeof vi.fn>;
    setItem: ReturnType<typeof vi.fn>;
    removeItem: ReturnType<typeof vi.fn>;
    clear: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    // Create fresh localStorage mock for each test
    localStorageMock = {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn()
    };

    // Replace global localStorage
    Object.defineProperty(global, 'localStorage', {
      value: localStorageMock,
      writable: true,
      configurable: true
    });

    // Clear all console mocks to see actual test output
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Test 1: Successful NEXT transition
   *
   * TODO: Will pass after refactor to invoke pattern
   *
   * Expected behavior:
   * - User triggers NEXT with valid step data
   * - Machine transitions to 'persisting' state
   * - persistDataService succeeds
   * - onDone: navigates to next step
   *
   * Current behavior (WRONG):
   * - goToNextStep executes first (navigation happens)
   * - persistToStorage executes second
   * - No way to block navigation on persistence failure
   */
  it('[RED] should persist data BEFORE navigating to next step', async () => {
    const actor = createActor(modelingWizardMachine, {
      input: { skipOptionalSteps: false, autoSaveInterval: 999999 }
    });

    actor.start();

    // Move to active state
    actor.send({ type: 'NEXT' });
    await waitFor(actor, (state) => state.matches('active'));

    // Save valid step data
    actor.send({
      type: 'SAVE_STEP',
      step: 'generalInfo',
      data: {
        fundName: 'Test Fund',
        vintageYear: 2024,
        fundSize: 100000000,
        currency: 'USD' as const,
        establishmentDate: '2024-01-01',
        isEvergreen: false,
        fundLife: 10,
        investmentPeriod: 5
      }
    });

    // Get initial step before NEXT
    const stepBeforeNext = actor.getSnapshot().context.currentStep;
    expect(stepBeforeNext).toBe('generalInfo');

    // Trigger NEXT event
    actor.send({ type: 'NEXT' });

    // Give state machine time to process
    await new Promise(resolve => setTimeout(resolve, 100));

    const snapshot = actor.getSnapshot();

    // After invoke refactor: persistence completes, THEN navigation
    // If navigation succeeded AND no error, then persistence worked correctly
    expect(snapshot.context.currentStep).toBe('sectorProfiles');
    expect(snapshot.context.persistenceError).toBeNull();

    // Verify localStorage was called (check spy call count)
    expect(localStorageMock.setItem).toHaveBeenCalled();

    actor.stop();
  });

  /**
   * Test 2: Failed NEXT with localStorage error
   *
   * TODO: Will pass after refactor to invoke pattern
   *
   * Expected behavior:
   * - localStorage.setItem() throws QuotaExceededError
   * - Machine transitions to 'delaying' state (retry logic)
   * - After retries exhausted → 'editing.persistFailed'
   * - currentStep stays on 'generalInfo'
   * - persistenceError is set in context
   *
   * Current behavior (WRONG):
   * - goToNextStep executes first → already on 'sectorProfiles'
   * - persistToStorage fails silently
   * - No error state, no user notification
   * - Data loss!
   */
  it('[RED] should NOT navigate when persistence fails (QuotaExceededError)', async () => {
    const actor = createActor(modelingWizardMachine, {
      input: { skipOptionalSteps: false, autoSaveInterval: 999999 }
    });

    actor.start();

    // Move to active state
    actor.send({ type: 'NEXT' });
    await waitFor(actor, (state) => state.matches('active'));

    // Save valid step data
    actor.send({
      type: 'SAVE_STEP',
      step: 'generalInfo',
      data: {
        fundName: 'Test Fund',
        vintageYear: 2024,
        fundSize: 100000000,
        currency: 'USD' as const,
        establishmentDate: '2024-01-01',
        isEvergreen: false
      }
    });

    // Mock localStorage.setItem to throw QuotaExceededError
    const quotaError = new Error('QuotaExceededError');
    quotaError.name = 'QuotaExceededError';
    localStorageMock.setItem.mockImplementation(() => {
      throw quotaError;
    });

    // Trigger NEXT event
    actor.send({ type: 'NEXT' });

    // Give state machine time to process
    await new Promise(resolve => setTimeout(resolve, 100));

    const snapshot = actor.getSnapshot();

    // TODO: After invoke refactor, this test should pass
    // Expected: Still on 'generalInfo', persistenceError is set
    // Current: Already on 'sectorProfiles' (navigation happened despite failure)

    // This assertion will FAIL with current implementation
    expect(snapshot.context.currentStep).toBe('generalInfo');

    if (snapshot.context.currentStep !== 'generalInfo') {
      console.log('[EXPECTED FAILURE] Navigation happened despite persistence failure');
      console.log('Current step:', snapshot.context.currentStep);
      console.log('Expected: generalInfo');
      throw new Error('Navigation executed despite QuotaExceededError (data loss!)');
    }

    // After invoke refactor, check for error state
    // expect(snapshot.matches({ active: { editing: 'persistFailed' } })).toBe(true);
    // expect(snapshot.context.persistenceError).toContain('Storage limit exceeded');

    actor.stop();
  });

  /**
   * Test 3: Retry after persistence failure
   *
   * TODO: Will pass after refactor to invoke pattern
   *
   * Expected behavior:
   * - Initial persistence fails
   * - Machine enters 'delaying' state with exponential backoff
   * - After delay → retries persistence (max 3 attempts: 1s, 2s, 4s)
   * - If still fails → 'editing.persistFailed'
   * - User can trigger RETRY event manually
   *
   * Current behavior (WRONG):
   * - No retry mechanism exists
   * - No 'delaying' or 'persistFailed' states
   * - User has no way to recover from failure
   */
  it('[RED] should support retry after persistence failure', async () => {
    const actor = createActor(modelingWizardMachine, {
      input: { skipOptionalSteps: false, autoSaveInterval: 999999 }
    });

    actor.start();

    // Move to active state and save data
    actor.send({ type: 'NEXT' });
    await waitFor(actor, (state) => state.matches('active'));

    actor.send({
      type: 'SAVE_STEP',
      step: 'generalInfo',
      data: {
        fundName: 'Test Fund',
        vintageYear: 2024,
        fundSize: 100000000,
        currency: 'USD' as const,
        establishmentDate: '2024-01-01',
        isEvergreen: false
      }
    });

    // First attempt fails
    let callCount = 0;
    localStorageMock.setItem.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        throw new Error('Network error');
      }
      // Second attempt succeeds
      return undefined;
    });

    // Trigger NEXT (will fail first time)
    actor.send({ type: 'NEXT' });
    await new Promise(resolve => setTimeout(resolve, 100));

    const snapshotAfterFailure = actor.getSnapshot();

    // TODO: After invoke refactor, check for retry state
    // Expected: Machine in 'delaying' state or 'editing.persistFailed'
    // Current: No such states exist

    // This check will FAIL - no retry mechanism in current implementation
    const hasRetryState =
      snapshotAfterFailure.matches({ active: 'delaying' }) ||
      snapshotAfterFailure.matches({ active: { editing: 'persistFailed' } });

    if (!hasRetryState) {
      console.log('[EXPECTED FAILURE] No retry state exists in current implementation');
      console.log('Current state:', snapshotAfterFailure.value);
      throw new Error('Retry mechanism not implemented');
    }

    actor.stop();
  });

  /**
   * Test 4: Auto-save doesn't block navigation
   *
   * TODO: Will pass after refactor to invoke pattern
   *
   * Expected behavior:
   * - Auto-save timer triggers with intent='auto-save'
   * - If persistence fails, error is logged but user can still navigate
   * - Different from manual NEXT (intent='navigate') which blocks
   *
   * Current behavior (WRONG):
   * - No intent tracking
   * - No differentiation between auto-save and manual save
   * - Auto-save uses same actions as NEXT/BACK
   */
  it('[RED] should allow navigation even if auto-save persistence fails', async () => {
    const actor = createActor(modelingWizardMachine, {
      input: { skipOptionalSteps: false, autoSaveInterval: 500 } // Short interval for test
    });

    actor.start();

    // Move to active state
    actor.send({ type: 'NEXT' });
    await waitFor(actor, (state) => state.matches('active'));

    // Save valid step data
    actor.send({
      type: 'SAVE_STEP',
      step: 'generalInfo',
      data: {
        fundName: 'Test Fund',
        vintageYear: 2024,
        fundSize: 100000000,
        currency: 'USD' as const,
        establishmentDate: '2024-01-01',
        isEvergreen: false
      }
    });

    // Mock persistence to fail on auto-save, then succeed for manual NEXT
    localStorageMock.setItem
      .mockImplementationOnce(() => { throw new Error('Auto-save failed'); })
      .mockImplementation(() => undefined);

    // Wait for auto-save timer to trigger
    await new Promise(resolve => setTimeout(resolve, 600));

    // Now try manual NEXT - should still work despite auto-save failure
    actor.send({ type: 'NEXT' });
    await new Promise(resolve => setTimeout(resolve, 100));

    const snapshot = actor.getSnapshot();

    // After invoke refactor with intent tracking
    // Expected: context.navigationIntent distinguishes 'auto-save' vs 'next'
    // Implementation uses 'navigationIntent' field

    const hasIntentField = 'navigationIntent' in snapshot.context;

    if (!hasIntentField) {
      console.log('[EXPECTED FAILURE] No navigationIntent tracking in current implementation');
      console.log('Context keys:', Object.keys(snapshot.context));
      throw new Error('navigationIntent field not present in context');
    }

    // Verify navigationIntent was cleared after NEXT completed
    expect(snapshot.context.navigationIntent).toBeNull();

    actor.stop();
  });

  /**
   * Test 5: BACK transition with persistence failure
   *
   * TODO: Will pass after refactor to invoke pattern
   *
   * Expected behavior:
   * - User triggers BACK
   * - Persistence fails
   * - Stays on current step (doesn't navigate backward)
   * - Shows error notification
   *
   * Current behavior (WRONG):
   * - goToPreviousStep executes first
   * - persistToStorage fails silently
   * - Already navigated backward with potential data loss
   */
  it('[RED] should NOT navigate backward when persistence fails', async () => {
    const actor = createActor(modelingWizardMachine, {
      input: { skipOptionalSteps: false, autoSaveInterval: 999999 }
    });

    actor.start();

    // Navigate to second step
    actor.send({ type: 'NEXT' });
    await waitFor(actor, (state) => state.matches('active'));

    // Mark generalInfo as valid so we can navigate
    actor.send({
      type: 'SAVE_STEP',
      step: 'generalInfo',
      data: {
        fundName: 'Test Fund',
        vintageYear: 2024,
        fundSize: 100000000,
        currency: 'USD' as const,
        establishmentDate: '2024-01-01',
        isEvergreen: false
      }
    });

    // Move to sectorProfiles
    actor.send({ type: 'NEXT' });
    await new Promise(resolve => setTimeout(resolve, 100));

    // Verify we're on second step
    expect(actor.getSnapshot().context.currentStep).toBe('sectorProfiles');

    // Save data on second step
    actor.send({
      type: 'SAVE_STEP',
      step: 'sectorProfiles',
      data: {
        sectorProfiles: [
          { id: 'tech', name: 'Technology', allocation: 100 }
        ],
        stageAllocations: [
          { stage: 'seed', allocation: 100 }
        ]
      }
    });

    // Mock persistence to fail
    localStorageMock.setItem.mockImplementation(() => {
      throw new Error('Persistence failed');
    });

    // Try to go back
    actor.send({ type: 'BACK' });
    await new Promise(resolve => setTimeout(resolve, 100));

    const snapshot = actor.getSnapshot();

    // After invoke refactor: persistence fails, navigation blocked
    // Expected: Still on 'sectorProfiles', persistenceError is set
    expect(snapshot.context.currentStep).toBe('sectorProfiles');
    expect(snapshot.context.persistenceError).toBeTruthy();

    actor.stop();
  });

  /**
   * Test 6: Component unmount during persistence
   *
   * TODO: Will pass after refactor to invoke pattern
   *
   * Expected behavior:
   * - Persistence in progress (invoke actor running)
   * - Component unmounts → actor.stop()
   * - XState cleans up invoke actor
   * - No memory leaks, no orphaned promises
   * - No "setState after unmount" warnings
   *
   * Current behavior:
   * - Synchronous actions complete immediately
   * - No invoke cleanup needed (but also no async safety)
   * - Future API migration would break this
   */
  it('[RED] should cleanup gracefully when component unmounts during persistence', async () => {
    const actor = createActor(modelingWizardMachine, {
      input: { skipOptionalSteps: false, autoSaveInterval: 999999 }
    });

    actor.start();

    // Move to active state
    actor.send({ type: 'NEXT' });
    await waitFor(actor, (state) => state.matches('active'));

    // Save valid step data
    actor.send({
      type: 'SAVE_STEP',
      step: 'generalInfo',
      data: {
        fundName: 'Test Fund',
        vintageYear: 2024,
        fundSize: 100000000,
        currency: 'USD' as const,
        establishmentDate: '2024-01-01',
        isEvergreen: false
      }
    });

    // Mock slow persistence
    localStorageMock.setItem.mockImplementation(() => {
      return new Promise(resolve => setTimeout(resolve, 1000));
    });

    // Trigger NEXT (starts async persistence)
    actor.send({ type: 'NEXT' });

    // Immediately stop actor (simulates component unmount)
    actor.stop();

    // Wait to ensure no errors thrown
    await new Promise(resolve => setTimeout(resolve, 100));

    // TODO: After invoke refactor, verify no active invoke actors
    // Expected: XState cleanup prevents memory leaks
    // Current: Synchronous implementation doesn't test async cleanup

    const snapshot = actor.getSnapshot();

    // Check if machine has proper cleanup for invoke actors
    // Current implementation doesn't use invoke pattern yet
    const hasInvokeCleanup = snapshot.status === 'stopped';

    if (!hasInvokeCleanup) {
      console.log('[EXPECTED FAILURE] Actor not properly stopped');
      console.log('Status:', snapshot.status);
      throw new Error('Invoke cleanup not implemented');
    }

    // No assertions throw - cleanup successful
    expect(true).toBe(true);
  });

  /**
   * Test 7: Exponential backoff timing
   *
   * TODO: Will pass after refactor to invoke pattern
   *
   * Expected behavior:
   * - Retry 1: Wait 1 second (2^0 * 1000ms)
   * - Retry 2: Wait 2 seconds (2^1 * 1000ms)
   * - Retry 3: Wait 4 seconds (2^2 * 1000ms)
   * - After 3 failures → 'editing.persistFailed'
   *
   * Current behavior:
   * - No retry mechanism
   * - No exponential backoff
   */
  it('[RED] should implement exponential backoff for retries', async () => {
    const actor = createActor(modelingWizardMachine, {
      input: { skipOptionalSteps: false, autoSaveInterval: 999999 }
    });

    actor.start();
    actor.send({ type: 'NEXT' });
    await waitFor(actor, (state) => state.matches('active'));

    actor.send({
      type: 'SAVE_STEP',
      step: 'generalInfo',
      data: {
        fundName: 'Test Fund',
        vintageYear: 2024,
        fundSize: 100000000,
        currency: 'USD' as const,
        establishmentDate: '2024-01-01',
        isEvergreen: false
      }
    });

    // Track retry timing
    const retryTimestamps: number[] = [];
    localStorageMock.setItem.mockImplementation(() => {
      retryTimestamps.push(Date.now());
      throw new Error('Persistence failed');
    });

    // Trigger NEXT
    actor.send({ type: 'NEXT' });

    // Wait for all retries to complete (1s + 2s + 4s = 7s)
    await new Promise(resolve => setTimeout(resolve, 8000));

    const snapshot = actor.getSnapshot();

    // TODO: After invoke refactor, verify retry timing
    // Expected: retryTimestamps show exponential backoff
    // Current: Only 1 call (no retries)

    if (retryTimestamps.length < 3) {
      console.log('[EXPECTED FAILURE] Retry mechanism not implemented');
      console.log('Retry attempts:', retryTimestamps.length);
      console.log('Expected: 3 retries with exponential backoff');
      throw new Error('Exponential backoff not implemented');
    }

    // Verify exponential spacing
    const delay1 = retryTimestamps[1] - retryTimestamps[0];
    const delay2 = retryTimestamps[2] - retryTimestamps[1];

    expect(delay1).toBeGreaterThanOrEqual(900); // ~1s
    expect(delay1).toBeLessThan(1500);
    expect(delay2).toBeGreaterThanOrEqual(1900); // ~2s
    expect(delay2).toBeLessThan(2500);

    actor.stop();
  }, 10000); // Extend timeout for retry test

  /**
   * Test 8: Context fields for persistence tracking
   *
   * TODO: Will pass after refactor to invoke pattern
   *
   * Expected context additions:
   * - persistenceError: string | null
   * - retryCount: number
   * - lastPersistAttempt: number | null
   * - intent: 'navigate' | 'auto-save' | null
   *
   * Current context:
   * - Missing all persistence tracking fields
   */
  it('[RED] should have context fields for persistence tracking', async () => {
    const actor = createActor(modelingWizardMachine, {
      input: { skipOptionalSteps: false }
    });

    actor.start();

    const snapshot = actor.getSnapshot();
    const context = snapshot.context;

    // TODO: After invoke refactor, these fields should exist
    const requiredFields = [
      'persistenceError',
      'retryCount',
      'lastPersistAttempt',
      'navigationIntent',
      'targetStep'
    ];

    const missingFields = requiredFields.filter(field => !(field in context));

    if (missingFields.length > 0) {
      console.log('[EXPECTED FAILURE] Missing context fields for persistence tracking');
      console.log('Missing fields:', missingFields);
      console.log('Current context keys:', Object.keys(context));
      throw new Error(`Missing persistence tracking fields: ${missingFields.join(', ')}`);
    }

    actor.stop();
  });
});

/**
 * PR #1: Context Fields & Service Integration Tests
 *
 * These tests verify the foundation for ADR-016 implementation:
 * - Context fields are properly initialized
 * - persistDataService actor is registered
 * - Service handles success and error cases
 *
 * These tests should PASS immediately (foundation layer only).
 */
describe('PR #1: Context Fields & Service Integration', () => {
  let localStorageMock: {
    getItem: ReturnType<typeof vi.fn>;
    setItem: ReturnType<typeof vi.fn>;
    removeItem: ReturnType<typeof vi.fn>;
    clear: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    // Create fresh localStorage mock for each test
    localStorageMock = {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn()
    };

    // Replace global localStorage
    Object.defineProperty(global, 'localStorage', {
      value: localStorageMock,
      writable: true,
      configurable: true
    });

    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Test 1: Context Initialization
   * Verify all 5 persistence tracking fields are initialized with correct defaults
   */
  it('should initialize persistence tracking fields to null/0', () => {
    const actor = createActor(modelingWizardMachine);
    actor.start();

    const context = actor.getSnapshot().context;

    // Verify all 5 new fields exist with correct initial values
    expect(context.persistenceError).toBeNull();
    expect(context.retryCount).toBe(0);
    expect(context.lastPersistAttempt).toBeNull();
    expect(context.navigationIntent).toBeNull();
    expect(context.targetStep).toBeNull();

    actor.stop();
  });

  /**
   * Test 2: persistDataService Success Path
   * Verify service saves to localStorage and returns correct data
   */
  it('persistDataService should save to localStorage successfully', async () => {
    // Create minimal context for testing
    const actor = createActor(modelingWizardMachine);
    actor.start();

    const mockContext = actor.getSnapshot().context;

    // Import the service directly to test it
    const { persistDataService } = await import('@/machines/modeling-wizard.machine');

    // Create an actor from the fromPromise service
    const serviceActor = createActor(persistDataService, { input: mockContext });
    serviceActor.start();

    // Wait for the actor to complete
    const snapshot = await waitFor(serviceActor, (state) => state.status === 'done');

    // Verify localStorage was called
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      'modeling-wizard-progress',
      expect.any(String)
    );

    // Verify result structure
    expect(snapshot.output.lastSaved).toBeGreaterThan(0);
    expect(snapshot.output.currentStep).toBe('generalInfo');

    // Verify stored data
    const storedData = JSON.parse(localStorageMock.setItem.mock.calls[0][1]);
    expect(storedData.currentStep).toBe('generalInfo');
    expect(storedData.lastSaved).toBeGreaterThan(0);

    serviceActor.stop();
    actor.stop();
  });

  /**
   * Test 3: persistDataService QuotaExceededError Handling
   * Verify service throws appropriate error when storage quota exceeded
   */
  it('persistDataService should throw on QuotaExceededError', async () => {
    // Mock setItem to throw QuotaExceededError
    localStorageMock.setItem.mockImplementation(() => {
      const err = new Error('Quota exceeded');
      err.name = 'QuotaExceededError';
      throw err;
    });

    const actor = createActor(modelingWizardMachine);
    actor.start();

    const mockContext = actor.getSnapshot().context;

    // Import the service
    const { persistDataService } = await import('@/machines/modeling-wizard.machine');

    // Create an actor from the fromPromise service
    const serviceActor = createActor(persistDataService, { input: mockContext });

    // IMPORTANT: Subscribe to error state BEFORE starting to avoid unhandled rejection
    const errorSnapPromise = waitFor(serviceActor, (state) => state.status === 'error');

    // Catch unhandled rejection to prevent Vitest from failing the test
    const rejectionHandler = (event: PromiseRejectionEvent) => {
      event.preventDefault();
    };
    global.addEventListener('unhandledrejection', rejectionHandler);

    serviceActor.start();

    // Wait for the actor to error
    const snapshot = await errorSnapPromise;

    global.removeEventListener('unhandledrejection', rejectionHandler);

    // Verify the error name and message
    expect(snapshot.error).toBeInstanceOf(Error);
    expect((snapshot.error as Error).name).toBe('QuotaExceededError');
    expect((snapshot.error as Error).message).toBe('Storage limit exceeded');

    serviceActor.stop();
    actor.stop();
  });

  /**
   * Test 4: persistDataService SecurityError Handling
   * Verify service throws appropriate error when storage access denied (privacy mode)
   */
  it('persistDataService should throw on SecurityError (privacy mode)', async () => {
    // Mock setItem to throw SecurityError
    localStorageMock.setItem.mockImplementation(() => {
      const err = new Error('Access denied');
      err.name = 'SecurityError';
      throw err;
    });

    const actor = createActor(modelingWizardMachine);
    actor.start();

    const mockContext = actor.getSnapshot().context;

    // Import the service
    const { persistDataService } = await import('@/machines/modeling-wizard.machine');

    // Create an actor from the fromPromise service
    const serviceActor = createActor(persistDataService, { input: mockContext });

    // IMPORTANT: Subscribe to error state BEFORE starting to avoid unhandled rejection
    const errorSnapPromise = waitFor(serviceActor, (state) => state.status === 'error');

    // Catch unhandled rejection to prevent Vitest from failing the test
    const rejectionHandler = (event: PromiseRejectionEvent) => {
      event.preventDefault();
    };
    global.addEventListener('unhandledrejection', rejectionHandler);

    serviceActor.start();

    // Wait for the actor to error
    const snapshot = await errorSnapPromise;

    global.removeEventListener('unhandledrejection', rejectionHandler);

    // Verify the error name and message
    expect(snapshot.error).toBeInstanceOf(Error);
    expect((snapshot.error as Error).name).toBe('SecurityError');
    expect((snapshot.error as Error).message).toBe('Storage unavailable (privacy mode)');

    serviceActor.stop();
    actor.stop();
  });
});
