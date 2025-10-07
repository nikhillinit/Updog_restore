/**
 * Modeling Wizard Step Components
 *
 * Centralized exports for all wizard step components.
 * Import from here to simplify component usage.
 *
 * @example
 * import { GeneralInfoStep, SectorProfilesStep } from '@/components/modeling-wizard/steps';
 */

export { GeneralInfoStep } from './GeneralInfoStep';
export type { GeneralInfoStepProps } from './GeneralInfoStep';

export { SectorProfilesStep } from './SectorProfilesStep';
export type { SectorProfilesStepProps } from './SectorProfilesStep';

export { CapitalAllocationStep } from './CapitalAllocationStep';
export type { CapitalAllocationStepProps } from './CapitalAllocationStep';

// Capital Allocation sub-components (exported for testing/reuse)
export { InitialInvestmentSection } from './capital-allocation/InitialInvestmentSection';
export { FollowOnStrategyTable } from './capital-allocation/FollowOnStrategyTable';
export { PacingHorizonBuilder } from './capital-allocation/PacingHorizonBuilder';
export { CalculationSummaryCard } from './capital-allocation/CalculationSummaryCard';

export { FeesExpensesStep } from './FeesExpensesStep';
export type { FeesExpensesStepProps } from './FeesExpensesStep';

export { FundFinancialsStep } from './FundFinancialsStep';
export type { FundFinancialsStepProps } from './FundFinancialsStep';

export { ExitRecyclingStep } from './ExitRecyclingStep';
export type { ExitRecyclingStepProps } from './ExitRecyclingStep';

export { WaterfallStep } from './WaterfallStep';
export type { WaterfallStepProps } from './WaterfallStep';

export { ScenariosStep } from './ScenariosStep';
export type { ScenariosStepProps } from './ScenariosStep';
