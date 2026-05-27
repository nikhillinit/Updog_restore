// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createActor, waitFor, type ActorRefFrom } from 'xstate';
import {
  modelingWizardMachine,
  STEP_ORDER,
  type WizardStep,
  type WizardStepDataMap,
} from '@/machines/modeling-wizard.machine';

type ModelingWizardActor = ActorRefFrom<typeof modelingWizardMachine>;

const validGeneralInfo = {
  fundName: 'Batch 5 Behavior Fund',
  vintageYear: 2024,
  fundSize: 100000000,
  currency: 'USD' as const,
  establishmentDate: '2024-01-01',
  isEvergreen: false,
  fundLife: 10,
  investmentPeriod: 5,
} satisfies WizardStepDataMap['generalInfo'];

const validSectorProfiles = {
  sectorProfiles: [{ id: 'tech', name: 'Technology', allocation: 100 }],
  stageAllocations: [{ stage: 'seed', allocation: 100 }],
} satisfies WizardStepDataMap['sectorProfiles'];

const validCapitalAllocation = {
  initialCheckSize: 500000,
  followOnStrategy: {
    reserveRatio: 0.5,
    followOnChecks: { A: 1000000, B: 2000000, C: 3000000 },
  },
  pacingModel: {
    investmentsPerYear: 10,
    deploymentCurve: 'linear' as const,
  },
} satisfies WizardStepDataMap['capitalAllocation'];

const validFeesExpenses = {
  managementFee: {
    rate: 2,
    basis: 'committed' as const,
    stepDown: { enabled: false },
  },
  adminExpenses: {
    annualAmount: 50000,
    growthRate: 3,
  },
} satisfies WizardStepDataMap['feesExpenses'];

const validScenarios: WizardStepDataMap['scenarios'] & { scenarioType: string } = {
  enabled: true,
  scenarioType: 'base',
  scenarios: [
    {
      id: 'base',
      name: 'Base Case',
      moicMultiplier: 1,
      exitTimingDelta: 0,
      lossRateDelta: 0,
      participationRateDelta: 0,
    },
  ],
};

async function startActiveActor(input: { skipOptionalSteps?: boolean } = {}) {
  const actor = createActor(modelingWizardMachine, {
    input: { autoSaveInterval: 999999, ...input },
  });

  actor.start();
  actor.send({ type: 'NEXT' });
  await waitFor(actor, (state) => state.matches('active'));

  return actor;
}

async function waitForStep(actor: ModelingWizardActor, step: WizardStep) {
  await waitFor(actor, (state) => state.context.currentStep === step);
}

async function navigateToFeesExpenses(actor: ModelingWizardActor) {
  actor.send({ type: 'SAVE_STEP', step: 'generalInfo', data: validGeneralInfo });
  actor.send({ type: 'NEXT' });
  await waitForStep(actor, 'sectorProfiles');

  actor.send({ type: 'SAVE_STEP', step: 'sectorProfiles', data: validSectorProfiles });
  actor.send({ type: 'NEXT' });
  await waitForStep(actor, 'capitalAllocation');

  actor.send({
    type: 'SAVE_STEP',
    step: 'capitalAllocation',
    data: validCapitalAllocation,
  });
  actor.send({ type: 'NEXT' });
  await waitForStep(actor, 'feesExpenses');
}

