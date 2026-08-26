import type {
  CapitalAllocationInput,
  GeneralInfoInput,
  SectorProfilesInput,
} from '@/schemas/modeling-wizard.schemas';

/**
 * Minimal reserve snapshot shared across routed-wizard utilities and the legacy
 * XState implementation.
 */
export interface WizardReserveAllocation {
  totalPlanned: number;
  optimalMOIC: number;
  companiesSupported: number;
  avgFollowOnSize: number;
  allocations: Array<{
    companyId: string;
    companyName: string;
    plannedReserve: number;
    exitMOIC: number;
  }>;
}

/**
 * Shared calculation seam for wizard helpers. This deliberately keeps only the
 * step slices that the shared reserve/domain logic actually consumes.
 */
export interface SharedWizardComputationContext {
  steps: {
    generalInfo?: GeneralInfoInput | undefined;
    sectorProfiles?: SectorProfilesInput | undefined;
    capitalAllocation?: CapitalAllocationInput | undefined;
  };
  calculations?:
    | {
        reserves?: WizardReserveAllocation | undefined;
      }
    | undefined;
}
