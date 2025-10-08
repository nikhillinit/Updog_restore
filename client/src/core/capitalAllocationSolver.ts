/**
 * Capital Allocation Solver
 *
 * Implements binary search algorithm to solve for optimal initial deals
 * where: initial_capital + follow_on_capital = total_allocated_capital
 *
 * Based on multi-AI collaborative design (GEMINI + OpenAI consensus)
 */

export interface StageData {
  name: string;
  roundSize: number; // in dollars
  graduationRate: number; // percentage 0-100
}

export interface FollowOnStrategy {
  stage: string;
  checkSize: number; // in dollars, 0 if no follow-on
  participationRate: number; // percentage 0-100
}

export interface AllocationInputs {
  totalAllocatedCapital: number; // in dollars
  initialCheckSize: number; // in dollars
  entryStage: string;
  stages: StageData[];
  followOnStrategy: FollowOnStrategy[];
}

export interface AllocationResult {
  initialDeals: number;
  initialCapital: number;
  followOnCapital: number;
  totalCapitalDeployed: number;
  stageBreakdown: StageBreakdown[];
}

export interface StageBreakdown {
  stageName: string;
  dealsEntering: number;
  graduationRate: number;
  dealsGraduating: number;
  followOnCheckSize: number;
  participationRate: number;
  followOnInvestments: number;
  capitalDeployed: number;
}

/**
 * Calculate total capital required for a given number of initial deals
 * including all follow-on investments across the cascade
 */
function calculateRequiredCapital(
  numInitialDeals: number,
  inputs: AllocationInputs
): { totalCapital: number; breakdown: StageBreakdown[] } {

  const { initialCheckSize, stages, followOnStrategy, entryStage } = inputs;

  // Find entry stage index (case-insensitive match)
  const entryIndex = stages.findIndex(s =>
    s.name.toLowerCase() === entryStage.toLowerCase()
  );

  if (entryIndex === -1) {
    // Fallback: if no stages or entry not found, return empty result
    console.warn(`Entry stage "${entryStage}" not found in stages:`, stages.map(s => s.name));
    return {
      totalCapital: 0,
      breakdown: []
    };
  }

  // Initial capital
  const initialCapital = numInitialDeals * initialCheckSize;

  // Calculate follow-on cascade
  let followOnCapital = 0;
  let dealsAtCurrentStage = numInitialDeals;
  const breakdown: StageBreakdown[] = [];

  // Process each stage starting from entry
  const subsequentStages = stages.slice(entryIndex);

  for (let i = 0; i < subsequentStages.length; i++) {
    const currentStage = subsequentStages[i];
    const nextStage = subsequentStages[i + 1];

    if (!currentStage) continue; // Skip if current stage is undefined

    if (!nextStage) {
      // Last stage - no follow-on
      breakdown.push({
        stageName: currentStage.name,
        dealsEntering: dealsAtCurrentStage,
        graduationRate: currentStage.graduationRate,
        dealsGraduating: 0,
        followOnCheckSize: 0,
        participationRate: 0,
        followOnInvestments: 0,
        capitalDeployed: 0
      });
      break;
    }

    // Find follow-on strategy for next stage
    const followOn = followOnStrategy.find(f => f.stage === nextStage.name) || {
      stage: nextStage.name,
      checkSize: 0,
      participationRate: 0
    };

    // Calculate graduations to next stage
    const dealsGraduating = dealsAtCurrentStage * (currentStage.graduationRate / 100);

    // Calculate follow-on investments
    const followOnInvestments = dealsGraduating * (followOn.participationRate / 100);
    const capitalForStage = followOnInvestments * followOn.checkSize; // checkSize is already in dollars

    followOnCapital += capitalForStage;

    breakdown.push({
      stageName: currentStage.name,
      dealsEntering: dealsAtCurrentStage,
      graduationRate: currentStage.graduationRate,
      dealsGraduating,
      followOnCheckSize: followOn.checkSize,
      participationRate: followOn.participationRate,
      followOnInvestments,
      capitalDeployed: capitalForStage
    });

    // Update for next iteration
    dealsAtCurrentStage = dealsGraduating;
  }

  return {
    totalCapital: initialCapital + followOnCapital,
    breakdown
  };
}

/**
 * Binary search algorithm to find optimal number of initial deals
 * Goal: Find N where calculateRequiredCapital(N) ≈ totalAllocatedCapital
 */
export function solveCapitalAllocation(inputs: AllocationInputs): AllocationResult {
  const { totalAllocatedCapital, initialCheckSize } = inputs;

  // Edge case: no capital allocated or invalid check size
  if (totalAllocatedCapital <= 0 || initialCheckSize <= 0) {
    return {
      initialDeals: 0,
      initialCapital: 0,
      followOnCapital: 0,
      totalCapitalDeployed: 0,
      stageBreakdown: []
    };
  }

  // Binary search boundaries - constrain to realistic maximum
  let low = 0;
  let high = Math.floor(totalAllocatedCapital / initialCheckSize); // Max possible deals if zero follow-ons

  // Edge case: not even one deal is possible
  if (high === 0) {
    return {
      initialDeals: 0,
      initialCapital: 0,
      followOnCapital: 0,
      totalCapitalDeployed: 0,
      stageBreakdown: []
    };
  }

  // Iterate to convergence (100 iterations is overkill but guarantees precision)
  for (let iteration = 0; iteration < 100; iteration++) {
    const guess = (low + high) / 2;

    // Skip invalid guess values
    if (guess <= 0) {
      low = 0.1;
      continue;
    }

    const { totalCapital } = calculateRequiredCapital(guess, inputs);

    if (totalCapital < totalAllocatedCapital) {
      // Can afford more deals
      low = guess;
    } else {
      // Too expensive
      high = guess;
    }

    // Check for convergence (less than 0.01 deal difference)
    if (Math.abs(high - low) < 0.01) {
      break;
    }
  }

  // Final solution: use floor of low bound
  const optimalDeals = Math.floor(low);
  const final = calculateRequiredCapital(optimalDeals, inputs);

  const initialCapital = optimalDeals * initialCheckSize;
  const followOnCapital = final.totalCapital - initialCapital;

  return {
    initialDeals: optimalDeals,
    initialCapital,
    followOnCapital,
    totalCapitalDeployed: final.totalCapital,
    stageBreakdown: final.breakdown
  };
}

/**
 * Calculate implied ownership percentage from check size and valuation
 */
export function calculateImpliedOwnership(
  checkSize: number, // in dollars
  postMoneyValuation: number // in dollars
): number {
  if (postMoneyValuation <= 0) return 0;
  return (checkSize / postMoneyValuation) * 100;
}