describe('modelingWizardMachine locked behavior', () => {
  let localStorageMock: {
    getItem: ReturnType<typeof vi.fn>;
    setItem: ReturnType<typeof vi.fn>;
    removeItem: ReturnType<typeof vi.fn>;
    clear: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    localStorageMock = {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    };

    Object.defineProperty(global, 'localStorage', {
      value: localStorageMock,
      writable: true,
      configurable: true,
    });

    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('starts from the expected initial state and seven-step order', () => {
    const actor = createActor(modelingWizardMachine);
    actor.start();

    const snapshot = actor.getSnapshot();

    expect(STEP_ORDER).toEqual([
      'generalInfo',
      'sectorProfiles',
      'capitalAllocation',
      'feesExpenses',
      'exitRecycling',
      'waterfall',
      'scenarios',
    ]);
    expect(snapshot.value).toBe('idle');
    expect(snapshot.context.currentStep).toBe('generalInfo');
    expect(snapshot.context.currentStepIndex).toBe(0);
    expect(snapshot.context.totalSteps).toBe(7);
    expect(snapshot.context.visitedSteps).toEqual(new Set(['generalInfo']));
    expect(snapshot.context.completedSteps).toEqual(new Set());
    expect(snapshot.context.isStepValid.exitRecycling).toBe(true);

    actor.stop();
  });

  it('keeps NEXT, BACK, and GOTO navigation behind successful persistence', async () => {
    const actor = await startActiveActor();

    actor.send({ type: 'BACK' });
    expect(actor.getSnapshot().context.currentStep).toBe('generalInfo');

    actor.send({ type: 'SAVE_STEP', step: 'generalInfo', data: validGeneralInfo });
    actor.send({ type: 'NEXT' });
    await waitForStep(actor, 'sectorProfiles');

    expect(actor.getSnapshot().context.completedSteps.has('generalInfo')).toBe(true);
    expect(actor.getSnapshot().context.visitedSteps.has('sectorProfiles')).toBe(true);

    actor.send({ type: 'BACK' });
    await waitForStep(actor, 'generalInfo');

    actor.send({ type: 'GOTO', step: 'capitalAllocation' });
    await waitForStep(actor, 'capitalAllocation');

    expect(actor.getSnapshot().context.currentStepIndex).toBe(2);
    expect(actor.getSnapshot().context.visitedSteps.has('capitalAllocation')).toBe(true);
    expect(localStorageMock.setItem).toHaveBeenCalled();

    actor.stop();
  });

  it('skips only the optional exit recycling step when configured', async () => {
    const standardActor = await startActiveActor({ skipOptionalSteps: false });
    await navigateToFeesExpenses(standardActor);

    standardActor.send({ type: 'SAVE_STEP', step: 'feesExpenses', data: validFeesExpenses });
    standardActor.send({ type: 'NEXT' });
    await waitForStep(standardActor, 'exitRecycling');

    expect(standardActor.getSnapshot().context.totalSteps).toBe(7);
    standardActor.stop();

    const skipActor = await startActiveActor({ skipOptionalSteps: true });
    await navigateToFeesExpenses(skipActor);

    skipActor.send({ type: 'SAVE_STEP', step: 'feesExpenses', data: validFeesExpenses });
    skipActor.send({ type: 'NEXT' });
    await waitForStep(skipActor, 'waterfall');

    expect(skipActor.getSnapshot().context.totalSteps).toBe(6);
    expect(skipActor.getSnapshot().context.visitedSteps.has('exitRecycling')).toBe(false);
    skipActor.stop();
  });

  it('preserves saved context across step transitions', async () => {
    const actor = await startActiveActor();

    actor.send({ type: 'SAVE_STEP', step: 'generalInfo', data: validGeneralInfo });
    actor.send({ type: 'NEXT' });
    await waitForStep(actor, 'sectorProfiles');

    actor.send({ type: 'SAVE_STEP', step: 'sectorProfiles', data: validSectorProfiles });
    actor.send({ type: 'NEXT' });
    await waitForStep(actor, 'capitalAllocation');

    const context = actor.getSnapshot().context;
    expect(context.steps.generalInfo).toEqual(validGeneralInfo);
    expect(context.steps.sectorProfiles).toEqual(validSectorProfiles);
    expect(context.completedSteps.has('generalInfo')).toBe(true);
    expect(context.completedSteps.has('sectorProfiles')).toBe(true);
    expect(context.visitedSteps.has('capitalAllocation')).toBe(true);

    actor.stop();
  });

  it('captures createdFundId from successful submit responses', async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify({ data: { id: 314 } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const actor = await startActiveActor();
    actor.send({ type: 'GOTO', step: 'scenarios' });
    await waitForStep(actor, 'scenarios');

    actor.send({ type: 'SAVE_STEP', step: 'scenarios', data: validScenarios });
    actor.send({ type: 'SUBMIT' });

    await waitFor(actor, (state) => state.matches('completed'));

    expect(actor.getSnapshot().context.createdFundId).toBe(314);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/funds'),
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
      })
    );
    expect(localStorageMock.removeItem).toHaveBeenCalledWith('modeling-wizard-progress');

    actor.stop();
  });
});
